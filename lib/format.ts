// Định dạng tiền, ngày, kỳ tính. Dùng được ở cả server và client.

export function money(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function moneyD(n: number): string {
  return money(n) + "đ";
}

const TZ = "Asia/Ho_Chi_Minh";

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function todayVN(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

export function currentPeriod(): string {
  return todayVN().slice(0, 7);
}

export function isPeriod(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Tháng sử dụng của một kỳ. Kỳ tính luôn bắt đầu từ tháng trước ngày chốt, nên kỳ "2026-11"
 * (ví dụ 02/10 – 01/11, chốt số đầu tháng 11) là số điện nước của tháng 10.
 * Khóa kỳ trong cơ sở dữ liệu vẫn giữ nguyên, chỉ tên hiển thị đổi.
 */
export function usageMonth(period: string): string {
  return shiftPeriod(period, -1);
}

/** "2026-11" -> "10/2026" (tháng sử dụng) */
export function periodLabel(period: string): string {
  const [y, m] = usageMonth(period).split("-");
  return `${Number(m)}/${y}`;
}

/** "2026-11" -> "tháng 10/2026" */
export function periodName(period: string): string {
  return `tháng ${periodLabel(period)}`;
}

/** "2026-11" -> "T10" */
export function periodShort(period: string): string {
  return `T${Number(usageMonth(period).split("-")[1])}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function clampDay(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m - 1, Math.min(Math.max(day, 1), daysInMonth(y, m))));
}

function dm(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function dmy(d: Date): string {
  return `${dm(d)}/${d.getUTCFullYear()}`;
}

/** Kỳ tính: từ ngày sau ngày chốt tháng trước đến ngày chốt tháng này. */
export function periodRange(period: string, billingDay: number): string {
  const [y, m] = period.split("-").map(Number);
  const end = clampDay(y, m, billingDay);
  const prev = shiftPeriod(period, -1).split("-").map(Number);
  const startBase = clampDay(prev[0], prev[1], billingDay);
  const start = new Date(startBase.getTime() + 86400000);
  return `${dm(start)} – ${dm(end)}`;
}

/** Ngày thu tiền trọ mỗi tháng = ngày trong tháng của ngày vào ở (không có thì dùng ngày chốt số). */
export function rentDay(moveInDate: string, billingDay: number): number {
  const m = /^\d{4}-\d{2}-(\d{2})$/.exec(moveInDate ?? "");
  const d = m ? Number(m[1]) : billingDay;
  return Math.min(Math.max(d, 1), 31);
}

/** Hạn đóng tiền trọ của kỳ `period`: ngày vào ở trong tháng đó (thu sau, cho kỳ thuê tháng trước đến nay). */
export function rentDueDate(period: string, moveInDate: string, billingDay: number): string {
  const [y, m] = period.split("-").map(Number);
  return dmy(clampDay(y, m, rentDay(moveInDate, billingDay)));
}

/** Như rentDueDate nhưng dạng YYYY-MM-DD (để so với todayVN). */
export function rentDueISO(period: string, moveInDate: string, billingDay: number): string {
  const [y, m] = period.split("-").map(Number);
  return clampDay(y, m, rentDay(moveInDate, billingDay)).toISOString().slice(0, 10);
}

/**
 * Kỳ `period` có phải kỳ thu tiền trọ của phòng không. Phòng thu mỗi tháng (cycle = 1) thì kỳ nào cũng thu.
 * Phòng thu 3 tháng một lần thì chỉ thu ở các kỳ cách tháng vào ở đúng bội số của 3 (vào ở 29/10 thì thu
 * ngày 29/1, 29/4, ...), mỗi lần trả cho 3 tháng liền trước. Chưa có ngày vào ở thì tính từ tháng 1/2000.
 */
export function isRentPeriod(period: string, moveInDate: string, cycle: number): boolean {
  if (cycle <= 1) return true;
  const anchor = /^\d{4}-\d{2}/.test(moveInDate ?? "") ? moveInDate.slice(0, 7) : "2000-01";
  const [ay, am] = anchor.split("-").map(Number);
  const [y, m] = period.split("-").map(Number);
  const diff = (y - ay) * 12 + (m - am);
  return diff > 0 && diff % cycle === 0;
}

/** Số tiền trọ của phòng ở kỳ `period`: giá thuê × số tháng của chu kỳ; kỳ không thu thì 0. */
export function rentForPeriod(
  room: { rent: number; rent_cycle: number; move_in_date: string },
  period: string,
): number {
  const cycle = Math.max(room.rent_cycle || 1, 1);
  return isRentPeriod(period, room.move_in_date, cycle) ? room.rent * cycle : 0;
}

/** Tên đợt thu tiền trọ: "Tiền trọ" hoặc "Tiền trọ 3 tháng". */
export function rentLabel(cycle: number): string {
  return cycle > 1 ? `Tiền trọ ${cycle} tháng` : "Tiền trọ";
}

/** Kỳ thuê của tiền trọ: từ ngày vào ở `cycle` tháng trước đến hết ngày liền trước ngày vào ở tháng này. */
export function rentRange(period: string, moveInDate: string, billingDay: number, cycle = 1): string {
  const day = rentDay(moveInDate, billingDay);
  const [y, m] = period.split("-").map(Number);
  const prev = shiftPeriod(period, -Math.max(cycle, 1)).split("-").map(Number);
  const start = clampDay(prev[0], prev[1], day);
  const end = new Date(clampDay(y, m, day).getTime() - 86400000);
  return `${dm(start)} – ${dm(end)}`;
}

/**
 * Hạn đóng các chi phí khác (điện, nước, phí): ngày cố định hằng tháng `feeDay`.
 * Ngày thu đầu tiên sau ngày chốt số của kỳ (ví dụ chốt ngày 20, thu ngày 6 thì thu ngày 6 tháng sau).
 */
export function feeDueDate(period: string, billingDay: number, feeDay: number): string {
  const [y, m] = period.split("-").map(Number);
  const f = Math.min(Math.max(feeDay, 1), 31);
  if (f > billingDay) return dmy(clampDay(y, m, f));
  const [ny, nm] = shiftPeriod(period, 1).split("-").map(Number);
  return dmy(clampDay(ny, nm, f));
}

/** "2026-11-20" -> "20/11" */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Chuẩn hóa số điện thoại: chỉ giữ chữ số; +84... -> 0... */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+84")) d = "0" + d.slice(3);
  else if (d.startsWith("84") && d.length >= 11) d = "0" + d.slice(2);
  return d.replace(/\D/g, "");
}

/** Bỏ dấu tiếng Việt, viết hoa: dùng cho nội dung chuyển khoản. */
export function transferNote(roomName: string, period: string): string {
  const base = roomName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .toUpperCase();
  // Nội dung chuyển khoản giữ theo khóa kỳ (tháng/năm của kỳ), không đổi theo tên hiển thị.
  const [y, m] = period.split("-");
  return `${base} ${Number(m)}/${y}`.trim();
}
