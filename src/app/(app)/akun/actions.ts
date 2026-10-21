"use server";

import { getUser } from "@/lib/auth";

export type PasswordState = { error?: string; field?: "current" | "password" | "confirm"; message?: string };

export async function changePassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const { supabase, email } = await getUser();
  const current = String(form.get("current") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (!current) return { error: "Password lama wajib diisi", field: "current" };
  if (password.length < 8) return { error: "Password baru minimal 8 karakter", field: "password" };
  if (password === current) return { error: "Password baru harus berbeda dari yang lama", field: "password" };
  if (password !== confirm) return { error: "Konfirmasi tidak sama dengan password baru", field: "confirm" };

  // Re-check the current password so an unattended logged-in session cannot change it.
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password: current });
  if (authError) return { error: "Password lama salah", field: "current" };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: `Gagal mengganti password: ${error.message}`, field: "password" };
  return { message: "Password berhasil diganti" };
}
