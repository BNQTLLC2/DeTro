import { NextResponse, type NextRequest } from "next/server";
import { checkPassword, makeSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";
import { clearLoginFailures, isLoginLocked, recordLoginFailure } from "@/lib/queries";

export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const back = (e: string) => NextResponse.redirect(new URL(`/login?e=${e}`, req.url), 303);

  if (await isLoginLocked(ip)) return back("locked");

  const form = await req.formData();
  const password = String(form.get("password") ?? "");

  if (!checkPassword(password)) {
    await recordLoginFailure(ip);
    return back("bad");
  }

  await clearLoginFailures(ip);
  const res = NextResponse.redirect(new URL("/admin", req.url), 303);
  res.cookies.set(SESSION_COOKIE, makeSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
