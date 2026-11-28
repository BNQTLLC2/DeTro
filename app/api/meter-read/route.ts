// Nhận ảnh đồng hồ (đã thu nhỏ ở trình duyệt) và trả về số đọc được. Chỉ chủ trọ đã đăng nhập dùng được.
import { isAdmin } from "@/lib/auth";
import { locateMeter, readMeter } from "@/lib/meter-ocr";

export const dynamic = "force-dynamic";
// Groq thường trả lời trong vài giây; giữ dư thời gian để khi chậm vẫn không bị Vercel cắt ngang.
export const maxDuration = 30;
const MAX_BASE64 = 3_000_000; // ~2,2MB ảnh, dưới giới hạn 4,5MB của Vercel

export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ ok: false, code: "error", message: "Chưa đăng nhập." }, { status: 401 });
  let body: { image?: unknown; mime?: unknown; kind?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, code: "error", message: "Ảnh gửi lên không hợp lệ." }, { status: 400 });
  }
  const { image, mime, kind, mode } = body;
  if (
    typeof image !== "string" ||
    image.length === 0 ||
    image.length > MAX_BASE64 ||
    (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") ||
    (kind !== "elec" && kind !== "water")
  ) {
    return Response.json({ ok: false, code: "error", message: "Ảnh quá lớn hoặc không hợp lệ. Hãy chụp lại." }, { status: 400 });
  }
  // mode "locate": tìm khung màn hình để trình duyệt cắt sát từ ảnh gốc; mặc định "read": đọc số.
  if (mode === "locate") return Response.json(await locateMeter(image, mime, kind));
  return Response.json(await readMeter(image, mime, kind));
}
