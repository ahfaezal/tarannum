import React, { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { LearningAnnotation, learningAnnotationService } from "../services/learningAnnotationService";

export type GraphViewport = {
  startTime: number;
  endTime: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  width: number;
  height: number;
};

type Props = {
  referenceId?: string | null;
  viewport: GraphViewport | null;
};

const BASIC_MARKS = ["Sabdu", "Baris depan", "Depan", "Baris atas", "Baris"];

const StudentLearningAnnotations: React.FC<Props> = ({ referenceId, viewport }) => {
  const [annotations, setAnnotations] = useState<LearningAnnotation[]>([]);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let active = true;
    setAnnotations([]);
    if (!referenceId) return () => { active = false; };

    learningAnnotationService.list(referenceId)
      .then((items) => {
        if (active) setAnnotations(items.filter((item) => item.status === "published"));
      })
      .catch(() => {
        if (active) setAnnotations([]);
      });
    return () => { active = false; };
  }, [referenceId]);

  const displayed = useMemo(() => {
    if (!viewport) return [];
    return annotations.filter(
      (item) => item.start_time >= viewport.startTime && item.start_time <= viewport.endTime,
    );
  }, [annotations, viewport]);

  if (!referenceId || annotations.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="pointer-events-auto absolute right-3 top-3 z-30 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-1.5 text-xs font-bold text-amber-950 shadow-md"
        aria-pressed={visible}
        title={visible ? "Sembunyikan panduan Qari" : "Tunjukkan panduan Qari"}
      >
        {visible ? <Eye size={15} /> : <EyeOff size={15} />}
        Panduan Qari
      </button>

      {visible && viewport && displayed.map((item) => {
        const xRatio = (item.start_time - viewport.startTime) / Math.max(viewport.endTime - viewport.startTime, 0.001);
        const left = viewport.plotLeft + xRatio * (viewport.plotRight - viewport.plotLeft);
        const yRatio = Math.max(0, Math.min(1, item.vertical_position ?? 0.12));
        const top = viewport.plotTop + yRatio * (viewport.plotBottom - viewport.plotTop);
        const isBasicMark = BASIC_MARKS.includes(item.label);
        const isText = item.label === "Teks / kalimah";
        const text = item.label === "Sabdu" ? "ﹼ"
          : item.label === "Baris depan" || item.label === "Depan" ? "ﹸ"
          : item.label === "Baris atas" || item.label === "Baris" ? "ﹶ"
          : item.arabic_text || item.label;

        return (
          <div
            key={item.id}
            className={`pointer-events-none absolute z-20 flex h-11 items-center justify-center border border-amber-400 bg-gradient-to-br from-amber-50 to-amber-100 text-slate-950 shadow-md ${isText ? "min-w-11 max-w-48 rounded-full px-2" : "w-11 rounded-full"} ${isBasicMark ? "overflow-hidden" : "overflow-visible"}`}
            style={{
              left: `${Math.max(viewport.plotLeft + 22, Math.min(viewport.plotRight - 22, left))}px`,
              top: `${Math.max(viewport.plotTop + 22, Math.min(viewport.plotBottom - 22, top))}px`,
              transform: "translate(-50%, -50%)",
              fontFamily: '"Noto Naskh Arabic", "Traditional Arabic", Arial, sans-serif',
            }}
            title={item.note || item.label}
          >
            <bdi className={`whitespace-nowrap font-bold ${isBasicMark ? "inline-flex translate-y-6 text-5xl leading-none" : isText ? "text-2xl leading-relaxed" : "text-3xl leading-relaxed"}`}>
              {text}
            </bdi>
          </div>
        );
      })}
    </>
  );
};

export default StudentLearningAnnotations;
