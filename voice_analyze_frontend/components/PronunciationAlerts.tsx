import React from "react";
import { PronunciationAlert } from "../types";
import { AlertCircle, Clock, ArrowRight } from "lucide-react";

interface PronunciationAlertsProps {
  alerts: PronunciationAlert[];
  onSeekToTime?: (time: number) => void;
  duration?: number;
}

const PronunciationAlerts: React.FC<PronunciationAlertsProps> = ({
  alerts,
  onSeekToTime,
  duration,
}) => {
  if (!alerts || alerts.length === 0) {
    return null;
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getCharacterName = (char: string): string => {
    const names: Record<string, string> = {
      ذ: "Dhal (ذ)",
      ز: "Zay (ز)",
      ص: "Sad (ص)",
      س: "Sin (س)",
    };
    return names[char] || char;
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="w-5 h-5 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-900">
          Pronunciation Alerts (Beta)
        </h3>
        <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">
          BETA
        </span>
      </div>
      <p className="text-xs text-amber-700 mb-3">
        Possible confusion detected. These are training suggestions only, not
        tajwid validation. May include false positives.
      </p>
      <div className="space-y-2">
        {alerts.map((alert, idx) => (
          <div
            key={idx}
            className="bg-white border border-amber-200 rounded-md p-3 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-medium text-slate-600">
                    {formatTime(alert.time)}
                    {duration && ` / ${formatTime(duration)}`}
                  </span>
                  {onSeekToTime && (
                    <button
                      onClick={() => onSeekToTime(alert.time)}
                      className="text-xs text-amber-600 hover:text-amber-700 underline flex items-center gap-1"
                      title="Seek to this timestamp"
                    >
                      Go to
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-700">
                    Expected:{" "}
                    <span className="font-semibold text-emerald-700">
                      {getCharacterName(alert.expected)}
                    </span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-700">
                    Detected:{" "}
                    <span className="font-semibold text-amber-700">
                      {getCharacterName(alert.detected)}
                    </span>
                  </span>
                </div>
                {alert.word && (
                  <div className="mt-1 text-xs text-slate-500">
                    Word: <span className="font-mono">{alert.word}</span>
                    {alert.expected_word && (
                      <>
                        {" "}
                        (Expected:{" "}
                        <span className="font-mono">{alert.expected_word}</span>)
                      </>
                    )}
                  </div>
                )}
                {alert.note && (
                  <div className="mt-1 text-xs text-amber-600 italic">
                    {alert.note}
                  </div>
                )}
                <div className="mt-1 text-xs text-slate-400">
                  Confidence: {(alert.confidence * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PronunciationAlerts;

