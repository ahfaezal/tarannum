import React, { useEffect, useMemo } from "react";
import { CheckCircle2, ExternalLink, MapPin, Phone, QrCode, ShieldCheck } from "lucide-react";
import { useParams } from "react-router-dom";

type PublicAsset = {
  id: string;
  model: string;
  status: "Active";
};

const getPublicAsset = (rawId: string): PublicAsset | null => {
  const id = rawId.trim().toUpperCase();
  const match = id.match(/^TAR-(IP5|IP8|IP9|IPA4)-(\d{3})$/);
  if (!match) return null;

  const unit = Number(match[2]);
  const fleets: Record<string, { model: string; maximum: number }> = {
    IP5: { model: "iPad 5th Generation", maximum: 1 },
    IP8: { model: "iPad 8th Generation", maximum: 60 },
    IP9: { model: "iPad 9th Generation", maximum: 26 },
    IPA4: { model: "iPad Air 4", maximum: 1 },
  };
  const fleet = fleets[match[1]];
  if (!fleet || unit < 1 || unit > fleet.maximum) return null;
  return { id, model: fleet.model, status: "Active" };
};

const AssetPage: React.FC = () => {
  const { deviceId = "" } = useParams();
  const asset = useMemo(() => getPublicAsset(deviceId), [deviceId]);

  useEffect(() => {
    document.title = asset
      ? `${asset.id} | Tarannum.ai Asset`
      : "Asset tidak ditemui | Tarannum.ai";
  }, [asset]);

  if (!asset) {
    return (
      <section className="mx-auto flex min-h-[72vh] max-w-2xl items-center px-4 py-12 sm:px-6">
        <div className="w-full rounded-3xl border border-amber-200 bg-white p-7 text-center shadow-xl shadow-slate-200/50 sm:p-10">
          <QrCode className="mx-auto h-14 w-14 text-amber-600" aria-hidden="true" />
          <p className="mt-5 text-sm font-bold uppercase tracking-[0.2em] text-amber-700">Tarannum Asset</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">ID aset tidak ditemui</h1>
          <p className="mx-auto mt-3 max-w-md text-slate-600">
            Kod yang diimbas tidak sepadan dengan rekod aset awam Tarannum Technologies.
          </p>
          <a href="tel:+60192504000" className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-800">
            <Phone className="h-5 w-5" aria-hidden="true" /> Hubungi Tarannum
          </a>
        </div>
      </section>
    );
  }

  const reportMessage = encodeURIComponent(
    `Assalamualaikum. Saya telah menjumpai peranti Tarannum dengan ID ${asset.id}. Mohon hubungi saya untuk urusan pemulangan.`,
  );

  return (
    <section className="relative isolate min-h-[72vh] overflow-hidden bg-slate-950 px-4 py-10 sm:px-6 sm:py-16">
      <div className="absolute inset-0 -z-10 opacity-70 [background:radial-gradient(circle_at_top_left,#047857_0,transparent_42%),radial-gradient(circle_at_bottom_right,#0f766e_0,transparent_38%)]" />
      <div className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-black/30">
          <div className="border-b border-emerald-100 bg-emerald-50 px-6 py-5 sm:px-9">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img src="/images/logo-web.jpg" alt="Tarannum.ai" className="h-12 w-12 rounded-full object-cover shadow-sm" />
                <div>
                  <p className="font-bold text-slate-950">TARANNUM.AI</p>
                  <p className="text-sm text-slate-600">Official Asset Verification</p>
                </div>
              </div>
              <ShieldCheck className="h-9 w-9 text-emerald-700" aria-hidden="true" />
            </div>
          </div>

          <div className="px-6 py-8 sm:px-9 sm:py-10">
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Aset disahkan
            </div>
            <h1 className="mt-3 break-words text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">{asset.id}</h1>
            <p className="mt-2 text-lg font-medium text-slate-600">{asset.model}</p>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-lg font-bold text-slate-950">Property of Tarannum Technologies</p>
              <p className="mt-2 leading-7 text-slate-600">
                Peranti ini adalah hak milik Tarannum Technologies. Jika dijumpai, sila hubungi kami untuk urusan pemulangan.
              </p>
              <dl className="mt-5 grid gap-3 border-t border-slate-200 pt-5 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Status aset</dt>
                  <dd className="mt-1 font-bold text-emerald-700">{asset.status}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Pemilik</dt>
                  <dd className="mt-1 font-bold text-slate-900">Tarannum Technologies</dd>
                </div>
              </dl>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <a href="tel:+60192504000" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white shadow-sm hover:bg-emerald-800">
                <Phone className="h-5 w-5" aria-hidden="true" /> 019-250 4000
              </a>
              <a href={`https://wa.me/60192504000?text=${reportMessage}`} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-700 px-5 py-3 font-bold text-emerald-800 hover:bg-emerald-50">
                Laporkan peranti dijumpai <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>

            <div className="mt-7 flex items-start gap-3 rounded-xl bg-slate-900 px-4 py-4 text-sm text-slate-200">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
              <p>Untuk keselamatan, halaman awam ini tidak memaparkan serial number, pengguna terakhir, lokasi dalaman atau maklumat MDM.</p>
            </div>
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-slate-400">asset.tarannum.ai · Tarannum Asset Management System</p>
      </div>
    </section>
  );
};

export default AssetPage;
