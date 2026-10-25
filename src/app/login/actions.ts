"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; field?: "email" | "password" };

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email) return { error: "Enter your email", field: "email" };
  if (!password) return { error: "Enter your password", field: "password" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Only bad credentials should read as "wrong password"; config/network failures must stay visible.
    if (error.code === "invalid_credentials") return { error: "Wrong email or password", field: "password" };
    console.error("signIn failed", error);
    return { error: "Could not sign in right now. Please try again later.", field: "password" };
  }
  redirect("/?welcome=1");
}
