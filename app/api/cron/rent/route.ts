// Vercel Cron gọi mỗi sáng (xem vercel.json) để tự công bố tiền trọ đến ngày thu.
// Vercel tự gửi "Authorization: Bearer <CRON_SECRET>" nếu đã đặt biến môi trường CRON_SECRET.
// Không bắt buộc: trang người thuê và trang Tổng quan cũng tự công bố khi được mở.
import { createHash, timingSafeEqual } from "node:crypto";
import { autoPublishRent } from "@/lib/queries";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const key = process.env.CRON_SECRET;
  if (!key) return false;
  const m = /^Bearer\s+(.+)$/i.exec((req.headers.get("authorization") ?? "").trim());
  if (!m) return false;
  const a = createHash("sha256").update(m[1]).digest();
  const b = createHash("sha256").update(key).digest();
  return timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) return Response.json({ ok: false, message: "CRON_SECRET chưa được cấu hình" }, { status: 503 });
  if (!authorized(req)) return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  const published = await autoPublishRent();
  return Response.json({ ok: true, published });
}
