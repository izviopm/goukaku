"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";

export type ProfileState = { error?: string; field?: "name" | "gender" | "photo"; message?: string };

const PHOTO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_PHOTO = 2 * 1024 * 1024;

/** Name, gender, and photo. The photo goes to avatars/<user id>/ (storage RLS only allows the user's own folder). */
export async function saveProfile(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const { supabase, id, avatarPath } = await getUser();
  const name = String(form.get("name") ?? "").trim();
  const gender = String(form.get("gender") ?? "");
  const photo = form.get("photo");
  const removePhoto = form.get("removePhoto") === "on";

  if (!name || name.length > 100) return { error: "Enter your name (up to 100 characters)", field: "name" };
  if (gender && gender !== "male" && gender !== "female") return { error: "Choose a gender", field: "gender" };

  let nextPath = avatarPath;
  if (photo instanceof File && photo.size > 0) {
    const ext = PHOTO_TYPES[photo.type];
    if (!ext) return { error: "Use a PNG, JPG, or WebP image", field: "photo" };
    if (photo.size > MAX_PHOTO) return { error: "The photo must be 2 MB or smaller", field: "photo" };
    // New file name each time so browsers and CDNs never show the old photo from cache.
    nextPath = `${id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(nextPath, photo, { contentType: photo.type });
    if (error) return { error: `Could not upload the photo: ${error.message}`, field: "photo" };
  } else if (removePhoto) {
    nextPath = null;
  }

  const { error } = await supabase.from("profiles").update({ full_name: name, gender: gender || null, avatar_path: nextPath }).eq("id", id);
  if (error) return { error: error.message, field: "name" };
  if (avatarPath && avatarPath !== nextPath) await supabase.storage.from("avatars").remove([avatarPath]);

  revalidatePath("/", "layout");
  return { message: "Profile saved" };
}

export type PasswordState ={ error?: string; field?: "current" | "password" | "confirm"; message?: string };

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
