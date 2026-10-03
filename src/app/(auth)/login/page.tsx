import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";

  return (
    <div className="space-y-8">
      <div className="space-y-1.5 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded bg-accent-fill text-sm font-bold text-white">
          SD
        </div>
        <h1 className="text-[22px] font-semibold leading-[28px]">Sign in to Support Desk</h1>
        <p className="text-sm text-muted">Use your organisation account to continue.</p>
      </div>

      <LoginForm next={next} />
    </div>
  );
}
