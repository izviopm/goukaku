# PRD: Goukaku

Dokumen ini adalah sumber kebenaran untuk perilaku produk. Jika ada yang bertentangan dengan dokumen lain, ikuti PRD ini.

## 1. Tujuan

Membantu user belajar untuk ujian sertifikasi lewat simulasi yang menyerupai ujian sebenarnya, dengan bank soal yang terus bertambah, kunci jawaban yang terverifikasi, dan riwayat belajar.

## 2. Pengguna dan peran

- **User**: belajar. Tidak bisa mendaftar sendiri, akun dibuat admin.
- **Admin**: pemilik proyek. Mengelola akun (termasuk reset password user yang lupa), API key, model AI, limit, blueprint default, dan identitas ujian.
- **My profile** (`/akun`): nama, jenis kelamin, email (hanya baca), foto profil (upload PNG/JPG/WebP maks 2 MB, atau avatar default sesuai jenis kelamin), dan ganti password.

## 3. Alur utama

1. **Login** (Supabase Auth). Akun dibuat admin.
2. **Dashboard**: daftar ujian user dan tombol buat ujian baru.
3. **Halaman ujian** (`/ujian/[slug]`), dua mode:
   - **Setup** (langkah bertahap, langkah berikutnya terkunci sampai yang sebelumnya selesai):
     1. **Ujian dan goal**:
        - **Identitas ujian**: user menjelaskan ujiannya (misalnya "CGI (Certified General Insurance) modul 002"). AI terus bertanya sampai tahu nama resmi, penyelenggara, modul atau level, dan negara, lalu menampilkan kartu ringkasan untuk dikonfirmasi.
        - Identitas ini dibagi per ujian: diisi user pertama, lalu hanya admin yang bisa mengubah atau mengosongkannya. Ringkasannya dikirim ke **setiap prompt AI** (blueprint, generate, ekstraksi, verifikasi, chat). Modul atau level lain dibuat sebagai ujian terpisah, misalnya "CGI 003".
        - Lalu bahasa soal (dibagi per ujian, diisi sekali), target skor (opsional), dan jumlah soal ujian asli (opsional).
     2. **Blueprint** (bagian 6).
     3. **Tambah soal** (bagian 5).
   - **Practice**: terbuka jika goal tersimpan, ada blueprint, dan minimal 10 soal terverifikasi (atau sejumlah soal ujian asli jika lebih kecil). Berisi Start, ringkasan topik, tambah soal, dan pengaturan ujian.
4. **Simulasi**: pilih jumlah soal, pilih mode umpan balik, lalu kerjakan (bagian 7).
5. **Riwayat dan analisis** (bagian 8).
6. **Asisten AI**: panel samping yang dibuka lewat tombol "Ask AI" di halaman ujian.

### Membuat ujian

- User memasukkan nama ujian. Sistem memetakan nama ke `exam_catalog` lewat `slug` dan `aliases`, sehingga "CGI" dan "cgi" menuju ujian yang sama.
- Jika belum ada di katalog, ujian baru dibuat dan dicatat. Tidak ada approval admin.

## 4. Chat AI

- Semua user bisa chat. Panggilan AI dijalankan di server memakai API key admin.
- User tidak pernah melihat atau memasukkan API key.
- Setiap panggilan dihitung ke `ai_usage` dan dicek terhadap limit (lihat bagian 9).
- Fallback model: jika model utama gagal (down, timeout, rate limit, model tidak ditemukan), model lain di daftar admin dicoba sesuai urutan. Error API key (401/403) dan limit tidak memicu fallback karena semua model memakai key yang sama.
- Bahasa soal ditentukan per ujian (`exam_catalog.language`). Jika ujian bersifat campuran dan belum ditentukan, AI bertanya ke user lalu menyimpan jawabannya. Ujian yang secara umum berbahasa Inggris (misalnya TOEFL) langsung dibuat dalam bahasa Inggris.
- AI boleh memberi saran topik atau tips ujian yang ditemukan di internet, selama disertai sumber.

## 5. Penambahan soal

| Jalur | Input | Kunci jawaban | Status awal |
|---|---|---|---|
| **Upload a file** | CSV/JSON (dibaca langsung) atau PDF/DOCX/TXT (dibaca AI) | Kunci dari file jika ada; jika tidak, AI yang menjawab | `unverified`; `origin = user_upload` (kunci dari file) atau `user_pdf_ai_answered` |
| **Manual** | Satu soal lewat form, wajib memilih topik | Dari user | `unverified`, `origin = user_upload` |
| **Generate with AI** | Jumlah soal (tombol atau chat) | AI | `unverified`, `origin = ai_generated` |
| **Prepare missing** | Dari kartu Start saat soal per topik kurang | AI | `unverified`, `origin = ai_generated` |

- Semua pekerjaan AI berjalan di latar belakang (`ai_jobs`) dengan progres dan ringkasan, misalnya "18 dengan kunci dari file, 7 dijawab AI".
- Saat membaca dokumen atau membuat soal, AI memberi label topik dari daftar topik blueprint (atau topik yang sudah ada di bank), supaya soal terhitung ke kuota blueprint.
- PDF hasil scan (gambar) belum didukung.

### Bank bersama

1. Semua soal masuk ke bank bersama per ujian. Soal yang sama tidak dibuat dua kali (dedup).
2. Saat simulasi dimulai, semua soal terverifikasi dari topik blueprint di bank bersama otomatis masuk ke bank pribadi user.
3. Soal baru dibuat **hanya saat user meminta** (Generate, Prepare missing, atau chat). Tidak ada pengisian otomatis di latar belakang.

### Dedup

- Hash SHA-256 dari teks yang sudah dinormalisasi, dengan unique index `(exam_id, content_hash)`.
- Duplikat makna dicek lewat pgvector (fase berikutnya, setelah pipeline dasar berjalan).
- Saat generate, daftar soal yang sudah ada dikirim ke prompt sebagai larangan duplikat.

### Kunci jawaban

Soal baru tidak dipakai simulasi sampai `answer_status = verified`.

1. **Cek struktur**: jumlah opsi sesuai, tepat satu kunci untuk MCQ, kunci ada di opsi.
2. **Blind solve**: minimal dua dan maksimal tiga model berbeda menjawab tanpa melihat kunci (hemat token). Model verifikasi diambil sesuai urutan daftar admin; model berikutnya hanya dipakai sebagai cadangan jika ada yang gagal. Jika kurang dari dua model bisa dihubungi, soal tetap `unverified` dan dicek ulang nanti. Penjelasan juga disimpan.
3. **Sumber web** (opsional): jika ada sumber resmi yang bertentangan, status `disputed`.
4. Semua sepakat → `verified`. Ada yang tidak sepakat → `disputed`, tidak dipakai simulasi.

## 6. Blueprint ujian

Blueprint adalah daftar topik dan persentase soal untuk satu ujian.

**Hibrida: default bersama dan versi pribadi.**

- **Default** (`exam_blueprints`): diisi oleh user pertama yang menyimpan blueprint untuk ujian itu. Setelah itu hanya admin yang bisa mengubahnya (di `/admin`).
- **Pribadi** (`user_blueprints`): user lain boleh menyimpan komposisinya sendiri. Ini tidak memengaruhi user lain. Tombol "Reset to default" kembali memakai default.
- **Blueprint efektif** = pribadi jika ada, selain itu default.

Cara mengisi:

1. **Suggest with AI**: AI mencari panduan resmi di internet (jika provider mendukung pencarian web) atau menyusun sendiri. Hasilnya mengisi form sebagai **draf**, lalu user meninjau dan menyimpan. Sumber disimpan sebagai `web` (dengan `source_url`) atau `ai`.
2. **Set it myself**: user mengisi topik dan persentase, `source = user`.
2a. **Use my syllabus**: user menempel teks atau mengunggah silabus/panduan ujian (PDF/DOCX/TXT). AI menyusun topik dan persentase dari dokumen itu (memakai bobot yang tertulis jika ada) sebagai draf, `source = user`. Ini paling akurat untuk sertifikasi lokal.
2b. Pencarian web untuk "Suggest with AI" tersedia di provider OpenAI, Anthropic, Gemini, dan OpenRouter (lewat plugin `web`). Provider OpenAI-compatible lain tidak punya pencarian web bawaan.
3. Validasi: topik unik (tanpa membedakan huruf besar/kecil), persentase > 0, total tepat 100. Isian topik menyarankan topik yang sudah ada di bank soal.

Soal yang dibuat AI dan setiap simulasi mengikuti blueprint efektif user.

## 7. Simulasi

### Pemilihan soal

- **Komposisi persis sesuai blueprint efektif.** Jumlah soal per topik dihitung dari persentase (pembagian sisa terbesar). Topik tidak pernah dicampur.
- Jika satu topik kekurangan soal terverifikasi, simulasi **tidak dimulai**. Kartu Start menampilkan rincian per topik dan tombol "Prepare N missing questions", yang membuat soal hanya untuk topik yang kurang (+20% cadangan, maksimal 3 putaran).
- **Pengulangan pintar** di dalam kuota tiap topik, dengan urutan:
  1. Soal yang belum pernah dijawab.
  2. Soal yang terakhir dijawab salah.
  3. Soal yang paling sering salah.
  4. Soal dengan *streak* benar terpendek (*mastered*, 3 benar berturut-turut, paling akhir).
  5. Soal yang paling lama tidak dijawab.
- Setelah semua soal di bank pernah dijawab, soal **diulang terus**. User diberi tahu lewat banner, supaya sadar sedang mengulang dan bisa menambah soal baru jika mau.
- Soal dalam simulasi aktif lain tidak diambil ulang.
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
- Analisis (`/ujian/[slug]/analisis`), dihitung dari **setiap jawaban**, termasuk pengulangan:
  - Akurasi per topik (jumlah benar dan salah).
  - Daftar soal dengan jumlah benar dan salah, status **Mastered** (3 benar berturut-turut), **Needs review** (jawaban terakhir salah), **Learning**, atau **New**. Bisa difilter dan diurutkan dari yang paling sering salah.

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
profiles            id (auth.users), role ('admin' | 'user'), created_at,
                    full_name, gender ('male' | 'female' | null), avatar_path
                    -- user hanya bisa mengubah full_name, gender, avatar_path miliknya (bukan role)
                    -- foto di Storage bucket "avatars", folder <user id>/; tanpa foto = avatar default sesuai gender
exam_catalog        id, slug unique, display_name, aliases text[], language,
                    pass_score, pass_score_source, pass_score_url,
                    identity jsonb {full_name, issuer, scope, country, summary}, identity_set_by
exams               id, catalog_id unique, created_by, created_at
user_exams          user_id, exam_id, created_at   -- ujian yang tampil di dashboard user
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
                    last_answered_at, correct_count, wrong_count, correct_streak,
                    primary key (user_id, question_id)
user_exam_goal      user_id, exam_id, target_score (opsional), exam_size (opsional)
user_blueprints     user_id, exam_id, topic, percentage   -- blueprint pribadi (bagian 6)
simulations         id, user_id, exam_id, size, feedback_mode ('instant' | 'end'),
                    status ('in_progress' | 'finished' | 'abandoned'),
                    started_at, finished_at, score, pass_score_snapshot
simulation_items    id, simulation_id, position, question_id, snapshot jsonb,
                    user_answer, is_correct, ai_score, ai_feedback, answered_at
ai_settings         id (singleton), provider ('openai' | 'anthropic' | 'gemini' | 'openai_compatible'),
                    model, base_url (hanya openai_compatible), api_key_secret_id
                    -- id rahasia di Supabase Vault; key terenkripsi di vault.secrets
                    -- daftar model {id, name} di app_settings.ai_models
                    -- model verifikasi (blind solve) di app_settings.verifier_models
app_settings        key, value jsonb
user_limits         user_id, ai_calls_per_day, questions_generated_per_day,
                    unlimited, set_by, set_at, note
ai_usage            user_id, day, calls, questions_generated, tokens,
                    primary key (user_id, day)
ai_jobs             id, user_id, exam_id, kind ('generate' | 'upload' | 'prepare'),
                    requested, done, status, error, payload, summary, created_at
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

- `.gitignore` sudah dibuat.
- Scaffold Next.js 16 dan skema Supabase sudah ada (lihat README).
- Simulasi yang dibiarkan `in_progress` lebih dari 12 jam otomatis menjadi `abandoned` saat user memulai simulasi baru.

