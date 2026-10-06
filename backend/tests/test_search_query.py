import unittest

from symvolia.search_query import MAX_MEILI_QUERY_TERMS, build_similarity_query


class BuildSimilarityQueryTest(unittest.TestCase):
    def test_removes_stop_words_and_limits_terms(self):
        query = build_similarity_query(
            "The city should invest in safer bike lanes and better transit "
            "because safer streets help students, workers, and families."
        )

        self.assertLessEqual(len(query.split()), MAX_MEILI_QUERY_TERMS)
        self.assertNotIn("the", query.split())
        self.assertNotIn("and", query.split())
        self.assertIn("safer", query.split())
        self.assertIn("transit", query.split())

    def test_repeated_terms_are_preferred(self):
        query = build_similarity_query(
            "alpha beta gamma delta epsilon zeta eta theta iota kappa "
            "lambda housing housing climate"
        )

        self.assertIn("housing", query.split())

    def test_falls_back_for_stop_word_only_text(self):
        self.assertEqual(build_similarity_query("the and of"), "the and of")

    def test_empty_when_text_has_no_tokens(self):
        self.assertEqual(build_similarity_query("?!..."), "")


if __name__ == "__main__":
    unittest.main()
