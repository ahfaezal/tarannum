import React, { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { Camera, ExternalLink, Hash, QrCode } from "lucide-react";
import { useNavigate } from "react-router-dom";


const tokenFromQr = (value: string): string | null => {
  try {
    const url = new URL(value, window.location.origin);
    const match = url.pathname.match(/^\/course\/join\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
};

const CourseScannerPage: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [manualCode, setManualCode] = useState("");

  const stop = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  };

  const joinWithCode = (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(manualCode)) {
      setError("Masukkan kod penyertaan 6 digit yang dipaparkan oleh Qari.");
      return;
    }
    stop();
    navigate(`/course/join/${manualCode}`);
  };
  useEffect(() => stop, []);

  const start = async () => {
    setError(""); setScanning(true);
    try {
      const reader = new BrowserQRCodeReader();
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (!result) return;
        const token = tokenFromQr(result.getText());
        if (!token) { setError("QR ini bukan pautan kursus Tarannum.ai."); return; }
        stop();
        navigate(`/course/join/${encodeURIComponent(token)}`);
      });
    } catch (reason: any) {
      setScanning(false);
      setError(reason?.message?.includes('Permission') ? 'Kebenaran kamera diperlukan untuk mengimbas QR.' : 'Kamera tidak dapat dimulakan. Gunakan aplikasi Camera iPad sebagai pilihan kedua.');
    }
  };

  return <section className="mx-auto max-w-2xl p-4 sm:py-12">
    <div className="rounded-3xl border bg-white p-6 shadow-lg sm:p-8">
      <QrCode className="h-12 w-12 text-emerald-700"/><h1 className="mt-4 text-3xl font-black text-slate-950">Imbas QR Kursus</h1>
      <p className="mt-3 leading-7 text-slate-600">Halakan kamera kepada QR yang dipaparkan oleh Qari. Sistem akan memilih Qari dan rujukan latihan kursus secara automatik.</p>
      <div className="mt-6 overflow-hidden rounded-2xl bg-slate-950"><video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline /></div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-3">{!scanning ? <button onClick={() => void start()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white"><Camera/>Aktifkan kamera</button> : <button onClick={stop} className="rounded-xl border border-slate-300 px-5 py-3 font-bold">Hentikan kamera</button>}</div>
      <div className="my-7 flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-slate-400"><span className="h-px flex-1 bg-slate-200"/>atau<span className="h-px flex-1 bg-slate-200"/></div>
      <form onSubmit={joinWithCode} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <label htmlFor="course-manual-code" className="flex items-center gap-2 font-bold text-emerald-950"><Hash className="h-5 w-5"/>Masukkan kod penyertaan</label>
        <p className="mt-1 text-sm text-emerald-800">Gunakan kod 6 digit pada skrin Qari jika QR tidak dapat diimbas.</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input id="course-manual-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={manualCode} onChange={event => setManualCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="min-w-0 flex-1 rounded-xl border border-emerald-300 bg-white px-4 py-3 text-center text-2xl font-black tracking-[0.35em] text-slate-950"/>
          <button type="submit" className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white">Sertai kursus</button>
        </div>
      </form>
      <div className="mt-7 rounded-xl bg-slate-100 p-4 text-sm leading-6 text-slate-700"><ExternalLink className="mr-2 inline h-4 w-4"/>Jika pelayar tidak membenarkan kamera, buka aplikasi <strong>Camera</strong> iPad dan imbas QR. Pautan akan kembali ke Tarannum.ai; login dahulu jika diminta.</div>
    </div>
  </section>;
};

export default CourseScannerPage;
