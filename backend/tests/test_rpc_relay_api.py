import os
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from symvolia.rpc_relay.api import create_api


class RpcRelayApiTests(unittest.TestCase):
    def client_for_env(self, env: dict[str, str]) -> TestClient:
        with patch.dict(os.environ, env, clear=True):
            app = FastAPI()
            create_api(app)
        return TestClient(app)

    @patch("symvolia.rpc_relay.api._forward_json_rpc", new_callable=AsyncMock)
    def test_allows_configured_method(self, forward_mock: AsyncMock) -> None:
        client = self.client_for_env(
            {
                "RELAY_RPC_URL": "https://rpc.example",
                "RPC_RELAY_ALLOWED_METHODS": "eth_blockNumber",
            }
        )
        forward_mock.return_value = {"jsonrpc": "2.0", "id": 1, "result": "0x10"}

        response = client.post(
            "/rpc",
            json={"jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": []},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"jsonrpc": "2.0", "id": 1, "result": "0x10"})
        forward_mock.assert_awaited_once()

    @patch("symvolia.rpc_relay.api._forward_json_rpc", new_callable=AsyncMock)
    def test_blocks_unconfigured_method(self, forward_mock: AsyncMock) -> None:
        client = self.client_for_env(
            {
                "RELAY_RPC_URL": "https://rpc.example",
                "RPC_RELAY_ALLOWED_METHODS": "eth_blockNumber",
            }
        )

        response = client.post(
            "/rpc",
            json={"jsonrpc": "2.0", "id": 2, "method": "eth_getLogs", "params": []},
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()["error"]["message"],
            "RPC method id 'eth_getLogs' is not allowed",
        )
        forward_mock.assert_not_awaited()

    @patch("symvolia.rpc_relay.api._forward_json_rpc", new_callable=AsyncMock)
    def test_configuration_is_loaded_once_at_app_startup(
        self,
        forward_mock: AsyncMock,
    ) -> None:
        client = self.client_for_env(
            {
                "RELAY_RPC_URL": "https://rpc.example",
                "RPC_RELAY_ALLOWED_METHODS": "eth_blockNumber",
            }
        )

        with patch.dict(
            os.environ,
            {"RPC_RELAY_ALLOWED_METHODS": "eth_getLogs"},
            clear=True,
        ):
            response = client.post(
                "/rpc",
                json={"jsonrpc": "2.0", "id": 22, "method": "eth_getLogs", "params": []},
            )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()["error"]["message"],
            "RPC method id 'eth_getLogs' is not allowed",
        )
        forward_mock.assert_not_awaited()

    @patch("symvolia.rpc_relay.api._forward_json_rpc", new_callable=AsyncMock)
    def test_eth_call_allows_allowlisted_contract(self, forward_mock: AsyncMock) -> None:
        client = self.client_for_env(
            {
                "RELAY_RPC_URL": "https://rpc.example",
                "RPC_RELAY_ALLOWED_METHODS": "eth_call",
                "RPC_RELAY_ALLOWED_CONTRACTS": "0x00000000000000000000000000000000000000aa",
            }
        )
        forward_mock.return_value = {"jsonrpc": "2.0", "id": 3, "result": "0x"}

        response = client.post(
            "/rpc",
            json={
                "jsonrpc": "2.0",
                "id": 3,
                "method": "eth_call",
                "params": [
                    {
                        "to": "0x00000000000000000000000000000000000000AA",
                        "data": "0x12345678",
                    },
                    "latest",
                ],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"jsonrpc": "2.0", "id": 3, "result": "0x"})
        forward_mock.assert_awaited_once()

    @patch("symvolia.rpc_relay.api._forward_json_rpc", new_callable=AsyncMock)
    def test_eth_call_blocks_non_allowlisted_contract(self, forward_mock: AsyncMock) -> None:
        client = self.client_for_env(
            {
                "RELAY_RPC_URL": "https://rpc.example",
                "RPC_RELAY_ALLOWED_METHODS": "eth_call",
                "RPC_RELAY_ALLOWED_CONTRACTS": "0x00000000000000000000000000000000000000aa",
            }
        )

        response = client.post(
            "/rpc",
            json={
                "jsonrpc": "2.0",
                "id": 4,
                "method": "eth_call",
                "params": [
                    {
                        "to": "0x00000000000000000000000000000000000000bb",
                        "data": "0x12345678",
                    },
                    "latest",
                ],
            },
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()["error"]["message"],
            "RPC method id 'eth_call' not allowed for contract id "
            "'0x00000000000000000000000000000000000000bb'",
        )
        forward_mock.assert_not_awaited()

    @patch("symvolia.rpc_relay.api._forward_json_rpc", new_callable=AsyncMock)
    def test_eth_call_fails_closed_without_allowlisted_contracts(
        self,
        forward_mock: AsyncMock,
    ) -> None:
        client = self.client_for_env(
            {
                "RELAY_RPC_URL": "https://rpc.example",
                "RPC_RELAY_ALLOWED_METHODS": "eth_call",
            }
        )

        response = client.post(
            "/rpc",
            json={
                "jsonrpc": "2.0",
                "id": 5,
                "method": "eth_call",
                "params": [
                    {
                        "to": "0x00000000000000000000000000000000000000aa",
                        "data": "0x12345678",
                    },
                    "latest",
                ],
            },
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()["error"]["message"],
            "RPC method id 'eth_call' not allowed for contract id "
            "'0x00000000000000000000000000000000000000aa'",
        )
        forward_mock.assert_not_awaited()

    def test_invalid_contract_allowlist_fails_at_app_startup(self) -> None:
        with patch.dict(
            os.environ,
            {"RPC_RELAY_ALLOWED_CONTRACTS": "not-an-address"},
            clear=True,
        ):
            with self.assertRaisesRegex(ValueError, "not-an-address"):
                create_api(FastAPI())

    def test_invalid_timeout_fails_at_app_startup(self) -> None:
        with patch.dict(
            os.environ,
            {"RPC_RELAY_UPSTREAM_TIMEOUT_SECONDS": "0"},
            clear=True,
        ):
            with self.assertRaisesRegex(
                ValueError,
                "RPC_RELAY_UPSTREAM_TIMEOUT_SECONDS must be greater than 0",
            ):
                create_api(FastAPI())

    # ------------------------------------------------------------------ #
    # Multicall3 tests                                                     #
    # ------------------------------------------------------------------ #

    # aggregate3 calldata targeting 0xaa...aa and 0xbb...bb (two inner calls).
    # Generated with:
    #   import eth_abi
    #   selector = bytes.fromhex("82ad56cb")
    #   calls = [("0x" + "aa"*20, True, bytes.fromhex("d8457001")),
    #            ("0x" + "bb"*20, True, bytes.fromhex("b656c043"))]
    #   "0x" + (selector + eth_abi.encode(["(address,bool,bytes)[]"], [calls])).hex()
    _MULTICALL3_ADDRESS = "0xca11bde05977b3631167028862be2a173976ca11"
    _AGGREGATE3_AA_BB = (
        "0x82ad56cb"
        "0000000000000000000000000000000000000000000000000000000000000020"
        "0000000000000000000000000000000000000000000000000000000000000002"
        "0000000000000000000000000000000000000000000000000000000000000040"
        "00000000000000000000000000000000000000000000000000000000000000e0"
        "000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        "0000000000000000000000000000000000000000000000000000000000000001"
        "0000000000000000000000000000000000000000000000000000000000000060"
        "0000000000000000000000000000000000000000000000000000000000000004"
        "d845700100000000000000000000000000000000000000000000000000000000"
        "000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        "0000000000000000000000000000000000000000000000000000000000000001"
        "0000000000000000000000000000000000000000000000000000000000000060"
        "0000000000000000000000000000000000000000000000000000000000000004"
        "b656c04300000000000000000000000000000000000000000000000000000000"
    )

    @patch("symvolia.rpc_relay.api._forward_json_rpc", new_callable=AsyncMock)
    def test_multicall3_allows_all_allowlisted_inner_contracts(
        self, forward_mock: AsyncMock
    ) -> None:
        addr_aa = "0x" + "aa" * 20
        addr_bb = "0x" + "bb" * 20
        client = self.client_for_env(
            {
                "RELAY_RPC_URL": "https://rpc.example",
                "RPC_RELAY_ALLOWED_METHODS": "eth_call",
                "RPC_RELAY_ALLOWED_CONTRACTS": f"{addr_aa},{addr_bb}",
            }
        )
        forward_mock.return_value = {"jsonrpc": "2.0", "id": 10, "result": "0x"}

        response = client.post(
            "/rpc",
            json={
                "jsonrpc": "2.0",
                "id": 10,
                "method": "eth_call",
                "params": [
                    {"to": self._MULTICALL3_ADDRESS, "data": self._AGGREGATE3_AA_BB},
                    "latest",
                ],
            },
        )

        self.assertEqual(response.status_code, 200)
        forward_mock.assert_awaited_once()

    @patch("symvolia.rpc_relay.api._forward_json_rpc", new_callable=AsyncMock)
    def test_multicall3_blocks_non_allowlisted_inner_contract(
        self, forward_mock: AsyncMock
    ) -> None:
        # Only allow addr_aa; addr_bb is NOT in the allowlist.
        addr_aa = "0x" + "aa" * 20
        client = self.client_for_env(
            {
                "RELAY_RPC_URL": "https://rpc.example",
                "RPC_RELAY_ALLOWED_METHODS": "eth_call",
                "RPC_RELAY_ALLOWED_CONTRACTS": addr_aa,
            }
        )

        response = client.post(
            "/rpc",
            json={
                "jsonrpc": "2.0",
                "id": 11,
                "method": "eth_call",
                "params": [
                    {"to": self._MULTICALL3_ADDRESS, "data": self._AGGREGATE3_AA_BB},
                    "latest",
                ],
            },
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("inner contract", response.json()["error"]["message"])
        forward_mock.assert_not_awaited()

    @patch("symvolia.rpc_relay.api._forward_json_rpc", new_callable=AsyncMock)
    def test_multicall3_blocks_malformed_calldata(
        self, forward_mock: AsyncMock
    ) -> None:
        addr_aa = "0x" + "aa" * 20
        client = self.client_for_env(
            {
                "RELAY_RPC_URL": "https://rpc.example",
                "RPC_RELAY_ALLOWED_METHODS": "eth_call",
                "RPC_RELAY_ALLOWED_CONTRACTS": addr_aa,
            }
        )

        response = client.post(
            "/rpc",
            json={
                "jsonrpc": "2.0",
                "id": 12,
                "method": "eth_call",
                "params": [
                    # aggregate3 selector but garbage body
                    {"to": self._MULTICALL3_ADDRESS, "data": "0x82ad56cbdeadbeef"},
                    "latest",
                ],
            },
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("decode", response.json()["error"]["message"])
        forward_mock.assert_not_awaited()


class RpcRelayGetLogsTests(unittest.TestCase):
    _ADDR_AA = "0x" + "aa" * 20
    _ADDR_BB = "0x" + "bb" * 20

    def client_for_env(self, env: dict[str, str]) -> TestClient:
        with patch.dict(os.environ, env, clear=True):
            app = FastAPI()
            create_api(app)
        return TestClient(app)

    def _client(self, extra: dict[str, str] | None = None) -> TestClient:
        env = {
            "RELAY_RPC_URL": "https://rpc.example",
            "RPC_RELAY_ALLOWED_METHODS": "eth_getLogs",
            "RPC_RELAY_ALLOWED_CONTRACTS": self._ADDR_AA,
        }
        if extra:
            env.update(extra)
        return self.client_for_env(env)

    @patch("symvolia.rpc_relay.api._forward_json_rpc", new_callable=AsyncMock)
    def test_allows_allowlisted_address_and_bounded_range(
        self, forward_mock: AsyncMock
    ) -> None:
        client = self._client()
        forward_mock.return_value = {"jsonrpc": "2.0", "id": 1, "result": []}

        response = client.post(
            "/rpc",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "eth_getLogs",
                "params": [
                    {
                        "address": self._ADDR_AA.upper(),
                        "fromBlock": "0x0",
                        "toBlock": "0x64",
                    }
                ],
            },
        )

        self.assertEqual(response.status_code, 200)
        forward_mock.assert_awaited_once()

    @patch("symvolia.rpc_relay.api._forward_json_rpc", new_callable=AsyncMock)
    def test_allows_list_of_allowlisted_addresses(
        self, forward_mock: AsyncMock
    ) -> None:
        client = self._client(
            {"RPC_RELAY_ALLOWED_CONTRACTS": f"{self._ADDR_AA},{self._ADDR_BB}"}
        )
        forward_mock.return_value = {"jsonrpc": "2.0", "id": 2, "result": []}

        response = client.post(
            "/rpc",
            json={
                "jsonrpc": "2.0",
                "id": 2,
                "method": "eth_getLogs",
                "params": [
                    {
                        "address": [self._ADDR_AA, self._ADDR_BB],
                        # 1000 -> 1999: a full, window-aligned range.
                        "fromBlock": "0x3e8",
                        "toBlock": "0x7cf",
                    }
                ],
            },
        )

        self.assertEqual(response.status_code, 200)
        forward_mock.assert_awaited_once()

    @patch("symvolia.rpc_relay.api._forward_json_rpc", new_callable=AsyncMock)
    def test_blocks_non_allowlisted_address(self, forward_mock: AsyncMock) -> None:
        client = self._client()

        response = client.post(
            "/rpc",
            json={
                "jsonrpc": "2.0",
                "id": 3,
                "method": "eth_getLogs",
                "params": [
                    {
                        "address": self._ADDR_BB,
                        "fromBlock": "0x0",
                        "toBlock": "0x1",
                    }
                ],
            },
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("not allowed for contract", response.json()["error"]["message"])
        forward_mock.assert_not_awaited()

    @patch("symvolia.rpc_relay.api._forward_json_rpc", new_callable=AsyncMock)
    def test_blocks_missing_address(self, forward_mock: AsyncMock) -> None:
        client = self._client()

        response = client.post(
            "/rpc",
            json={
                "jsonrpc": "2.0",
                "id": 4,
                "method": "eth_getLogs",
                "params": [{"fromBlock": "0x0", "toBlock": "0x1"}],
            },
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("address is required", response.json()["error"]["message"])
        forward_mock.assert_not_awaited()

    @patch("symvolia.rpc_relay.api._forward_json_rpc", new_callable=AsyncMock)
    def test_blocks_named_block_tags(self, forward_mock: AsyncMock) -> None:
        client = self._client()

        response = client.post(
            "/rpc",
            json={
                "jsonrpc": "2.0",
                "id": 5,
                "method": "eth_getLogs",
                "params": [
                    {
                        "address": self._ADDR_AA,
                        "fromBlock": "0x0",
                        "toBlock": "latest",
                    }
                ],
            },
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("numeric block numbers", response.json()["error"]["message"])
        forward_mock.assert_not_awaited()

    @patch("symvolia.rpc_relay.api._forward_json_rpc", new_callable=AsyncMock)
    def test_blocks_range_exceeding_maximum(self, forward_mock: AsyncMock) -> None:
        client = self._client({"RPC_RELAY_GETLOGS_WINDOW_BLOCKS": "100"})

        response = client.post(
            "/rpc",
            json={
                "jsonrpc": "2.0",
                "id": 6,
                "method": "eth_getLogs",
                "params": [
                    {
                        "address": self._ADDR_AA,
                        "fromBlock": "0x0",
                        "toBlock": "0x64",  # span 101 > 100
                    }
                ],
            },
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("exceeds the", response.json()["error"]["message"])
        self.assertIn("window", response.json()["error"]["message"])
        forward_mock.assert_not_awaited()

    @patch("symvolia.rpc_relay.api._forward_json_rpc", new_callable=AsyncMock)
    def test_blocks_unaligned_from_block(self, forward_mock: AsyncMock) -> None:
        client = self._client()  # default window is 1000

        response = client.post(
            "/rpc",
            json={
                "jsonrpc": "2.0",
                "id": 8,
                "method": "eth_getLogs",
                "params": [
                    {
                        "address": self._ADDR_AA,
                        "fromBlock": "0x1f4",  # 500, not a multiple of 1000
                        "toBlock": "0x258",  # 600
                    }
                ],
            },
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("aligned", response.json()["error"]["message"])
        forward_mock.assert_not_awaited()

    @patch("symvolia.rpc_relay.api._forward_json_rpc", new_callable=AsyncMock)
    def test_blocks_inverted_range(self, forward_mock: AsyncMock) -> None:
        client = self._client()

        response = client.post(
            "/rpc",
            json={
                "jsonrpc": "2.0",
                "id": 7,
                "method": "eth_getLogs",
                "params": [
                    {
                        "address": self._ADDR_AA,
                        "fromBlock": "0x64",
                        "toBlock": "0x0",
                    }
                ],
            },
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("before fromBlock", response.json()["error"]["message"])
        forward_mock.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
