"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export type LoginState = { error?: string } | undefined;

function safeNext(value: FormDataEntryValue | null): string {
  const raw = typeof value === "string" ? value : "";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return "/";
  }
  return raw;
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const limit = await rateLimit(`login:${clientIp(await headers())}`, 20, 60);
  if (!limit.ok) {
    return { error: "Too many sign-in attempts. Try again in a minute." };
  }
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: safeNext(formData.get("next")),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error;
  }
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
