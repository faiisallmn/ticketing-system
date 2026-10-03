import { NextResponse } from "next/server";

export function apiOk(
  data: unknown,
  meta?: Record<string, unknown>,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json({ data, ...(meta ? { meta } : {}) }, { headers });
}

export function apiError(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}
