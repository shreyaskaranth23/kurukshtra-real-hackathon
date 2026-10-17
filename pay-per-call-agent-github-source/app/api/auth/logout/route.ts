import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { sameOriginError } from "@/lib/security";

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return originError;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
