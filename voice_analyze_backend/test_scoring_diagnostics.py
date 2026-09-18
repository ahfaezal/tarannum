import ast
import random
import unittest
from pathlib import Path

from scoring_diagnostics import NearestPitchTime, numeric_score


class ScoringDiagnosticsTests(unittest.TestCase):
    def test_zero_is_not_replaced_by_contour(self):
        for key in ('graph_stability_score', 'graph_position_score', 'contour_detail_score', 'ayat_graph_score'):
            self.assertEqual(numeric_score({key: 0.0}, key, 77.87), 0.0)

    def test_missing_and_null_keep_legacy_fallback(self):
        for value in ({}, {'score': None}, {'score': 'invalid'}):
            self.assertEqual(numeric_score(value, 'score', 77.87), 77.87)
        self.assertEqual(numeric_score({'score': 23.644}, 'score', 77.87), 23.64)

    def test_index_matches_original_search_including_ties_and_edges(self):
        rng = random.Random(42)
        keys = list(range(1000))
        rng.shuffle(keys)
        index = NearestPitchTime(keys)
        for target in [-10, 0, 1001, 0.5, 999.5] + [rng.uniform(-10, 1010) for _ in range(500)]:
            self.assertEqual(index.nearest(target), min(keys, key=lambda value: abs(value - target)))
        self.assertIsNone(NearestPitchTime([]).nearest(0))

    def test_response_mapping_uses_zero_safe_helper(self):
        tree = ast.parse(Path(__file__).with_name('main.py').read_text(encoding='utf-8'))
        fields = {}
        for node in ast.walk(tree):
            if isinstance(node, ast.Dict):
                for key, value in zip(node.keys, node.values):
                    if isinstance(key, ast.Constant) and key.value in ('graphStability', 'graphPosition', 'contourDetail', 'ayatGraph'):
                        fields[key.value] = ast.unparse(value)
        self.assertEqual(len(fields), 4)
        for expression in fields.values():
            self.assertTrue(expression.startswith('numeric_score('), expression)


if __name__ == '__main__':
    unittest.main()
