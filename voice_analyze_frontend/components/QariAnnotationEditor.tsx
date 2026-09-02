import React, { useEffect, useMemo, useRef, useState } from "react";
import { Languages, RefreshCw, Save, Send, Trash2 } from "lucide-react";
import { LearningAnnotation, LearningAnnotationType, learningAnnotationService } from "../services/learningAnnotationService";
import { TextSegment } from "../services/referenceLibraryService";

type Props = {
  referenceId: string;
  duration: number;
  currentTime: number;
  ayat: TextSegment[];
  children: (onViewportChange: (viewport: GraphViewport) => void) => React.ReactNode;
};

type GraphViewport = {
  startTime: number; endTime: number; plotLeft: number; plotRight: number;
  plotTop: number; plotBottom: number; width: number; height: number;
};

type LetterTool = { key: string; type: LearningAnnotationType; label: string; arabic: string };

const ARABIC_LETTERS: LetterTool[] = [
  ["alif", "ا"], ["ba", "ب"], ["ta", "ت"], ["tha", "ث"], ["jim", "ج"],
  ["ha", "ح"], ["kha", "خ"], ["dal", "د"], ["dhal", "ذ"], ["ra", "ر"],
  ["zay", "ز"], ["sin", "س"], ["syin", "ش"], ["sad", "ص"], ["dad", "ض"],
  ["to", "ط"], ["zo", "ظ"], ["ain", "ع"], ["ghain", "غ"], ["fa", "ف"],
  ["qaf", "ق"], ["kaf", "ك"], ["lam", "ل"], ["mim", "م"], ["nun", "ن"],
  ["wau", "و"], ["ha-bulat", "هـ"], ["lam-alif", "لا"], ["hamzah", "ء"], ["ya", "ي"],
].map(([key, arabic]) => ({ key, arabic, type: "letter" as const, label: `Huruf ${arabic}` }));

const BASIC_MARKS: LetterTool[] = [
  { key: "shaddah", type: "letter", arabic: "ﹼ", label: "Sabdu" },
  { key: "dammah", type: "letter", arabic: "ﹸ", label: "Depan" },
  { key: "baris", type: "letter", arabic: "ﹶ", label: "Baris" },
];

const ACTION_TOOLS: LetterTool[] = [
  { key: "text", type: "letter", arabic: "أب", label: "Teks / kalimah" },
  { key: "stop", type: "letter", arabic: "■", label: "Stop" },
  { key: "forward", type: "letter", arabic: "→", label: "Anak panah depan" },
  { key: "both-directions", type: "letter", arabic: "↔", label: "Anak panah depan dan belakang" },
];

const TOOLS: LetterTool[] = [...ARABIC_LETTERS, ...BASIC_MARKS, ...ACTION_TOOLS];

const STYLES: Record<LearningAnnotationType, string> = {
  letter: "border-sky-500 bg-sky-100 text-sky-900", mad: "border-violet-500 bg-violet-100 text-violet-900",
  makhraj: "border-amber-500 bg-amber-100 text-amber-900", ghunnah: "border-fuchsia-500 bg-fuchsia-100 text-fuchsia-900",
  stop: "border-rose-500 bg-rose-100 text-rose-900", breath: "border-cyan-500 bg-cyan-100 text-cyan-900",
  repeat: "border-emerald-500 bg-emerald-100 text-emerald-900", pitch: "border-blue-500 bg-blue-100 text-blue-900",
  note: "border-slate-500 bg-slate-100 text-slate-900",
};

const QariAnnotationEditor: React.FC<Props> = ({ referenceId, duration, currentTime, ayat, children }) => {
  const [items, setItems] = useState<LearningAnnotation[]>([]);
  const [inactiveIds, setInactiveIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAyah, setSelectedAyah] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"draft" | "published" | null>(null);
  const [message, setMessage] = useState("");
  const [viewport, setViewport] = useState<GraphViewport>({ startTime: 0, endTime: duration, plotLeft: 60, plotRight: 740, plotTop: 60, plotBottom: 300, width: 800, height: 360 });
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    learningAnnotationService.list(referenceId, true)
      .then(setItems).catch((error) => setMessage(error.message)).finally(() => setLoading(false));
  }, [referenceId]);

  const ayahRange = useMemo(() => {
    if (selectedAyah === "all") return { start: 0, end: duration };
    const item = ayat[Number(selectedAyah)];
    return item ? { start: item.start, end: item.end } : { start: 0, end: duration };
  }, [selectedAyah, ayat, duration]);

  const visibleItems = items.filter((item) => item.annotation_type === "letter" && item.start_time >= viewport.startTime && item.start_time <= viewport.endTime);
  const selected = items.find((item) => item.id === selectedId) || null;
  const timeFromPointer = (clientX: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || duration <= 0) return 0;
    const canvasX = clientX - rect.left;
    const ratio = (canvasX - viewport.plotLeft) / Math.max(viewport.plotRight - viewport.plotLeft, 1);
    const time = viewport.startTime + ratio * (viewport.endTime - viewport.startTime);
    return Math.max(ayahRange.start, Math.min(ayahRange.end, time));
  };
  const verticalFromPointer = (clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return 0.12;
    const canvasY = clientY - rect.top;
    return Math.max(0, Math.min(1, (canvasY - viewport.plotTop) / Math.max(viewport.plotBottom - viewport.plotTop, 1)));
  };
  const leftPosition = (time: number) => viewport.plotLeft + ((time - viewport.startTime) / Math.max(viewport.endTime - viewport.startTime, 0.1)) * (viewport.plotRight - viewport.plotLeft);

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const markerId = event.dataTransfer.getData("application/x-qari-marker");
    const toolKey = event.dataTransfer.getData("application/x-qari-tool");
    const time = Number(timeFromPointer(event.clientX).toFixed(2));
    const verticalPosition = Number(verticalFromPointer(event.clientY).toFixed(3));
    if (markerId) {
      setItems((current) => current.map((item) => {
        if (item.id !== markerId) return item;
        const length = Math.max(0, (item.end_time || item.start_time) - item.start_time);
        return { ...item, start_time: time, vertical_position: verticalPosition, end_time: item.end_time != null ? Math.min(ayahRange.end, time + length) : null, status: "draft" };
      }));
      return;
    }
    const tool = TOOLS.find((entry) => entry.key === toolKey);
    if (!tool) return;
    const id = `local-${crypto.randomUUID()}`;
    setItems((current) => [...current, { id, reference_id: referenceId, qari_id: "", annotation_type: "letter", label: tool.label, arabic_text: tool.arabic, note: "", start_time: time, end_time: null, vertical_position: verticalPosition, status: "draft" }]);
    setSelectedId(id);
  };

  const resize = (item: LearningAnnotation, edge: "start" | "end", event: React.PointerEvent) => {
    event.preventDefault(); event.stopPropagation();
    const move = (pointerEvent: PointerEvent) => {
      const time = Number(timeFromPointer(pointerEvent.clientX).toFixed(2));
      setItems((current) => current.map((entry) => entry.id !== item.id ? entry : edge === "start"
        ? { ...entry, start_time: Math.min(time, (entry.end_time || time) - 0.2), status: "draft" }
        : { ...entry, end_time: Math.max(time, entry.start_time + 0.2), status: "draft" }));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  const updateSelected = (changes: Partial<LearningAnnotation>) => {
    if (!selectedId) return;
    setItems((current) => current.map((item) => item.id === selectedId ? { ...item, ...changes, status: "draft" } : item));
  };
  const removeSelected = () => {
    if (!selected) return;
    if (!selected.id.startsWith("local-")) setInactiveIds((current) => [...new Set([...current, selected.id])]);
    setItems((current) => current.filter((item) => item.id !== selected.id)); setSelectedId(null);
  };
  const save = async (status: "draft" | "published") => {
    setSaving(status); setMessage("");
    try {
      const result = await learningAnnotationService.saveAll(referenceId, items, status, inactiveIds);
      setItems(result.annotations); setInactiveIds([]);
      setMessage(status === "published" ? "Panduan telah diterbitkan kepada pengguna." : "Draf panduan telah disimpan.");
    } catch (error: any) { setMessage(error.message); }
    finally { setSaving(null); }
  };

  return (
    <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-lg font-bold text-slate-900">Panduan Bacaan Qari</h3><p className="text-xs text-slate-600">Pilih ayat, kemudian seret ikon ke atas graf. Masa disimpan secara automatik.</p></div>
        <select value={selectedAyah} onChange={(e) => setSelectedAyah(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          <option value="all">Keseluruhan rakaman</option>
          {ayat.map((item, index) => <option key={index} value={index}>Ayat {index + 1} · {item.text.slice(0, 32)}</option>)}
        </select>
      </div>

      <div className="mt-3 rounded-xl border border-amber-200 bg-white p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700"><Languages size={16} className="text-amber-700"/>Ikon bacaan — seret ikon ke lokasi yang sesuai pada graf</div>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10 xl:grid-cols-[repeat(15,minmax(0,1fr))]" dir="rtl">
          {TOOLS.map((tool) => { const isBasicMark = BASIC_MARKS.some((mark) => mark.key === tool.key); return <div key={tool.key} draggable title={tool.label} aria-label={tool.label} onDragStart={(event) => event.dataTransfer.setData("application/x-qari-tool", tool.key)} className={`mx-auto flex h-11 w-11 cursor-grab items-center justify-center rounded-full border border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100 font-bold text-slate-950 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-500 hover:shadow-md active:cursor-grabbing ${isBasicMark ? "overflow-hidden text-4xl" : "overflow-visible text-2xl"}`} style={{ fontFamily: '"Noto Naskh Arabic", "Traditional Arabic", Arial, sans-serif' }}><span className={isBasicMark ? "inline-flex translate-y-6 items-center justify-center leading-none" : "leading-relaxed"}>{tool.arabic}</span></div>; })}
        </div>
      </div>

      <div ref={canvasRef} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} className="relative mt-4 overflow-hidden rounded-xl border-2 border-slate-300 bg-white" style={{ minHeight: 360 }}>
        {children(setViewport)}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/15 via-transparent to-white/10" />
        {duration > 0 && currentTime >= viewport.startTime && currentTime <= viewport.endTime && <div className="pointer-events-none absolute z-10 w-px bg-blue-500" style={{ left: `${leftPosition(currentTime)}px`, top: `${viewport.plotTop}px`, height: `${viewport.plotBottom - viewport.plotTop}px` }} />}
        {visibleItems.map((item) => {
          const ranged = item.end_time != null;
          const displayText = item.label === "Sabdu"
            ? "ﹼ"
            : item.label === "Baris depan" || item.label === "Depan"
              ? "ﹸ"
              : item.label === "Baris atas" || item.label === "Baris"
                ? "ﹶ"
                : item.arabic_text || item.label;
          const isBasicMark = ["Sabdu", "Baris depan", "Depan", "Baris atas", "Baris"].includes(item.label);
          const isTextMarker = item.label === "Teks / kalimah";
          const left = leftPosition(item.start_time);
          const width = ranged ? Math.max(20, leftPosition(item.end_time!) - left) : 0;
          const fallbackRow = [...String(item.id)].reduce<number>((total, char) => total + char.charCodeAt(0), 0) % 4;
          const normalizedY = item.vertical_position ?? (0.1 + fallbackRow * 0.21);
          const top = viewport.plotTop + normalizedY * (viewport.plotBottom - viewport.plotTop);
          return <div key={item.id} draggable onDragStart={(event) => event.dataTransfer.setData("application/x-qari-marker", item.id)} onClick={(event) => { event.stopPropagation(); setSelectedId(item.id); }} className={`absolute z-20 flex h-11 cursor-move items-center border border-amber-400 bg-gradient-to-br from-amber-50 to-amber-100 text-slate-950 shadow-md ${ranged ? "rounded-xl" : isTextMarker ? "min-w-11 max-w-48 rounded-full px-2" : "w-11 rounded-full"} ${isBasicMark ? "overflow-hidden" : "overflow-visible"} ${selectedId === item.id ? "ring-2 ring-blue-500 ring-offset-2" : ""}`} style={{ left: `${Math.max(viewport.plotLeft + 22, Math.min(viewport.plotRight - 22, left))}px`, top: `${Math.max(viewport.plotTop + 22, Math.min(viewport.plotBottom - 22, top))}px`, width: ranged ? `${width}px` : undefined, transform: ranged ? "translateY(-50%)" : "translate(-50%, -50%)" }}>
            {ranged && <button type="button" onPointerDown={(event) => resize(item, "start", event)} className="h-full w-3 cursor-ew-resize rounded-l-md bg-black/15" aria-label="Panjangkan dari kiri" />}
            <span className={`flex min-w-0 flex-1 items-center justify-center px-1 ${isBasicMark ? "overflow-hidden" : "overflow-visible"}`}><bdi className={`whitespace-nowrap font-bold ${isBasicMark ? "inline-flex translate-y-6 items-center justify-center text-5xl leading-none" : isTextMarker ? "overflow-hidden text-2xl leading-relaxed" : "overflow-visible text-3xl leading-relaxed"}`} style={{ fontFamily: '"Noto Naskh Arabic", "Traditional Arabic", Arial, sans-serif' }}>{displayText}</bdi></span>
            {ranged && <button type="button" onPointerDown={(event) => resize(item, "end", event)} className="h-full w-3 cursor-ew-resize rounded-r-md bg-black/15" aria-label="Panjangkan dari kanan" />}
          </div>;
        })}
        {loading && <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/70 text-sm text-slate-600"><RefreshCw className="mr-2 animate-spin" size={17}/>Memuatkan panduan…</div>}
      </div>

      {selected && <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[1fr_1fr_2fr_auto]">
        <label className="text-xs font-semibold text-slate-600">Label<input value={selected.label} onChange={(e) => updateSelected({ label: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Huruf / kalimah<input dir="rtl" value={selected.arabic_text || ""} onChange={(e) => updateSelected({ arabic_text: e.target.value })} placeholder="Contoh: أَنْ لَا" className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-right text-lg" /></label>
        <label className="text-xs font-semibold text-slate-600">Penerangan Qari<input value={selected.note || ""} onChange={(e) => updateSelected({ note: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" /></label>
        <button type="button" onClick={removeSelected} className="inline-flex self-end items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white" title="Buang ikon"><Trash2 size={16}/>Buang ikon</button>
      </div>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-medium text-slate-600">{message || `${items.length} tanda · ${items.some((item) => item.status === "draft") ? "Ada perubahan draf" : "Sedia"}`}</p><div className="flex gap-2"><button type="button" onClick={() => save("draft")} disabled={!!saving} className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Save size={16}/>{saving === "draft" ? "Menyimpan…" : "Simpan draf"}</button><button type="button" onClick={() => save("published")} disabled={!!saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Send size={16}/>{saving === "published" ? "Menerbitkan…" : "Simpan & terbitkan"}</button></div></div>
    </div>
  );
};

export default QariAnnotationEditor;
