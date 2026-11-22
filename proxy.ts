import { NextResponse, type NextRequest } from "next/server";
import { decoyUrl, hiddenLoginSlug, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Khi đặt ADMIN_LOGIN_PATH: /login và trang chủ chuyển người lạ sang trang khác, trang đăng nhập chỉ mở được ở đường dẫn bí mật.
export function proxy(req: NextRequest) {
  const slug = hiddenLoginSlug();
  if (!slug) return NextResponse.next();
  const path = req.nextUrl.pathname.toLowerCase();
  if (path === `/${slug}`) return NextResponse.rewrite(new URL("/login", req.url));
  if (path === "/login") {
    const ok = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
    return NextResponse.redirect(ok ? new URL("/admin", req.url) : decoyUrl());
  }
  return NextResponse.next();
}

export const config = { matcher: ["/login", "/:slug"] };
