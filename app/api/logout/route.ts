import { NextResponse, type NextRequest } from "next/server";
import { loginPath, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL(loginPath(), req.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
