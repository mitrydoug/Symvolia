"""Search API routes for the Symvolia search service."""

import logging

import meilisearch
from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from symvolia.indexer import (
    SEMANTIC_EMBEDDER_NAME,
    STATEMENTS_INDEX,
    normalize_forum_contract_address,
    semantic_search_enabled,
    statement_document_id,
)
from symvolia.search_query import build_similarity_query

logger = logging.getLogger(__name__)


class SearchResult(BaseModel):
    statement_id: int
    statement_text: str
    last_engagement: int | None = None


def _to_search_results(hits: list[dict[str, object]]) -> list[SearchResult]:
    return [
        SearchResult(
            statement_id=int(hit["statementId"]),
            statement_text=str(hit["statementText"]),
            last_engagement=hit.get("lastEngagement"),
        )
        for hit in hits
    ]


def create_api(app: FastAPI) -> None:
    """Register search routes on *app*."""

    @app.get("/")
    async def root():
        return RedirectResponse(url="/docs")

    @app.get("/health")
    async def health_check():
        return {"status": "ok"}

    @app.get("/search")
    async def search(
        statement_text: str,
        forum_address: str,
    ) -> list[SearchResult]:
        """Full-text search over indexed statements.

        Results are always scoped to a single forum contract.

        Uses Meilisearch's ``frequency`` matching strategy so that
        rare/distinctive words are weighted higher than common ones.
        """
        # Normalize to EIP-55 checksum to match how addresses are stored in
        # the index. Meilisearch filter equality is case-sensitive, so a
        # lowercase address from the frontend would otherwise match nothing.
        normalized_forum_address = normalize_forum_contract_address(forum_address)

        query = build_similarity_query(statement_text)
        if not query:
            return []

        search_params: dict[str, object] = {
            "matchingStrategy": "frequency",
            "filter": f'forumAddress = "{normalized_forum_address}"',
        }

        results = app.state.meili_client.index(STATEMENTS_INDEX).search(
            query, search_params
        )
        hits = _to_search_results(results["hits"])
        logger.debug(
            "GET /search statement_text=%r query=%r forum=%s (normalized=%s) → %d hit(s) "
            "(estimatedTotalHits=%s): %s",
            statement_text,
            query,
            forum_address,
            normalized_forum_address,
            len(hits),
            results.get("estimatedTotalHits"),
            [h.model_dump() for h in hits],
        )
        return hits

    @app.get("/similar")
    async def similar(
        statement_id: int,
        forum_address: str,
        limit: int = 20,
    ) -> list[SearchResult]:
        """Semantic similar-documents search for an indexed statement.

        Results are always scoped to a single forum contract. If the semantic
        embedder is not configured or Meilisearch cannot run it, callers should
        fall back to the lexical ``/search`` endpoint.
        """
        if not semantic_search_enabled():
            raise HTTPException(
                status_code=503,
                detail="Semantic similar search is not enabled",
            )

        normalized_forum_address = normalize_forum_contract_address(forum_address)
        document_id = statement_document_id(normalized_forum_address, statement_id)
        bounded_limit = max(1, min(limit, 100))

        similar_params: dict[str, object] = {
            "id": document_id,
            "embedder": SEMANTIC_EMBEDDER_NAME,
            "filter": (
                f'forumAddress = "{normalized_forum_address}" '
                f"AND statementId != {statement_id}"
            ),
            "limit": bounded_limit,
        }

        try:
            results = app.state.meili_client.index(
                STATEMENTS_INDEX
            ).get_similar_documents(similar_params)
        except meilisearch.errors.MeilisearchApiError as exc:
            logger.warning(
                "GET /similar failed for document_id=%s forum=%s: %s",
                document_id,
                normalized_forum_address,
                exc,
            )
            raise HTTPException(
                status_code=503,
                detail="Semantic similar search is unavailable",
            ) from exc

        hits = _to_search_results(results["hits"])
        logger.debug(
            "GET /similar statement_id=%s document_id=%s forum=%s → %d hit(s) "
            "(estimatedTotalHits=%s): %s",
            statement_id,
            document_id,
            normalized_forum_address,
            len(hits),
            results.get("estimatedTotalHits"),
            [h.model_dump() for h in hits],
        )
        return hits
