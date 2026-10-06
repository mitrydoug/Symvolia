"""Gas sponsorship policy routes for Alchemy Gas Manager webhooks."""

import asyncio
import hashlib
import logging
import os
from dataclasses import dataclass
from typing import Any

from eth_utils import function_signature_to_4byte_selector
from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field

from symvolia.gas_sponsorship import identity
from symvolia.gas_sponsorship.rate_limiter import (
    DEFAULT_CAPACITY_GAS,
    DEFAULT_LEAK_GAS_PER_DAY,
    LeakyBucketRateLimiter,
)

logger = logging.getLogger(__name__)

INSPECT_APPROVE_ENV = "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE"

# Off-chain leaky-bucket rate limiter configuration. The limiter is optional:
# when RATE_LIMIT_DB_ENV is unset the webhook stays a pure selector allow-list.
# The bucket is denominated in GAS: each sponsored userOperation costs the sum of
# its gas limits, so a human's budget tracks the compute we actually sponsor.
RATE_LIMIT_DB_ENV = "GAS_SPONSORSHIP_RATE_LIMIT_DB"
RATE_LIMIT_CAPACITY_ENV = "GAS_SPONSORSHIP_RATE_LIMIT_CAPACITY_GAS"
RATE_LIMIT_LEAK_ENV = "GAS_SPONSORSHIP_RATE_LIMIT_LEAK_GAS_PER_DAY"
# RPC used to resolve a userOperation's zkPassport id (getUserIdentifier / verify).
# Falls back to the indexer RPC when unset.
RATE_LIMIT_RPC_URL_ENV = "GAS_SPONSORSHIP_RPC_URL"
VERIFIER_ADDRESS_ENV = "ZKPASSPORT_VERIFIER_ADDRESS"

# ERC-4337 userOperation gas-limit fields summed into a single "gas cost" weight.
# These are upper bounds (limits and fee caps), so metering on them is a
# conservative over-estimate of settled cost; the leaky bucket's leak self-heals
# any over-count. Paymaster fields only appear on EntryPoint v0.7 operations.
GAS_LIMIT_FIELDS = (
    "callGasLimit",
    "verificationGasLimit",
    "preVerificationGas",
    "paymasterVerificationGasLimit",
    "paymasterPostOpGasLimit",
)

# Fallback weight for the read-only eligibility preview when a caller's
# userOperation carries no gas-limit fields yet (e.g. it wasn't fully prepared).
# A forum submit is well under this, so it's a conservative "typical action"
# stand-in that keeps the preview answerable without a real estimate.
NOMINAL_ELIGIBILITY_GAS = 500_000.0

DEFAULT_REGISTRY_SIGNATURES_BY_MODE = {
    "dev": ["register(string)"],
    "mock": [
        "register((bytes32,(bytes32,bytes,bytes32[]),bytes,(uint256,string,string,bool)))"
    ],
    "production": [
        "register((bytes32,(bytes32,bytes,bytes32[]),bytes,(uint256,string,string,bool)))"
    ],
}

# Selector for the proof-based registration variant (shared by mock &
# production), so the metering layer knows to recover the human's id from the
# proof params rather than from the sender address.
_PROOF_REGISTER_SELECTOR = function_signature_to_4byte_selector(
    "register((bytes32,(bytes32,bytes,bytes32[]),bytes,(uint256,string,string,bool)))"
).hex()


def _selector(signature: str) -> str:
    return function_signature_to_4byte_selector(signature).hex()


SMART_ACCOUNT_EXECUTE_SELECTOR = _selector("execute(address,uint256,bytes)")

# Forum write entrypoints eligible for gas sponsorship. Metering now happens
# off-chain (see _apply_rate_limit), so the plain write functions are sponsored
# directly, and a batched multicall of them is sponsored as a single action.
FORUM_MULTICALL_SELECTOR = _selector("multicall(bytes[])")
FORUM_WRITE_SELECTORS = {
    _selector("addStatement(string,int256)"): "addStatement(string,int256)",
    _selector(
        "adjustSupport((uint256,int256,uint8)[])"
    ): "adjustSupport(SupportAdjustment[])",
}


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    try:
        return float(value.strip())
    except ValueError:
        logger.warning("Invalid float for %s=%r; using default %s", name, value, default)
        return default


def _summarize_hex(value: Any, prefix_chars: int = 18) -> dict[str, object] | None:
    if not isinstance(value, str) or not value.startswith("0x"):
        return None
    hex_chars = max(len(value) - 2, 0)
    return {
        "prefix": value[:prefix_chars],
        "hex_chars": hex_chars,
        "bytes": hex_chars // 2,
    }


def _normalize_address(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    stripped_value = value.strip().lower()
    if len(stripped_value) == 42 and stripped_value.startswith("0x"):
        return stripped_value
    return None


def _parse_address_set(value: str | None) -> set[str]:
    if not value:
        return set()
    addresses: set[str] = set()
    for candidate in value.replace(",", " ").split():
        normalized_address = _normalize_address(candidate)
        if normalized_address:
            addresses.add(normalized_address)
    return addresses


def _parse_signature_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [signature.strip() for signature in value.split(";") if signature.strip()]


def _registry_mode() -> str:
    return os.getenv("REGISTRY_MODE", "production")


def _registry_selectors() -> dict[str, str]:
    signatures = _parse_signature_list(os.getenv("GAS_SPONSORSHIP_REGISTRY_SIGNATURES"))
    if not signatures:
        signatures = DEFAULT_REGISTRY_SIGNATURES_BY_MODE.get(_registry_mode(), [])
    return {_selector(signature): signature for signature in signatures}


def _hex_to_bytes(value: Any) -> bytes | None:
    if not isinstance(value, str) or not value.startswith("0x"):
        return None
    try:
        return bytes.fromhex(value[2:])
    except ValueError:
        return None


def _read_word(data: bytes, offset: int) -> bytes | None:
    if offset < 0 or offset + 32 > len(data):
        return None
    return data[offset : offset + 32]


def _read_uint256(data: bytes, offset: int) -> int | None:
    word = _read_word(data, offset)
    if word is None:
        return None
    return int.from_bytes(word, byteorder="big")


def _read_address(data: bytes, offset: int) -> str | None:
    word = _read_word(data, offset)
    if word is None:
        return None
    return "0x" + word[-20:].hex()


def _decode_dynamic_bytes(data: bytes, base_offset: int, relative_offset: int) -> bytes | None:
    length_offset = base_offset + relative_offset
    value_length = _read_uint256(data, length_offset)
    if value_length is None:
        return None
    value_offset = length_offset + 32
    value_end = value_offset + value_length
    if value_end > len(data):
        return None
    return data[value_offset:value_end]


def _decode_execute_call(call_data: Any) -> tuple[str, int, bytes] | None:
    data = _hex_to_bytes(call_data)
    if data is None or len(data) < 4 + 32 * 3:
        return None
    if data[:4].hex() != SMART_ACCOUNT_EXECUTE_SELECTOR:
        return None

    args_offset = 4
    target = _read_address(data, args_offset)
    value = _read_uint256(data, args_offset + 32)
    inner_data_offset = _read_uint256(data, args_offset + 64)
    if target is None or value is None or inner_data_offset is None:
        return None

    inner_data = _decode_dynamic_bytes(data, args_offset, inner_data_offset)
    if inner_data is None:
        return None
    return target, value, inner_data


def _decode_multicall_calls(inner_data: bytes) -> list[bytes] | None:
    if len(inner_data) < 4 + 32 or inner_data[:4].hex() != FORUM_MULTICALL_SELECTOR:
        return None

    args_offset = 4
    array_offset = _read_uint256(inner_data, args_offset)
    if array_offset is None:
        return None
    array_start = args_offset + array_offset
    call_count = _read_uint256(inner_data, array_start)
    if call_count is None:
        return None

    calls: list[bytes] = []
    for index in range(call_count):
        call_offset = _read_uint256(inner_data, array_start + 32 + index * 32)
        if call_offset is None:
            return None
        call = _decode_dynamic_bytes(inner_data, array_start + 32, call_offset)
        if call is None:
            return None
        calls.append(call)
    return calls


@dataclass(frozen=True)
class MeteredAction:
    """A sponsored action to charge against a human's leaky-bucket budget.

    ``kind`` selects how the zkPassport id is recovered:
    ``"forum"`` (registry.getUserIdentifier(sender)),
    ``"registration_proof"`` (production: verify(...) eth_call),
    ``"registration_mock_proof"`` (mock: parse publicInputs[len-2] from
    calldata) or ``"registration_dev"`` (keccak256(abi.encode(sender))).

    The charged weight is the userOperation's gas cost, computed at metering time
    from its gas-limit fields, so it is not carried on the action itself.
    """

    kind: str
    sender: str
    inner_data: bytes


def _parse_uint(value: Any) -> int:
    """Parse a userOperation numeric field (hex string, int, or decimal string)."""
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return value if value > 0 else 0
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return 0
        try:
            parsed = int(text, 16) if text.lower().startswith("0x") else int(text)
        except ValueError:
            return 0
        return parsed if parsed > 0 else 0
    return 0


def _gas_weight(user_operation: dict[str, Any]) -> float | None:
    """Total gas the sponsored userOperation may consume, summed across limits.

    Returns ``None`` when no gas-limit fields are present (e.g. an early
    estimation call), so the caller can fail closed rather than charge zero.
    """
    total = sum(_parse_uint(user_operation.get(field)) for field in GAS_LIMIT_FIELDS)
    return float(total) if total > 0 else None


def _sponsorship_decision(
    user_operation: dict[str, Any],
) -> tuple[bool, str, MeteredAction | None]:
    if not _env_flag(INSPECT_APPROVE_ENV, default=False):
        return False, f"{INSPECT_APPROVE_ENV} is not enabled", None

    registry_address = _normalize_address(os.getenv("REGISTRY_ADDRESS"))
    forum_addresses = _parse_address_set(os.getenv("FORUM_CONTRACT_ADDRESSES"))
    if registry_address is None and not forum_addresses:
        return False, "deployment addresses are not configured", None

    decoded_execute = _decode_execute_call(user_operation.get("callData"))
    if decoded_execute is None:
        return (
            False,
            "callData is not smart-account execute(address,uint256,bytes)",
            None,
        )

    target, value, inner_data = decoded_execute
    if value != 0:
        return False, "native value transfers are not sponsored", None
    if len(inner_data) < 4:
        return False, "inner callData is missing a function selector", None

    target = target.lower()
    inner_selector = inner_data[:4].hex()
    sender = _normalize_address(user_operation.get("sender")) or ""

    if target == registry_address:
        function_name = _registry_selectors().get(inner_selector)
        if function_name is None:
            return False, f"registry selector 0x{inner_selector} is not sponsored", None
        if inner_selector == _PROOF_REGISTER_SELECTOR:
            # The proof-based register(params) is shared by mock & production.
            # Production recovers the id by eth_call-ing the on-chain verifier;
            # mock has no verifier, so it parses the id from the proof params.
            kind = (
                "registration_mock_proof"
                if _registry_mode() == "mock"
                else "registration_proof"
            )
        else:
            # Dev register(string) or a custom-configured signature we can
            # approve but not attribute via a proof; meter by sender-derived id.
            kind = "registration_dev"
        return True, f"registry.{function_name}", MeteredAction(kind, sender, inner_data)

    if target in forum_addresses:
        if inner_selector in FORUM_WRITE_SELECTORS:
            return (
                True,
                f"forum.{FORUM_WRITE_SELECTORS[inner_selector]}",
                MeteredAction("forum", sender, inner_data),
            )
        if inner_selector != FORUM_MULTICALL_SELECTOR:
            return False, f"forum selector 0x{inner_selector} is not sponsored", None

        calls = _decode_multicall_calls(inner_data)
        if calls is None:
            return False, "forum multicall could not be decoded", None
        if not calls:
            return False, "empty forum multicall is not sponsored", None

        call_names: list[str] = []
        for call in calls:
            if len(call) < 4:
                return False, "nested multicall item is missing a selector", None
            call_selector = call[:4].hex()
            call_name = FORUM_WRITE_SELECTORS.get(call_selector)
            if call_name is None:
                return (
                    False,
                    f"nested forum selector 0x{call_selector} is not sponsored",
                    None,
                )
            call_names.append(call_name)

        return (
            True,
            "forum.multicall(" + ",".join(call_names) + ")",
            MeteredAction("forum", sender, inner_data),
        )

    return False, f"target {target} is not a sponsored contract", None


# Cache one limiter instance per database path so the schema is created once.
_rate_limiters: dict[str, LeakyBucketRateLimiter] = {}


def _get_rate_limiter() -> LeakyBucketRateLimiter | None:
    """Return the configured limiter, or ``None`` when metering is disabled."""
    db_path = (os.getenv(RATE_LIMIT_DB_ENV) or "").strip()
    if not db_path:
        return None
    limiter = _rate_limiters.get(db_path)
    if limiter is None:
        limiter = LeakyBucketRateLimiter(
            db_path,
            capacity_units=_env_float(RATE_LIMIT_CAPACITY_ENV, DEFAULT_CAPACITY_GAS),
            leak_units_per_day=_env_float(
                RATE_LIMIT_LEAK_ENV, DEFAULT_LEAK_GAS_PER_DAY
            ),
        )
        _rate_limiters[db_path] = limiter
    return limiter


def _rate_limit_rpc_url() -> str | None:
    return (
        os.getenv(RATE_LIMIT_RPC_URL_ENV) or os.getenv("INDEXER_RPC_URL") or ""
    ).strip() or None


async def _resolve_user_id(action: MeteredAction) -> str | None:
    """Recover the zkPassport id for *action*, or ``None`` if it cannot be met."""
    if not action.sender:
        return None

    if action.kind == "registration_dev":
        # No proof and not yet registered: reproduce the dev registry's id
        # locally so it matches the id forum actions will later meter against.
        return identity.dev_registration_user_id(action.sender)

    if action.kind == "registration_mock_proof":
        # Mock has no on-chain verifier: recover the scoped nullifier by
        # decoding the proof params locally (no RPC), matching what the mock
        # registry stores and what forum actions later meter against.
        return identity.mock_registration_user_id(action.inner_data)

    rpc_url = _rate_limit_rpc_url()
    if rpc_url is None:
        logger.warning(
            "Rate limiting enabled but no RPC URL configured; cannot meter %s",
            action.kind,
        )
        return None

    if action.kind == "forum":
        registry_address = _normalize_address(os.getenv("REGISTRY_ADDRESS"))
        if registry_address is None:
            return None
        return await identity.resolve_forum_user_id(
            rpc_url, registry_address, action.sender
        )

    if action.kind == "registration_proof":
        verifier_address = _normalize_address(os.getenv(VERIFIER_ADDRESS_ENV))
        if verifier_address is None:
            logger.warning(
                "%s is not set; cannot meter production registration",
                VERIFIER_ADDRESS_ENV,
            )
            return None
        return await identity.resolve_registration_user_id(
            rpc_url, verifier_address, action.inner_data, action.sender
        )

    return None


def _idempotency_key(user_operation: dict[str, Any]) -> str:
    """Stable digest identifying one userOperation across webhook retries."""
    sender = str(user_operation.get("sender", ""))
    nonce = str(user_operation.get("nonce", ""))
    call_data = str(user_operation.get("callData", ""))
    return hashlib.sha256(f"{sender}|{nonce}|{call_data}".encode()).hexdigest()


def _format_usage(usage: float | None, capacity: float | None) -> str | None:
    """Render bucket usage as ``%<pct> (<usage>/<capacity>)`` for logs."""
    if usage is None or capacity is None:
        return None
    pct = round(usage / capacity * 100) if capacity > 0 else 0
    return f"%{pct} ({usage:.0f}/{capacity:.0f})"


@dataclass
class MeteringOutcome:
    """Result of metering an approved action, with detail for decision logs."""

    approved: bool
    reason: str
    user_id: str | None = None
    usage_gas: float | None = None
    capacity_gas: float | None = None


async def _apply_rate_limit(
    user_operation: dict[str, Any], action: MeteredAction, reason: str
) -> MeteringOutcome:
    """Meter an approved action by its gas cost; returns the final decision.

    Both failure paths below return without calling ``try_consume``, so a
    degenerate call (missing gas fields or an unresolvable id) is not cached and
    a later well-formed retry of the same userOperation can still be sponsored.
    """
    limiter = _get_rate_limiter()
    if limiter is None:
        return MeteringOutcome(True, reason)

    weight = _gas_weight(user_operation)
    if weight is None:
        return MeteringOutcome(
            False, f"{reason}: userOperation is missing gas-limit fields"
        )

    user_id = await _resolve_user_id(action)
    if user_id is None:
        return MeteringOutcome(
            False, f"{reason}: could not resolve zkPassport id for metering"
        )

    decision = await asyncio.to_thread(
        limiter.try_consume,
        user_id,
        weight,
        idempotency_key=_idempotency_key(user_operation),
    )
    if not decision.allowed:
        return MeteringOutcome(
            False,
            f"{reason}: gas budget exceeded (gas={weight:.0f})",
            user_id=user_id,
            usage_gas=decision.usage_after,
            capacity_gas=decision.capacity,
        )
    return MeteringOutcome(
        True,
        f"{reason}: metered gas={weight:.0f} "
        f"usage={decision.usage_after:.0f}/{decision.capacity:.0f}"
        + (" (replayed)" if decision.replayed else ""),
        user_id=user_id,
        usage_gas=decision.usage_after,
        capacity_gas=decision.capacity,
    )


class GasSponsorshipInspectRequest(BaseModel):
    """Loose Alchemy webhook payload shape used while integration is being mapped."""

    model_config = ConfigDict(extra="allow")

    userOperation: dict[str, Any] = Field(default_factory=dict)
    policyId: str | None = None
    chainId: str | int | None = None
    webhookData: Any | None = None


class GasSponsorshipDecision(BaseModel):
    approved: bool


class GasSponsorshipEligibilityRequest(BaseModel):
    """Preview payload: the smart-wallet userOperation the client just prepared.

    The frontend prepares this via Alchemy's bundler (``prepareUserOperation``),
    so its gas-limit fields come from the same estimator the sponsorship webhook
    will meter against at submit time.
    """

    model_config = ConfigDict(extra="allow")

    userOperation: dict[str, Any] = Field(default_factory=dict)
    userId: str | None = None
    """The caller's zkPassport id (bytes32 hex), supplied by the frontend.

    Required in practice: the preview meters against it directly. The endpoint
    never resolves identity server-side, so it can't be coerced into a registry
    RPC. It is only trusted for this read-only *peek* — the webhook re-resolves
    the id authoritatively before any budget is consumed, so a spoofed value
    cannot overspend another human's allowance.
    """


def _normalize_client_user_id(value: str | None) -> str | None:
    """Shape-check a client-supplied zkPassport id so it can key a bucket.

    Returns the ``0x``-prefixed, lowercase, 32-byte hex id, or ``None`` when the
    value is absent or malformed (the eligibility preview then reports an error
    rather than resolving server-side). Metering ids produced on the backend are
    ``"0x" + <64 hex>`` (see ``identity``), so a valid value maps to the same
    bucket the webhook will charge.
    """
    if not value:
        return None
    text = value.strip().lower()
    if not text.startswith("0x") or len(text) != 66:
        return None
    try:
        int(text, 16)
    except ValueError:
        return None
    return text


class GasSponsorshipEligibility(BaseModel):
    """Read-only sponsorship outlook for a prepared userOperation.

    ``status`` is one of:

    * ``sponsored`` — the action qualifies and the human is within budget.
    * ``rate_limited`` — the action qualifies but the human's gas budget is
      currently exhausted (a clean "take a break", not an error).
    * ``ineligible`` — the action is not sponsorable (unknown selector/target,
      sponsorship disabled, etc.).
    * ``error`` — eligibility could not be determined (e.g. identity metering
      lookup failed); the caller should retry or fall back to self-funding.
    """

    status: str
    detail: str | None = None
    usage_gas: float | None = None
    capacity_gas: float | None = None
    retry_after_seconds: float | None = None


async def _evaluate_eligibility(
    request: "GasSponsorshipEligibilityRequest",
    user_operation: dict[str, Any],
) -> tuple["GasSponsorshipEligibility", str | None]:
    """Compute the eligibility preview verdict without consuming budget.

    Returns the verdict plus the metering ``user_id`` used (or ``None`` when no
    metering was performed) so the route can log it without exposing the id in
    the response body.
    """
    approved, reason, action = _sponsorship_decision(user_operation)
    if not approved or action is None:
        return GasSponsorshipEligibility(status="ineligible", detail=reason), None

    limiter = _get_rate_limiter()
    if limiter is None:
        # Metering disabled: any sponsorable action is unconditionally in. Still
        # surface the client-supplied id (when present) for log correlation.
        return (
            GasSponsorshipEligibility(status="sponsored", detail=reason),
            _normalize_client_user_id(request.userId),
        )

    weight = _gas_weight(user_operation)
    if weight is None:
        weight = NOMINAL_ELIGIBILITY_GAS

    # This preview is only ever called by the frontend, which already holds
    # the caller's zkPassport id. Require it and meter against it directly:
    # the endpoint never resolves identity server-side, so an
    # unauthenticated caller can't force a registry RPC (a cost/DoS abuse
    # vector). The webhook remains the authoritative, RPC-backed metering
    # path at submit time.
    user_id = _normalize_client_user_id(request.userId)
    if user_id is None:
        return (
            GasSponsorshipEligibility(
                status="error",
                detail=f"{reason}: a valid userId is required for a metering preview",
            ),
            None,
        )

    decision = await asyncio.to_thread(limiter.peek, user_id, weight)
    if decision.allowed:
        return (
            GasSponsorshipEligibility(
                status="sponsored",
                detail=reason,
                usage_gas=decision.usage_after,
                capacity_gas=decision.capacity,
            ),
            user_id,
        )

    # Rejected: report how long until enough budget leaks back to fit this
    # action, so the UI can offer a concrete "try again in ~N" hint.
    over = decision.usage_after + weight - decision.capacity
    retry_after = over / limiter.leak_per_second if limiter.leak_per_second > 0 else None
    return (
        GasSponsorshipEligibility(
            status="rate_limited",
            detail=f"{reason}: gas budget exceeded (gas={weight:.0f})",
            usage_gas=decision.usage_after,
            capacity_gas=decision.capacity,
            retry_after_seconds=retry_after,
        ),
        user_id,
    )


def create_api(app: FastAPI) -> None:
    """Register gas sponsorship routes on *app*."""

    @app.post("/alchemy/gas-policy/eligibility")
    async def check_gas_sponsorship_eligibility(
        request: GasSponsorshipEligibilityRequest,
    ) -> GasSponsorshipEligibility:
        """Preview whether a prepared userOperation would be sponsored.

        Mirrors the webhook's decision + metering logic but *peeks* the
        rate-limit bucket instead of consuming it, so the confirmation dialog can
        distinguish a clean rate-limit decline from a genuine error before the
        user submits. It never charges budget: the authoritative decision remains
        the webhook (`/alchemy/gas-policy/inspect`) at submit time.
        """
        user_operation = request.userOperation
        logger.info(
            "Gas sponsorship eligibility request: sender=%s user_operation_keys=%s "
            "call_data=%s user_id_present=%s",
            user_operation.get("sender"),
            sorted(user_operation.keys()),
            _summarize_hex(user_operation.get("callData")),
            request.userId is not None,
        )

        result, metering_user_id = await _evaluate_eligibility(
            request, user_operation
        )
        logger.info(
            "Gas sponsorship eligibility decision: status=%s detail=%s sender=%s "
            "user_id=%s usage=%s",
            result.status,
            result.detail,
            user_operation.get("sender"),
            metering_user_id,
            _format_usage(result.usage_gas, result.capacity_gas),
        )
        return result

    @app.post("/alchemy/gas-policy/inspect")
    async def inspect_alchemy_gas_policy(
        request: GasSponsorshipInspectRequest,
    ) -> GasSponsorshipDecision:
        """Temporarily inspect Alchemy Gas Manager webhook payloads.

        This endpoint is intentionally not the final policy implementation. It
        exists so Base Sepolia test requests can reveal the exact UserOperation
        and callData shape that the real sponsorship policy must decode.
        """
        user_operation = request.userOperation
        call_data = user_operation.get("callData")
        paymaster_and_data = user_operation.get("paymasterAndData")
        logger.info(
            "Alchemy gas policy inspect request: policy_id=%s chain_id=%s "
            "sender=%s user_operation_keys=%s call_data=%s paymaster_and_data=%s "
            "webhook_data_type=%s",
            request.policyId,
            request.chainId,
            user_operation.get("sender"),
            sorted(user_operation.keys()),
            _summarize_hex(call_data),
            _summarize_hex(paymaster_and_data),
            (
                type(request.webhookData).__name__
                if request.webhookData is not None
                else None
            ),
        )
        approved, reason, action = _sponsorship_decision(user_operation)
        outcome: MeteringOutcome | None = None
        if approved and action is not None:
            outcome = await _apply_rate_limit(user_operation, action, reason)
            approved, reason = outcome.approved, outcome.reason
        logger.info(
            "Alchemy gas policy decision: approved=%s reason=%s sender=%s "
            "user_id=%s usage=%s",
            approved,
            reason,
            user_operation.get("sender"),
            outcome.user_id if outcome else None,
            _format_usage(outcome.usage_gas, outcome.capacity_gas)
            if outcome
            else None,
        )
        return GasSponsorshipDecision(approved=approved)
