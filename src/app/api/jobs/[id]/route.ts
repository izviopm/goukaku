import { after } from "next/server";
import { getUser } from "@/lib/auth";
import { resumeJob } from "@/lib/generate";

// A resumed job runs in this function's after(), so it gets the same time budget as the page that started it.
export const maxDuration = 300;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { supabase } = await getUser();
  // RLS limits this to the caller's own jobs, so a user can only resume their own work.
  const { data } = await supabase.from("ai_jobs").select("id, kind, requested, done, status, error, summary, updated_at").eq("id", id).maybeSingle();
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });
  if (data.status === "queued" || data.status === "running") after(() => resumeJob(data));
  return Response.json(data);
}
