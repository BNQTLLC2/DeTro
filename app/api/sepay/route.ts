// Webhook SePay "tiền vào". Cấu hình bên SePay:
//   URL: https://<tên miền>/api/sepay   |   Kiểu xác thực: API Key   |   Giá trị = biến SEPAY_API_KEY
import { createHash, timingSafeEqual } from "node:crypto";
import { parsePayload } from "@/lib/sepay";
import { recordSepayPayment } from "@/lib/queries";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const key = process.env.SEPAY_API_KEY;
  if (!key) return false;
  const header = req.headers.get("authorization") ?? "";
  const m = /^Apikey\s+(.+)$/i.exec(header.trim());
  if (!m) return false;
  const a = createHash("sha256").update(m[1]).digest();
  const b = createHash("sha256").update(key).digest();
  return timingSafeEqual(a, b);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function POST(req: Request) {
  if (!process.env.SEPAY_API_KEY) return json({ success: false, message: "SEPAY_API_KEY chưa được cấu hình" }, 503);
  if (!authorized(req)) return json({ success: false, message: "Unauthorized" }, 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ success: false, message: "Dữ liệu không hợp lệ" }, 400);
  }

  const tx = parsePayload(raw);
  if (!tx) return json({ success: false, message: "Thiếu hoặc sai trường dữ liệu" }, 400);

  // Chỉ xử lý tiền vào. Tiền ra bỏ qua nhưng vẫn báo thành công để SePay không gửi lại.
  if (tx.transferType !== "in") return json({ success: true });

  try {
    const r = await recordSepayPayment(tx);
    console.log("SePay webhook", tx.id, tx.transferAmount, JSON.stringify(tx.content), "->", r);
  } catch (e) {
    console.error("SePay webhook lỗi", e);
    return json({ success: false, message: "Lỗi xử lý" }, 500); // SePay sẽ tự gửi lại
  }
  return json({ success: true });
}
