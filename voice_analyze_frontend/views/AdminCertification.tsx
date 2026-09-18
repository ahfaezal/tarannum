import React from 'react';
import CourseManager from '../components/CourseManager';
import CEOSignaturePanel from '../components/CEOSignaturePanel';

const AdminCertification: React.FC = () => (
  <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
    <header>
      <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">Pentadbiran</p>
      <h1 className="text-3xl font-bold">Kursus & Sijil</h1>
      <p className="mt-2 text-slate-600">Pilih kursus untuk mengurus peserta, kehadiran, Live Scoring dan kemajuan persijilan dalam satu tempat.</p>
    </header>
    <CourseManager admin defaultExpanded />
    <CEOSignaturePanel />
  </div>
);

export default AdminCertification;
