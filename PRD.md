# PRD: Goukaku

Dokumen ini adalah sumber kebenaran untuk perilaku produk. Jika ada yang bertentangan dengan dokumen lain, ikuti PRD ini.

## 1. Tujuan

Membantu user belajar untuk ujian sertifikasi lewat simulasi yang menyerupai ujian sebenarnya, dengan bank soal yang terus bertambah, kunci jawaban yang terverifikasi, dan riwayat belajar.

## 2. Pengguna dan peran

- **User**: belajar. Tidak bisa mendaftar sendiri, akun dibuat admin.
- **Admin**: pemilik proyek. Mengelola akun, API key, model AI, limit, dan verifikasi blueprint.

## 3. Alur utama

1. **Login** (Supabase Auth). Akun dibuat admin.
2. **Dashboard**: daftar ujian user dan tombol buat ujian baru.
3. **Halaman ujian** (`/ujian/[slug]`): tambah soal, mulai simulasi, riwayat, analisis.
4. **Tambah soal**, lewat chat atau upload (lihat bagian 5).
5. **Simulasi**: pilih jumlah soal, pilih mode umpan balik, lalu kerjakan.
6. **Riwayat dan analisis**.

### Membuat ujian

- User memasukkan nama ujian. Sistem memetakan nama ke `exam_catalog` lewat `slug` dan `aliases`, sehingga "CGI" dan "cgi" menuju ujian yang sama.
- Jika belum ada di katalog, ujian baru dibuat dan dicatat. Tidak ada approval admin.

## 4. Chat AI

- Semua user bisa chat. Panggilan AI dijalankan di server memakai API key admin.
- User tidak pernah melihat atau memasukkan API key.
- Setiap panggilan dihitung ke `ai_usage` dan dicek terhadap limit (lihat bagian 9).
- Bahasa soal ditentukan per ujian (`exam_catalog.language`). Jika ujian bersifat campuran dan belum ditentukan, AI bertanya ke user lalu menyimpan jawabannya. Ujian yang secara umum berbahasa Inggris (misalnya TOEFL) langsung dibuat dalam bahasa Inggris.
- AI boleh memberi saran topik atau tips ujian yang ditemukan di internet, selama disertai sumber.

## 5. Penambahan soal

Tiga jalur:

| Jalur | Input | Kunci jawaban | Status awal |
|---|---|---|---|
| A. Soal + jawaban | Upload CSV/JSON atau input manual | Dari user | `unverified` |
| B. Soal tanpa jawaban | Upload PDF/teks | AI yang menjawab | `unverified`, `origin = user_pdf_ai_answered` |
| C. Minta AI | Perintah di chat, misalnya "tambahkan 60 soal CGI" | AI | `unverified`, `origin = ai_generated` |

### Alur bank bersama

1. Sebelum mencari di luar, sistem mengecek bank bersama untuk ujian tersebut.
2. Soal yang sudah ada dipakai ulang. Soal yang sama tidak dibuat dua kali.
3. Jika bank belum cukup, AI mencari atau membuat soal sesuai blueprint, lalu hasilnya masuk ke bank bersama.

### Dedup

- Hash SHA-256 dari teks yang sudah dinormalisasi, dengan unique index `(exam_id, content_hash)`.
- Duplikat makna dicek lewat pgvector (fase berikutnya, setelah pipeline dasar berjalan).
- Saat generate, daftar soal yang sudah ada dikirim ke prompt sebagai larangan duplikat.

### Kunci jawaban

Soal baru tidak dipakai simulasi sampai `answer_status = verified`.

1. **Cek struktur**: jumlah opsi sesuai, tepat satu kunci untuk MCQ, kunci ada di opsi.
2. **Blind solve**: minimal dua model berbeda menjawab tanpa melihat kunci. Penjelasan juga dibandingkan.
3. **Sumber web** (opsional): jika ada sumber resmi yang bertentangan, status `disputed`.
4. Semua sepakat → `verified`. Ada yang tidak sepakat → `disputed`, tidak dipakai simulasi.

## 6. Blueprint ujian

Blueprint adalah daftar topik dan persentase soal untuk satu ujian.

Urutan sumber:

1. Blueprint sudah ada di `exam_blueprints` → pakai.
2. Cari di internet. Simpan `source_url`, status `source = web`, belum aktif sampai admin atau user mengonfirmasi.
3. Tidak ketemu → AI bertanya ke user: user menentukan persentase, atau menyerahkan ke AI.
4. Jika user menyerahkan ke AI, AI menentukan persentase dan menyimpannya dengan `source = ai`.

Sistem juga menjaga bahwa soal yang dihasilkan mengikuti blueprint.

## 7. Simulasi

### Pemilihan soal

- Ambil soal dari **bank pribadi** user (`user_exam_pool`), yaitu sekumpulan pointer ke bank bersama.
- Prioritas: soal yang belum pernah dijawab. Setelah semua terjawab, bank baru boleh diulang.
- Jika user meminta lebih banyak soal daripada yang tersedia, sistem menambah dari bank bersama dulu, lalu AI.
- Soal dalam simulasi aktif tidak boleh diambil ulang.
- Hanya soal `answer_status = verified` dan `status = active` yang masuk.

### Mode umpan balik

- `instant`: setelah memilih jawaban, tampilkan benar atau salah, kunci, dan penjelasan.
- `end`: semua dinilai setelah submit.
- Mode dipilih saat mulai dan **tidak bisa diganti** di tengah simulasi.

### Penilaian

- MCQ: dicocokkan dengan kunci snapshot.
- Esai (fase berikutnya): AI menilai dengan rubrik, bukan kecocokan kata. Ditampilkan sebagai "penilaian AI".

### Snapshot

- Setiap item simulasi menyimpan `snapshot` (teks soal, opsi, kunci, penjelasan, topik) saat ujian.
- Perubahan kunci setelahnya tidak mengubah skor historis. Riwayat menampilkan catatan "kunci diperbarui setelah ujian" jika berlaku.

### Abandon

Simulasi yang ditinggalkan tetap tersimpan dengan status `abandoned`. Soal yang sudah dijawab tetap dihitung di `user_progress`.

## 8. Riwayat dan analisis

- `/riwayat`: daftar simulasi per ujian, dengan tanggal, mode, jumlah soal, skor, dan status.
- Detail simulasi: jawaban, kunci dan penjelasan dari snapshot, skor per topik.
- Analisis: skor per topik dan topik lemah berdasarkan riwayat.

## 9. Limit dan biaya

- Default limit per user di `app_settings.default_limits`.
- `user_limits` per user. Admin bisa mengatur angka tertentu atau `unlimited = true`.
- Urutan resolusi: `unlimited` → nilai user → default.
- Batas global harian untuk seluruh panggilan AI tetap berlaku walaupun user unlimited.
- Kill switch admin untuk menghentikan semua panggilan AI.
- Pengecekan limit dilakukan di server sebelum setiap panggilan AI.

## 10. Laporan soal

- User bisa melaporkan soal dengan alasan.
- Setiap laporan dicatat di `question_reports` dengan `user_id`.
- Soal disembunyikan (`status = hidden`) setelah **3 laporan dari user berbeda**.
- Setiap laporan memicu verifikasi ulang, dan admin bisa melihat daftar laporan.

## 11. Nilai kelulusan

Urutan sumber:

1. **Target pribadi** user: disimpan di `user_exam_goal`.
2. **Web**: AI mencari, disimpan di `exam_catalog.pass_score` dengan `pass_score_source = web` dan `pass_score_url`.
3. **Dari user**: AI bertanya jika tidak ketemu, disimpan dengan `pass_score_source = user`.
4. Tidak ada → hanya skor yang ditampilkan.

Nilai kelulusan yang disimpan di simulasi adalah `pass_score_snapshot`.

## 12. Skema data

```text
profiles            id (auth.users), role ('admin' | 'user'), created_at
exam_catalog        id, slug unique, display_name, aliases text[], language,
                    pass_score, pass_score_source, pass_score_url
exams               id, catalog_id, created_by, created_at
exam_blueprints     id, exam_id, topic, percentage,
                    source ('web' | 'user' | 'ai'), source_url, confirmed_by
questions           id, exam_id, type ('mcq' | 'essay'), body, options jsonb,
                    answer, explanation, rubric jsonb, topic,
                    origin ('user_upload' | 'user_pdf_ai_answered' | 'ai_generated' | 'web'),
                    answer_status ('unverified' | 'verified' | 'disputed'),
                    verification jsonb, status ('active' | 'hidden'),
                    created_by, content_hash, embedding (fase lanjut),
                    unique(exam_id, content_hash)
question_reports    id, question_id, user_id, reason, created_at,
                    unique(question_id, user_id)
user_exam_pool      user_id, exam_id, question_id, added_at,
                    primary key (user_id, exam_id, question_id)
user_progress       user_id, question_id, answered_count, last_correct,
                    last_answered_at, primary key (user_id, question_id)
user_exam_goal      user_id, exam_id, target_score
simulations         id, user_id, exam_id, size, feedback_mode ('instant' | 'end'),
                    status ('in_progress' | 'finished' | 'abandoned'),
                    started_at, finished_at, score, pass_score_snapshot
simulation_items    id, simulation_id, position, question_id, snapshot jsonb,
                    user_answer, is_correct, ai_score, ai_feedback, answered_at
ai_settings         id (singleton), provider, model, api_key_encrypted
                    -- dienkripsi dengan Supabase Vault
app_settings        key, value jsonb
user_limits         user_id, ai_calls_per_day, questions_generated_per_day,
                    unlimited, set_by, set_at, note
ai_usage            user_id, day, calls, questions_generated, tokens,
                    primary key (user_id, day)
ai_jobs             id, user_id, exam_id, requested, status, error, created_at
```

### RLS

- Semua tabel aktif RLS.
- `user`: baca dan tulis hanya data miliknya (`user_id = auth.uid()`).
- Bank soal (`questions`, `exam_catalog`, `exams`): baca semua user yang login, tulis lewat server.
- `ai_settings`, `app_settings`, `user_limits`, `profiles.role`: tulis hanya admin.
- Panggilan AI dan penulisan `questions` hanya lewat server (Route Handler/Server Action) dengan service role, bukan dari browser.

## 13. Di luar cakupan versi pertama

- Soal esai (rubrik dan penilaian AI). Fase berikutnya.
- Duplikat semantik dengan pgvector. Fase berikutnya.
- Pendaftaran mandiri dan undangan.
- Pembayaran dan langganan.
- Aplikasi mobile.

## 14. Kriteria selesai untuk versi pertama

- Admin bisa membuat akun user, mengatur API key, dan mengatur limit.
- User bisa membuat ujian, menambah soal lewat tiga jalur, dan memulai simulasi.
- Simulasi memilih soal dari bank pribadi dengan benar, dan mengulang hanya setelah semua soal terjawab.
- Mode `instant` dan `end` bekerja, dan mode tidak bisa diganti di tengah simulasi.
- Soal yang belum `verified` tidak pernah muncul di simulasi.
- Riwayat tetap menampilkan soal dari snapshot setelah soal diedit atau disembunyikan.
- Laporan 3 user berbeda menyembunyikan soal.
- Limit per user dan unlimited bekerja, serta batas global berlaku.
- Semua tabel memiliki RLS, dan user tidak bisa membaca data user lain.

## 15. Status tooling

- `.gitignore` belum dibuat. Dibuat sebelum kode atau file kunci pertama masuk repo (lihat README).
- Graphify belum dijalankan karena repo belum berisi kode. Dijalankan setelah scaffold Next.js (lihat README).

