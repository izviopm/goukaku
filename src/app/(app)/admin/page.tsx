import { BookMarked, Flag, Gauge, Sparkles, UserPlus, Users } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Reveal } from "@/components/motion";
import { Badge, Card, EmptyState, Field, Hero, inputClass, SectionTitle } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { createUser, saveAiSettings, saveCatalog, saveLimits, saveUserLimit } from "./actions";
import { AiSettingsFields } from "./ai-settings-fields";
import { BlueprintEditor } from "../ujian/[slug]/blueprint-editor";

export default async function AdminPage() {
  const { supabase } = await requireAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: ai }, { data: settings }, { data: profiles }, { data: limits }, { data: usage }, { data: reports }, { data: catalog }, users] =
    await Promise.all([
      supabase.from("ai_settings").select("provider, model, base_url, api_key_secret_id").eq("id", true).maybeSingle(),
      supabase.from("app_settings").select("key, value"),
      supabase.from("profiles").select("id, role, created_at").order("created_at"),
      supabase.from("user_limits").select("*"),
      supabase.from("ai_usage").select("user_id, calls, questions_generated").eq("day", today),
      supabase.from("question_reports").select("id, reason, created_at, question_id, questions(body, status)").order("created_at", { ascending: false }).limit(100),
      supabase.from("exam_catalog").select("*, exams(id, exam_blueprints(topic, percentage, source_url, confirmed_by))").order("display_name"),
      createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
    ]);

  const setting = (k: string) => settings?.find((s) => s.key === k)?.value ?? {};
  const defaults = setting("default_limits");
  const verifierIds: string[] = setting("verifier_models").models ?? [];
  // Older settings only stored bare ids; list them so nothing configured disappears from the form.
  const saved: { id: string; name: string }[] = setting("ai_models").models ?? [];
  const models = saved.length ? saved : [...new Set([ai?.model, ...verifierIds].filter(Boolean) as string[])].map((id) => ({ id, name: "" }));
  const emails = new Map(users.data.users.map((u) => [u.id, u.email]));
  const reportCount = new Map<string, number>();
  reports?.forEach((r) => reportCount.set(r.question_id, (reportCount.get(r.question_id) ?? 0) + 1));

  return (
    <>
      <Hero eyebrow="Admin" title="Settings">
        Accounts, AI models, usage limits, reported questions, and the exam catalog.
      </Hero>

      <Reveal className="grid gap-4 lg:grid-cols-2" delay={0.05}>
        <Card className="border-ai-border lg:row-span-2">
          <SectionTitle icon={Sparkles} tone="ai">
            AI models
          </SectionTitle>
          <ActionForm action={saveAiSettings} submit="Save">
            <AiSettingsFields
              provider={ai?.provider ?? "anthropic"}
              baseUrl={ai?.base_url ?? ""}
              hasKey={!!ai?.api_key_secret_id}
              models={models}
              main={ai?.model ?? ""}
              verifiers={verifierIds}
            />
          </ActionForm>
        </Card>

        <Card>
          <SectionTitle icon={UserPlus}>Create a user</SectionTitle>
          <ActionForm action={createUser} submit="Create account">
            <Field id="new-email" label="Email">
              <input id="new-email" name="email" type="email" autoComplete="off" required className={inputClass} />
            </Field>
            <Field id="new-password" label="Initial password" help="At least 8 characters. Share it with the user through a safe channel.">
              <input id="new-password" name="password" type="password" autoComplete="new-password" required className={inputClass} aria-describedby="new-password-help" />
            </Field>
          </ActionForm>
        </Card>

        <Card>
          <SectionTitle icon={Gauge}>Default and global limits</SectionTitle>
          <ActionForm action={saveLimits} submit="Save limits">
            <Field id="calls" label="AI calls per user per day">
              <input id="calls" name="calls" type="number" min={0} defaultValue={defaults.ai_calls_per_day ?? ""} className={inputClass} />
            </Field>
            <Field id="questions" label="AI-generated questions per user per day">
              <input id="questions" name="questions" type="number" min={0} defaultValue={defaults.questions_generated_per_day ?? ""} className={inputClass} />
            </Field>
            <Field id="global" label="Global AI calls per day" help="Also applies to unlimited users.">
              <input id="global" name="global" type="number" min={0} defaultValue={setting("global_daily_limit").calls_per_day ?? ""} className={inputClass} aria-describedby="global-help" />
            </Field>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-destructive/30 px-3">
              <input type="checkbox" name="kill" defaultChecked={!!setting("ai_kill_switch").enabled} className="size-5 accent-destructive" />
              <span className="font-medium text-destructive">Kill switch: stop all AI calls</span>
            </label>
          </ActionForm>
        </Card>
      </Reveal>

      <Reveal delay={0.1}>
        <Card>
          <SectionTitle icon={Flag}>Reported questions</SectionTitle>
          {!reports?.length ? (
            <EmptyState icon={Flag} title="No reports" />
          ) : (
            <ul className="flex max-h-96 flex-col divide-y overflow-y-auto text-sm">
              {reports.map((r) => {
                const q = r.questions as unknown as { body: string; status: string } | null;
                return (
                  <li key={r.id} className="flex flex-col gap-1 py-3">
                    <span className="line-clamp-2 font-medium">{q?.body}</span>
                    <span className="text-muted-foreground">Reason: {r.reason}</span>
                    <span className="flex gap-2">
                      <Badge>{reportCount.get(r.question_id)} reports</Badge>
                      {q?.status === "hidden" && <Badge tone="accent">Hidden</Badge>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </Reveal>

      <Reveal delay={0.15}>
        <Card>
          <SectionTitle icon={Users}>Users and limits</SectionTitle>
          <ul className="flex flex-col divide-y">
            {(profiles ?? []).map((p) => {
              const l = limits?.find((x) => x.user_id === p.id);
              const u = usage?.find((x) => x.user_id === p.id);
              return (
                <li key={p.id} className="py-4">
                  <ActionForm action={saveUserLimit} submit="Save" className="grid items-end gap-3 md:grid-cols-6">
                    <input type="hidden" name="userId" value={p.id} />
                    <div className="md:col-span-2">
                      <p className="font-medium break-all">{emails.get(p.id) ?? p.id}</p>
                      <p className="text-sm text-muted-foreground">
                        {p.role} · today {u?.calls ?? 0} calls, {u?.questions_generated ?? 0} questions
                      </p>
                    </div>
                    <Field id={`c-${p.id}`} label="Calls/day">
                      <input id={`c-${p.id}`} name="calls" type="number" min={0} placeholder="default" defaultValue={l?.ai_calls_per_day ?? ""} className={inputClass} />
                    </Field>
                    <Field id={`q-${p.id}`} label="Questions/day">
                      <input id={`q-${p.id}`} name="questions" type="number" min={0} placeholder="default" defaultValue={l?.questions_generated_per_day ?? ""} className={inputClass} />
                    </Field>
                    <Field id={`n-${p.id}`} label="Note">
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
      </Reveal>

      <Reveal delay={0.2}>
        <Card>
          <SectionTitle icon={BookMarked}>Exam catalog</SectionTitle>
          {!catalog?.length ? (
            <EmptyState icon={BookMarked} title="No exams yet" />
          ) : (
            <ul className="flex flex-col divide-y">
              {catalog.map((c) => {
                const examRow = c.exams as unknown as {
                  id: string;
                  exam_blueprints: { topic: string; percentage: number; source_url: string | null; confirmed_by: string | null }[];
                } | null;
                const defaultBp = (examRow?.exam_blueprints ?? []).filter((b) => b.confirmed_by);
                return (
                <li key={c.id} className="flex flex-col gap-3 py-4">
                  <ActionForm action={saveCatalog} submit="Save" className="grid items-end gap-3 md:grid-cols-5">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="slug" value={c.slug} />
                    <input type="hidden" name="pass_score_source" value={c.pass_score_source ?? "user"} />
                    <Field id={`dn-${c.id}`} label={`Name (${c.slug})`}>
                      <input id={`dn-${c.id}`} name="display_name" defaultValue={c.display_name} className={inputClass} />
                    </Field>
                    <Field id={`al-${c.id}`} label="Aliases (comma separated)">
                      <input id={`al-${c.id}`} name="aliases" defaultValue={c.aliases.join(", ")} className={inputClass} />
                    </Field>
                    <Field id={`lg-${c.id}`} label="Question language">
                      <select id={`lg-${c.id}`} name="language" defaultValue={c.language ?? ""} className={inputClass}>
                        <option value="">Not set</option>
                        <option value="id">Indonesian</option>
                        <option value="en">English</option>
                      </select>
                    </Field>
                    <Field id={`ps-${c.id}`} label="Passing score">
                      <input id={`ps-${c.id}`} name="pass_score" type="number" min={0} max={100} step="0.1" defaultValue={c.pass_score ?? ""} className={inputClass} />
                    </Field>
                  </ActionForm>
                  {examRow && (
                    <details className="rounded-lg border p-4">
                      <summary className="cursor-pointer font-medium">
                        Default blueprint {defaultBp.length ? `(${defaultBp.length} topics)` : "(not set)"}
                      </summary>
                      <p className="mt-2 mb-4 text-sm text-muted-foreground">Used by everyone studying this exam who has no personal blueprint.</p>
                      <BlueprintEditor
                        examId={examRow.id}
                        mode="admin"
                        initial={defaultBp.map((b) => ({ topic: b.topic, percentage: Number(b.percentage) }))}
                        sourceUrl={defaultBp.find((b) => b.source_url)?.source_url ?? null}
                      />
                    </details>
                  )}
                </li>
                );
              })}
            </ul>
          )}
        </Card>
      </Reveal>
    </>
  );
}
