# Goukaku (合格)

Simulasi ujian untuk belajar. User membuat bank ujian (misalnya CGI), mengisi soal dari upload atau dari AI, lalu berlatih lewat simulasi dengan umpan balik langsung atau di akhir, dan melihat riwayat serta analisis hasilnya.

> *goukaku* (合格) berarti "lulus" dalam bahasa Jepang. Nama ini merujuk pada tujuan user: lulus ujian.

## Fitur utama

- **Bank ujian** per sertifikasi (contoh: CGI, TOEFL). Bank soal dibagi antar user dalam satu ujian.
- **Tambah soal** dengan tiga cara: upload soal beserta jawaban, upload soal tanpa jawaban (AI yang menjawab), atau minta AI mencari atau membuat soal lewat chat.
- **Blueprint ujian**: komposisi topik dan persentasenya, dicari dari internet, atau ditanyakan ke user, atau ditentukan AI.
- **Verifikasi kunci jawaban**: kunci hanya dipakai setelah lolos pemeriksaan (struktur, blind solve oleh beberapa model, dan sumber web bila ada).
- **Simulasi**: user memilih jumlah soal dan mode umpan balik (langsung setelah menjawab, atau di akhir). Mode tidak bisa diganti di tengah simulasi.
- **Riwayat dan analisis**: setiap simulasi tersimpan dengan snapshot soal, sehingga riwayat tidak berubah ketika bank soal diperbarui. Analisis per topik.
- **Laporan soal**: soal disembunyikan otomatis setelah 3 laporan dari user berbeda, lalu diverifikasi ulang.
- **Chat AI** untuk semua user. Hanya admin yang bisa mengatur API key, menambah user, dan mengatur limit per user.

## Peran

| Peran | Bisa |
|---|---|
| `user` | Chat AI, tambah soal, simulasi, riwayat, analisis, lapor soal |
| `admin` | Semua di atas, plus: menambah user, mengatur API key dan model AI, mengatur limit (termasuk unlimited) per user, memverifikasi blueprint, dan menyunting `exam_catalog` |

Tidak ada pendaftaran mandiri. Akun dibuat oleh admin.

## Stack

- **Next.js** (App Router) dengan TypeScript
- **Tailwind CSS** untuk styling
- **Supabase**: Postgres, Auth, RLS, dan Vault untuk enkripsi API key
- **Vercel** untuk hosting
- Provider AI dipilih admin (OpenAI, Anthropic, Gemini, dan lainnya lewat satu lapisan adapter)

## Dokumen

- [`PRD.md`](./PRD.md): spesifikasi produk, alur, skema data, dan aturan bisnis
- [`UI_RULES.md`](./UI_RULES.md): aturan desain, tema Jepang, warna, tipografi, dan komponen

## Menjalankan secara lokal

> Belum tersedia. Akan diisi setelah scaffold Next.js dibuat.

Variabel lingkungan yang dibutuhkan (nilai asli jangan pernah di-commit):

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # hanya server, jangan pernah NEXT_PUBLIC_*
```

## Keamanan

- `.env*` masuk `.gitignore`.
- Service role key hanya dipakai di server.
- Semua tabel memakai Row Level Security.
- Laporkan celah keamanan lewat issue privat, bukan issue publik.

## Lisensi

Belum ditentukan.

## Catatan untuk AI pengerjaan

- **`.gitignore` belum dibuat.** Buat sebelum file apa pun yang berisi kunci masuk ke folder ini. Minimal memuat `node_modules/`, `.next/`, `.env*`, dan `graphify-out/` (kecuali jika tim ingin membagikan graf).
- **Graphify belum dijalankan.** Jalankan skill `graphify` setelah scaffold Next.js dan kode pertama ada, lalu gunakan `graphify-out/GRAPH_REPORT.md` sebagai peta arsitektur sebelum mengubah struktur file. Jika `graphify-out/graph.json` sudah ada, pertanyaan tentang kode dijawab lewat `graphify query` terlebih dahulu.
- Aturan desain ada di `UI_RULES.md` dan wajib diikuti. Aturan produk ada di `PRD.md` dan menjadi sumber kebenaran jika ada konflik.

