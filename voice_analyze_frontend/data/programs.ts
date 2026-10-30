export type ProgramGalleryItem = {
  src: string;
  alt: string;
  caption: string;
};

export type ProgramRecord = {
  slug: string;
  title: string;
  eyebrow: string;
  date: string;
  dateLabel: string;
  location: string;
  facilitator: string;
  category: string;
  excerpt: string;
  introduction: string[];
  heroImage: string;
  heroAlt: string;
  facts: Array<{ label: string; value: string }>;
  journey: Array<{ time: string; title: string; description: string }>;
  outcomes: Array<{ value: string; label: string; description: string }>;
  gallery: ProgramGalleryItem[];
};

const base = "/programs/kursus-profesional-azan-2026";

export const programs: ProgramRecord[] = [
  {
    slug: "kursus-profesional-azan-maqam-hijjaz-2026",
    title: "Kursus Profesional Azan Maqam Hijjaz",
    eyebrow: "REKOD PROGRAM TARANNUM.AI",
    date: "2026-10-24",
    dateLabel: "24 Oktober 2026",
    location: "Surau Jumaat Al-Amin, Bandar Tun Razak, Kuala Lumpur",
    facilitator: "Ustaz Ahmad Tarmizi bin Abdul Rahman",
    category: "Azan & Maqam Hijjaz",
    excerpt: "Latihan intensif satu hari yang menggabungkan bimbingan Qari, amali azan dan teknologi latihan suara Tarannum.ai.",
    introduction: [
      "Kursus Profesional Azan Maqam Hijjaz menghimpunkan peserta untuk memahami struktur, kawalan suara dan pembawaan Maqam Hijjaz melalui bimbingan secara langsung.",
      "Setiap peserta menggunakan iPad dan headset yang disediakan untuk mendengar rujukan, mengikuti graf nada, membuat rakaman serta melihat maklum balas latihan dalam sistem Tarannum.ai.",
    ],
    heroImage: `${base}/20261024_161545.webp`,
    heroAlt: "Foto berkumpulan Kursus Profesional Azan Maqam Hijjaz",
    facts: [
      { label: "Tarikh", value: "Sabtu, 24 Oktober 2026" },
      { label: "Masa", value: "7.30 pagi – 4.00 petang" },
      { label: "Lokasi", value: "Surau Jumaat Al-Amin, Bandar Tun Razak" },
      { label: "Pembimbing", value: "Ustaz Ahmad Tarmizi bin Abdul Rahman" },
    ],
    journey: [
      { time: "7.30 pagi", title: "Pendaftaran & persediaan", description: "Semakan peserta, pembahagian peranti dan persediaan ruang latihan." },
      { time: "8.30 pagi", title: "Asas Azan Maqam Hijjaz", description: "Penerangan struktur lagu, pernafasan, sebutan dan kawalan suara." },
      { time: "10.30 pagi", title: "Demonstrasi & latihan berpandu", description: "Peserta mengikuti contoh bacaan dan graf nada bersama pembimbing." },
      { time: "2.00 petang", title: "Rakaman dan penilaian", description: "Latihan individu menggunakan iPad, headset dan sistem Tarannum.ai." },
      { time: "3.30 petang", title: "Rumusan & penghargaan", description: "Sesi penutup, penyampaian sijil umum dan fotografi peserta." },
    ],
    outcomes: [
      { value: "80", label: "Peserta", description: "Peserta mengikuti latihan fizikal dan digital dalam satu ruang pembelajaran." },
      { value: "1 hari", label: "Latihan intensif", description: "Daripada asas Maqam Hijjaz hingga rakaman dan maklum balas kendiri." },
      { value: "30 hari", label: "Akses latihan", description: "Peserta boleh meneruskan latihan dalam tempoh program yang ditetapkan." },
    ],
    gallery: [
      { src: `${base}/20261024_083844.webp`, alt: "Pembimbing menyampaikan latihan kepada peserta", caption: "Sesi pengenalan dan penerangan awal program." },
      { src: `${base}/20261024_091032.webp`, alt: "Peserta mengikuti penerangan Maqam Hijjaz", caption: "Penerangan teknik azan dan struktur Maqam Hijjaz." },
      { src: `${base}/20261024_091317.webp`, alt: "Peserta menggunakan iPad dan headset", caption: "Latihan digital menggunakan peranti yang disediakan." },
      { src: `${base}/20261024_094415.webp`, alt: "Suasana latihan Kursus Profesional Azan", caption: "Peserta mendengar, memerhati dan berlatih secara berpandu." },
      { src: `${base}/20261024_150934.webp`, alt: "Sesi amali pada sebelah petang", caption: "Sesi rakaman dan penilaian kendiri bersama Tarannum.ai." },
      { src: `${base}/20261024_155205.webp`, alt: "Rumusan Kursus Profesional Azan", caption: "Rumusan program dan perkongsian akhir pembimbing." },
      { src: `${base}/20261024_124120.webp`, alt: "Peserta menerima sijil umum program", caption: "Kenangan peserta bersama pembimbing." },
      { src: `${base}/20261024_124517.webp`, alt: "Peserta bergambar bersama pembimbing", caption: "Penghargaan kepada peserta kursus." },
      { src: `${base}/20261024_125348.webp`, alt: "Peserta wanita bergambar bersama pembimbing", caption: "Penyertaan peserta daripada pelbagai latar belakang." },
      { src: `${base}/20261024_161544.webp`, alt: "Foto rasmi semua peserta kursus", caption: "Foto rasmi Kursus Profesional Azan Maqam Hijjaz 2026." },
    ],
  },
];

export const programBySlug = (slug?: string) => programs.find((program) => program.slug === slug);
