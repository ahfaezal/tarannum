import React, { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { Camera, ExternalLink, QrCode } from "lucide-react";
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

  const stop = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
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
      <div className="mt-7 rounded-xl bg-slate-100 p-4 text-sm leading-6 text-slate-700"><ExternalLink className="mr-2 inline h-4 w-4"/>Jika pelayar tidak membenarkan kamera, buka aplikasi <strong>Camera</strong> iPad dan imbas QR. Pautan akan kembali ke Tarannum.ai; login dahulu jika diminta.</div>
    </div>
  </section>;
};

export default CourseScannerPage;
