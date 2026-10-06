"""JSON-RPC relay endpoint with strict method and contract allowlists."""

from __future__ import annotations

import logging
import os
import re
from typing import Any

import eth_abi
import httpx
from fastapi import Body, FastAPI, Request
from fastapi.responses import JSONResponse
from web3 import AsyncWeb3

logger = logging.getLogger(__name__)

# Default read-only methods used by the frontend's public client.
_DEFAULT_ALLOWED_METHODS = {
    "eth_blockNumber",
    "eth_call",
    "eth_chainId",
    "eth_estimateGas",
    "eth_getBlockByNumber",
    "eth_getCode",
    "eth_getLogs",
    "eth_getTransactionByHash",
    "eth_getTransactionReceipt",
}

# Methods whose params include a contract address that must be allowlisted.
_CONTRACT_SCOPED_METHODS = {"eth_call", "eth_estimateGas"}
# eth_getLogs is scoped separately: its filter object carries an address (or list
# of addresses) plus an explicit numeric block range that must be block-aligned
# and no larger than a single window.
_GETLOGS_METHOD = "eth_getLogs"
_METHOD_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_]+$")
_PAYLOAD_PREVIEW_CHARS = 500
# eth_getLogs requests must start on a multiple of this many blocks and span at
# most this many blocks. A fixed grid keeps historical windows canonical (so the
# upstream RPC can cache them) and bounds each request. Must match the frontend
# local-search GETLOGS_WINDOW_BLOCKS.
_DEFAULT_GETLOGS_WINDOW_BLOCKS = 1000

# Canonical Multicall3 address (CREATE2-deterministic, same on every EVM chain).
_MULTICALL3_ADDRESS = "0xca11bde05977b3631167028862be2a173976ca11"
# aggregate3(Call3[] calls) selector.
_AGGREGATE3_SELECTOR = bytes.fromhex("82ad56cb")
_AGGREGATE3_TYPES = ["(address,bool,bytes)[]"]


def _csv_values(raw: str) -> list[str]:
    return [value for value in re.split(r"[\s,]+", raw.strip()) if value]


def _load_allowed_methods() -> frozenset[str]:
    raw = os.getenv("RPC_RELAY_ALLOWED_METHODS", "").strip()
    methods = set(_DEFAULT_ALLOWED_METHODS) if not raw else set(_csv_values(raw))

    if not methods:
        raise ValueError("RPC_RELAY_ALLOWED_METHODS must include at least one method id")

    invalid_methods = sorted(
        method for method in methods if not _METHOD_NAME_PATTERN.fullmatch(method)
    )
    if invalid_methods:
        raise ValueError(
            "RPC_RELAY_ALLOWED_METHODS contains invalid method(s): "
            f"{', '.join(invalid_methods)}"
        )

    return frozenset(methods)


def _load_allowed_contracts() -> frozenset[str]:
    raw = os.getenv("RPC_RELAY_ALLOWED_CONTRACTS", "").strip()
    if not raw:
        raw = os.getenv("FORUM_CONTRACT_ADDRESSES", "").strip()

    allowed: set[str] = set()
    for candidate in _csv_values(raw):
        if not AsyncWeb3.is_address(candidate):
            raise ValueError(
                "RPC_RELAY_ALLOWED_CONTRACTS contains invalid contract: "
                f"{candidate}"
            )
        allowed.add(AsyncWeb3.to_checksum_address(candidate).lower())

    return frozenset(allowed)


def _load_upstream_timeout_seconds() -> float:
    raw = os.getenv("RPC_RELAY_UPSTREAM_TIMEOUT_SECONDS", "15").strip()
    try:
        timeout_seconds = float(raw)
    except ValueError as exc:
        raise ValueError(
            "RPC_RELAY_UPSTREAM_TIMEOUT_SECONDS must be a number; "
            f"got {raw!r}"
        ) from exc

    if timeout_seconds <= 0:
        raise ValueError(
            "RPC_RELAY_UPSTREAM_TIMEOUT_SECONDS must be greater than 0; "
            f"got {raw!r}"
        )

    return timeout_seconds


def _load_getlogs_window_blocks() -> int:
    raw = os.getenv("RPC_RELAY_GETLOGS_WINDOW_BLOCKS", "").strip()
    if not raw:
        return _DEFAULT_GETLOGS_WINDOW_BLOCKS

    try:
        window_blocks = int(raw)
    except ValueError as exc:
        raise ValueError(
            "RPC_RELAY_GETLOGS_WINDOW_BLOCKS must be an integer; "
            f"got {raw!r}"
        ) from exc

    if window_blocks <= 0:
        raise ValueError(
            "RPC_RELAY_GETLOGS_WINDOW_BLOCKS must be greater than 0; "
            f"got {raw!r}"
        )

    return window_blocks


def _error_response(request_id: Any, code: int, message: str) -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": code, "message": message},
    }


def _preview(value: Any) -> str:
    return repr(value)[:_PAYLOAD_PREVIEW_CHARS]


def _extract_contract_address(payload: dict[str, Any]) -> str | None:
    params = payload.get("params", [])
    if not isinstance(params, list) or not params:
        return None

    first_param = params[0]
    if not isinstance(first_param, dict):
        return None

    target = first_param.get("to")
    if not isinstance(target, str):
        return None

    return target


def _decode_multicall3_targets(calldata_hex: str) -> list[str] | None:
    """Return the inner target addresses from a Multicall3 aggregate3 call.

    Returns None if the calldata cannot be decoded as aggregate3.
    """
    try:
        raw = bytes.fromhex(calldata_hex.removeprefix("0x"))
    except ValueError:
        return None

    if len(raw) < 4 or raw[:4] != _AGGREGATE3_SELECTOR:
        return None

    try:
        (calls,) = eth_abi.decode(_AGGREGATE3_TYPES, raw[4:])
    except Exception:  # noqa: BLE001
        return None

    return [call[0] for call in calls]


def _validate_contract_scope(
    payload: dict[str, Any],
    allowed_contracts: frozenset[str],
) -> dict[str, Any] | None:
    request_id = payload.get("id")
    method = str(payload.get("method"))
    target = _extract_contract_address(payload)

    if target is None:
        logger.warning(
            "RPC relay rejected method %s request_id=%r: missing params[0].to; "
            "payload_preview=%s",
            method,
            request_id,
            _preview(payload),
        )
        return _error_response(
            request_id,
            -32602,
            f"Invalid params for RPC method id '{method}': expected params[0].to",
        )
    if not AsyncWeb3.is_address(target):
        logger.warning(
            "RPC relay rejected method %s request_id=%r: invalid contract %s",
            method,
            request_id,
            target,
        )
        return _error_response(
            request_id,
            -32602,
            f"Invalid contract id for RPC method id '{method}': {target}",
        )

    normalized_target = AsyncWeb3.to_checksum_address(target).lower()

    # Special case: Multicall3 aggregate3 — validate every inner target.
    if normalized_target == _MULTICALL3_ADDRESS:
        return _validate_multicall3_scope(payload, request_id, method, allowed_contracts)

    if normalized_target not in allowed_contracts:
        logger.warning(
            "RPC relay rejected method %s request_id=%r: contract %s is not allowlisted",
            method,
            request_id,
            normalized_target,
        )
        return _error_response(
            request_id,
            -32601,
            f"RPC method id '{method}' not allowed for contract id '{normalized_target}'",
        )

    return None


def _validate_multicall3_scope(
    payload: dict[str, Any],
    request_id: Any,
    method: str,
    allowed_contracts: frozenset[str],
) -> dict[str, Any] | None:
    """Validate that every inner target in a Multicall3 aggregate3 call is allowlisted."""
    params = payload.get("params", [])
    calldata: str = (params[0] or {}).get("data", "") if params else ""

    inner_targets = _decode_multicall3_targets(calldata)
    if inner_targets is None:
        logger.warning(
            "RPC relay rejected multicall3 method %s request_id=%r: "
            "could not decode aggregate3 calldata",
            method,
            request_id,
        )
        return _error_response(
            request_id,
            -32602,
            f"Invalid params for RPC method id '{method}': "
            "could not decode Multicall3 aggregate3 calldata",
        )

    for raw_addr in inner_targets:
        if not AsyncWeb3.is_address(raw_addr):
            logger.warning(
                "RPC relay rejected multicall3 method %s request_id=%r: "
                "invalid inner contract address %s",
                method,
                request_id,
                raw_addr,
            )
            return _error_response(
                request_id,
                -32602,
                f"Invalid inner contract id in Multicall3 call for RPC method id '{method}': "
                f"{raw_addr}",
            )
        normalized = AsyncWeb3.to_checksum_address(raw_addr).lower()
        if normalized not in allowed_contracts:
            logger.warning(
                "RPC relay rejected multicall3 method %s request_id=%r: "
                "inner contract %s is not allowlisted",
                method,
                request_id,
                normalized,
            )
            return _error_response(
                request_id,
                -32601,
                f"RPC method id '{method}' not allowed for inner contract id '{normalized}'",
            )

    logger.debug(
        "RPC relay approved multicall3 method %s request_id=%r with %d inner call(s)",
        method,
        request_id,
        len(inner_targets),
    )
    return None


def _parse_block_number(value: Any) -> int | None:
    """Parse a JSON-RPC block quantity into an int.

    Only concrete numeric values are accepted. Named tags such as "latest",
    "pending", "earliest", "safe", and "finalized" return None so callers can
    reject them (an unbounded tag would let a filter span the whole chain).
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 0 else None
    if isinstance(value, str):
        try:
            parsed = int(value, 16) if value.lower().startswith("0x") else int(value)
        except ValueError:
            return None
        return parsed if parsed >= 0 else None
    return None


def _validate_getlogs_scope(
    payload: dict[str, Any],
    allowed_contracts: frozenset[str],
    window_blocks: int,
) -> dict[str, Any] | None:
    """Validate an eth_getLogs filter.

    Enforces that (a) every filter address is allowlisted and (b) the numeric
    block range is aligned to the ``window_blocks`` grid and spans at most one
    window. Aligned, fixed-size windows keep historical queries canonical (so the
    upstream RPC can cache them) and bound each request against abuse.
    """
    request_id = payload.get("id")
    method = str(payload.get("method"))
    params = payload.get("params", [])

    if not isinstance(params, list) or not params or not isinstance(params[0], dict):
        logger.warning(
            "RPC relay rejected method %s request_id=%r: missing filter object; "
            "payload_preview=%s",
            method,
            request_id,
            _preview(payload),
        )
        return _error_response(
            request_id,
            -32602,
            f"Invalid params for RPC method id '{method}': expected a filter object",
        )

    filter_obj = params[0]

    raw_address = filter_obj.get("address")
    if raw_address is None:
        logger.warning(
            "RPC relay rejected method %s request_id=%r: filter has no address",
            method,
            request_id,
        )
        return _error_response(
            request_id,
            -32602,
            f"Invalid params for RPC method id '{method}': filter address is required",
        )

    addresses = raw_address if isinstance(raw_address, list) else [raw_address]
    if not addresses:
        return _error_response(
            request_id,
            -32602,
            f"Invalid params for RPC method id '{method}': filter address is required",
        )

    for candidate in addresses:
        if not isinstance(candidate, str) or not AsyncWeb3.is_address(candidate):
            logger.warning(
                "RPC relay rejected method %s request_id=%r: invalid filter address %r",
                method,
                request_id,
                candidate,
            )
            return _error_response(
                request_id,
                -32602,
                f"Invalid contract id for RPC method id '{method}': {candidate!r}",
            )
        normalized = AsyncWeb3.to_checksum_address(candidate).lower()
        if normalized not in allowed_contracts:
            logger.warning(
                "RPC relay rejected method %s request_id=%r: contract %s not allowlisted",
                method,
                request_id,
                normalized,
            )
            return _error_response(
                request_id,
                -32601,
                f"RPC method id '{method}' not allowed for contract id '{normalized}'",
            )

    if "blockHash" in filter_obj:
        # A blockHash filter targets exactly one block, so the range bound does
        # not apply. fromBlock/toBlock must not be combined with it.
        if "fromBlock" in filter_obj or "toBlock" in filter_obj:
            return _error_response(
                request_id,
                -32602,
                f"Invalid params for RPC method id '{method}': "
                "blockHash cannot be combined with fromBlock/toBlock",
            )
        return None

    from_block = _parse_block_number(filter_obj.get("fromBlock"))
    to_block = _parse_block_number(filter_obj.get("toBlock"))
    if from_block is None or to_block is None:
        logger.warning(
            "RPC relay rejected method %s request_id=%r: non-numeric block range "
            "fromBlock=%r toBlock=%r",
            method,
            request_id,
            filter_obj.get("fromBlock"),
            filter_obj.get("toBlock"),
        )
        return _error_response(
            request_id,
            -32602,
            f"Invalid params for RPC method id '{method}': "
            "fromBlock and toBlock must be explicit numeric block numbers",
        )

    if to_block < from_block:
        return _error_response(
            request_id,
            -32602,
            f"Invalid params for RPC method id '{method}': toBlock is before fromBlock",
        )

    if from_block % window_blocks != 0:
        logger.warning(
            "RPC relay rejected method %s request_id=%r: fromBlock %d is not aligned "
            "to a %d-block window",
            method,
            request_id,
            from_block,
            window_blocks,
        )
        return _error_response(
            request_id,
            -32602,
            f"Invalid params for RPC method id '{method}': fromBlock {from_block} "
            f"must be aligned to a multiple of {window_blocks}",
        )

    span_blocks = to_block - from_block + 1
    if span_blocks > window_blocks:
        logger.warning(
            "RPC relay rejected method %s request_id=%r: block span %d exceeds the "
            "%d-block window",
            method,
            request_id,
            span_blocks,
            window_blocks,
        )
        return _error_response(
            request_id,
            -32602,
            f"Invalid params for RPC method id '{method}': block span {span_blocks} "
            f"exceeds the {window_blocks}-block window",
        )

    logger.debug(
        "RPC relay approved method %s request_id=%r span=%d for %d address(es)",
        method,
        request_id,
        span_blocks,
        len(addresses),
    )
    return None


async def _forward_json_rpc(
    upstream_rpc_url: str,
    payload: dict[str, Any],
    timeout_seconds: float,
) -> dict[str, Any]:
    request_id = payload.get("id")
    method = payload.get("method")
    try:
        logger.debug(
            "RPC relay forwarding method %s request_id=%r to upstream",
            method,
            request_id,
        )
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(upstream_rpc_url, json=payload)
            response.raise_for_status()
        upstream_payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning(
            "RPC relay upstream call failed for method %s request_id=%r: %s",
            method,
            request_id,
            exc,
        )
        return _error_response(
            request_id,
            -32000,
            f"Upstream RPC request failed for method id '{method}'",
        )

    if not isinstance(upstream_payload, dict):
        logger.warning(
            "RPC relay upstream returned non-object response for method %s "
            "request_id=%r response_type=%s response_preview=%r",
            method,
            request_id,
            type(upstream_payload).__name__,
            _preview(upstream_payload),
        )
        return _error_response(
            request_id,
            -32000,
            f"Upstream RPC returned an invalid response for method id '{method}'",
        )

    return upstream_payload


def create_api(app: FastAPI) -> None:
    """Register constrained JSON-RPC relay routes on *app*."""

    allowed_methods = _load_allowed_methods()
    allowed_contracts = _load_allowed_contracts()
    # RELAY_RPC_URL is the dedicated RPC endpoint for the relay.
    upstream_rpc_url = os.getenv("RELAY_RPC_URL", "").strip()
    upstream_timeout_seconds = _load_upstream_timeout_seconds()
    getlogs_window_blocks = _load_getlogs_window_blocks()

    logger.info(
        "RPC relay configured with %d allowed method(s), %d allowed contract(s), "
        "upstream=%s, timeout=%ss, getlogs_window_blocks=%d",
        len(allowed_methods),
        len(allowed_contracts),
        "configured" if upstream_rpc_url else "missing",
        upstream_timeout_seconds,
        getlogs_window_blocks,
    )

    @app.post("/rpc")
    async def rpc_relay(
        request: Request,
        payload: Any = Body(...),
    ) -> JSONResponse:
        if isinstance(payload, list):
            logger.warning(
                "RPC relay rejected batch request from %s payload_preview=%s",
                request.client.host if request.client else "unknown",
                _preview(payload),
            )
            return JSONResponse(
                _error_response(
                    None,
                    -32600,
                    "Batch JSON-RPC requests are not supported",
                ),
                status_code=400,
            )
        if not isinstance(payload, dict):
            logger.warning(
                "RPC relay rejected non-object request from %s payload_type=%s "
                "payload_preview=%s",
                request.client.host if request.client else "unknown",
                type(payload).__name__,
                _preview(payload),
            )
            return JSONResponse(
                _error_response(None, -32600, "Invalid JSON-RPC request object"),
                status_code=400,
            )

        request_id = payload.get("id")
        method = payload.get("method")
        logger.info(
            "RPC relay received request method=%r request_id=%r from=%s",
            method,
            request_id,
            request.client.host if request.client else "unknown",
        )

        if payload.get("jsonrpc") != "2.0":
            logger.warning(
                "RPC relay rejected invalid JSON-RPC version for method=%r "
                "request_id=%r version=%r",
                method,
                request_id,
                payload.get("jsonrpc"),
            )
            return JSONResponse(
                _error_response(request_id, -32600, "Invalid JSON-RPC version"),
                status_code=400,
            )

        if not isinstance(method, str) or not method:
            logger.warning(
                "RPC relay rejected invalid method for request_id=%r method=%r",
                request_id,
                method,
            )
            return JSONResponse(
                _error_response(request_id, -32600, "Invalid JSON-RPC method"),
                status_code=400,
            )

        if method not in allowed_methods:
            logger.warning(
                "RPC relay rejected disallowed method %s request_id=%r",
                method,
                request_id,
            )
            return JSONResponse(
                _error_response(
                    request_id,
                    -32601,
                    f"RPC method id '{method}' is not allowed",
                ),
                status_code=403,
            )

        if method in _CONTRACT_SCOPED_METHODS:
            policy_error = _validate_contract_scope(payload, allowed_contracts)
            if policy_error is not None:
                return JSONResponse(policy_error, status_code=403)

        if method == _GETLOGS_METHOD:
            policy_error = _validate_getlogs_scope(
                payload, allowed_contracts, getlogs_window_blocks
            )
            if policy_error is not None:
                return JSONResponse(policy_error, status_code=403)

        if not upstream_rpc_url:
            logger.warning(
                "RPC relay cannot forward method %s request_id=%r: RELAY_RPC_URL missing",
                method,
                request_id,
            )
            return JSONResponse(
                _error_response(
                    request_id,
                    -32000,
                    f"RELAY_RPC_URL is not configured for RPC method id '{method}'",
                ),
                status_code=503,
            )

        upstream_response = await _forward_json_rpc(
            upstream_rpc_url=upstream_rpc_url,
            payload=payload,
            timeout_seconds=upstream_timeout_seconds,
        )
        return JSONResponse(upstream_response)
