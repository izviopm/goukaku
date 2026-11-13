// One-off bulk import of an outside question bank into the shared bank.
// Usage: node --env-file=.env.local scripts/import-bank.mjs <data-dir> <admin-user-id> <source-name>
// <source-name> is stored only in the admin-only question_imports table.
// <data-dir> holds data_<code>.json files. Safe to re-run: questions dedupe on (exam_id, content_hash).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { normalize, structureError, LETTERS } from "../src/lib/rules.ts";

const [dir, adminId, source] = process.argv.slice(2);
if (!dir || !adminId || !source) throw new Error("Usage: node --env-file=.env.local scripts/import-bank.mjs <data-dir> <admin-user-id> <source-name>");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ISSUER = "AAMAI (Asosiasi Ahli Manajemen Asuransi Indonesia)";
const CGI = "Certificate in General Insurance (CGI)";
const AAAIK = "Ajun Ahli Asuransi Indonesia Kerugian (AAAIK)";
const AAIK = "Ahli Asuransi Indonesia Kerugian (AAIK)";
const MODULES = [
  {
    code: "001", cert: "CGI", title: "Prinsip Asuransi", level: CGI, format: "mcq",
    summary:
      "Ujian pilihan ganda tingkat CGI modul 001 tentang prinsip dasar asuransi umum: konsep, komponen, dan klasifikasi risiko; manajemen risiko; pooling of risks dan hukum bilangan besar; fungsi, manfaat, kelas bisnis, dan produk asuransi; struktur pasar asuransi, Lloyd's, profesi, perantara, dan distribusi; prinsip insurable interest, utmost good faith dan material facts, proximate cause, indemnity, contribution, dan subrogation; koasuransi, dual insurance, dan self-insurance; prosedur underwriting dan struktur polis; penetapan premi, klaim, dan informasi manajemen; reasuransi; serta regulasi perasuransian Indonesia (UU No. 40 Tahun 2014). Materi hukum perikatan, hukum dagang, dan hukum tort termasuk modul 002, bukan modul ini.",
  },
  {
    code: "002", cert: "CGI", title: "Hukum Asuransi", level: CGI, format: "mcq",
    summary:
      "Ujian pilihan ganda tingkat CGI modul 002 tentang pengantar hukum dan hukum asuransi: pengantar hukum dan sistem hukum; hukum perikatan dan perjanjian menurut KUH Perdata (sumber perikatan, syarat sah Pasal 1320 BW, cacat kehendak, asas kepribadian, wanprestasi dan somasi, force majeure, ganti rugi, hapusnya perikatan, jual beli, sewa-menyewa, hibah); hukum pembuktian perdata; daluwarsa, rechtsverwerking, dan decheance; hukum dagang dan perusahaan (maatschap, firma, CV, PT, koperasi), hukum pengangkutan, hukum laut, dan kepailitan; asuransi dalam KUHD; hukum pidana; serta sistem hukum Inggris (legislasi dan interpretasi, hierarki pengadilan dan preseden, hukum Uni Eropa, prosedur perdata, legal personality) dan hukum tort (trespass, negligence dan duty of care, economic loss, nuisance, strict dan vicarious liability, defamation). Prinsip teknis asuransi dan underwriting termasuk modul 001, bukan modul ini.",
  },
  {
    code: "101", cert: "AAAIK", title: "Prinsip Asuransi", level: AAAIK, format: "essay",
    summary:
      "Ujian esai AAAIK modul 101 tentang prinsip dan praktik asuransi umum: manajemen risiko, peril, hazard, dan karakteristik risiko yang dapat diasuransikan; konsep, fungsi, dan manfaat asuransi; struktur pasar, Lloyd's, profesi, perantara, dan distribusi; hukum kontrak dan keagenan asuransi; prinsip insurable interest, utmost good faith dan duty of disclosure, proximate cause, indemnity, contribution, dan subrogation; koasuransi, asuransi ganda, dan retensi; polis, dokumentasi, dan ketentuan polis; underwriting dan penetapan premi; produk dan kelas bisnis; manajemen klaim dan informasi kinerja; reasuransi; serta regulasi OJK dan perlindungan konsumen.",
  },
  {
    code: "102", cert: "AAAIK", title: "Hukum Asuransi", level: AAAIK, format: "essay",
    summary:
      "Ujian esai AAAIK modul 102 tentang hukum asuransi: hukum perikatan dan perjanjian Indonesia serta hukum asuransi dalam KUHD; hukum kontrak Inggris dan pembentukan kontrak asuransi; utmost good faith dan fair presentation; terms, warranties, dan interpretasi polis; insurable interest; assignment, novation, dan pengalihan polis; pihak ketiga dan privity; hukum keagenan dan perantara asuransi; proximate cause dan causation; klaim, indemnity, penyelesaian kerugian, dan fraudulent claims; hukum tort (negligence, trespass, nuisance, strict liability, defamation); serta regulasi perasuransian Indonesia.",
  },
  {
    code: "103", cert: "AAAIK", title: "Bisnis Asuransi & Keuangan", level: AAAIK, format: "essay",
    summary:
      "Ujian esai AAAIK modul 103 tentang manajemen bisnis dan keuangan perusahaan asuransi: bentuk usaha asuransi, captive, dan takaful; pasar dan industri asuransi, Lloyd's dan London Market; distribusi, perantara, delegated authority, MGA, dan outsourcing; manajemen, kepemimpinan, budaya organisasi, dan manajemen SDM; corporate governance, audit, dan company law; strategi pertumbuhan, merger, dan akuisisi; pemasaran, riset pasar, dan pengembangan produk; customer experience, TCF, dan etika; perencanaan, anggaran, dan management information; akuntansi dan laporan keuangan, analisis rasio keuangan asuransi, financial strength, rating, dan solvency; claims reserving dan technical provisions; serta reasuransi dan pengelolaan portofolio.",
  },
  {
    code: "104", cert: "AAAIK", title: "Asuransi Kendaraan Bermotor & Liability", level: AAAIK, format: "essay",
    summary:
      "Ujian esai AAAIK modul 104 tentang asuransi kendaraan bermotor dan asuransi tanggung gugat (liability): prinsip umum motor insurance, produk, polis, dan jaminan; PSAKBI (jaminan, pengecualian, definisi, klaim, dan ganti rugi); underwriting, administrasi polis, pricing, rating, dan portofolio motor; risiko, hazard, dan tanggung jawab pengemudi; hukum wajib, Road Traffic Act, MIB, dan pengemudi tidak diasuransikan; klaim motor, perbaikan, total loss, sengketa, litigasi, dan fraud; liability underwriting (risk assessment, loss control, wording, trigger, dan limit); employers' liability, keselamatan kerja, compulsory insurance, dan kompensasi; emerging liability (pollution, cyber, terorisme, corporate manslaughter); program liability (DIC, DIL, umbrella, layers); PPP/PFI dan project insurance; yurisdiksi dan ADR; serta claims management, mutu, dan pelayanan.",
  },
  {
    code: "402", cert: "AAIK", title: "Manajemen Underwriting", level: AAIK, format: "essay",
    summary:
      "Ujian esai AAIK modul 402 tentang manajemen underwriting di perusahaan asuransi umum: skenario start-up insurer dan business plan; governance, kewenangan, dan audit underwriting; strategi underwriting dan risk appetite; kebijakan underwriting dan risk acceptance; produk, jaminan, dan wording; distribusi, pemasaran, dan segmentasi nasabah; delegated authority, scheme, dan portofolio broker; perencanaan, budgeting, dan forecasting; pricing dan rating; claims analytics (frequency, severity, burning cost), claims reserving, dan ultimate claims; modal, profitabilitas, dan kinerja keuangan; manajemen portofolio dan business mix; reasuransi (struktur, program, security, counterparty risk); exposure, akumulasi, dan catastrophe management; global programme dan international insurance; monitoring, MI, KPI, dan variance; sistem, data, dan teknologi underwriting; serta manajemen SDM dan kompetensi underwriter.",
  },
];

const slugify = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// Same hash as src/lib/questions.ts contentHash, so later uploads dedupe against these.
const hashOf = (q) => createHash("sha256").update(q.type === "essay" ? `essay\n${normalize(q.body)}` : [q.body, ...q.options].map(normalize).join("\n")).digest("hex");

/** The source has no grading criteria; each sentence of the reference answer becomes one (max 10). */
export function rubricFrom(answer) {
  const seen = new Set();
  const out = [];
  for (const s of answer.split(/(?<=[.!?;])\s+/).map((x) => x.trim()).filter((x) => x.length >= 15)) {
    if (seen.has(normalize(s)) || out.length >= 10) continue;
    seen.add(normalize(s));
    out.push(s);
  }
  return out.length ? out : [answer.trim()];
}

const check = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

for (const m of MODULES) {
  const name = `${m.cert} ${m.code}`;
  const slug = slugify(name);
  const catalog = check(
    await db
      .from("exam_catalog")
      .upsert(
        {
          slug,
          display_name: name,
          aliases: [...new Set([slug, slugify(`${m.cert} ${m.code} ${m.title}`), slugify(`${m.cert} ${m.title}`)])],
          language: "id",
          format: m.format,
          identity: { full_name: `${m.level} – Modul ${m.code} ${m.title}`, issuer: ISSUER, scope: `Modul ${m.code} – ${m.title}`, country: "Indonesia", summary: m.summary },
          identity_set_by: adminId,
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single(),
    `catalog ${name}`,
  );
  check(await db.from("exams").upsert({ catalog_id: catalog.id, created_by: adminId }, { onConflict: "catalog_id", ignoreDuplicates: true }), "exam");
  const examId = check(await db.from("exams").select("id").eq("catalog_id", catalog.id).single(), "exam id").id;
  check(await db.from("user_exams").upsert({ user_id: adminId, exam_id: examId }, { ignoreDuplicates: true }), "user_exams");

  const raw = JSON.parse(readFileSync(`${dir}/data_${m.code}.json`, "utf8"));
  const rows = new Map();
  const refs = new Map();
  let invalid = 0;
  for (const q of raw) {
    const input =
      m.format === "mcq"
        ? { type: "mcq", body: String(q.q ?? "").trim(), options: (q.options ?? []).map((o) => String(o).trim()), answer: LETTERS[q.correct], explanation: q.a, topic: q.subtopic }
        : { type: "essay", body: String(q.q ?? "").trim(), options: [], answer: String(q.a ?? "").trim(), rubric: rubricFrom(String(q.a ?? "")), topic: q.subtopic };
    if (structureError(input) || !input.topic?.trim()) {
      invalid++;
      continue;
    }
    const hash = hashOf(input);
    if (rows.has(hash)) continue;
    refs.set(hash, q.id);
    rows.set(hash, {
      exam_id: examId,
      type: m.format,
      body: input.body,
      options: input.options,
      answer: input.answer,
      rubric: m.format === "essay" ? input.rubric : null,
      explanation: input.explanation?.trim() || null,
      topic: input.topic.trim(),
      origin: "web",
      answer_status: "verified",
      verification: { checked_at: new Date().toISOString(), structure: "ok", mode: m.format === "essay" ? "rubric" : "curated" },
      created_by: adminId,
      content_hash: hash,
    });
  }

  const all = [...rows.values()];
  for (let i = 0; i < all.length; i += 500)
    check(await db.from("questions").upsert(all.slice(i, i + 500), { onConflict: "exam_id,content_hash", ignoreDuplicates: true }), "questions");

  // Audit rows, admin-only table.
  const hashes = [...rows.keys()];
  // 100 per call: hashes go in the URL, and 500 of them is too long.
  for (let i = 0; i < hashes.length; i += 100) {
    const ids = check(await db.from("questions").select("id, content_hash").eq("exam_id", examId).in("content_hash", hashes.slice(i, i + 100)), "ids");
    check(
      await db
        .from("question_imports")
        .upsert(ids.map((r) => ({ question_id: r.id, source, source_ref: refs.get(r.content_hash) })), { ignoreDuplicates: true }),
      "question_imports",
    );
  }

  // Blueprint = topic share of the imported bank, so every run's quota fits what exists.
  const count = new Map();
  for (const r of all) count.set(r.topic, (count.get(r.topic) ?? 0) + 1);
  check(await db.from("exam_blueprints").delete().eq("exam_id", examId), "clear blueprint");
  check(
    await db.from("exam_blueprints").insert(
      [...count].map(([topic, n]) => ({ exam_id: examId, topic, percentage: Math.max(0.01, Math.round((10000 * n) / all.length) / 100), source: "web", confirmed_by: adminId })),
    ),
    "blueprint",
  );
  console.log(`${name}: ${raw.length} in source, ${all.length} unique imported, ${raw.length - all.length - invalid} duplicates skipped, ${invalid} invalid skipped, ${count.size} topics`);
}
