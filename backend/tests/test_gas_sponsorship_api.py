import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from eth_abi import encode
from eth_utils import function_signature_to_4byte_selector
from fastapi import FastAPI
from fastapi.testclient import TestClient

from symvolia.gas_sponsorship import identity
from symvolia.gas_sponsorship.api import create_api
from symvolia.gas_sponsorship.rate_limiter import LeakyBucketRateLimiter


REGISTRY_ADDRESS = "0x00000000000000000000000000000000000000aa"
FORUM_ADDRESS = "0x00000000000000000000000000000000000000bb"

REGISTER_PRODUCTION_SIGNATURE = (
    "register((bytes32,(bytes32,bytes,bytes32[]),bytes,(uint256,string,string,bool)))"
)


def _selector(signature: str) -> bytes:
    return function_signature_to_4byte_selector(signature)


def _execute_call_data(target: str, inner_call_data: bytes) -> str:
    return "0x" + (
        _selector("execute(address,uint256,bytes)")
        + encode(["address", "uint256", "bytes"], [target, 0, inner_call_data])
    ).hex()


def _add_statement_call_data(text: str, weight: int) -> bytes:
    return _selector("addStatement(string,int256)") + encode(
        ["string", "int256"], [text, weight]
    )


def _adjust_support_call_data(adjustments: list[tuple[int, int, int]]) -> bytes:
    return _selector("adjustSupport((uint256,int256,uint8)[])") + encode(
        ["(uint256,int256,uint8)[]"], [adjustments]
    )


class GasSponsorshipApiTests(unittest.TestCase):
    def setUp(self) -> None:
        app = FastAPI()
        create_api(app)
        self.client = TestClient(app)
        self.payload = {
            "policyId": "policy-test",
            "chainId": "84532",
            "userOperation": {
                "sender": "0x0000000000000000000000000000000000000001",
                "callData": "0x12345678abcdef",
            },
            "webhookData": {"source": "test"},
        }

    @patch.dict(os.environ, {}, clear=True)
    def test_inspect_endpoint_fails_closed_by_default(self) -> None:
        response = self.client.post("/alchemy/gas-policy/inspect", json=self.payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"approved": False})

    @patch.dict(
        os.environ,
        {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "REGISTRY_MODE": "dev",
        },
        clear=True,
    )
    def test_inspect_endpoint_can_be_enabled_for_spike(self) -> None:
        self.payload["userOperation"]["callData"] = _execute_call_data(
            REGISTRY_ADDRESS,
            _selector("register(string)") + encode(["string"], ["USA"]),
        )

        response = self.client.post("/alchemy/gas-policy/inspect", json=self.payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"approved": True})

    @patch.dict(
        os.environ,
        {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "FORUM_CONTRACT_ADDRESSES": FORUM_ADDRESS,
            "REGISTRY_MODE": "production",
        },
        clear=True,
    )
    def test_forum_add_statement_is_sponsored(self) -> None:
        self.payload["userOperation"]["callData"] = _execute_call_data(
            FORUM_ADDRESS,
            _add_statement_call_data("hello", 1),
        )

        response = self.client.post("/alchemy/gas-policy/inspect", json=self.payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"approved": True})

    @patch.dict(
        os.environ,
        {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "FORUM_CONTRACT_ADDRESSES": FORUM_ADDRESS,
            "REGISTRY_MODE": "production",
        },
        clear=True,
    )
    def test_forum_adjust_support_is_sponsored(self) -> None:
        self.payload["userOperation"]["callData"] = _execute_call_data(
            FORUM_ADDRESS,
            _adjust_support_call_data([(0, 1, 0)]),
        )

        response = self.client.post("/alchemy/gas-policy/inspect", json=self.payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"approved": True})

    @patch.dict(
        os.environ,
        {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "FORUM_CONTRACT_ADDRESSES": FORUM_ADDRESS,
            "REGISTRY_MODE": "production",
        },
        clear=True,
    )
    def test_forum_multicall_of_writes_is_sponsored(self) -> None:
        multicall = _selector("multicall(bytes[])") + encode(
            ["bytes[]"],
            [[_add_statement_call_data("hello", 1), _adjust_support_call_data([(0, 1, 0)])]],
        )
        self.payload["userOperation"]["callData"] = _execute_call_data(
            FORUM_ADDRESS, multicall
        )

        response = self.client.post("/alchemy/gas-policy/inspect", json=self.payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"approved": True})

    @patch.dict(
        os.environ,
        {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "FORUM_CONTRACT_ADDRESSES": FORUM_ADDRESS,
            "REGISTRY_MODE": "production",
        },
        clear=True,
    )
    def test_unknown_forum_selector_is_not_sponsored(self) -> None:
        # Only addStatement / adjustSupport (and multicalls of them) are
        # sponsored; any other forum selector must fail closed.
        self.payload["userOperation"]["callData"] = _execute_call_data(
            FORUM_ADDRESS,
            _selector("setOwner(address)") + encode(["address"], [FORUM_ADDRESS]),
        )

        response = self.client.post("/alchemy/gas-policy/inspect", json=self.payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"approved": False})

    @patch.dict(
        os.environ,
        {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "REGISTRY_MODE": "production",
        },
        clear=True,
    )
    def test_production_register_selector_is_sponsored(self) -> None:
        # The webhook approves by selector; the four-byte selector is what
        # matters, so an empty argument body is sufficient to exercise routing.
        self.payload["userOperation"]["callData"] = _execute_call_data(
            REGISTRY_ADDRESS,
            _selector(REGISTER_PRODUCTION_SIGNATURE),
        )

        response = self.client.post("/alchemy/gas-policy/inspect", json=self.payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"approved": True})

    @patch.dict(
        os.environ,
        {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "REGISTRY_MODE": "production",
        },
        clear=True,
    )
    def test_removed_register_sponsored_selector_is_not_sponsored(self) -> None:
        # The old on-chain sponsored variant no longer exists on the deployed
        # registry, so its selector must not be sponsored.
        self.payload["userOperation"]["callData"] = _execute_call_data(
            REGISTRY_ADDRESS,
            _selector(
                "registerSponsored((bytes32,(bytes32,bytes,bytes32[]),bytes,(uint256,string,string,bool)))"
            ),
        )

        response = self.client.post("/alchemy/gas-policy/inspect", json=self.payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"approved": False})


class LeakyBucketRateLimiterTests(unittest.TestCase):
    def _limiter(self, **kwargs) -> LeakyBucketRateLimiter:
        directory = tempfile.mkdtemp()
        db_path = os.path.join(directory, "sponsorship.db")
        return LeakyBucketRateLimiter(db_path, **kwargs)

    def test_consume_within_capacity_then_rejects(self) -> None:
        limiter = self._limiter(capacity_units=10, leak_units_per_day=0)

        first = limiter.try_consume("user", 4, now=1000)
        second = limiter.try_consume("user", 4, now=1000)
        third = limiter.try_consume("user", 4, now=1000)

        self.assertTrue(first.allowed)
        self.assertTrue(second.allowed)
        self.assertFalse(third.allowed)  # 8 + 4 = 12 > 10
        self.assertEqual(second.usage_after, 8.0)
        # A rejected consume does not add its weight.
        self.assertEqual(third.usage_after, 8.0)

    def test_leak_recovers_budget_over_time(self) -> None:
        # 86400 units/day == 1 unit/second.
        limiter = self._limiter(capacity_units=10, leak_units_per_day=86_400)

        self.assertTrue(limiter.try_consume("user", 6, now=1000).allowed)
        self.assertFalse(limiter.try_consume("user", 6, now=1000).allowed)
        # Five seconds later, 5 units have leaked (6 -> 1), so 1 + 6 = 7 <= 10.
        recovered = limiter.try_consume("user", 6, now=1005)
        self.assertTrue(recovered.allowed)
        self.assertAlmostEqual(recovered.usage_after, 7.0, places=6)

    def test_idempotency_key_replays_without_double_charging(self) -> None:
        limiter = self._limiter(capacity_units=10, leak_units_per_day=0)

        first = limiter.try_consume("user", 5, idempotency_key="op-1", now=1000)
        replay = limiter.try_consume("user", 5, idempotency_key="op-1", now=1000)

        self.assertTrue(first.allowed)
        self.assertTrue(replay.allowed)
        self.assertFalse(replay.replayed is False)
        self.assertEqual(replay.usage_after, 5.0)  # not 10

        # A distinct op charges again.
        distinct = limiter.try_consume("user", 5, idempotency_key="op-2", now=1000)
        self.assertTrue(distinct.allowed)
        self.assertEqual(distinct.usage_after, 10.0)


class GasSponsorshipMeteringTests(unittest.TestCase):
    def setUp(self) -> None:
        app = FastAPI()
        create_api(app)
        self.client = TestClient(app)
        directory = tempfile.mkdtemp()
        self.db_path = os.path.join(directory, "sponsorship.db")
        self.sender = "0x0000000000000000000000000000000000000abc"

    def _payload(self, call_data: str, nonce: str, *, gas: int = 200_000) -> dict:
        # Split the gas across three limit fields so the summation path is
        # exercised; unset fields (paymaster*) default to zero.
        call_gas = gas // 2
        verification_gas = gas // 4
        pre_verification_gas = gas - call_gas - verification_gas
        return {
            "policyId": "policy-test",
            "chainId": "84532",
            "userOperation": {
                "sender": self.sender,
                "nonce": nonce,
                "callData": call_data,
                "callGasLimit": hex(call_gas),
                "verificationGasLimit": hex(verification_gas),
                "preVerificationGas": hex(pre_verification_gas),
            },
        }

    def test_dev_registration_meters_by_reproduced_user_id(self) -> None:
        # capacity 800000 gas, 200000 gas/op => four succeed, the fifth is
        # rejected, all keyed by the same reproduced dev user id (no RPC).
        call_data = _execute_call_data(
            REGISTRY_ADDRESS,
            _selector("register(string)") + encode(["string"], ["USA"]),
        )
        env = {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "REGISTRY_MODE": "dev",
            "GAS_SPONSORSHIP_RATE_LIMIT_DB": self.db_path,
            "GAS_SPONSORSHIP_RATE_LIMIT_CAPACITY_GAS": "800000",
            "GAS_SPONSORSHIP_RATE_LIMIT_LEAK_GAS_PER_DAY": "0",
        }
        with patch.dict(os.environ, env, clear=True):
            results = [
                self.client.post(
                    "/alchemy/gas-policy/inspect",
                    json=self._payload(call_data, hex(nonce)),
                ).json()["approved"]
                for nonce in range(5)
            ]

        self.assertEqual(results, [True, True, True, True, False])

    def test_repeated_user_operation_is_not_double_charged(self) -> None:
        call_data = _execute_call_data(
            REGISTRY_ADDRESS,
            _selector("register(string)") + encode(["string"], ["USA"]),
        )
        env = {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "REGISTRY_MODE": "dev",
            "GAS_SPONSORSHIP_RATE_LIMIT_DB": self.db_path,
            "GAS_SPONSORSHIP_RATE_LIMIT_CAPACITY_GAS": "800000",
            "GAS_SPONSORSHIP_RATE_LIMIT_LEAK_GAS_PER_DAY": "0",
        }
        with patch.dict(os.environ, env, clear=True):
            # Same nonce five times: only the first consumes budget (200000 gas),
            # so distinct later ops still fit under the 800000-gas capacity.
            for _ in range(5):
                same = self.client.post(
                    "/alchemy/gas-policy/inspect",
                    json=self._payload(call_data, "0x1"),
                )
                self.assertTrue(same.json()["approved"])

            distinct = [
                self.client.post(
                    "/alchemy/gas-policy/inspect",
                    json=self._payload(call_data, hex(nonce)),
                ).json()["approved"]
                for nonce in range(10, 14)
            ]

        # 200000 (deduped) + 200000*3 = 800000 fits; the fourth distinct op does not.
        self.assertEqual(distinct, [True, True, True, False])

    @staticmethod
    def _mock_register_call_data(nullifier: bytes) -> bytes:
        # Mock mode's register(params) shares production's tuple; the scoped
        # nullifier the registry stores is publicInputs[len - 2].
        public_inputs = [b"\x00" * 32] * 6 + [nullifier, b"\x00" * 32]
        params = (
            b"\x00" * 32,
            (b"\x00" * 32, b"", public_inputs),
            b"",
            (0, "", "", False),
        )
        params_type = (
            "(bytes32,(bytes32,bytes,bytes32[]),bytes,(uint256,string,string,bool))"
        )
        return _selector(REGISTER_PRODUCTION_SIGNATURE) + encode(
            [params_type], [params]
        )

    def test_mock_registration_meters_by_parsed_nullifier(self) -> None:
        # Mock mode has no on-chain verifier: the id is parsed from the proof
        # params locally (publicInputs[len - 2], no RPC), so five ops keyed by
        # that same nullifier exhaust an 800000-gas / 200000-per-op bucket after
        # four.
        nullifier = bytes.fromhex("ab" * 32)
        call_data = _execute_call_data(
            REGISTRY_ADDRESS, self._mock_register_call_data(nullifier)
        )
        env = {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "REGISTRY_MODE": "mock",
            "GAS_SPONSORSHIP_RATE_LIMIT_DB": self.db_path,
            "GAS_SPONSORSHIP_RATE_LIMIT_CAPACITY_GAS": "800000",
            "GAS_SPONSORSHIP_RATE_LIMIT_LEAK_GAS_PER_DAY": "0",
        }
        with patch.dict(os.environ, env, clear=True):
            results = [
                self.client.post(
                    "/alchemy/gas-policy/inspect",
                    json=self._payload(call_data, hex(nonce)),
                ).json()["approved"]
                for nonce in range(5)
            ]

        self.assertEqual(results, [True, True, True, True, False])

    def test_forum_submit_metered_and_approved(self) -> None:
        call_data = _execute_call_data(
            FORUM_ADDRESS,
            _add_statement_call_data("hello", 1),
        )
        env = {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "FORUM_CONTRACT_ADDRESSES": FORUM_ADDRESS,
            "REGISTRY_MODE": "production",
            "GAS_SPONSORSHIP_RATE_LIMIT_DB": self.db_path,
            "GAS_SPONSORSHIP_RPC_URL": "http://rpc.invalid",
        }
        resolver = AsyncMock(return_value="0x" + "11" * 32)
        with patch.dict(os.environ, env, clear=True), patch.object(
            identity, "resolve_forum_user_id", resolver
        ):
            response = self.client.post(
                "/alchemy/gas-policy/inspect",
                json=self._payload(call_data, "0x1"),
            )

        self.assertEqual(response.json(), {"approved": True})
        resolver.assert_awaited_once()

    def test_forum_submit_rejected_when_over_capacity(self) -> None:
        call_data = _execute_call_data(
            FORUM_ADDRESS,
            _add_statement_call_data("hello", 1),
        )
        env = {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "FORUM_CONTRACT_ADDRESSES": FORUM_ADDRESS,
            "REGISTRY_MODE": "production",
            "GAS_SPONSORSHIP_RATE_LIMIT_DB": self.db_path,
            "GAS_SPONSORSHIP_RPC_URL": "http://rpc.invalid",
            "GAS_SPONSORSHIP_RATE_LIMIT_CAPACITY_GAS": "100000",
        }
        resolver = AsyncMock(return_value="0x" + "22" * 32)
        with patch.dict(os.environ, env, clear=True), patch.object(
            identity, "resolve_forum_user_id", resolver
        ):
            # gas cost 200000 > capacity 100000.
            response = self.client.post(
                "/alchemy/gas-policy/inspect",
                json=self._payload(call_data, "0x1"),
            )

        self.assertEqual(response.json(), {"approved": False})

    def test_forum_submit_rejected_when_gas_fields_missing(self) -> None:
        call_data = _execute_call_data(
            FORUM_ADDRESS,
            _add_statement_call_data("hello", 1),
        )
        env = {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "FORUM_CONTRACT_ADDRESSES": FORUM_ADDRESS,
            "REGISTRY_MODE": "production",
            "GAS_SPONSORSHIP_RATE_LIMIT_DB": self.db_path,
            "GAS_SPONSORSHIP_RPC_URL": "http://rpc.invalid",
        }
        resolver = AsyncMock(return_value="0x" + "33" * 32)
        payload = {
            "policyId": "policy-test",
            "chainId": "84532",
            "userOperation": {
                "sender": self.sender,
                "nonce": "0x1",
                "callData": call_data,
            },
        }
        with patch.dict(os.environ, env, clear=True), patch.object(
            identity, "resolve_forum_user_id", resolver
        ):
            response = self.client.post(
                "/alchemy/gas-policy/inspect", json=payload
            )

        # No gas-limit fields => nothing to meter => fail closed (self-fund).
        self.assertEqual(response.json(), {"approved": False})

    def test_forum_submit_rejected_when_user_id_unresolvable(self) -> None:
        call_data = _execute_call_data(
            FORUM_ADDRESS,
            _add_statement_call_data("hello", 1),
        )
        env = {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "FORUM_CONTRACT_ADDRESSES": FORUM_ADDRESS,
            "REGISTRY_MODE": "production",
            "GAS_SPONSORSHIP_RATE_LIMIT_DB": self.db_path,
            "GAS_SPONSORSHIP_RPC_URL": "http://rpc.invalid",
        }
        resolver = AsyncMock(return_value=None)
        with patch.dict(os.environ, env, clear=True), patch.object(
            identity, "resolve_forum_user_id", resolver
        ):
            response = self.client.post(
                "/alchemy/gas-policy/inspect",
                json=self._payload(call_data, "0x1"),
            )

        # Fail closed: an unresolvable id means we decline (user self-funds).
        self.assertEqual(response.json(), {"approved": False})


class GasSponsorshipEligibilityTests(unittest.TestCase):
    def setUp(self) -> None:
        app = FastAPI()
        create_api(app)
        self.client = TestClient(app)
        directory = tempfile.mkdtemp()
        self.db_path = os.path.join(directory, "sponsorship.db")
        self.sender = "0x0000000000000000000000000000000000000abc"
        # The webhook meters this sender against its reproduced dev id; the
        # preview must pass the same id so both hit the same bucket.
        self.user_id = identity.dev_registration_user_id(self.sender)

    def _payload(self, call_data: str, nonce: str, *, gas: int = 200_000) -> dict:
        call_gas = gas // 2
        verification_gas = gas // 4
        pre_verification_gas = gas - call_gas - verification_gas
        return {
            "userOperation": {
                "sender": self.sender,
                "nonce": nonce,
                "callData": call_data,
                "callGasLimit": hex(call_gas),
                "verificationGasLimit": hex(verification_gas),
                "preVerificationGas": hex(pre_verification_gas),
            },
        }

    def _eligibility_payload(
        self,
        call_data: str,
        nonce: str,
        *,
        gas: int = 200_000,
        user_id: str | None = None,
    ) -> dict:
        payload = self._payload(call_data, nonce, gas=gas)
        payload["userId"] = self.user_id if user_id is None else user_id
        return payload

    def _dev_register_call_data(self) -> str:
        return _execute_call_data(
            REGISTRY_ADDRESS,
            _selector("register(string)") + encode(["string"], ["USA"]),
        )

    def test_eligibility_reports_sponsored_without_consuming(self) -> None:
        call_data = self._dev_register_call_data()
        env = {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "REGISTRY_MODE": "dev",
            "GAS_SPONSORSHIP_RATE_LIMIT_DB": self.db_path,
            "GAS_SPONSORSHIP_RATE_LIMIT_CAPACITY_GAS": "800000",
            "GAS_SPONSORSHIP_RATE_LIMIT_LEAK_GAS_PER_DAY": "0",
        }
        with patch.dict(os.environ, env, clear=True):
            # Capacity only covers four 200000-gas actions, but peeking never
            # consumes, so every preview stays sponsored.
            previews = [
                self.client.post(
                    "/alchemy/gas-policy/eligibility",
                    json=self._eligibility_payload(call_data, hex(nonce)),
                ).json()
                for nonce in range(10)
            ]
            # The bucket is untouched, so live metering still grants four actions.
            approvals = [
                self.client.post(
                    "/alchemy/gas-policy/inspect",
                    json=self._payload(call_data, hex(nonce)),
                ).json()["approved"]
                for nonce in range(100, 105)
            ]

        self.assertTrue(all(p["status"] == "sponsored" for p in previews))
        self.assertEqual(approvals, [True, True, True, True, False])

    def test_eligibility_reports_rate_limited_when_budget_exhausted(self) -> None:
        call_data = self._dev_register_call_data()
        env = {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "REGISTRY_MODE": "dev",
            "GAS_SPONSORSHIP_RATE_LIMIT_DB": self.db_path,
            "GAS_SPONSORSHIP_RATE_LIMIT_CAPACITY_GAS": "300000",
            # 1 gas/second leak keeps retry_after finite and positive.
            "GAS_SPONSORSHIP_RATE_LIMIT_LEAK_GAS_PER_DAY": "86400",
        }
        with patch.dict(os.environ, env, clear=True):
            # Consume the whole 300000-gas bucket with a real sponsored action.
            first = self.client.post(
                "/alchemy/gas-policy/inspect",
                json=self._payload(call_data, "0x1", gas=300_000),
            )
            self.assertTrue(first.json()["approved"])
            # A preview for another 300000-gas action no longer fits.
            preview = self.client.post(
                "/alchemy/gas-policy/eligibility",
                json=self._eligibility_payload(call_data, "0x2", gas=300_000),
            ).json()

        self.assertEqual(preview["status"], "rate_limited")
        self.assertIsNotNone(preview["retry_after_seconds"])
        self.assertGreater(preview["retry_after_seconds"], 0)

    def test_eligibility_reports_ineligible_for_unsponsored_target(self) -> None:
        # A call to a contract that is neither the registry nor a forum.
        call_data = _execute_call_data(
            "0x00000000000000000000000000000000000000cc",
            _selector("register(string)") + encode(["string"], ["USA"]),
        )
        env = {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "REGISTRY_MODE": "dev",
            "GAS_SPONSORSHIP_RATE_LIMIT_DB": self.db_path,
            "GAS_SPONSORSHIP_RATE_LIMIT_CAPACITY_GAS": "800000",
            "GAS_SPONSORSHIP_RATE_LIMIT_LEAK_GAS_PER_DAY": "0",
        }
        with patch.dict(os.environ, env, clear=True):
            preview = self.client.post(
                "/alchemy/gas-policy/eligibility",
                json=self._payload(call_data, "0x1"),
            ).json()

        self.assertEqual(preview["status"], "ineligible")

    def test_eligibility_requires_user_id(self) -> None:
        # Without a client-supplied userId the endpoint must not resolve identity
        # server-side (which would trigger a registry RPC); it errors instead.
        call_data = _execute_call_data(
            FORUM_ADDRESS,
            _add_statement_call_data("hello", 1),
        )
        env = {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "FORUM_CONTRACT_ADDRESSES": FORUM_ADDRESS,
            "REGISTRY_MODE": "production",
            "GAS_SPONSORSHIP_RATE_LIMIT_DB": self.db_path,
            "GAS_SPONSORSHIP_RPC_URL": "http://rpc.invalid",
        }
        resolver = AsyncMock(return_value="0x" + "44" * 32)
        with patch.dict(os.environ, env, clear=True), patch.object(
            identity, "resolve_forum_user_id", resolver
        ):
            preview = self.client.post(
                "/alchemy/gas-policy/eligibility",
                json=self._payload(call_data, "0x1"),
            ).json()

        self.assertEqual(preview["status"], "error")
        resolver.assert_not_awaited()

    def test_eligibility_uses_client_user_id_hint_without_rpc(self) -> None:
        # A forum action would normally resolve the id via RPC; a valid client
        # hint lets the preview meter directly and skip that call entirely.
        call_data = _execute_call_data(
            FORUM_ADDRESS,
            _add_statement_call_data("hello", 1),
        )
        env = {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "FORUM_CONTRACT_ADDRESSES": FORUM_ADDRESS,
            "REGISTRY_MODE": "production",
            "GAS_SPONSORSHIP_RATE_LIMIT_DB": self.db_path,
            "GAS_SPONSORSHIP_RATE_LIMIT_CAPACITY_GAS": "800000",
            "GAS_SPONSORSHIP_RATE_LIMIT_LEAK_GAS_PER_DAY": "0",
            "GAS_SPONSORSHIP_RPC_URL": "http://rpc.invalid",
        }
        resolver = AsyncMock(return_value=None)
        payload = self._payload(call_data, "0x1")
        payload["userId"] = "0x" + "22" * 32
        with patch.dict(os.environ, env, clear=True), patch.object(
            identity, "resolve_forum_user_id", resolver
        ):
            preview = self.client.post(
                "/alchemy/gas-policy/eligibility",
                json=payload,
            ).json()

        self.assertEqual(preview["status"], "sponsored")
        resolver.assert_not_awaited()

    def test_eligibility_rejects_malformed_client_user_id(self) -> None:
        # A malformed userId is discarded (so it can't key a junk bucket) and,
        # with no server-side resolution, the endpoint errors without any RPC.
        call_data = _execute_call_data(
            FORUM_ADDRESS,
            _add_statement_call_data("hello", 1),
        )
        env = {
            "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE": "true",
            "REGISTRY_ADDRESS": REGISTRY_ADDRESS,
            "FORUM_CONTRACT_ADDRESSES": FORUM_ADDRESS,
            "REGISTRY_MODE": "production",
            "GAS_SPONSORSHIP_RATE_LIMIT_DB": self.db_path,
            "GAS_SPONSORSHIP_RATE_LIMIT_CAPACITY_GAS": "800000",
            "GAS_SPONSORSHIP_RATE_LIMIT_LEAK_GAS_PER_DAY": "0",
            "GAS_SPONSORSHIP_RPC_URL": "http://rpc.invalid",
        }
        resolver = AsyncMock(return_value="0x" + "33" * 32)
        payload = self._payload(call_data, "0x1")
        payload["userId"] = "not-a-bytes32"
        with patch.dict(os.environ, env, clear=True), patch.object(
            identity, "resolve_forum_user_id", resolver
        ):
            preview = self.client.post(
                "/alchemy/gas-policy/eligibility",
                json=payload,
            ).json()

        self.assertEqual(preview["status"], "error")
        resolver.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
