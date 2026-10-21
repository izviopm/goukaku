import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, inputClass, PageTitle } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { createUser, saveAiSettings, saveCatalog, saveLimits, saveUserLimit } from "./actions";

export default async function AdminPage() {
  const { supabase } = await requireAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: ai }, { data: settings }, { data: profiles }, { data: limits }, { data: usage }, { data: reports }, { data: catalog }, users] =
    await Promise.all([
      supabase.from("ai_settings").select("provider, model, api_key_secret_id").eq("id", true).maybeSingle(),
      supabase.from("app_settings").select("key, value"),
      supabase.from("profiles").select("id, role, created_at").order("created_at"),
      supabase.from("user_limits").select("*"),
      supabase.from("ai_usage").select("user_id, calls, questions_generated").eq("day", today),
      supabase.from("question_reports").select("id, reason, created_at, question_id, questions(body, status)").order("created_at", { ascending: false }).limit(100),
      supabase.from("exam_catalog").select("*").order("display_name"),
      createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
    ]);

  const setting = (k: string) => settings?.find((s) => s.key === k)?.value ?? {};
  const defaults = setting("default_limits");
  const emails = new Map(users.data.users.map((u) => [u.id, u.email]));
  const reportCount = new Map<string, number>();
  reports?.forEach((r) => reportCount.set(r.question_id, (reportCount.get(r.question_id) ?? 0) + 1));

  return (
    <>
      <PageTitle sub="Akun, model AI, limit, laporan soal, dan katalog ujian.">Admin</PageTitle>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Buat akun user</h2>
          <ActionForm action={createUser} submit="Buat akun">
            <Field id="new-email" label="Email">
              <input id="new-email" name="email" type="email" autoComplete="off" required className={inputClass} />
            </Field>
            <Field id="new-password" label="Password awal" help="Minimal 8 karakter. Berikan ke user lewat jalur aman.">
              <input id="new-password" name="password" type="password" autoComplete="new-password" required className={inputClass} />
            </Field>
          </ActionForm>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold">Model AI</h2>
          <ActionForm action={saveAiSettings} submit="Simpan">
            <Field id="provider" label="Provider">
              <select id="provider" name="provider" defaultValue={ai?.provider ?? "anthropic"} className={inputClass}>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
            </Field>
            <Field id="model" label="Model utama" help="Untuk chat, membuat soal, dan menjawab soal dari PDF.">
              <input id="model" name="model" defaultValue={ai?.model ?? ""} required className={inputClass} />
            </Field>
            <Field id="verifiers" label="Model verifikasi (pisahkan dengan koma)" help="Minimal 2 model berbeda dari provider yang sama untuk blind solve.">
              <input id="verifiers" name="verifiers" defaultValue={(setting("verifier_models").models ?? []).join(", ")} className={inputClass} />
            </Field>
            <Field id="apiKey" label="API key" help={ai?.api_key_secret_id ? "Tersimpan di Vault. Kosongkan untuk mempertahankan." : "Belum ada API key."}>
              <input id="apiKey" name="apiKey" type="password" autoComplete="off" className={inputClass} />
            </Field>
          </ActionForm>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold">Limit default dan global</h2>
          <ActionForm action={saveLimits} submit="Simpan limit">
            <Field id="calls" label="Panggilan AI per user per hari">
              <input id="calls" name="calls" type="number" min={0} defaultValue={defaults.ai_calls_per_day ?? ""} className={inputClass} />
            </Field>
            <Field id="questions" label="Soal dibuat AI per user per hari">
              <input id="questions" name="questions" type="number" min={0} defaultValue={defaults.questions_generated_per_day ?? ""} className={inputClass} />
            </Field>
            <Field id="global" label="Batas global panggilan AI per hari" help="Berlaku juga untuk user unlimited.">
              <input id="global" name="global" type="number" min={0} defaultValue={setting("global_daily_limit").calls_per_day ?? ""} className={inputClass} />
            </Field>
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="checkbox" name="kill" defaultChecked={!!setting("ai_kill_switch").enabled} className="size-5 accent-destructive" />
              <span className="font-medium text-destructive">Kill switch: hentikan semua panggilan AI</span>
            </label>
          </ActionForm>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold">Laporan soal</h2>
          {!reports?.length ? (
            <p className="text-muted-foreground">Belum ada laporan.</p>
          ) : (
            <ul className="flex max-h-96 flex-col divide-y overflow-y-auto text-sm">
              {reports.map((r) => {
                const q = r.questions as unknown as { body: string; status: string } | null;
                return (
                  <li key={r.id} className="flex flex-col gap-1 py-3">
                    <span className="line-clamp-2 font-medium">{q?.body}</span>
                    <span className="text-muted-foreground">Alasan: {r.reason}</span>
                    <span className="flex gap-2">
                      <Badge>{reportCount.get(r.question_id)} laporan</Badge>
                      {q?.status === "hidden" && <Badge tone="accent">Disembunyikan</Badge>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">User dan limit</h2>
        <ul className="flex flex-col divide-y">
          {(profiles ?? []).map((p) => {
            const l = limits?.find((x) => x.user_id === p.id);
            const u = usage?.find((x) => x.user_id === p.id);
            return (
              <li key={p.id} className="py-4">
                <ActionForm action={saveUserLimit} submit="Simpan" className="grid items-end gap-3 md:grid-cols-6">
                  <input type="hidden" name="userId" value={p.id} />
                  <div className="md:col-span-2">
                    <p className="font-medium break-all">{emails.get(p.id) ?? p.id}</p>
                    <p className="text-sm text-muted-foreground">
                      {p.role} · hari ini {u?.calls ?? 0} panggilan, {u?.questions_generated ?? 0} soal
                    </p>
                  </div>
                  <Field id={`c-${p.id}`} label="Panggilan/hari">
                    <input id={`c-${p.id}`} name="calls" type="number" min={0} placeholder="default" defaultValue={l?.ai_calls_per_day ?? ""} className={inputClass} />
                  </Field>
                  <Field id={`q-${p.id}`} label="Soal/hari">
                    <input id={`q-${p.id}`} name="questions" type="number" min={0} placeholder="default" defaultValue={l?.questions_generated_per_day ?? ""} className={inputClass} />
                  </Field>
                  <Field id={`n-${p.id}`} label="Catatan">
                    <input id={`n-${p.id}`} name="note" defaultValue={l?.note ?? ""} className={inputClass} />
                  </Field>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
                    <input type="checkbox" name="unlimited" defaultChecked={!!l?.unlimited} className="size-5 accent-primary" />
                    Unlimited
                  </label>
                </ActionForm>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Katalog ujian</h2>
        <ul className="flex flex-col divide-y">
          {(catalog ?? []).map((c) => (
            <li key={c.id} className="py-4">
              <ActionForm action={saveCatalog} submit="Simpan" className="grid items-end gap-3 md:grid-cols-5">
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="slug" value={c.slug} />
                <input type="hidden" name="pass_score_source" value={c.pass_score_source ?? "user"} />
                <Field id={`dn-${c.id}`} label={`Nama (${c.slug})`}>
                  <input id={`dn-${c.id}`} name="display_name" defaultValue={c.display_name} className={inputClass} />
                </Field>
                <Field id={`al-${c.id}`} label="Alias (koma)">
                  <input id={`al-${c.id}`} name="aliases" defaultValue={c.aliases.join(", ")} className={inputClass} />
                </Field>
                <Field id={`lg-${c.id}`} label="Bahasa">
                  <select id={`lg-${c.id}`} name="language" defaultValue={c.language ?? ""} className={inputClass}>
                    <option value="">Belum ditentukan</option>
                    <option value="id">Indonesia</option>
                    <option value="en">Inggris</option>
                  </select>
                </Field>
                <Field id={`ps-${c.id}`} label="Nilai lulus">
                  <input id={`ps-${c.id}`} name="pass_score" type="number" min={0} max={100} step="0.1" defaultValue={c.pass_score ?? ""} className={inputClass} />
                </Field>
              </ActionForm>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
