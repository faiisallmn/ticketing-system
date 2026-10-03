import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";

/**
 * No dashboard landing page: agents land on their queue, requesters on
 * their tickets. Both live at /tickets, scoped by role.
 */
export default async function HomePage() {
  await requireUser();
  redirect("/tickets");
}
