// Tích hợp SePay (https://developer.sepay.vn):
// - Mỗi phòng một tài khoản định danh (VA) khai báo bằng biến môi trường VA_<TÊN PHÒNG>, ví dụ VA_PHONG101.
// - Tạo ảnh QR chuyển khoản (vietqr.app/img) tới VA của phòng.
// - Webhook "tiền vào" của SePay khớp giao dịch với phòng theo số VA nhận tiền.

export const QR_BASE = "https://vietqr.app/img";

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

/** Chuẩn hóa số tài khoản / VA: bỏ khoảng trắng, gạch, viết hoa. */
export function normalizeAccount(s: string | null | undefined): string {
  return (s ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/** Tên biến môi trường chứa VA của phòng, bỏ chữ "Phòng" đầu tên: "Phòng 101" hoặc "101" đều ra VA_101. */
export function vaEnvKey(roomName: string): string {
  return `VA_${compact(roomName.replace(/^\s*Phòng\s*/i, ""))}`;
}

/** VA của một phòng lấy từ biến môi trường, rỗng nếu chưa khai báo. */
export function roomVa(roomName: string): string {
  return normalizeAccount(process.env[vaEnvKey(roomName)]);
}

export type PaymentPart = "rent" | "other";

/** Đợt thu của một giao dịch: tiền trọ, chi phí khác, hoặc gộp cả hai trong một lần chuyển ("all"). */
export type PayTarget = PaymentPart | "all";

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
    subAccount: o.subAccount === null || o.subAccount === undefined ? null : String(o.subAccount),
    code: o.code === null || o.code === undefined ? null : String(o.code),
    content: String(o.content ?? ""),
    transferType: o.transferType,
    transferAmount: Math.round(amount),
    referenceCode: o.referenceCode === undefined ? undefined : String(o.referenceCode),
  };
}
