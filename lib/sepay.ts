// Tích hợp SePay (https://developer.sepay.vn):
// - Tạo ảnh QR chuyển khoản (vietqr.app/img).
// - Mã thanh toán gắn với hóa đơn, để webhook "tiền vào" của SePay tự khớp và đánh dấu đã thu.

export const QR_BASE = "https://vietqr.app/img";
export const DEFAULT_PREFIX = "TRO";

/** Bỏ dấu tiếng Việt, viết hoa, chỉ giữ chữ và số. */
function compact(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

export function isValidPrefix(p: string): boolean {
  return /^[A-Za-z]{2,8}$/.test(p);
}

export type PaymentPart = "rent" | "other";

/** Đợt thu của một giao dịch: tiền trọ, chi phí khác, hoặc gộp cả hai trong một lần chuyển ("all"). */
export type PayTarget = PaymentPart | "all";

/** Từ khóa phân biệt đợt thu tiền trọ trong nội dung chuyển khoản. */
const RENT_TAG = "TIENTRO";
/** Từ khóa của mã QR gộp (tiền trọ + điện, nước, phí khác chuyển một lần). */
const ALL_TAG = "TONG";

/**
 * Nội dung chuyển khoản, mỗi đợt thu một mã riêng (`period` dạng "YYYY-MM"):
 * - Chi phí khác (điện, nước, phí): "<TIỀN TỐ>_<TÊN PHÒNG>_<THÁNG>/<NĂM>", ví dụ "DETRO_PHONG1_11/2026".
 * - Tiền trọ: "<TIỀN TỐ>_<TÊN PHÒNG>_TIENTRO_<THÁNG>/<NĂM>", ví dụ "DETRO_PHONG1_TIENTRO_11/2026".
 * - Gộp cả hai: "<TIỀN TỐ>_<TÊN PHÒNG>_TONG_<THÁNG>/<NĂM>", ví dụ "DETRO_PHONG1_TONG_11/2026".
 */
export function paymentContent(prefix: string, roomName: string, period: string, part: PayTarget = "other"): string {
  const [y, m] = period.split("-");
  const name = compact(roomName);
  const tag = part === "rent" ? RENT_TAG : part === "all" ? ALL_TAG : "";
  return [prefix.toUpperCase(), name, tag, `${m}/${y}`].filter(Boolean).join("_");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Tìm phòng và tháng trong nội dung chuyển khoản dạng "<TIỀN TỐ>_<TÊN PHÒNG>_<MM>/<YYYY>".
 * Bỏ hết ký tự không phải chữ/số trước khi so, nên vẫn khớp khi ngân hàng bỏ "_", "/" hoặc khoảng trắng.
 * Trả về null nếu không thấy.
 */
export function parsePaymentRef(
  prefix: string,
  content: string,
  rooms: { id: number; name: string }[],
): { roomId: number; period: string } | null {
  if (!isValidPrefix(prefix)) return null;
  const text = compact(content);
  for (const r of rooms) {
    const name = compact(r.name);
    if (!name) continue;
    const re = new RegExp(`${escapeRe(compact(prefix))}${escapeRe(name)}(\\d{2})(20\\d{2})(?!\\d)`);
    const m = re.exec(text);
    if (!m) continue;
    const month = Number(m[1]);
    if (month < 1 || month > 12) continue;
    return { roomId: r.id, period: `${m[2]}-${m[1]}` };
  }
  return null;
}

/**
 * Như parsePaymentRef nhưng nhận cả mã tiền trọ ("..._TIENTRO_MM/YYYY") và cho biết giao dịch thuộc đợt thu nào.
 */
export function parsePaymentTarget(
  prefix: string,
  content: string,
  rooms: { id: number; name: string }[],
): { roomId: number; period: string; part: PayTarget } | null {
  if (!isValidPrefix(prefix)) return null;
  const text = compact(content);
  for (const r of rooms) {
    const name = compact(r.name);
    if (!name) continue;
    const re = new RegExp(`${escapeRe(compact(prefix))}${escapeRe(name)}(${RENT_TAG}|${ALL_TAG})?(\\d{2})(20\\d{2})(?!\\d)`);
    const m = re.exec(text);
    if (!m) continue;
    const month = Number(m[2]);
    if (month < 1 || month > 12) continue;
    return { roomId: r.id, period: `${m[3]}-${m[2]}`, part: m[1] === RENT_TAG ? "rent" : m[1] === ALL_TAG ? "all" : "other" };
  }
  return null;
}

/**
 * Lấy mã hóa đơn từ giao dịch SePay. Ưu tiên trường `code` (SePay tự trích theo cấu hình),
 * không có thì tìm trong nội dung chuyển khoản. Trả về null nếu không thấy.
 */
export function parsePaymentCode(prefix: string, code: string | null, content: string): number | null {
  if (!isValidPrefix(prefix)) return null;
  const re = new RegExp(`${escapeRe(prefix)}(\\d{1,9})`, "i");
  for (const src of [code ?? "", content]) {
    const m = re.exec(src);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Địa chỉ ảnh QR của SePay. `bank` nhận tên ngắn, mã hoặc BIN của ngân hàng (ví dụ VCB, MB, BIDV). */
export function sepayQrUrl(o: {
  account: string;
  bank: string;
  amount?: number;
  content?: string;
  download?: boolean;
}): string {
  const e = encodeURIComponent;
  const parts = [`acc=${e(o.account)}`, `bank=${e(o.bank)}`];
  if (o.amount && o.amount > 0) parts.push(`amount=${Math.round(o.amount)}`);
  if (o.content) parts.push(`des=${e(o.content)}`);
  parts.push("template=compact");
  if (o.download) parts.push("download=true");
  return `${QR_BASE}?${parts.join("&")}`;
}

export type SepayPayload = {
  id: number;
  gateway: string;
  transactionDate: string;
  accountNumber: string;
  code: string | null;
  content: string;
  transferType: "in" | "out";
  transferAmount: number;
  accumulated?: number;
  subAccount?: string | null;
  referenceCode?: string;
  description?: string;
};

/** Kiểm tra và chuẩn hóa dữ liệu webhook. Trả về null nếu thiếu/sai trường bắt buộc. */
export function parsePayload(raw: unknown): SepayPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = Number(o.id);
  const amount = Number(o.transferAmount);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (o.transferType !== "in" && o.transferType !== "out") return null;
  return {
    id,
    gateway: String(o.gateway ?? ""),
    transactionDate: String(o.transactionDate ?? ""),
    accountNumber: String(o.accountNumber ?? ""),
    code: o.code === null || o.code === undefined ? null : String(o.code),
    content: String(o.content ?? ""),
    transferType: o.transferType,
    transferAmount: Math.round(amount),
    referenceCode: o.referenceCode === undefined ? undefined : String(o.referenceCode),
  };
}
