import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from symvolia.search_service.api import create_api


class FakeIndex:
    def __init__(self) -> None:
        self.similar_params = None

    def get_similar_documents(self, params):
        self.similar_params = params
        return {
            "hits": [
                {
                    "statementId": 8,
                    "statementText": "A related statement",
                    "lastEngagement": 42,
                }
            ],
            "estimatedTotalHits": 1,
        }


class FakeMeiliClient:
    def __init__(self, index: FakeIndex) -> None:
        self._index = index

    def index(self, _index_name: str) -> FakeIndex:
        return self._index


class SearchApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.index = FakeIndex()
        app = FastAPI()
        app.state.meili_client = FakeMeiliClient(self.index)
        create_api(app)
        self.client = TestClient(app)

    @patch("symvolia.search_service.api.semantic_search_enabled", return_value=True)
    def test_similar_search_scopes_to_forum_and_excludes_source(self, _enabled):
        response = self.client.get(
            "/similar",
            params={
                "statement_id": 7,
                "forum_address": "0x00000000000000000000000000000000000000AB",
                "limit": 250,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            [
                {
                    "statement_id": 8,
                    "statement_text": "A related statement",
                    "last_engagement": 42,
                }
            ],
        )
        self.assertEqual(
            self.index.similar_params,
            {
                "id": "0x00000000000000000000000000000000000000ab-7",
                "embedder": "statement-text",
                "filter": (
                    'forumAddress = "0x00000000000000000000000000000000000000AB" '
                    "AND statementId != 7"
                ),
                "limit": 100,
            },
        )

    @patch("symvolia.search_service.api.semantic_search_enabled", return_value=False)
    def test_similar_search_returns_unavailable_when_disabled(self, _enabled):
        response = self.client.get(
            "/similar",
            params={
                "statement_id": 7,
                "forum_address": "0x00000000000000000000000000000000000000AB",
            },
        )

        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
