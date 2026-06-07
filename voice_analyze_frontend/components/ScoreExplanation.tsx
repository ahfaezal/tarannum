import React, { useState } from "react";
import { HelpCircle, X, TrendingUp, Music, Volume2, Target } from "lucide-react";

interface ScoreBreakdown {
  pitch?: number; // Pitch accuracy (0-100)
  timing?: number; // Timing/rhythm (0-100) - derived from base_score
  pronunciation?: number; // Pronunciation (0-100) - derived from base_score
  overall: number; // Overall score (0-100)
}

interface ScoreExplanationProps {
  score: number; // Overall score (0-100)
  breakdown?: ScoreBreakdown; // Optional detailed breakdown
  className?: string;
}

/**
 * Score Explanation Component
 * 
 * Displays a help icon next to the score that opens a modal explaining:
 * - What the score represents
 * - Score breakdown (Pitch, Timing, Pronunciation)
 * - Teacher-friendly explanation
 * - What to focus on suggestions
 */
const ScoreExplanation: React.FC<ScoreExplanationProps> = ({
  score,
  breakdown,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // If breakdown is not provided, estimate it from overall score
  // This is a fallback until backend provides detailed breakdown
  const getBreakdown = (): ScoreBreakdown => {
    if (breakdown) return breakdown;

    // Estimate breakdown from overall score
    // In reality, these come from backend: base_score (pronunciation/timing) and pitch_score
    // For now, we'll use the overall score as approximation
    return {
      pitch: score * 0.5, // Estimate: 50% of score
      timing: score * 0.3, // Estimate: 30% of score
      pronunciation: score * 0.2, // Estimate: 20% of score
      overall: score,
    };
  };

  const breakdownData = getBreakdown();

  // Determine focus areas based on breakdown
  const getFocusAreas = (): string[] => {
    const areas: string[] = [];
    const threshold = 70;

    if ((breakdownData.pitch || 0) < threshold) {
      areas.push("Pitch accuracy - focus on matching the melodic contour");
    }
    if ((breakdownData.timing || 0) < threshold) {
      areas.push("Timing and rhythm - practice with the reference audio");
    }
    if ((breakdownData.pronunciation || 0) < threshold) {
      areas.push("Pronunciation clarity - listen carefully to each word");
    }

    if (areas.length === 0) {
      areas.push("Continue practicing to maintain your excellent performance");
    }

    return areas;
  };

  const focusAreas = getFocusAreas();

  // Get score category
  const getScoreCategory = (): {
    label: string;
    color: string;
    bgColor: string;
  } => {
    if (score >= 80) {
      return {
        label: "Excellent",
        color: "text-emerald-600",
        bgColor: "bg-emerald-50",
      };
    } else if (score >= 60) {
      return {
        label: "Good",
        color: "text-amber-600",
        bgColor: "bg-amber-50",
      };
    } else {
      return {
        label: "Developing",
        color: "text-red-600",
        bgColor: "bg-red-50",
      };
    }
  };

  const category = getScoreCategory();

  return (
    <>
      {/* Help Icon Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors ${className}`}
        title="Learn more about this score"
        aria-label="Score explanation"
      >
        <HelpCircle size={18} />
      </button>

      {/* Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-bold text-slate-800">
                Understanding Your Score
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Close"
              >
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Simple Explanation */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-slate-700 leading-relaxed">
                  <strong className="font-semibold text-blue-900">
                    What does this score mean?
                  </strong>
                  <br />
                  This score measures how closely your recitation matches the
                  reference audio across three key dimensions:
                </p>
                <ul className="mt-2 space-y-1 text-sm text-slate-700 list-disc list-inside">
                  <li>
                    <strong>Pitch (50%):</strong> How well your melodic contour 
                    (the shape of your voice's pitch) matches the reference
                  </li>
                  <li>
                    <strong>Timing & Rhythm (16%):</strong> How well your tempo, 
                    rhythm, and timing match the reference
                  </li>
                  <li>
                    <strong>Pronunciation (34%):</strong> How clearly and accurately 
                    you pronounce each word, including voice timbre and clarity
                  </li>
                </ul>
                <p className="mt-2 text-sm text-slate-600 italic">
                  A higher score indicates a closer match across all these dimensions. 
                  All scores—overall and per segment—are normalized to 0–100%. 
                  The score ranges from 0% (completely different) to 100% (perfect match).
                </p>
              </div>

              {/* Score Breakdown */}
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">
                  Score Breakdown
                </h3>
                <div className="space-y-4">
                  {/* Pitch Accuracy */}
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                      <Music className="text-purple-600" size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700">
                          Pitch Accuracy
                        </span>
                        <span className="text-sm font-bold text-slate-800">
                          {breakdownData.pitch?.toFixed(1) || "N/A"}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-purple-500 h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, breakdownData.pitch || 0)}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        How well your pitch contour matches the reference melody
                      </p>
                    </div>
                  </div>

                  {/* Timing/Rhythm */}
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <TrendingUp className="text-blue-600" size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700">
                          Timing & Rhythm
                        </span>
                        <span className="text-sm font-bold text-slate-800">
                          {breakdownData.timing?.toFixed(1) || "N/A"}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, breakdownData.timing || 0)}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        How well your timing and rhythm match the reference
                      </p>
                    </div>
                  </div>

                  {/* Pronunciation */}
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                      <Volume2 className="text-emerald-600" size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700">
                          Pronunciation
                        </span>
                        <span className="text-sm font-bold text-slate-800">
                          {breakdownData.pronunciation?.toFixed(1) || "N/A"}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-emerald-500 h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              breakdownData.pronunciation || 0
                            )}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        How clearly and accurately you pronounce each word
                      </p>
                    </div>
                  </div>

                  {/* Overall Score */}
                  <div className="pt-4 border-t border-slate-200">
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0 w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                        <Target className="text-slate-600" size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-slate-700">
                            Overall Similarity
                          </span>
                          <span
                            className={`text-lg font-bold ${
                              score >= 80
                                ? "text-emerald-600"
                                : score >= 60
                                ? "text-amber-600"
                                : "text-red-600"
                            }`}
                          >
                            {breakdownData.overall.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-3">
                          <div
                            className={`h-3 rounded-full transition-all ${
                              score >= 80
                                ? "bg-emerald-500"
                                : score >= 60
                                ? "bg-amber-500"
                                : "bg-red-500"
                            }`}
                            style={{
                              width: `${Math.min(100, breakdownData.overall)}%`,
                            }}
                          />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Combined score across all dimensions
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Teacher-Friendly Explanation */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">
                  For Teachers & Trainers:
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed mb-2">
                  <strong>Simple explanation for students:</strong> "This score shows 
                  how well your recitation matches the reference. It looks at three 
                  things: the melody (pitch), the rhythm (timing), and how clearly 
                  you pronounce the words."
                </p>
                <p className="text-sm text-slate-600 leading-relaxed">
                  <strong>How to use this:</strong> Use the breakdown above to identify 
                  which specific areas need improvement. If pitch is low, focus on 
                  matching the melodic contour. If timing is low, practice with the 
                  reference rhythm. If pronunciation is low, emphasize clear articulation.
                </p>
                <div className="mt-2 pt-2 border-t border-slate-300">
                  <p className="text-xs text-slate-500">
                    <strong>Score Weighting:</strong> Pitch (50%) + Timing (16%) + 
                    Pronunciation (34%) = 100% overall score. Segment scores are 
                    each capped at 0–100% for consistency.
                  </p>
                </div>
              </div>

              {/* Focus Areas */}
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-3">
                  What to Focus On
                </h3>
                <ul className="space-y-2">
                  {focusAreas.map((area, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-3 text-sm text-slate-700"
                    >
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold mt-0.5">
                        {index + 1}
                      </span>
                      <span>{area}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 rounded-b-xl">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ScoreExplanation;

