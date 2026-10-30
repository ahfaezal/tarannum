export type AchievementGalleryItem = {
  src: string;
  alt: string;
  caption: string;
  portrait?: boolean;
};

export type AchievementRecord = {
  slug: string;
  award: string;
  title: string;
  eyebrow: string;
  event: string;
  date: string;
  dateLabel: string;
  venue: string;
  organizer: string;
  recipient: string;
  presenter: string;
  abstractId: string;
  category: string;
  theme: string;
  excerpt: string;
  introduction: string[];
  significance: string[];
  heroImage: string;
  heroAlt: string;
  facts: Array<{ label: string; value: string }>;
  gallery: AchievementGalleryItem[];
  certificateImage: string;
};

const base = "/achievements/knovasi-2026";

export const achievements: AchievementRecord[] = [
  {
    slug: "pingat-emas-knovasi-2026",
    award: "Pingat Emas",
    title: "Tarannum.ai di kNOVASI 2026",
    eyebrow: "PENCAPAIAN & PENGIKTIRAFAN",
    event: "Karnival Inovasi Pengajaran & Pembelajaran 2026 (kNOVASI 2026)",
    date: "2026-10-01",
    dateLabel: "30 September – 1 Oktober 2026",
    venue: "Sama-Sama Hotel, Sepang",
    organizer: "Universiti Kebangsaan Malaysia",
    recipient: "Ah Faezal Husni Arshad",
    presenter: "Ah Faezal Husni Arshad",
    abstractId: "A70",
    category: "Pentaksiran Alternatif",
    theme: "Pencitraan Semula Pendidikan Tinggi dalam Era Kecerdasan Buatan",
    excerpt: "Tarannum.ai menerima Pingat Emas di kNOVASI 2026 atas inovasi pentaksiran alternatif berasaskan AI yang diperkukuh dengan validasi Qari pakar.",
    introduction: [
      "Tarannum.ai dipersembahkan di kNOVASI 2026 sebagai sebuah platform pentaksiran alternatif untuk latihan tarannum al-Quran. Inovasi ini menggabungkan analisis berasaskan kecerdasan buatan, visualisasi latihan dan pengesahan manusia oleh Qari pakar.",
      "Pembentangan rasmi telah dijadualkan di bawah kategori Pentaksiran Alternatif dengan ID abstrak A70. Pengiktirafan Pingat Emas menjadi penanda penting kepada usaha membangunkan pengalaman latihan yang lebih tersusun, terukur dan mudah dicapai.",
    ],
    significance: [
      "Mengiktiraf pendekatan Tarannum.ai yang menggabungkan teknologi AI dan kepakaran Qari.",
      "Memperkukuh peranan sistem sebagai alat latihan dan pentaksiran alternatif, bukan pengganti guru.",
      "Memberi keyakinan untuk memperluas penggunaan Tarannum.ai dalam kursus, institusi dan komuniti.",
    ],
    heroImage: `${base}/40a31929-2616-47c6-9cc2-e8750c527a43.webp`,
    heroAlt: "Ah Faezal Husni Arshad di ruang pameran Tarannum.ai semasa kNOVASI 2026",
    facts: [
      { label: "Pengiktirafan", value: "Pingat Emas" },
      { label: "Acara", value: "kNOVASI 2026" },
      { label: "Tarikh", value: "30 September – 1 Oktober 2026" },
      { label: "Lokasi", value: "Sama-Sama Hotel, Sepang" },
      { label: "Kategori", value: "Pentaksiran Alternatif" },
      { label: "ID Abstrak", value: "A70" },
    ],
    gallery: [
      { src: `${base}/b616a812-35bc-46f3-b004-e00c2bb17344.webp`, alt: "Ruang pameran inovasi Tarannum.ai", caption: "Ruang pameran Tarannum.ai di kNOVASI 2026." },
      { src: `${base}/56522a3a-e5de-4a76-aad2-34dfa3085534.webp`, alt: "Pelawat bersama wakil Tarannum.ai", caption: "Perkongsian inovasi bersama pengunjung pameran." },
      { src: `${base}/20261001_224809.webp`, alt: "Pingat Emas kNOVASI 2026", caption: "Pingat Emas yang diterima oleh Tarannum.ai.", portrait: true },
      { src: `${base}/98261024-ca53-459a-bf91-38a3f1a63fcd.webp`, alt: "Foto rasmi peserta kNOVASI 2026", caption: "Foto rasmi peserta dan penganjur kNOVASI 2026." },
      { src: `${base}/014a9a15-eb77-4acf-bf74-9102eb394d72.webp`, alt: "Demonstrasi Tarannum.ai kepada pelawat", caption: "Demonstrasi pengalaman latihan Tarannum.ai." },
      { src: `${base}/20261001_172750.webp`, alt: "Kenangan di majlis kNOVASI 2026", caption: "Kenangan bersama warga inovasi di kNOVASI 2026.", portrait: true },
      { src: `${base}/938fdf61-c8b8-4443-9c00-93fe10cefdc9.webp`, alt: "Tarannum.ai di ruang acara kNOVASI", caption: "Membawa teknologi latihan tarannum ke pentas inovasi pendidikan." },
      { src: `${base}/20261001_092217.webp`, alt: "Wakil Tarannum.ai bersama bahan pameran", caption: "Persediaan pameran dan pembentangan Tarannum.ai." },
    ],
    certificateImage: `${base}/sijil-pingat-emas-knovasi-2026.webp`,
  },
];

export const achievementBySlug = (slug?: string) => achievements.find((achievement) => achievement.slug === slug);
