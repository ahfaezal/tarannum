import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Headphones, Maximize2, Mic2, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { getAvailableContent } from "../../services/platformService";
import { analyzeRecitation, extractReferencePitch, getRecordingSessionStatus, restoreCompletedRecordingResult } from "../../services/apiService";
import { PitchPoint } from "../../services/pitchExtractor";
import { AnalysisResult, AyahTiming, PitchData } from "../../types";

const Recorder = lazy(() => import("../../components/Recorder"));
const LivePitchGraph = lazy(() => import("../../components/LivePitchGraph"));
const Countdown = lazy(() => import("../../components/Countdown"));
const RecordingFullScreenMode = lazy(() => import("../../components/RecordingFullScreenMode"));
const AssessmentInfographic = lazy(() => import("../../components/AssessmentInfographic"));
type RecordingMode = "R1" | "R2" | "R3";
type ReferenceOption = {
  id: string;
  title: string;
  duration?: number;
  textSegments?: AyahTiming[];
  ayahTiming?: AyahTiming[];
};

const modeDescription: Record<RecordingMode, string> = {
  R1: "Baseline before training",
  R2: "Post-training assessment",
  R3: "Repeat assessment for consistency",
};

const getParticipantSessionId = () => {
  const stored = sessionStorage.getItem("tarannum_recording_session_id");
  if (stored) return stored;
  const created = crypto.randomUUID();
  sessionStorage.setItem("tarannum_recording_session_id", created);
  return created;
};

const getCompletedModes = (): Set<RecordingMode> => {
  try {
    const stored = JSON.parse(sessionStorage.getItem("tarannum_completed_recording_modes") || "[]");
    return new Set(stored.filter((mode: string) => mode === "R1" || mode === "R2" || mode === "R3"));
  } catch {
    return new Set();
  }
};

const RecordingPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const initialMode = params.get("mode");
  const participantSessionId = useRef(getParticipantSessionId());
  const recordingAttemptRef = useRef(0);
  const recordingTimeRef = useRef(0);
  const recordingPitchCountRef = useRef(0);
  const [references, setReferences] = useState<ReferenceOption[]>([]);
  const [referenceId, setReferenceId] = useState(params.get("reference") || "");
  const [mode, setMode] = useState<RecordingMode>(initialMode === "R2" || initialMode === "R3" ? initialMode : "R1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [triggerStart, setTriggerStart] = useState(false);
  const [triggerStop, setTriggerStop] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [recordingPitch, setRecordingPitch] = useState<PitchPoint[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [referencePitch, setReferencePitch] = useState<PitchData[]>([]);
  const [ayahTiming, setAyahTiming] = useState<AyahTiming[]>([]);
  const [loadingReferencePitch, setLoadingReferencePitch] = useState(false);
  const [referencePitchError, setReferencePitchError] = useState<string | null>(null);
  const [showRecordingCountdown, setShowRecordingCountdown] = useState(false);
  const [isRecordingFullScreenOpen, setIsRecordingFullScreenOpen] = useState(false);
  const [fullScreenZoom, setFullScreenZoom] = useState(1);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recordingAttempt, setRecordingAttempt] = useState(0);
  const [r1TechnicalError, setR1TechnicalError] = useState<string | null>(null);
  const [completedModes, setCompletedModes] = useState<Set<RecordingMode>>(getCompletedModes);

  useEffect(() => {
    sessionStorage.setItem("tarannum_completed_recording_modes", JSON.stringify([...completedModes]));
  }, [completedModes]);

  useEffect(() => {
    let active = true;
    if (!referenceId) return;
    getRecordingSessionStatus(participantSessionId.current, referenceId)
      .then((status) => {
        if (!active) return;
        const restored = new Set(Object.keys(status.completed_modes) as RecordingMode[]);
        setCompletedModes(restored);
        if (status.next_mode) setMode(status.next_mode);
      })
      .catch((statusError) => {
        if (active) console.warn("Recording session status could not be restored", statusError);
      });
    return () => { active = false; };
  }, [referenceId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const data = await getAvailableContent();
        const mapped = (data.content || []).map((item: any) => ({
          id: item.reference_id || item.id,
          title: item.title || item.reference_title || "Audio rujukan",
          duration: item.duration || item.reference_duration || 0,
          textSegments: Array.isArray(item.text_segments) ? item.text_segments : [],
          ayahTiming: Array.isArray(item.ayah_timing) ? item.ayah_timing : [],
        }));
        if (active) {
          setReferences(mapped);
          if (!referenceId && mapped[0]) setReferenceId(mapped[0].id);
        }
      } catch (requestError: any) {
        if (active) setError(requestError.message || "Rujukan tidak dapat dimuatkan");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (referenceId) setParams({ reference: referenceId, mode }, { replace: true });
  }, [referenceId, mode, setParams]);

  useEffect(() => {
    let active = true;
    if (!referenceId) {
      setReferencePitch([]);
      setAyahTiming([]);
      return;
    }

    (async () => {
      try {
        setLoadingReferencePitch(true);
        setReferencePitchError(null);
        const pitch = await extractReferencePitch(undefined, "reference.mp3", referenceId);
        if (active) {
          const content = references.find((reference) => reference.id === referenceId);
          const savedTiming = content?.textSegments?.length
            ? content.textSegments
            : content?.ayahTiming?.length
            ? content.ayahTiming
            : [];
          setReferencePitch(pitch.reference || []);
          setAyahTiming(savedTiming.length ? savedTiming : pitch.ayah_timing || []);
        }
      } catch (pitchError: any) {
        if (active) {
          setReferencePitch([]);
          setAyahTiming([]);
          setReferencePitchError(pitchError.message || "The Qari graph could not be loaded.");
        }
      } finally {
        if (active) setLoadingReferencePitch(false);
      }
    })();

    return () => { active = false; };
  }, [referenceId, references]);

  const selected = useMemo(() => references.find((reference) => reference.id === referenceId), [references, referenceId]);
  const recordingUrl = useMemo(() => blob ? URL.createObjectURL(blob) : "", [blob]);

  const startRecordingAfterCountdown = useCallback(() => {
    recordingAttemptRef.current += 1;
    setRecordingAttempt(recordingAttemptRef.current);
    setShowRecordingCountdown(false);
    setTriggerStart(true);
  }, []);

  const cancelRecordingCountdown = useCallback(() => {
    setShowRecordingCountdown(false);
    setTriggerStart(false);
  }, []);

  const stopRecordingFromWorkspace = useCallback(() => {
    setTriggerStop(true);
    window.setTimeout(() => setTriggerStop(false), 250);
  }, []);

  useEffect(() => () => {
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  }, [recordingUrl]);

  const reset = () => {
    setBlob(null);
    setRecordingPitch([]);
    setRecordingTime(0);
    recordingTimeRef.current = 0;
    recordingPitchCountRef.current = 0;
    setShowRecordingCountdown(false);
    setResult(null);
    setTriggerStart(false);
    setError(null);
    setR1TechnicalError(null);
  };

  const submitAudio = async (audio: Blob | null) => {
    if (!audio || !selected) return;
    try {
      setSubmitting(true);
      setError(null);
      const analysis = await analyzeRecitation(audio, null, selected.title, selected.id, {
        clientSessionId: participantSessionId.current,
        recordingMode: mode,
        scoringVersion: "V2.3",
        recordingAttempt: Math.max(1, recordingAttemptRef.current),
      });
      setResult(analysis);
      setCompletedModes((completed) => new Set(completed).add(mode));
    } catch (submitError: any) {
      // A mobile connection can lose the HTTP response after the backend has
      // already saved the score. Reconcile first so Retry never duplicates R1.
      for (let recoveryAttempt = 0; recoveryAttempt < 5; recoveryAttempt += 1) {
        try {
          const status = await getRecordingSessionStatus(participantSessionId.current, selected.id);
          const restored = restoreCompletedRecordingResult(status, mode);
          if (restored) {
            setResult(restored);
            setCompletedModes((completed) => new Set(completed).add(mode));
            setError(null);
            return;
          }
        } catch (recoveryError) {
          console.warn("Completed scoring result could not be restored", recoveryError);
        }
        if (recoveryAttempt < 4) {
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
        }
      }
      setError(submitError.message || "The recording could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  };

  const validateR1Recording = async (audio: Blob) => {
    const expectedDuration = selected?.duration || referencePitch.at(-1)?.time || 60;
    const minimumDuration = Math.max(10, expectedDuration * 0.5);
    if (audio.size < 5_000) throw new Error("The R1 recording is empty or too small. Check the microphone and try again.");
    const capturedDuration = recordingTimeRef.current;
    if (capturedDuration < minimumDuration) throw new Error(`The R1 recording is too short (${Math.round(capturedDuration)}s). The technical minimum is ${Math.ceil(minimumDuration)}s.`);
    if (recordingPitchCountRef.current < 5) throw new Error("Insufficient voice activity was detected. Adjust the microphone and try again.");
  };

  const handleRecordingComplete = async (audio: Blob) => {
    setBlob(audio);
    setTriggerStart(false);
    setIsRecordingFullScreenOpen(false);
    if (mode !== "R1") return;
    try {
      setError(null);
      setR1TechnicalError(null);
      await validateR1Recording(audio);
      await submitAudio(audio);
    } catch (validationError: any) {
      const message = validationError.message || "The R1 recording did not pass technical validation.";
      setR1TechnicalError(message);
      setError(message);
    }
  };

  return <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
    <p className="font-semibold text-emerald-700">RECORDING & ASSESSMENT</p>
    <h1 className="mt-3 text-3xl font-bold">Record only when you are fully prepared.</h1>
    <p className="mt-3 text-slate-600">The graph follows your live voice while the Qari audio remains muted. Results are labelled Experimental Score V2.3.</p>

    <div className="mt-8 rounded-2xl border bg-white p-6">
      <h2 className="text-xl font-bold">1. Recording Setup</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold">Reference Audio
          <select disabled={loading || isRecording} value={referenceId} onChange={(event) => { setReferenceId(event.target.value); recordingAttemptRef.current = 0; setRecordingAttempt(0); setCompletedModes(new Set()); reset(); }} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal">
            <option value="">{loading ? "Loading…" : "Select a reference"}</option>
            {references.map((reference) => <option key={reference.id} value={reference.id}>{reference.title}</option>)}
          </select>
        </label>
        <fieldset>
          <legend className="text-sm font-semibold">Recording Session</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(["R1", "R2", "R3"] as RecordingMode[]).map((value) => {
              const locked = value === "R2" ? !completedModes.has("R1") : value === "R3" ? !completedModes.has("R2") : false;
              const done = completedModes.has(value);
              return <button
              key={value}
              type="button"
              disabled={isRecording || locked}
              aria-pressed={mode === value}
              onClick={() => { setMode(value); recordingAttemptRef.current = 0; setRecordingAttempt(0); reset(); }}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border p-3 font-bold disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${mode === value ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-slate-300"}`}
            >{done && <CheckCircle2 size={17}/>} {value}</button>})}
          </div>
        </fieldset>
      </div>
      <div className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
        <span className="flex items-center gap-2"><Headphones size={18}/> Headset connected</span>
        <span className="flex items-center gap-2"><Mic2 size={18}/> Microphone enabled</span>
        <span className="flex items-center gap-2"><ShieldCheck size={18}/> Quiet recording space</span>
      </div>
      <p className="mt-4 text-xs text-slate-400">Active training session · Technical ID stored automatically</p>
    </div>

    <div className="mt-6 rounded-2xl border bg-white p-6">
      <h2 className="text-xl font-bold">2. Record Recitation — {mode}</h2>
      <p className="mt-2 text-sm text-slate-600">{modeDescription[mode]}</p>
      {error && <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {!referenceId
        ? <p className="mt-6 rounded-xl bg-amber-50 p-4 text-amber-900">Select a reference audio first.</p>
        : <Suspense fallback={<p className="mt-6 text-slate-500">Loading recorder…</p>}>
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">Qari and Student Pitch Comparison</p>
                  <p className="text-xs text-slate-500">The Qari graph is a visual guide — Qari audio is not played</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isRecording ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                    {isRecording ? "LIVE" : "Ready"}
                  </span>
                  <button
                    type="button"
                    disabled={mode === "R1" && !!blob && !r1TechnicalError}
                    onClick={() => setIsRecordingFullScreenOpen(true)}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Maximize2 size={16}/> Fullscreen
                  </button>
                </div>
              </div>
              {loadingReferencePitch
                ? <div className="flex h-[300px] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500">Loading Qari graph…</div>
                : referencePitchError
                ? <div className="flex h-[300px] items-center justify-center rounded-lg bg-red-50 px-4 text-center text-sm text-red-700">{referencePitchError}</div>
                : <LivePitchGraph
                    referencePitch={referencePitch}
                    studentPitch={recordingPitch}
                    isRecording={isRecording}
                    isPlaying={false}
                    currentTime={recordingTime}
                    referenceDuration={selected?.duration || referencePitch.at(-1)?.time || 60}
                    height={300}
                    fixedYAxis
                    ayahMarkers={ayahTiming}
                  />}
            </div>
            <div className="hidden" aria-hidden="true"><Recorder
              isRecording={isRecording}
              setIsRecording={setIsRecording}
              onPitchUpdate={(pitch) => {
                recordingPitchCountRef.current += 1;
                setRecordingPitch((points) => [...points, pitch]);
              }}
              onRecordingTimeUpdate={(time) => {
                recordingTimeRef.current = time;
                setRecordingTime(time);
              }}
              recordingPitchData={recordingPitch}
              referencePitchData={referencePitch}
              referenceDuration={selected?.duration || 60}
              maxDuration={selected?.duration || referencePitch.at(-1)?.time || 60}
              onRecordingStart={() => {
                setBlob(null);
                setResult(null);
                setRecordingPitch([]);
                setRecordingTime(0);
                recordingTimeRef.current = 0;
                recordingPitchCountRef.current = 0;
                setTriggerStart(false);
                setShowRecordingCountdown(true);
              }}
              triggerRecordingStart={triggerStart}
              triggerRecordingStop={triggerStop}
              onRecordingComplete={handleRecordingComplete}
              onError={setError}
            /></div>
          </Suspense>}
    </div>

    {blob && mode !== "R1" && <div className="mt-6 rounded-2xl border bg-white p-6">
      <h2 className="text-xl font-bold">3. Review Recording</h2>
      <audio controls src={recordingUrl} className="mt-5 w-full"/>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 font-semibold"><RotateCcw size={18}/> Retake</button>
        <button type="button" onClick={() => submitAudio(blob)} disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-50"><Send size={18}/>{submitting ? "Processing…" : "Submit for Scoring"}</button>
      </div>
    </div>}

    {blob && mode === "R1" && !result && <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-6">
      <h2 className="text-xl font-bold text-blue-950">R1 — Automatic Submission</h2>
      <p className="mt-2 text-sm text-blue-900">The original recording is not played back, preserving baseline integrity.</p>
      {submitting
        ? <p className="mt-4 font-semibold text-blue-800">Validation passed. Submitting the original file for scoring…</p>
        : r1TechnicalError
        ? <div className="mt-4">
            <p className="text-sm font-medium text-blue-950">Technical validation failed: {r1TechnicalError}</p>
            <button type="button" onClick={() => setIsRecordingFullScreenOpen(true)} className="mt-3 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white">Repeat Technical Capture</button>
          </div>
        : error
        ? <button type="button" onClick={() => submitAudio(blob)} className="mt-4 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white">Retry the same file</button>
        : null}
    </div>}

    {result && <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
      <div className="flex items-center gap-3 text-emerald-800"><CheckCircle2/><h2 className="text-xl font-bold">Experimental Score V2.3</h2></div>
      <p className="mt-3 max-w-2xl text-slate-700">This score supports practice and is not an official result or participant ranking.</p>
      {result.scoreBreakdown && <div className="mt-6 space-y-6">
        <Suspense fallback={<p className="text-sm text-slate-500">Preparing assessment profile…</p>}>
          <AssessmentInfographic
            overall={result.normalizedScore ?? result.score}
            metrics={[
              { label: "Melodic Contour", value: result.scoreBreakdown.pitchContour ?? result.scoreBreakdown.pitch },
              { label: "Contour Detail", value: result.scoreBreakdown.contourDetail },
              { label: "Pitch Position", value: result.scoreBreakdown.graphPosition },
              { label: "Ayah Melody Similarity", value: result.scoreBreakdown.ayatGraph },
              { label: "Timing Consistency", value: result.scoreBreakdown.ayatTiming ?? result.scoreBreakdown.timing },
              { label: "Vocal Stability", value: result.scoreBreakdown.graphStability },
              { label: "Ayah Completion", value: result.scoreBreakdown.segmentCoverage },
              { label: "Recitation Validity", value: result.scoreBreakdown.recitationValidity },
              { label: "Voice Coverage", value: result.scoreBreakdown.segmentCoverage },
              { label: "Microphone Stability", value: result.scoreBreakdown.micStability },
              { label: "Audio Clarity", value: result.scoreBreakdown.audioClarity },
            ]}
          />
        </Suspense>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <strong>How the final score is formed:</strong> V2.3 applies weighted graph metrics, assessment-validity checks and any applicable score cap. Component scores are diagnostic indicators and are not averaged equally.
        </div>
      </div>}
      <dl className="mt-5 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
        <div><dt className="font-semibold">Recording ID</dt><dd className="break-all">{result.sessionId || "—"}</dd></div>
        <div><dt className="font-semibold">Metadata</dt><dd>{result.recordingMode || mode} · {result.scoringVersion || "V2.3"} · Attempt {result.recordingAttempt || recordingAttempt}</dd></div>
      </dl>
      {result.integrityStatus === "complete"
        ? <p className="mt-4 text-sm font-medium text-emerald-800">Data integrity verified: database, audio and score data are complete.</p>
        : result.integrityStatus
        ? <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">The score is available, but secure data storage requires attention. Status: {result.integrityStatus}.</p>
        : null}
    </div>}

    <Link to={`/training${referenceId ? `?reference=${encodeURIComponent(referenceId)}` : ""}`} className="mt-8 inline-block font-semibold text-emerald-700">← Back to Training</Link>
    <Suspense fallback={null}>
      <Countdown
        isActive={showRecordingCountdown}
        onComplete={startRecordingAfterCountdown}
        onCancel={cancelRecordingCountdown}
        duration={5}
        showAudioCue
      />
      <RecordingFullScreenMode
        isOpen={isRecordingFullScreenOpen}
        onClose={() => setIsRecordingFullScreenOpen(false)}
        referencePitch={referencePitch}
        studentPitch={recordingPitch}
        isRecording={isRecording}
        isPlaying={false}
        currentTime={recordingTime}
        referenceDuration={selected?.duration || referencePitch.at(-1)?.time || 60}
        onPlay={() => {}}
        onPause={() => {}}
        onStop={stopRecordingFromWorkspace}
        onRestart={() => setRecordingTime(0)}
        isPracticeMode={false}
        isRecordingSession={isRecording}
        onRecordingStart={() => {
          if (mode === "R1" && blob && !r1TechnicalError) return;
          setR1TechnicalError(null);
          setError(null);
          setBlob(null);
          setResult(null);
          setRecordingPitch([]);
          setRecordingTime(0);
          setTriggerStart(false);
          setShowRecordingCountdown(true);
        }}
        onRecordingStop={stopRecordingFromWorkspace}
        ayatTiming={ayahTiming}
        onSeekToTime={() => {}}
        canRepeatAyah={false}
        studentBlob={blob}
        zoomLevel={fullScreenZoom}
        onZoomChange={setFullScreenZoom}
      />
    </Suspense>
  </section>;
};

export default RecordingPage;
