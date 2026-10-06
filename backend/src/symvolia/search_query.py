"""Utilities for turning statement text into Meilisearch queries."""

import re
from collections import Counter

MAX_MEILI_QUERY_TERMS = 10

STOP_WORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "but",
        "by",
        "can",
        "could",
        "did",
        "do",
        "does",
        "for",
        "from",
        "had",
        "has",
        "have",
        "he",
        "her",
        "his",
        "how",
        "i",
        "if",
        "in",
        "is",
        "it",
        "its",
        "let",
        "may",
        "might",
        "must",
        "my",
        "need",
        "not",
        "of",
        "on",
        "or",
        "our",
        "own",
        "shall",
        "she",
        "should",
        "so",
        "than",
        "that",
        "the",
        "their",
        "them",
        "then",
        "there",
        "these",
        "they",
        "this",
        "to",
        "too",
        "us",
        "very",
        "was",
        "we",
        "were",
        "what",
        "when",
        "which",
        "who",
        "will",
        "with",
        "would",
        "you",
        "your",
    }
)

_TOKEN_RE = re.compile(r"[a-z0-9]+(?:['-][a-z0-9]+)*", re.IGNORECASE)


def build_similarity_query(statement_text: str) -> str:
    """Return a compact keyword query for finding similar statements.

    Meilisearch only considers the first ten words of a query. Passing an
    entire statement can therefore over-constrain the search and hide later,
    more distinctive terms. This keeps up to ten non-stop-word tokens, favoring
    repeated and longer terms while preserving their original order.
    """
    tokens = [
        match.group(0).lower().strip("'-")
        for match in _TOKEN_RE.finditer(statement_text)
    ]
    content_tokens = [
        token
        for token in tokens
        if len(token) >= 2 and token not in STOP_WORDS and not token.isnumeric()
    ]

    if not content_tokens:
        return " ".join(tokens[:MAX_MEILI_QUERY_TERMS])

    counts = Counter(content_tokens)
    first_positions = {
        token: content_tokens.index(token) for token in dict.fromkeys(content_tokens)
    }

    ranked_tokens = sorted(
        first_positions,
        key=lambda token: (
            -counts[token],
            -min(len(token), 16),
            first_positions[token],
        ),
    )[:MAX_MEILI_QUERY_TERMS]
    selected = sorted(ranked_tokens, key=first_positions.__getitem__)
    return " ".join(selected)
