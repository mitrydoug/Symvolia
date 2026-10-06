"""Standalone search-API entry-point.

Run with:
    uvicorn symvolia.search_service.main:app --host 0.0.0.0 --port 8000

Or via FastAPI CLI:
    fastapi run src/symvolia/search_service/main.py
"""

import os

import meilisearch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from symvolia.gas_sponsorship.api import create_api as create_gas_sponsorship_api
from symvolia.rpc_relay.api import create_api as create_rpc_relay_api
from symvolia.search_service.api import create_api

MEILI_URL = os.getenv("MEILI_URL", "http://localhost:7700")
MEILI_API_KEY = os.getenv("MEILI_API_KEY", "")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "")

app = FastAPI(title="Symvolia Search API")

if CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS.split(","),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.state.meili_client = meilisearch.Client(MEILI_URL, MEILI_API_KEY)
create_api(app)
create_rpc_relay_api(app)
create_gas_sponsorship_api(app)
