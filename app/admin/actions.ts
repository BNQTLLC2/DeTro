"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { currentPeriod, isPeriod, periodName } from "@/lib/format";
import type { FeeMethod } from "@/lib/billing";
import * as Q from "@/lib/queries";

/* ------------------------------ Hàm hỗ trợ ------------------------------ */

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function intOf(fd: FormData, key: string, fallback = 0): number {
  const raw = str(fd, key).replace(/[.\s]/g, "").replace(",", ".");
  if (raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function numOf(fd: FormData, key: string): number | null {
  const raw = str(fd, key).replace(",", ".");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Chỉ cho quay lại các trang trong /admin, tránh chuyển hướng ra ngoài. */
function safeBack(fd: FormData, fallback = "/admin"): string {
  const b = str(fd, "back");
  return b.startsWith("/admin") && !b.startsWith("//") ? b : fallback;
}

function go(back: string, kind: "ok" | "error", msg: string): never {
  const sep = back.includes("?") ? "&" : "?";
  redirect(`${back}${sep}${kind}=${encodeURIComponent(msg)}`);
}

function periodOf(fd: FormData): string {
  const p = str(fd, "period");
  if (!isPeriod(p)) throw new Error("Kỳ không hợp lệ.");
  return p;
}

async function run(back: string, okMsg: string, fn: () => Promise<string | void>): Promise<never> {
  let msg = okMsg;
  try {
    const r = await fn();
    if (typeof r === "string") msg = r;
  } catch (e) {
    go(back, "error", e instanceof Error ? e.message : "Có lỗi xảy ra.");
  }
  revalidatePath("/admin", "layout");
  go(back, "ok", msg);
}

/* --------------------------- Công bố / thu tiền --------------------------- */

export async function publishRoomAction(fd: FormData) {
  await requireAdmin();
  const back = safeBack(fd);
  const roomId = intOf(fd, "room");
  await run(back, "Đã công bố. Người thuê đã xem được hóa đơn.", async () => {
    await Q.publishInvoice(roomId, periodOf(fd));
  });
}

export async function unpublishRoomAction(fd: FormData) {
  await requireAdmin();
  const back = safeBack(fd);
  const roomId = intOf(fd, "room");
  await run(back, "Đã hủy công bố. Người thuê không còn thấy hóa đơn này.", async () => {
    await Q.unpublishInvoice(roomId, periodOf(fd));
  });
}

export async function publishAllAction(fd: FormData) {
  await requireAdmin();
  const back = safeBack(fd);
  await run(back, "", async () => {
    const n = await Q.publishAll(periodOf(fd));
    return n === 0
      ? "Không có phòng nào cần công bố (cần nhập đủ điện và nước)."
      : `Đã công bố ${n} phòng. Người thuê đã xem được hóa đơn.`;
  });
}

/** Công bố / hủy công bố tiền trọ (đợt thu riêng, không cần số điện nước). */
export async function publishRentAction(fd: FormData) {
  await requireAdmin();
  const back = safeBack(fd);
  const roomId = intOf(fd, "room");
  await run(back, "Đã công bố tiền trọ. Người thuê đã xem được và chuyển khoản.", async () => {
    await Q.publishRent(roomId, periodOf(fd));
  });
}

export async function unpublishRentAction(fd: FormData) {
  await requireAdmin();
  const back = safeBack(fd);
  const roomId = intOf(fd, "room");
  await run(back, "Đã hủy công bố tiền trọ.", async () => {
    await Q.unpublishRent(roomId, periodOf(fd));
  });
}

/** Đánh dấu đã thu một đợt: part = "rent" (tiền trọ) hoặc "other" (chi phí khác, mặc định). */
export async function setPaidAction(fd: FormData) {
  await requireAdmin();
  const back = safeBack(fd);
  const roomId = intOf(fd, "room");
  const paid = str(fd, "paid") === "1";
  const part = str(fd, "part") === "rent" ? "rent" : "other";
  const what = part === "rent" ? "tiền trọ" : "chi phí khác";
  await run(back, paid ? `Đã đánh dấu đã thu ${what}.` : `Đã bỏ đánh dấu đã thu ${what}.`, async () => {
    await Q.setPaid(roomId, periodOf(fd), paid, part);
  });
}

/* ------------------------------ Nhập chỉ số ------------------------------ */

export async function saveReadingAction(fd: FormData) {
  await requireAdmin();
  const back = safeBack(fd);
  const kind = str(fd, "kind") === "water" ? "water" : "elec";
  const roomId = intOf(fd, "room");
  const start = numOf(fd, "start");
  const end = numOf(fd, "end");
  await run(back, kind === "elec" ? "Đã lưu số điện." : "Đã lưu số nước.", async () => {
    if (start === null || end === null) throw new Error("Hãy nhập đủ số đầu và số cuối.");
    await Q.saveReading(roomId, periodOf(fd), kind, start, end);
  });
}

export async function addAdjustmentAction(fd: FormData) {
  await requireAdmin();
  const back = safeBack(fd);
  const roomId = intOf(fd, "room");
  const name = str(fd, "name");
  const amount = intOf(fd, "amount", NaN);
  await run(back, "Đã thêm khoản phát sinh.", async () => {
    if (!name) throw new Error("Hãy nhập tên khoản phát sinh.");
    if (!Number.isFinite(amount) || amount === 0) throw new Error("Số tiền không hợp lệ (có thể nhập số âm để giảm trừ).");
    await Q.addAdjustment(roomId, periodOf(fd), name, amount);
  });
}

export async function removeAdjustmentAction(fd: FormData) {
  await requireAdmin();
  const back = safeBack(fd);
  const roomId = intOf(fd, "room");
  const index = intOf(fd, "index", -1);
  await run(back, "Đã bỏ khoản phát sinh.", async () => {
    await Q.removeAdjustment(roomId, periodOf(fd), index);
  });
}

/* ---------------------------------- Phòng --------------------------------- */

export async function saveRoomAction(fd: FormData) {
  await requireAdmin();
  const back = safeBack(fd, "/admin/phong");
  const id = intOf(fd, "id");
  await run(back, "Đã lưu thông tin phòng.", async () => {
    const name = str(fd, "name");
    if (!name) throw new Error("Tên phòng không được để trống.");
    const billingDay = intOf(fd, "billing_day", 1);
    if (billingDay < 1 || billingDay > 31) throw new Error("Ngày chốt số phải từ 1 đến 31.");
    await Q.saveRoom(id, {
      name,
      rent: Math.max(intOf(fd, "rent"), 0),
      tenant_name: str(fd, "tenant_name"),
      tenant_phone: str(fd, "tenant_phone"),
      occupants: Math.max(intOf(fd, "occupants", 1), 0),
      deposit: Math.max(intOf(fd, "deposit"), 0),
      move_in_date: str(fd, "move_in_date"),
      billing_day: billingDay,
      is_vacant: fd.get("is_vacant") === "on",
      init_elec: Math.max(intOf(fd, "init_elec"), 0),
      init_water: Math.max(intOf(fd, "init_water"), 0),
    });
  });
}

/** Lưu các khoản phí của một phòng trong trang Nhập số. */
export async function saveFeesAction(fd: FormData) {
  await requireAdmin();
  const back = safeBack(fd);
  const roomId = intOf(fd, "room");
  await run(back, "Đã lưu các khoản phí. Tháng sau sẽ tự dùng lại.", async () => {
    const types = await Q.listFeeTypes();
    await Q.saveInvoiceFees(
      roomId,
      periodOf(fd),
      types.map((t) => ({
        fee_type_id: t.id,
        enabled: fd.get(`fee_on_${t.id}`) === "on",
        amount: str(fd, `fee_amount_${t.id}`) === "" ? null : Math.max(intOf(fd, `fee_amount_${t.id}`), 0),
        quantity: Math.max(intOf(fd, `fee_qty_${t.id}`, 1), 0),
      })),
    );
  });
}

export async function regenerateTokenAction(fd: FormData) {
  await requireAdmin();
  const id = intOf(fd, "id");
  await run("/admin/phong", "Đã đổi link. Link cũ không còn xem được, hãy gửi link mới cho người thuê.", async () => {
    await Q.regenerateToken(id);
  });
}

/** Đổi link ngay trên trang (không tải lại), trả về mã mới. */
export async function regenerateTokenInlineAction(id: number): Promise<{ token: string } | { error: string }> {
  await requireAdmin();
  try {
    await Q.regenerateToken(id);
    const room = await Q.getRoom(id);
    if (!room) return { error: "Không tìm thấy phòng." };
    return { token: room.token };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Có lỗi xảy ra." };
  }
}

/* --------------------------------- Cài đặt -------------------------------- */

export async function saveSettingsAction(fd: FormData) {
  await requireAdmin();
  await run("/admin/cai-dat", "", async () => {
    const quota = numOf(fd, "water_quota");
    if (quota === null || quota < 0) throw new Error("Số khối nước định mức không hợp lệ.");
    const feeDay = intOf(fd, "fee_day", 6);
    if (feeDay < 1 || feeDay > 31) throw new Error("Ngày thu chi phí khác phải từ 1 đến 31.");
    await Q.saveSettings({
      house_name: str(fd, "house_name") || "Nhà trọ",
      elec_price: Math.max(intOf(fd, "elec_price"), 0),
      water_quota: quota,
      water_low: Math.max(intOf(fd, "water_low"), 0),
      water_high: Math.max(intOf(fd, "water_high"), 0),
      fee_day: feeDay,
    });
    // Giá mới áp dụng luôn cho hóa đơn tháng hiện tại chưa thu tiền.
    const period = currentPeriod();
    const n = await Q.applyPricesToPeriod(period);
    return n > 0
      ? `Đã lưu cài đặt và áp dụng giá mới cho ${n} hóa đơn ${periodName(period)}. Hóa đơn tháng cũ và hóa đơn đã thu giữ nguyên giá cũ.`
      : "Đã lưu cài đặt. Hóa đơn tháng cũ và hóa đơn đã thu giữ nguyên giá cũ.";
  });
}

function methodOf(fd: FormData): FeeMethod {
  const m = str(fd, "method");
  return m === "per_person" || m === "per_unit" ? m : "fixed";
}

export async function createFeeTypeAction(fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name");
  const roomId = intOf(fd, "room");
  await run(
    safeBack(fd, "/admin/phong"),
    roomId
      ? "Đã thêm loại phí cho phòng này. Các phòng khác đang tắt, bật ở trang từng phòng."
      : "Đã thêm loại phí.",
    async () => {
      if (!name) throw new Error("Hãy nhập tên loại phí.");
      await Q.createFeeType(name, methodOf(fd), Math.max(intOf(fd, "amount"), 0), roomId || undefined);
      const period = str(fd, "period");
      if (roomId && isPeriod(period)) await Q.refreshInvoiceFees(roomId, period);
    },
  );
}

export async function updateFeeTypeAction(fd: FormData) {
  await requireAdmin();
  const id = intOf(fd, "id");
  const name = str(fd, "name");
  await run(safeBack(fd, "/admin/phong"), "Đã lưu loại phí.", async () => {
    if (!name) throw new Error("Tên loại phí không được để trống.");
    await Q.updateFeeType(id, name, methodOf(fd), Math.max(intOf(fd, "amount"), 0), fd.get("active") === "on");
  });
}

/** Xóa một loại phí khỏi mọi phòng. `id` được gắn sẵn bằng bind ở nút Xóa. */
export async function deleteFeeTypeAction(id: number, fd: FormData) {
  await requireAdmin();
  const roomId = intOf(fd, "room");
  const period = str(fd, "period");
  await run(safeBack(fd, "/admin/phong"), "Đã xóa loại phí khỏi tất cả các phòng. Hóa đơn đã công bố không bị ảnh hưởng.", async () => {
    await Q.deleteFeeType(id);
    // Hóa đơn chưa công bố thì cập nhật theo danh sách phí mới; hóa đơn đã công bố giữ nguyên.
    if (roomId && isPeriod(period)) {
      const inv = await Q.getInvoice(roomId, period);
      if (inv && !inv.published) await Q.refreshInvoiceFees(roomId, period);
    }
  });
}
