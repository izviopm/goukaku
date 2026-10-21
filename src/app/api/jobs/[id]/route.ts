import { getUser } from "@/lib/auth";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { supabase } = await getUser();
  const { data } = await supabase.from("ai_jobs").select("kind, requested, done, status, error, summary").eq("id", id).maybeSingle();
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(data);
}
