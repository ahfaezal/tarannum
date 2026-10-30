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
const alAbrarBase = "/programs/bengkel-tarannum-al-fatihah-kelantan-2026";

export const programs: ProgramRecord[] = [
  {
    slug: "bengkel-tarannum-al-fatihah-nahawand-kelantan-2026",
    title: "Bengkel Tarannum Nahawand Surah Al-Fatihah",
    eyebrow: "REKOD PROGRAM TARANNUM.AI",
    date: "2026-10-27",
    dateLabel: "27 Oktober 2026",
    location: "Masjid Al-Abrar, Mukim Pauh Sembilan, Bachok, Kelantan",
    facilitator: "Ts. Ah Faezal Husni Hj. Arshad",
    category: "Al-Fatihah & Maqam Nahawand",
    excerpt: "Bengkel komuniti di Bachok yang memperkenalkan latihan Surah Al-Fatihah dalam Maqam Nahawand menggunakan sistem Tarannum.ai.",
    introduction: [
      "Bengkel Tarannum Nahawand Surah Al-Fatihah dilaksanakan sebagai kelas komuniti percuma untuk membantu peserta mendengar, memahami dan mengikuti bentuk melodi Nahawand secara tersusun.",
      "Program dua jam ini menggabungkan penerangan bersemuka dengan latihan digital Tarannum.ai. Seramai 38 peserta direkodkan dalam senarai pendaftaran awal, manakala kehadiran sebenar pada hari program mencapai 69 orang.",
    ],
    heroImage: `${alAbrarBase}/867812156_1560958872735370_6005944260418750307_n.webp`,
    heroAlt: "Foto berkumpulan Bengkel Tarannum Nahawand Surah Al-Fatihah di Masjid Al-Abrar",
    facts: [
      { label: "Tarikh", value: "Selasa, 27 Oktober 2026" },
      { label: "Masa", value: "2.00 – 4.00 petang" },
      { label: "Lokasi", value: "Masjid Al-Abrar, Mukim Pauh Sembilan, Bachok" },
      { label: "Pembimbing", value: "Ts. Ah Faezal Husni Hj. Arshad" },
    ],
    journey: [
      { time: "2.00 petang", title: "Pengenalan Maqam Nahawand", description: "Penerangan asas melodi dan kaitannya dengan bacaan Surah Al-Fatihah." },
      { time: "2.30 petang", title: "Demonstrasi bacaan", description: "Peserta mendengar dan memerhati contoh bacaan berpandukan rujukan." },
      { time: "3.00 petang", title: "Latihan menggunakan Tarannum.ai", description: "Latihan individu dengan visualisasi nada dan bimbingan dalam kumpulan." },
      { time: "3.45 petang", title: "Rumusan latihan", description: "Pengukuhan semula teknik bacaan dan panduan meneruskan latihan kendiri." },
    ],
    outcomes: [
      { value: "69", label: "Hadir", description: "Kehadiran sebenar melebihi 38 peserta yang direkodkan dalam senarai awal." },
      { value: "2 jam", label: "Latihan berfokus", description: "Pengenalan, demonstrasi dan amali Surah Al-Fatihah dalam satu sesi." },
      { value: "1 maqam", label: "Nahawand", description: "Latihan tertumpu pada bentuk melodi Nahawand untuk Surah Al-Fatihah." },
    ],
    gallery: [
      { src: `${alAbrarBase}/poster.webp`, alt: "Poster rasmi Bengkel Tarannum Nahawand Surah Al-Fatihah", caption: "Poster rasmi bengkel komuniti di Masjid Al-Abrar." },
      { src: `${alAbrarBase}/875447823_1560956049402319_8346864318071658002_n.webp`, alt: "Pembimbing menyampaikan bengkel tarannum", caption: "Penerangan dan demonstrasi oleh pembimbing." },
      { src: `${alAbrarBase}/869184664_1560956206068970_3533553743650002158_n.webp`, alt: "Peserta mengikuti bengkel di ruang solat masjid", caption: "Sebahagian daripada 69 hadirin yang mengikuti program." },
      { src: `${alAbrarBase}/867812150_1560956819402242_6225274529140066317_n.webp`, alt: "Peserta lelaki menggunakan peranti untuk latihan", caption: "Latihan digital dalam kumpulan peserta lelaki." },
      { src: `${alAbrarBase}/866341281_1560957026068888_7648187976543128733_n.webp`, alt: "Peserta wanita melihat paparan latihan Tarannum.ai", caption: "Peserta memerhati visualisasi latihan pada peranti." },
      { src: `${alAbrarBase}/870076743_1560957276068863_4524060217130152565_n.webp`, alt: "Fasilitator membantu peserta menggunakan sistem", caption: "Bantuan penggunaan sistem diberikan secara langsung." },
      { src: `${alAbrarBase}/872851350_1560957342735523_6873580736879861946_n.webp`, alt: "Barisan peserta wanita mengikuti latihan", caption: "Latihan berperingkat mengikut bacaan rujukan." },
      { src: `${alAbrarBase}/866253231_1560958079402116_6140139160100554227_n.webp`, alt: "Peserta menerima bimbingan penggunaan Tarannum.ai", caption: "Bimbingan dekat membantu peserta mencuba sistem dengan yakin." },
      { src: `${alAbrarBase}/870285240_1560958222735435_2863033835817730152_n.webp`, alt: "Suasana keseluruhan Bengkel Tarannum Al-Fatihah", caption: "Suasana pembelajaran komuniti di Masjid Al-Abrar." },
      { src: `${alAbrarBase}/866413056_1560958449402079_7434089445134576117_n.webp`, alt: "Peserta lelaki berlatih dalam satu barisan", caption: "Latihan bacaan dilaksanakan bersama peranti yang disediakan." },
      { src: `${alAbrarBase}/865795619_1560958796068711_6001432394119482656_n.webp`, alt: "Foto berkumpulan peserta Bengkel Tarannum", caption: "Kenangan bersama peserta program di Bachok, Kelantan." },
    ],
  },
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
