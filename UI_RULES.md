# UI Rules: Goukaku

Aturan ini wajib diikuti untuk setiap komponen dan halaman. Jika ada yang bertentangan dengan dokumen lain, dokumen ini yang menang untuk urusan visual.

## 1. Prinsip

- **Tenang dan fokus.** Ujian itu menegangkan. Tampilan harus rapi, lapang, dan tidak ramai.
- **Tema Jepang secara halus.** Unsur Jepang hadir lewat warna, pola, dan istilah, bukan dekorasi berlebihan.
- **Jelas untuk belajar.** Jawaban benar, salah, dan penjelasan harus terbaca sekilas.
- **Aksesibel secara default.** Semua aturan kontras dan fokus di bawah wajib, tidak opsional.

## 2. Teknologi

- **Tailwind CSS** adalah satu-satunya sumber styling. Tidak ada CSS module atau inline style, kecuali untuk nilai dinamis.
- Warna, font, dan spacing didefinisikan sebagai token di `tailwind.config` dan CSS variable, lalu dipakai lewat kelas Tailwind (`bg-primary`, `text-foreground`).
- Komponen UI menggunakan pola yang sama dengan proyek. Jangan membuat komponen baru jika sudah ada.

## 3. Tipografi

- **Font utama: Plus Jakarta Sans** untuk semua teks Latin (judul dan isi).
- Bobot yang dipakai: 400 (isi), 500 (label), 600 (subjudul), 700 (judul).
- Import lewat `next/font/google`, bukan `<link>` manual, supaya font di-host oleh Next.js.

```ts
// app/layout.tsx
import { Plus_Jakarta_Sans } from "next/font/google";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});
```

- **Teks Jepang** (misalnya "合格" di logo atau judul dekoratif) memakai fallback `Noto Sans JP`, karena Plus Jakarta Sans tidak memiliki glyph Jepang. Dimuat hanya jika benar-benar ada teks Jepang, dan hanya bobot yang dipakai.
- Skala: `text-sm` untuk keterangan, `text-base` untuk isi, `text-lg` sampai `text-3xl` untuk judul. Hindari ukuran arbitrer.
- Tinggi baris minimal 1.5 untuk isi. Panjang baris maksimal sekitar 70 karakter untuk penjelasan soal.

## 4. Warna

Palet dasar: **biru ai (藍)** sebagai warna utama dan **oranye mikan pastel (蜜柑)** sebagai aksen. Nada pastel dipakai untuk latar dan permukaan, nada yang lebih gelap untuk teks dan tombol.

### Token

| Token | Hex | Pemakaian |
|---|---|---|
| `primary` | `#2F5D8C` | Tombol utama, tautan, fokus. Kontras 6.8:1 dengan teks putih |
| `primary-soft` | `#DCEBF5` | Latar kartu info dan badge biru |
| `accent` | `#F9B77A` | Latar tombol aksen dan highlight. Teks di atasnya wajib `accent-foreground` |
| `accent-foreground` | `#7C2D12` | Teks di atas `accent`. Kontras sekitar 5.4:1 |
| `accent-soft` | `#FCD9B6` | Latar badge jawaban salah atau peringatan lembut |
| `accent-text` | `#9A3412` | Teks oranye pada latar putih. Jangan pakai `accent` sebagai teks |
| `background` | `#F7FAFC` | Latar halaman |
| `card` | `#FFFFFF` | Kartu dan panel |
| `foreground` | `#1E293B` | Teks utama |
| `muted` | `#EEF3F8` | Latar sekunder |
| `muted-foreground` | `#475569` | Teks sekunder. Kontras minimal 4.5:1 di atas `background` dan `muted` |
| `border` | `#D6E0EA` | Garis batas kartu dan input |
| `ring` | `#2F5D8C` | Outline fokus |
| `success` | `#166534` | Teks benar. Selalu disertai ikon dan teks, tidak hanya warna |
| `destructive` | `#B91C1C` | Teks salah atau aksi hapus. Selalu disertai ikon dan teks |

### Aturan warna

- Warna tidak boleh menjadi satu-satunya penanda. Jawaban benar atau salah harus punya ikon dan teks.
- Tombol utama: latar `primary`, teks `#FFFFFF`.
- Tombol aksen: latar `accent`, teks `accent-foreground`. Jangan membalik kombinasi ini.
- Teks oranye di atas putih memakai `accent-text`, bukan `accent`, karena `accent` kontras rendah di atas putih.
- Tidak ada warna lain di luar token. Jika butuh warna baru, tambahkan ke token dulu dan catat di bagian 13.

### Catatan dari desain referensi

Hasil `ui-ux-pro-max --design-system` menyarankan aksen oranye `#EA580C` dan font Noto Serif JP / Noto Sans JP. Keduanya **tidak dipakai** karena bertentangan dengan permintaan. Nilai di bagian ini menggantikannya. Oranye yang lebih terang diturunkan dari palet pastel agar cocok dengan tema.

## 5. Tema Jepang

Unsur Jepang dipakai dengan takaran kecil:

- **Istilah**: "Goukaku" (合格), "Moshi" untuk tryout, "Renshuu" (練習) untuk latihan. Gunakan di judul halaman dan label, jangan di setiap kalimat.
- **Pola latar** (opsional): pola *seigaiha* (ombak) atau *asanoha* (daun hemp) dalam SVG tipis, opacity maksimal 6%, hanya di header atau hero. Tidak di area konten.
- **Ikon**: gunakan ikon garis sederhana. Hindari ikon bergaya kartun.
- **Hal yang dihindari**: gerbang torii, kimono, bunga sakura berjatuhan, dan elemen dekoratif lain yang mengganggu konten.

Pola SVG ditulis sebagai file aset atau background SVG Tailwind (`bg-[url(...)]`), bukan dengan animasi.

## 6. Layout dan spacing

- Basis spacing 4px (kelipatan `p-1`, `gap-2`, `gap-4`, `gap-6`, `gap-8`). Jangan memakai nilai arbitrer seperti `p-[13px]`.
- Lebar konten maksimal `max-w-3xl` untuk halaman simulasi dan soal, `max-w-6xl` untuk dashboard dan riwayat.
- Kartu: `rounded-xl`, `border`, `bg-card`, `p-6`. Bayangan lembut `shadow-sm`, tidak lebih.
- Jarak antar kartu minimal `gap-4`.

### Breakpoint

Uji di 375px, 768px, 1024px, dan 1440px. Desain mobile-first, dengan kelas Tailwind `sm:`, `md:`, `lg:`.

## 7. Komponen

### Tombol

- Tinggi minimal 40px, dan area sentuh minimal 44×44px di mobile.
- Varian: `primary`, `accent`, `outline`, `ghost`, `destructive`.
- Setiap tombol punya `cursor-pointer`, transisi warna 150–200ms, dan state `disabled` yang jelas (`opacity-50`, `cursor-not-allowed`).

### Pilihan jawaban (MCQ)

- Setiap opsi adalah tombol dengan label huruf (A, B, C, D, E) dan teks lengkap.
- Opsi yang dipilih: border `primary`, latar `primary-soft`.
- Mode `instant` setelah menjawab:
  - Benar: ikon centang, teks "Benar", latar `success` tipis.
  - Salah: ikon silang, teks "Salah", latar `accent-soft`.
  - Kunci yang benar selalu ditandai dengan ikon dan teks, walaupun user salah.
- Penjelasan muncul di bawah opsi dalam panel terpisah, dengan label sumber jika `answer_status` belum `verified`.

### Input chat

- Input dengan label yang terlihat (bukan hanya placeholder).
- Tombol kirim dengan `aria-label` jika hanya ikon.
- Status "AI sedang berpikir" ditampilkan sebagai teks, bukan hanya animasi.

### Badge

- `primary-soft` untuk status netral dan topik.
- `accent-soft` untuk peringatan, misalnya "Belum diverifikasi" atau "Kunci diperbarui setelah ujian".
- Teks badge minimal `text-xs` dengan `font-medium`.

### Tabel dan riwayat

- Baris bergantian dengan `muted` yang sangat tipis, atau border tipis tanpa zebra.
- Kolom skor rata kanan dengan `tabular-nums`.

### Form

- Setiap input punya label, pesan bantuan, dan pesan error di bawah field.
- Error ditampilkan dengan ikon dan teks, dan fokus pindah ke field pertama yang salah saat submit.

## 8. Motion

- Transisi UI 150–250ms, dengan easing `ease-out` untuk masuk dan `ease-in` untuk keluar.
- Animasi hanya untuk umpan balik (jawaban benar atau salah, indikator loading), tidak untuk dekorasi.
- Hormati `prefers-reduced-motion`: gunakan kelas `motion-safe:` untuk semua animasi, dan `motion-reduce:` untuk versi tanpa gerak.
- Tidak ada animasi yang berulang tanpa henti.

## 9. Aksesibilitas

Wajib dipenuhi di setiap halaman:

- Kontras teks normal minimal 4.5:1, teks besar minimal 3:1. Kontras elemen non-teks (ikon, batas kontrol) minimal 3:1.
- Fokus terlihat di semua elemen interaktif. Gunakan `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`. Jangan hapus outline tanpa pengganti.
- Semua fungsi bisa diakses lewat keyboard. Urutan fokus mengikuti urutan visual.
- Ikon hiasan di samping teks memakai `aria-hidden="true"`. Ikon tanpa teks wajib punya `aria-label`.
- Tombol pilihan jawaban memakai `aria-pressed` atau `role="radio"` dalam `role="radiogroup"`, sesuai pola yang dipilih.
- Pesan dinamis (jawaban benar atau salah, hasil simulasi) diumumkan lewat `aria-live="polite"`.
- Bahasa halaman diatur di `<html lang>`. Gunakan `lang="ja"` pada elemen teks Jepang.
- Form login dan password mendukung password manager dan paste.
- Tidak ada drag-only interaction tanpa alternatif keyboard.

## 10. Mode gelap

- Versi pertama hanya light mode. Mode gelap ditunda sampai palet gelapnya diuji kontrasnya secara terpisah.
- Jangan membuat mode gelap dengan membalik warna secara otomatis tanpa pengujian.

## 11. Pemeriksaan sebelum rilis

- [ ] Tidak ada emoji sebagai ikon.
- [ ] Semua ikon dari satu keluarga (Lucide atau Heroicons), dengan ukuran token (`size-4`, `size-5`).
- [ ] Semua warna berasal dari token di bagian 4.
- [ ] Plus Jakarta Sans termuat lewat `next/font`.
- [ ] Teks Jepang memakai fallback Noto Sans JP dan `lang="ja"`.
- [ ] Kontras diuji untuk semua kombinasi di bagian 4.
- [ ] Fokus keyboard terlihat di semua elemen interaktif.
- [ ] Diuji dengan `prefers-reduced-motion` aktif.
- [ ] Diuji di 375px, 768px, 1024px, 1440px.
- [ ] Jawaban benar atau salah tidak hanya ditandai warna.

## 12. Yang belum diputuskan

- Ikon: Lucide atau Heroicons. Pilih satu dan catat di sini sebelum implementasi.
- Komponen dasar: shadcn/ui di atas Tailwind, atau komponen buatan sendiri. Jika shadcn dipakai, token di bagian 4 dipetakan ke variabel shadcn.

## 13. Log perubahan token

| Tanggal | Perubahan | Alasan |
|---|---|---|
| 2026-10-21 | Palet awal biru ai dan oranye mikan pastel | Permintaan awal |
