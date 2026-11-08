import React, { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CopyPlus,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import {
  ActivityType,
  AgentAction,
  AssessmentEngine,
  KidsLearningPackage,
  KidsPackageTransition,
  KidsPackageUnit,
  PackageDraft,
  PackageStatus,
  PackageType,
  TransitionOutcome,
  archiveKidsPackage,
  createKidsPackage,
  createKidsPackageVersion,
  listKidsPackages,
  publishKidsPackage,
  replaceKidsPackageTransitions,
  updateKidsPackage,
} from "../services/kidsPackageService";

const engines: Array<{ value: AssessmentEngine; label: string }> = [
  { value: "azure_speech", label: "Azure Speech" },
  { value: "fastconformer", label: "FastConformer" },
  { value: "tarannum", label: "Enjin Tarannum" },
];

const agentActions: Array<{ value: AgentAction; label: string }> = [
  { value: "advance", label: "Naik tahap" },
  { value: "retain", label: "Kekal & kukuhkan" },
  { value: "remedial", label: "Pakej pemulihan" },
  { value: "foundation", label: "Kembali ke asas" },
  { value: "human_review", label: "Semakan manusia" },
  { value: "notify_parent", label: "Maklum ibu bapa" },
  { value: "notify_teacher", label: "Maklum guru" },
];

const activityOptions: Array<{ value: ActivityType; label: string }> = [
  { value: "iqra_reading", label: "Bacaan IQRA" },
  { value: "tarannum_listen", label: "Dengar Tarannum" },
  { value: "tarannum_practice", label: "Latih Tarannum" },
  { value: "tarannum_record", label: "Rakam Tarannum" },
];

const statusLabels: Record<PackageStatus, string> = {
  draft: "Draf",
  published: "Diterbitkan",
  archived: "Diarkib",
};

const statusStyles: Record<PackageStatus, string> = {
  draft: "bg-amber-100 text-amber-800",
  published: "bg-emerald-100 text-emerald-800",
  archived: "bg-slate-200 text-slate-700",
};

const emptyUnit = (sequence: number): KidsPackageUnit => ({
  unit_key: `unit-${sequence}`,
  sequence,
  title: `Unit ${sequence}`,
  instruction: "",
  activity_type: "iqra_reading",
  reference_text: "",
  reference_id: "",
  sample_id: "",
  required: true,
  assessment_config: {},
});

const emptyDraft = (): PackageDraft => ({
  package_key: "",
  title: "",
  description: "",
  package_type: "page",
  level: "IQRA 3",
  source_metadata: { book_title: "IQRA 3", page_number: 1 },
  assessment_engines: ["azure_speech", "fastconformer"],
  completion_rules: {
    required_unit_pass_rate: 1,
    minimum_valid_attempts_per_unit: 1,
    require_in_sequence: true,
  },
  allowed_agent_actions: ["advance", "retain", "remedial", "foundation", "human_review"],
  units: [emptyUnit(1)],
});

const packageToDraft = (item: KidsLearningPackage): PackageDraft => ({
  package_key: item.package_key,
  title: item.title,
  description: item.description || "",
  package_type: item.package_type,
  level: item.level || "",
  source_metadata: { ...item.source_metadata },
  assessment_engines: [...item.assessment_engines],
  completion_rules: { ...item.completion_rules },
  allowed_agent_actions: [...item.allowed_agent_actions],
  units: item.units.map(({ id: _id, ...unit }) => ({ ...unit, assessment_config: { ...unit.assessment_config } })),
});

const FieldLabel: React.FC<React.PropsWithChildren> = ({ children }) => (
  <label className="mb-1 block text-sm font-semibold text-slate-700">{children}</label>
);

const AdminKidsPackages: React.FC = () => {
  const [packages, setPackages] = useState<KidsLearningPackage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PackageDraft>(emptyDraft);
  const [transitions, setTransitions] = useState<KidsPackageTransition[]>([]);
  const [filter, setFilter] = useState<PackageStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = packages.find((item) => item.id === selectedId) || null;
  const editable = !selected || selected.status === "draft";

  const visiblePackages = useMemo(
    () => packages.filter((item) => filter === "all" || item.status === filter),
    [packages, filter]
  );

  const load = async (preferredId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listKidsPackages();
      setPackages(result);
      const nextId = preferredId || selectedId;
      if (nextId) {
        const current = result.find((item) => item.id === nextId);
        if (current) {
          setSelectedId(current.id);
          setDraft(packageToDraft(current));
          setTransitions(current.transitions.map((item) => ({ ...item, conditions: { ...item.conditions } })));
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Pakej tidak dapat dimuatkan.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectPackage = (item: KidsLearningPackage) => {
    setSelectedId(item.id);
    setDraft(packageToDraft(item));
    setTransitions(item.transitions.map((transition) => ({ ...transition, conditions: { ...transition.conditions } })));
    setMessage(null);
    setError(null);
  };

  const startNew = () => {
    setSelectedId(null);
    setDraft(emptyDraft());
    setTransitions([]);
    setMessage(null);
    setError(null);
  };

  const updatePackageType = (type: PackageType) => {
    setDraft((current) => ({
      ...current,
      package_type: type,
      source_metadata: type === "page"
        ? { book_title: current.level || "IQRA 3", page_number: 1 }
        : { surah_name: "Al-Fatihah", surah_number: 1 },
    }));
  };

  const toggleEngine = (engine: AssessmentEngine) => setDraft((current) => ({
    ...current,
    assessment_engines: current.assessment_engines.includes(engine)
      ? current.assessment_engines.filter((item) => item !== engine)
      : [...current.assessment_engines, engine],
  }));

  const toggleAgentAction = (action: AgentAction) => setDraft((current) => ({
    ...current,
    allowed_agent_actions: current.allowed_agent_actions.includes(action)
      ? current.allowed_agent_actions.filter((item) => item !== action)
      : [...current.allowed_agent_actions, action],
  }));

  const updateUnit = (index: number, patch: Partial<KidsPackageUnit>) => {
    setDraft((current) => ({
      ...current,
      units: current.units.map((unit, unitIndex) => unitIndex === index ? { ...unit, ...patch } : unit),
    }));
  };

  const addUnit = () => setDraft((current) => ({
    ...current,
    units: [...current.units, emptyUnit(current.units.length + 1)],
  }));

  const removeUnit = (index: number) => setDraft((current) => ({
    ...current,
    units: current.units.filter((_, unitIndex) => unitIndex !== index).map((unit, unitIndex) => ({ ...unit, sequence: unitIndex + 1 })),
  }));

  const moveUnit = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.units.length) return;
    setDraft((current) => {
      const units = [...current.units];
      [units[index], units[target]] = [units[target], units[index]];
      return { ...current, units: units.map((unit, unitIndex) => ({ ...unit, sequence: unitIndex + 1 })) };
    });
  };

  const runAction = async (action: () => Promise<KidsLearningPackage>, success: string) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      setMessage(success);
      await load(result.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Operasi tidak berjaya.");
    } finally {
      setSaving(false);
    }
  };

  const save = () => runAction(async () => {
    const result = selected
      ? await updateKidsPackage(selected.id, draft)
      : await createKidsPackage(draft);
    await replaceKidsPackageTransitions(result.id, transitions);
    return result;
  }, selected ? "Draf pakej telah dikemas kini." : "Pakej baharu telah dicipta sebagai draf.");

  const addTransition = () => {
    const target = packages.find((item) => item.id !== selectedId && item.status === "published");
    if (!target) {
      setError("Terbitkan sekurang-kurangnya satu pakej sasaran sebelum menambah laluan agen.");
      return;
    }
    setTransitions((current) => [...current, {
      to_package_id: target.id,
      outcome: "advance",
      priority: (current.length + 1) * 10,
      conditions: {},
      requires_human_approval: false,
      is_active: true,
    }]);
  };

  const updateTransition = (index: number, patch: Partial<KidsPackageTransition>) => setTransitions((current) =>
    current.map((transition, transitionIndex) => transitionIndex === index ? { ...transition, ...patch } : transition)
  );

  return (
    <div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
      <header className="rounded-2xl bg-gradient-to-r from-emerald-950 to-slate-900 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-4">
            <div className="rounded-xl bg-emerald-500/20 p-3 text-emerald-300"><BookOpen className="h-7 w-7" /></div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-emerald-300">Tarannum Kids</p>
              <h1 className="mt-1 text-2xl font-bold">Pakej Pembelajaran & Laluan Agen</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Sediakan satu pakej bagi setiap muka surat atau surah, susun unit latihan dan hadkan keputusan autonomi agen.</p>
            </div>
          </div>
          <button onClick={() => void load()} className="flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10">
            <RefreshCw className="h-4 w-4" /> Muat semula
          </button>
        </div>
      </header>

      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div>}
      {message && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{message}</div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4 xl:self-start">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-slate-900">Senarai pakej</h2>
            <button onClick={startNew} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Plus className="h-4 w-4" /> Baharu</button>
          </div>
          <select value={filter} onChange={(event) => setFilter(event.target.value as PackageStatus | "all")} className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="all">Semua status</option>
            <option value="draft">Draf</option>
            <option value="published">Diterbitkan</option>
            <option value="archived">Diarkib</option>
          </select>
          <div className="mt-3 max-h-[68vh] space-y-2 overflow-y-auto pr-1">
            {loading && <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>}
            {!loading && visiblePackages.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada pakej dalam status ini.</p>}
            {visiblePackages.map((item) => (
              <button key={item.id} onClick={() => selectPackage(item)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === item.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-emerald-300"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-semibold text-slate-900">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.package_key} · v{item.version}</p></div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                </div>
                <div className="mt-3 flex items-center justify-between"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusStyles[item.status]}`}>{statusLabels[item.status]}</span><span className="text-xs text-slate-500">{item.units.length} unit</span></div>
              </button>
            ))}
          </div>
        </aside>

        <main className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-lg font-bold text-slate-900">{selected ? `${selected.title} · v${selected.version}` : "Pakej baharu"}</h2><p className="mt-1 text-sm text-slate-500">{editable ? "Simpan sebagai draf sebelum diterbitkan." : "Versi diterbitkan/diarkib tidak boleh diubah."}</p></div>
              {selected && <span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusStyles[selected.status]}`}>{statusLabels[selected.status]}</span>}
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div><FieldLabel>Kunci pakej</FieldLabel><input disabled={Boolean(selected) || !editable} value={draft.package_key} onChange={(event) => setDraft({ ...draft, package_key: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} placeholder="iqra-3-page-18" className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></div>
              <div><FieldLabel>Nama pakej</FieldLabel><input disabled={!editable} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="IQRA 3 - Muka Surat 18" className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></div>
              <div><FieldLabel>Jenis pakej</FieldLabel><select disabled={!editable} value={draft.package_type} onChange={(event) => updatePackageType(event.target.value as PackageType)} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"><option value="page">Satu muka surat</option><option value="surah">Satu surah</option></select></div>
              <div><FieldLabel>Tahap</FieldLabel><input disabled={!editable} value={draft.level || ""} onChange={(event) => setDraft({ ...draft, level: event.target.value })} placeholder="IQRA 3 / Al-Quran" className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></div>
              {draft.package_type === "page" ? <>
                <div><FieldLabel>Nama buku</FieldLabel><input disabled={!editable} value={String(draft.source_metadata.book_title || "")} onChange={(event) => setDraft({ ...draft, source_metadata: { ...draft.source_metadata, book_title: event.target.value } })} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></div>
                <div><FieldLabel>Nombor muka surat</FieldLabel><input disabled={!editable} type="number" min={1} value={Number(draft.source_metadata.page_number || 1)} onChange={(event) => setDraft({ ...draft, source_metadata: { ...draft.source_metadata, page_number: Number(event.target.value) } })} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></div>
              </> : <>
                <div><FieldLabel>Nama surah</FieldLabel><input disabled={!editable} value={String(draft.source_metadata.surah_name || "")} onChange={(event) => setDraft({ ...draft, source_metadata: { ...draft.source_metadata, surah_name: event.target.value } })} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></div>
                <div><FieldLabel>Nombor surah</FieldLabel><input disabled={!editable} type="number" min={1} max={114} value={Number(draft.source_metadata.surah_number || 1)} onChange={(event) => setDraft({ ...draft, source_metadata: { ...draft.source_metadata, surah_number: Number(event.target.value) } })} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></div>
              </>}
              <div className="md:col-span-2"><FieldLabel>Huraian</FieldLabel><textarea disabled={!editable} value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-900">Unit latihan</h2><p className="mt-1 text-sm text-slate-500">Susunan ini menentukan perjalanan pelajar dalam satu pakej.</p></div>{editable && <button onClick={addUnit} className="flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-700"><Plus className="h-4 w-4" /> Unit</button>}</div>
            <div className="mt-4 space-y-4">
              {draft.units.map((unit, index) => (
                <div key={`${unit.unit_key}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3"><h3 className="font-bold text-slate-800">Unit {index + 1}</h3>{editable && <div className="flex gap-1"><button onClick={() => moveUnit(index, -1)} disabled={index === 0} className="rounded-lg p-2 hover:bg-white disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button><button onClick={() => moveUnit(index, 1)} disabled={index === draft.units.length - 1} className="rounded-lg p-2 hover:bg-white disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button><button onClick={() => removeUnit(index)} disabled={draft.units.length === 1} className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div>}</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div><FieldLabel>Kunci unit</FieldLabel><input disabled={!editable} value={unit.unit_key} onChange={(event) => updateUnit(index, { unit_key: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></div>
                    <div><FieldLabel>Nama unit</FieldLabel><input disabled={!editable} value={unit.title} onChange={(event) => updateUnit(index, { title: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></div>
                    <div><FieldLabel>Aktiviti</FieldLabel><select disabled={!editable} value={unit.activity_type} onChange={(event) => updateUnit(index, { activity_type: event.target.value as ActivityType })} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100">{activityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                    <div><FieldLabel>ID rujukan / sampel</FieldLabel><input disabled={!editable} value={unit.reference_id || unit.sample_id || ""} onChange={(event) => updateUnit(index, { reference_id: event.target.value, sample_id: "" })} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></div>
                    <div className="md:col-span-2"><FieldLabel>Arahan pelajar</FieldLabel><input disabled={!editable} value={unit.instruction || ""} onChange={(event) => updateUnit(index, { instruction: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></div>
                    <div className="md:col-span-2"><FieldLabel>Teks rujukan</FieldLabel><textarea dir="auto" disabled={!editable} value={unit.reference_text || ""} onChange={(event) => updateUnit(index, { reference_text: event.target.value })} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xl disabled:bg-slate-100" /></div>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-700"><input disabled={!editable} type="checkbox" checked={unit.required} onChange={(event) => updateUnit(index, { required: event.target.checked })} className="h-4 w-4 accent-emerald-600" /> Wajib diselesaikan</label>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Enjin & syarat tamat</h2>
              <div className="mt-4 space-y-2">{engines.map((engine) => <label key={engine.value} className="flex items-center gap-2 text-sm font-medium"><input disabled={!editable} type="checkbox" checked={draft.assessment_engines.includes(engine.value)} onChange={() => toggleEngine(engine.value)} className="h-4 w-4 accent-emerald-600" /> {engine.label}</label>)}</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div><FieldLabel>Kadar unit lulus</FieldLabel><input disabled={!editable} type="number" min={0.1} max={1} step={0.05} value={Number(draft.completion_rules.required_unit_pass_rate || 1)} onChange={(event) => setDraft({ ...draft, completion_rules: { ...draft.completion_rules, required_unit_pass_rate: Number(event.target.value) } })} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></div>
                <div><FieldLabel>Percubaan sah minimum</FieldLabel><input disabled={!editable} type="number" min={1} value={Number(draft.completion_rules.minimum_valid_attempts_per_unit || 1)} onChange={(event) => setDraft({ ...draft, completion_rules: { ...draft.completion_rules, minimum_valid_attempts_per_unit: Number(event.target.value) } })} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></div>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm font-medium"><input disabled={!editable} type="checkbox" checked={Boolean(draft.completion_rules.require_in_sequence)} onChange={(event) => setDraft({ ...draft, completion_rules: { ...draft.completion_rules, require_in_sequence: event.target.checked } })} className="h-4 w-4 accent-emerald-600" /> Wajib ikut susunan unit</label>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Autonomi yang dibenarkan</h2><p className="mt-1 text-sm text-slate-500">Agen tidak boleh memilih tindakan di luar senarai ini.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">{agentActions.map((action) => <label key={action.value} className="flex items-center gap-2 text-sm font-medium"><input disabled={!editable} type="checkbox" checked={draft.allowed_agent_actions.includes(action.value)} onChange={() => toggleAgentAction(action.value)} className="h-4 w-4 accent-emerald-600" /> {action.label}</label>)}</div>
            </div>
          </section>

          {selected && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-900">Laluan pakej agen</h2><p className="mt-1 text-sm text-slate-500">Pilih pakej sasaran bagi keputusan naik tahap, pemulihan atau kembali ke asas.</p></div>{editable && <button onClick={addTransition} className="flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-700"><Plus className="h-4 w-4" /> Laluan</button>}</div>
            <div className="mt-4 space-y-3">{transitions.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada laluan. Keputusan kekal tidak memerlukan laluan.</p>}{transitions.map((transition, index) => <div key={`${transition.to_package_id}-${index}`} className="rounded-xl border border-slate-200 p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_100px_auto]">
                <div><FieldLabel>Pakej sasaran</FieldLabel><select disabled={!editable} value={transition.to_package_id} onChange={(event) => updateTransition(index, { to_package_id: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100">{packages.filter((item) => item.id !== selectedId && item.status === "published").map((item) => <option key={item.id} value={item.id}>{item.title} · v{item.version}</option>)}</select></div>
                <div><FieldLabel>Keputusan</FieldLabel><select disabled={!editable} value={transition.outcome} onChange={(event) => updateTransition(index, { outcome: event.target.value as TransitionOutcome })} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"><option value="advance">Naik tahap</option><option value="remedial">Pemulihan</option><option value="foundation">Kembali ke asas</option></select></div>
                <div><FieldLabel>Keutamaan</FieldLabel><input disabled={!editable} type="number" min={1} value={transition.priority} onChange={(event) => updateTransition(index, { priority: Number(event.target.value) })} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></div>
                {editable && <button aria-label="Buang laluan" onClick={() => setTransitions((current) => current.filter((_, transitionIndex) => transitionIndex !== index))} className="mt-6 rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-5 w-5" /></button>}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div><FieldLabel>Markah penguasaan minimum</FieldLabel><input disabled={!editable} type="number" min={0} max={100} value={Number(transition.conditions.minimum_mastery_score ?? 0)} onChange={(event) => updateTransition(index, { conditions: { ...transition.conditions, minimum_mastery_score: Number(event.target.value) } })} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></div>
                <div><FieldLabel>Bilangan pakej selesai minimum</FieldLabel><input disabled={!editable} type="number" min={1} value={Number(transition.conditions.minimum_completed_packages ?? 1)} onChange={(event) => updateTransition(index, { conditions: { ...transition.conditions, minimum_completed_packages: Number(event.target.value) } })} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></div>
                <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700"><input disabled={!editable} type="checkbox" checked={transition.requires_human_approval} onChange={(event) => updateTransition(index, { requires_human_approval: event.target.checked })} className="h-4 w-4 accent-emerald-600" /> Perlu kelulusan guru/ibu bapa</label>
              </div>
            </div>)}</div>
          </section>}

          <div className="flex flex-wrap justify-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {editable && <button disabled={saving} onClick={save} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} Simpan draf</button>}
            {selected?.status === "draft" && <button disabled={saving} onClick={() => runAction(() => replaceKidsPackageTransitions(selected.id, transitions).then(() => publishKidsPackage(selected.id)), "Pakej telah diterbitkan.")} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"><Send className="h-5 w-5" /> Terbitkan</button>}
            {selected && selected.status !== "draft" && <button disabled={saving} onClick={() => runAction(() => createKidsPackageVersion(selected.id), "Versi draf baharu telah dicipta.")} className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 font-semibold text-white hover:bg-amber-600 disabled:opacity-60"><CopyPlus className="h-5 w-5" /> Cipta versi baharu</button>}
            {selected && selected.status !== "archived" && <button disabled={saving} onClick={() => runAction(() => archiveKidsPackage(selected.id), "Pakej telah diarkibkan.")} className="flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><Archive className="h-5 w-5" /> Arkib</button>}
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><p>Penerbitan mengunci versi ini untuk audit. Sebarang perubahan selepas itu mesti dibuat melalui versi draf baharu.</p></div>
        </main>
      </div>
    </div>
  );
};

export default AdminKidsPackages;
