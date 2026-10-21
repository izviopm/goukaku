import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
  return { id: data.user.id, email: data.user.email ?? "", isAdmin: profile?.role === "admin", supabase };
});

export async function requireAdmin() {
  const user = await getUser();
  if (!user.isAdmin) redirect("/");
  return user;
}
