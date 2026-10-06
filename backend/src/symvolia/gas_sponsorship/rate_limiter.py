"""SQLite-backed leaky-bucket rate limiter for gas-sponsored actions.

Metering lives off-chain, here in the sponsorship webhook decision path, so the
smart contracts need no metered/unmetered function split: the self-funded path
is simply "the webhook declined to sponsor".

Model — linear leaky bucket, keyed by the zkPassport unique identifier so a human
shares one budget across registration and every forum, regardless of how many
addresses they control::

    usage_now = max(0, usage_last - leak_per_second * (now - updated_at))
    consume(weight): usage_now += weight; reject if usage_now > capacity

The bucket is denominated in **gas**: each sponsored userOperation costs the sum
of its gas-limit fields, so a human's budget tracks the compute actually
sponsored on their behalf rather than a coarse per-action approximation.

At the target scale (<= ~10k humans) a single SQLite file on a mounted volume is
ample. All access is serialized with a process-level lock and each operation runs
in its own short ``BEGIN IMMEDIATE`` transaction under WAL, so a stray second
connection (e.g. a health check) cannot corrupt an in-flight read-modify-write.
"""

from __future__ import annotations

import os
import sqlite3
import threading
import time
from dataclasses import dataclass

# Defaults are denominated in gas. A generous 5,000,000-gas burst that refills at
# 20,000,000 gas/day comfortably covers ordinary use (a forum submit is well
# under ~300k gas) while still throttling automated abuse. Operators tune these
# via GAS_SPONSORSHIP_RATE_LIMIT_CAPACITY_GAS / _LEAK_GAS_PER_DAY.
DEFAULT_CAPACITY_GAS = 5_000_000.0
DEFAULT_LEAK_GAS_PER_DAY = 20_000_000.0

_SECONDS_PER_DAY = 86_400.0

# A single userOperation can trigger the sponsorship webhook more than once (gas
# estimation and the final paymaster request). Cache the first decision for this
# long, keyed by userOp identity, so retries never double-charge the bucket.
DEFAULT_IDEMPOTENCY_TTL_SECONDS = 900


@dataclass(frozen=True)
class RateLimitDecision:
    """Outcome of a single :meth:`LeakyBucketRateLimiter.try_consume` call."""

    allowed: bool
    usage_after: float
    capacity: float
    replayed: bool


class LeakyBucketRateLimiter:
    """Per-human leaky-bucket limiter persisted in a SQLite file."""

    def __init__(
        self,
        db_path: str,
        *,
        capacity_units: float = DEFAULT_CAPACITY_GAS,
        leak_units_per_day: float = DEFAULT_LEAK_GAS_PER_DAY,
        idempotency_ttl_seconds: int = DEFAULT_IDEMPOTENCY_TTL_SECONDS,
    ) -> None:
        self._db_path = db_path
        self.capacity = float(capacity_units)
        self.leak_per_second = float(leak_units_per_day) / _SECONDS_PER_DAY
        self.idempotency_ttl_seconds = int(idempotency_ttl_seconds)
        self._lock = threading.Lock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._db_path, timeout=5.0)
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA busy_timeout=5000")
        return connection

    def _initialize(self) -> None:
        parent = os.path.dirname(self._db_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with self._lock:
            connection = self._connect()
            try:
                connection.execute(
                    "CREATE TABLE IF NOT EXISTS sponsorship_bucket ("
                    " user_id TEXT PRIMARY KEY,"
                    " usage REAL NOT NULL,"
                    " updated_at REAL NOT NULL)"
                )
                connection.execute(
                    "CREATE TABLE IF NOT EXISTS sponsorship_decision ("
                    " idempotency_key TEXT PRIMARY KEY,"
                    " allowed INTEGER NOT NULL,"
                    " created_at REAL NOT NULL)"
                )
                connection.commit()
            finally:
                connection.close()

    def try_consume(
        self,
        user_id: str,
        weight: float,
        *,
        idempotency_key: str | None = None,
        now: float | None = None,
    ) -> RateLimitDecision:
        """Charge *weight* units to *user_id*'s bucket if it stays under capacity.

        When *idempotency_key* is supplied and a decision for it was recorded
        within the TTL window, that cached decision is returned verbatim without
        charging the bucket again (``replayed=True``).
        """
        if now is None:
            now = time.time()
        weight = float(weight)

        with self._lock:
            connection = self._connect()
            try:
                connection.execute("BEGIN IMMEDIATE")

                if idempotency_key is not None:
                    cached = connection.execute(
                        "SELECT allowed, created_at FROM sponsorship_decision"
                        " WHERE idempotency_key = ?",
                        (idempotency_key,),
                    ).fetchone()
                    if (
                        cached is not None
                        and now - cached[1] <= self.idempotency_ttl_seconds
                    ):
                        usage_row = connection.execute(
                            "SELECT usage FROM sponsorship_bucket WHERE user_id = ?",
                            (user_id,),
                        ).fetchone()
                        connection.commit()
                        return RateLimitDecision(
                            allowed=bool(cached[0]),
                            usage_after=usage_row[0] if usage_row else 0.0,
                            capacity=self.capacity,
                            replayed=True,
                        )

                row = connection.execute(
                    "SELECT usage, updated_at FROM sponsorship_bucket"
                    " WHERE user_id = ?",
                    (user_id,),
                ).fetchone()
                usage, updated_at = row if row is not None else (0.0, now)
                decayed = max(0.0, usage - self.leak_per_second * (now - updated_at))
                projected = decayed + weight
                allowed = projected <= self.capacity
                # Persist the decayed level even on rejection so the leak keeps
                # accruing from `now` instead of resetting the clock.
                usage_after = projected if allowed else decayed

                connection.execute(
                    "INSERT INTO sponsorship_bucket (user_id, usage, updated_at)"
                    " VALUES (?, ?, ?)"
                    " ON CONFLICT(user_id) DO UPDATE SET"
                    " usage = excluded.usage, updated_at = excluded.updated_at",
                    (user_id, usage_after, now),
                )

                if idempotency_key is not None:
                    connection.execute(
                        "INSERT INTO sponsorship_decision"
                        " (idempotency_key, allowed, created_at) VALUES (?, ?, ?)"
                        " ON CONFLICT(idempotency_key) DO UPDATE SET"
                        " allowed = excluded.allowed, created_at = excluded.created_at",
                        (idempotency_key, int(allowed), now),
                    )
                    connection.execute(
                        "DELETE FROM sponsorship_decision WHERE created_at < ?",
                        (now - self.idempotency_ttl_seconds,),
                    )

                connection.commit()
                return RateLimitDecision(
                    allowed=allowed,
                    usage_after=usage_after,
                    capacity=self.capacity,
                    replayed=False,
                )
            finally:
                connection.close()

    def peek(
        self,
        user_id: str,
        weight: float,
        *,
        now: float | None = None,
    ) -> RateLimitDecision:
        """Return the decision for *weight* **without** charging the bucket.

        Mirrors :meth:`try_consume`'s projection math but performs no writes, so
        it can back a read-only eligibility preview without consuming a human's
        budget. ``usage_after`` reports the *current* decayed level (the weight
        is not added on a rejection, and only hypothetically added when it would
        be allowed), and ``replayed`` is always ``False``.
        """
        if now is None:
            now = time.time()
        weight = float(weight)

        with self._lock:
            connection = self._connect()
            try:
                row = connection.execute(
                    "SELECT usage, updated_at FROM sponsorship_bucket"
                    " WHERE user_id = ?",
                    (user_id,),
                ).fetchone()
                usage, updated_at = row if row is not None else (0.0, now)
                decayed = max(0.0, usage - self.leak_per_second * (now - updated_at))
                projected = decayed + weight
                allowed = projected <= self.capacity
                return RateLimitDecision(
                    allowed=allowed,
                    usage_after=projected if allowed else decayed,
                    capacity=self.capacity,
                    replayed=False,
                )
            finally:
                connection.close()
