import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { db } from "@/lib/db";

/** Self-help suggestions while filing a ticket (used for deflection). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) {
    return NextResponse.json({ articles: [] });
  }

  const articles = await db.article.findMany({
    where: {
      status: "PUBLISHED",
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: [{ helpful: "desc" }, { views: "desc" }],
    take: 5,
    select: { title: true, slug: true, excerpt: true },
  });

  return NextResponse.json({ articles });
}
