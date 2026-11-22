// Đăng nhập chủ trọ bằng một mật khẩu duy nhất (biến môi trường ADMIN_PASSWORD).
// Phiên lưu trong cookie httpOnly có chữ ký HMAC, không cần bảng người dùng.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Đường dẫn đăng nhập bí mật (biến ADMIN_LOGIN_PATH, ví dụ "vao-tro-k7x2"). Khi đặt, trang /login và trang
 * chủ trả về 404, người lạ không thấy trang đăng nhập ở đâu cả. Để trống thì dùng /login như thường.
 */
export function hiddenLoginSlug(): string {
  const v = (process.env.ADMIN_LOGIN_PATH ?? "").trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  return /^[a-z0-9_-]{6,64}$/.test(v) && !["login", "admin", "api", "p"].includes(v) ? v : "";
}

/** Nơi chuyển người lạ tới khi trang đăng nhập đang được giấu (đổi bằng biến HIDDEN_REDIRECT_URL). */
export function decoyUrl(): string {
  const v = (process.env.HIDDEN_REDIRECT_URL ?? "").trim();
  return /^https?:\/\//.test(v) ? v : "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
}

export function loginPath(): string {
  const s = hiddenLoginSlug();
  return s ? `/${s}` : "/login";
}

export const SESSION_COOKIE = "admin_session";
export const SESSION_DAYS = 30;

function secret(): string {
  return (
    process.env.SESSION_SECRET ||
    createHash("sha256")
      .update("phong-tro:" + (process.env.ADMIN_PASSWORD ?? ""))
      .digest("hex")
  );
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeSessionToken(now = Date.now()): string {
  const exp = String(now + SESSION_DAYS * 86400000);
  return `${exp}.${sign(exp)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;
  const expected = sign(exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return Number(exp) > now;
}

export function checkPassword(input: string): boolean {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(real).digest();
  return timingSafeEqual(a, b);
}

export function passwordConfigured(): boolean {
  return !!process.env.ADMIN_PASSWORD;
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/** Dùng ở đầu mọi trang và mọi server action của chủ trọ. */
export async function requireAdmin(): Promise<void> {
  if (await isAdmin()) return;
  // Đã giấu trang đăng nhập thì người chưa đăng nhập chỉ thấy 404, không bị chuyển tới trang đăng nhập.
  if (hiddenLoginSlug()) redirect(decoyUrl());
  redirect("/login");
}
