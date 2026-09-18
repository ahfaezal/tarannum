import React, { useEffect, useState } from 'react';
import { CEOSignatureStatus, getCEOSignaturePreview, getCEOSignatureStatus, uploadCEOSignature } from '../services/certificationService';

export default function CEOSignaturePanel() {
  const [status, setStatus] = useState<CEOSignatureStatus | null>(null);
  const [preview, setPreview] = useState<Blob | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getCEOSignatureStatus();
        if (cancelled) return;
        setStatus(result);
        if (result.uploaded) {
          const blob = await getCEOSignaturePreview();
          if (!cancelled) setPreview(blob);
        }
      } catch (e: any) {if (!cancelled) setError(e.message);}
      finally {if (!cancelled) setBusy(false);}
    })();
    return () => {cancelled = true;};
  }, []);
  useEffect(() => {
    if (!preview) return;
    const objectUrl = URL.createObjectURL(preview);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [preview]);
  const upload = async (file: File) => {
    setError(''); setMessage('');
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 2*1024*1024 || !file.size) {
      setError('Gunakan PNG, JPEG atau WebP, maksimum 2 MB.'); return;
    }
    if (status?.uploaded && !window.confirm('Gantikan tandatangan CEO aktif? Gambar baharu akan digunakan pada PDF sijil yang dijana selepas ini.')) return;
    setBusy(true);
    try {
      const result = await uploadCEOSignature(file);
      setStatus(result);
      setMessage('Tandatangan CEO berjaya disimpan.');
      setPreview(await getCEOSignaturePreview());
    } catch (e: any) {setError(e.message);}
    finally {setBusy(false);}
  };
  return <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-bold text-emerald-900">Tandatangan CEO</h2>
    <p className="mt-2 text-sm text-slate-600">Digunakan pada Sijil Kehadiran & Penyertaan serta Sijil Kompetensi. Muat naik tandatangan Ketua Pegawai Eksekutif, Tarannum Technologies. PNG berlatar telus disarankan.</p>
    <p className="mt-2 text-sm font-semibold" role="status" aria-live="polite">{busy ? 'Memproses…' : status?.uploaded ? `Tandatangan aktif${status.updated_at ? ` · ${new Date(status.updated_at).toLocaleString('ms-MY')}` : ''}` : status ? 'Belum dimuat naik' : 'Status belum dapat disemak'}</p>
    {url && <div className="mt-3 inline-block rounded border bg-slate-50 p-4"><img src={url} alt="Pratonton tandatangan CEO aktif" className="h-24 max-w-full object-contain" /></div>}
    <label className="mt-4 block text-sm font-semibold">{status?.uploaded ? 'Gantikan tandatangan' : 'Muat naik tandatangan'}
      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} className="mt-2 block max-w-full" onChange={e => {const file=e.target.files?.[0]; e.target.value=''; if(file) void upload(file);}} />
    </label>
    <p className="mt-2 text-xs text-slate-500">Maksimum 2 MB dan 4000 × 4000 piksel. Muat naik dan pratonton hanya boleh diakses oleh admin.</p>
    {message && <p className="mt-2 text-emerald-700" role="status">{message}</p>}
    {error && <p className="mt-2 text-red-700" role="alert">{error}</p>}
  </section>;
}
