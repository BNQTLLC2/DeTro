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

/** "2026-11" -> "11/2026" */
export function periodLabel(period: string): string {
  const [y, m] = period.split("-");
  return `${Number(m)}/${y}`;
}

/** "2026-11" -> "tháng 11/2026" */
export function periodName(period: string): string {
  return `tháng ${periodLabel(period)}`;
}

/** "2026-11" -> "T11" */
export function periodShort(period: string): string {
  return `T${Number(period.split("-")[1])}`;
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

/** Hạn đóng = ngày chốt + số ngày hạn đóng (cài đặt). */
export function dueDate(period: string, billingDay: number, dueDays: number): string {
  const [y, m] = period.split("-").map(Number);
  const end = clampDay(y, m, billingDay);
  return dmy(new Date(end.getTime() + dueDays * 86400000));
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
  return `${base} ${periodLabel(period)}`.trim();
}
