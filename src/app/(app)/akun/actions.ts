"use server";

import { getUser } from "@/lib/auth";

export type PasswordState = { error?: string; field?: "current" | "password" | "confirm"; message?: string };

export async function changePassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const { supabase, email } = await getUser();
  const current = String(form.get("current") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (!current) return { error: "Enter your current password", field: "current" };
  if (password.length < 8) return { error: "The new password needs at least 8 characters", field: "password" };
  if (password === current) return { error: "The new password must be different from the current one", field: "password" };
  if (password !== confirm) return { error: "The passwords do not match", field: "confirm" };

  // Re-check the current password so an unattended logged-in session cannot change it.
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password: current });
  if (authError) return { error: "Your current password is wrong", field: "current" };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: `Could not change the password: ${error.message}`, field: "password" };
  return { message: "Password changed" };
}
