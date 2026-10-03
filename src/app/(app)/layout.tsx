import { cookies } from "next/headers";
import { requireUser } from "@/lib/dal";
import { Sidebar } from "@/components/shell/sidebar";
import { RequesterShell } from "@/components/shell/requester-shell";
import type { Theme } from "@/app/layout";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const stored = (await cookies()).get("theme")?.value;
  const theme: Theme = stored === "dark" ? "dark" : "light";

  if (user.role === "REQUESTER") {
    return <RequesterShell theme={theme}>{children}</RequesterShell>;
  }

  return <Sidebar theme={theme}>{children}</Sidebar>;
}
