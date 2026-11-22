import { NextResponse, type NextRequest } from "next/server";
import { paymentStatus } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Trang người thuê hỏi nhanh trạng thái thanh toán của hóa đơn đang xem (chỉ cần biết link riêng của phòng).
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const inv = Number(req.nextUrl.searchParams.get("inv"));
  const st = Number.isInteger(inv) ? await paymentStatus(token, inv) : null;
  if (!st) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(st, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
