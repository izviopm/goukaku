import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, full_name, gender, avatar_path").eq("id", data.user.id).single();
  return {
    id: data.user.id,
    email: data.user.email ?? "",
    isAdmin: profile?.role === "admin",
    name: (profile?.full_name as string | null) ?? null,
    gender: (profile?.gender as "male" | "female" | null) ?? null,
    avatarPath: (profile?.avatar_path as string | null) ?? null,
    supabase,
  };
});

export async function requireAdmin() {
  const user = await getUser();
  if (!user.isAdmin) redirect("/");
  return user;
}
