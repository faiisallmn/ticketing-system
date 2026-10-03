import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Support Desk",
    template: "%s · Support Desk",
  },
  description: "Internal ticketing system for the support organisation.",
  // iOS rewrites dates, emails and phone numbers into links, which breaks
  // hydration (https://nextjs.org/docs/messages/react-hydration-error).
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export type Theme = "light" | "dark";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Read once on the server so first paint already matches the theme —
  // client and server can never disagree (no hydration flash).
  const stored = (await cookies()).get("theme")?.value;
  const theme: Theme = stored === "dark" ? "dark" : "light";

  return (
    <html lang="en" data-theme={theme} className={`${schibsted.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
