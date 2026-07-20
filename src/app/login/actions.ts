"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SendCodeState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

export type VerifyCodeState = {
  status: "idle" | "error";
  message?: string;
};

/**
 * Emails a 6-digit one-time code (no link: the Supabase email template renders
 * only {{ .Token }}). Codes work everywhere, including the iOS home-screen
 * app, whose cookie storage a magic link opened in Safari can never reach.
 */
export async function sendLoginCode(
  _prev: SendCodeState,
  formData: FormData,
): Promise<SendCodeState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email || !email.includes("@")) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    return { status: "error", message: error.message };
  }
  return { status: "sent", message: `Code sent to ${email}. Check your inbox.` };
}

export async function verifyLoginCode(
  _prev: VerifyCodeState,
  formData: FormData,
): Promise<VerifyCodeState> {
  const email = String(formData.get("email") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  const nextParam = String(formData.get("next") ?? "/dashboard");
  const next = nextParam.startsWith("/") ? nextParam : "/dashboard";

  if (!email || !email.includes("@")) {
    return { status: "error", message: "Enter a valid email address." };
  }
  if (!/^\d{6}$/.test(token)) {
    return { status: "error", message: "Enter the 6-digit code from the email." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error) {
    return { status: "error", message: error.message };
  }
  redirect(next);
}
