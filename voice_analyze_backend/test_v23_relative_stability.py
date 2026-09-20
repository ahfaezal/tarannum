import unittest

from scoring_engine import compute_relative_melodic_stability


class RelativeMelodicStabilityTests(unittest.TestCase):
    def test_matching_melodic_motion_scores_full_marks(self):
        metrics = {"stdDev": 2.3, "coefficientOfVariation": 0.04, "changeRate": 3.3}
        self.assertEqual(compute_relative_melodic_stability(metrics, metrics), 100.0)

    def test_moderate_difference_remains_realistic(self):
        reference = {"stdDev": 2.3, "coefficientOfVariation": 0.04, "changeRate": 3.3}
        student = {"stdDev": 3.0, "coefficientOfVariation": 0.052, "changeRate": 4.1}
        score = compute_relative_melodic_stability(reference, student)
        self.assertGreaterEqual(score, 80.0)
        self.assertLess(score, 95.0)

    def test_large_difference_is_still_penalised(self):
        reference = {"stdDev": 2.0, "coefficientOfVariation": 0.04, "changeRate": 3.0}
        student = {"stdDev": 5.0, "coefficientOfVariation": 0.10, "changeRate": 7.0}
        self.assertLess(compute_relative_melodic_stability(reference, student), 40.0)

    def test_missing_reference_metric_fails_closed(self):
        reference = {"stdDev": 0.0, "coefficientOfVariation": 0.0, "changeRate": 0.0}
        student = {"stdDev": 2.0, "coefficientOfVariation": 0.04, "changeRate": 3.0}
        self.assertEqual(compute_relative_melodic_stability(reference, student), 0.0)


if __name__ == "__main__":
    unittest.main()
