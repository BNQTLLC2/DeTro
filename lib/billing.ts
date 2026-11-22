// Tính tiền hóa đơn. Hàm thuần, không đụng database, có unit test (tests/billing.test.ts).

export type Fee = { name: string; amount: number; detail?: string };

export type BillingInput = {
  rent: number;
  occupants: number;
  elecStart: number | null;
  elecEnd: number | null;
  waterStart: number | null;
  waterEnd: number | null;
  elecPrice: number; // đ / kWh
  waterQuotaPerPerson: number; // m³ giá rẻ mỗi người
  waterLow: number; // đ / m³ trong định mức
  waterHigh: number; // đ / m³ vượt định mức
  fees: Fee[];
  adjustments: Fee[];
};

export type ReadingState = "missing" | "invalid" | "ok";

export type BillingResult = {
  elecState: ReadingState;
  waterState: ReadingState;
  kwh: number;
  elecAmount: number;
  m3: number;
  quota: number;
  lowM3: number;
  highM3: number;
  lowAmount: number;
  highAmount: number;
  waterAmount: number;
  feesTotal: number;
  adjustmentsTotal: number;
  total: number;
  /** Đã có đủ số điện và số nước hợp lệ, có thể công bố. */
  complete: boolean;
};

export function readingState(start: number | null, end: number | null): ReadingState {
  if (end === null || start === null || Number.isNaN(end) || Number.isNaN(start)) return "missing";
  if (end < start) return "invalid";
  return "ok";
}

export function computeInvoice(i: BillingInput): BillingResult {
  const elecState = readingState(i.elecStart, i.elecEnd);
  const waterState = readingState(i.waterStart, i.waterEnd);

  const kwh = elecState === "ok" ? (i.elecEnd as number) - (i.elecStart as number) : 0;
  const elecAmount = Math.round(kwh * i.elecPrice);

  const m3 = waterState === "ok" ? (i.waterEnd as number) - (i.waterStart as number) : 0;
  const quota = Math.max(i.occupants, 0) * i.waterQuotaPerPerson;
  const lowM3 = Math.min(m3, quota);
  const highM3 = Math.max(m3 - quota, 0);
  const lowAmount = Math.round(lowM3 * i.waterLow);
  const highAmount = Math.round(highM3 * i.waterHigh);
  const waterAmount = lowAmount + highAmount;

  const feesTotal = i.fees.reduce((s, f) => s + f.amount, 0);
  const adjustmentsTotal = i.adjustments.reduce((s, f) => s + f.amount, 0);
  const total = i.rent + elecAmount + waterAmount + feesTotal + adjustmentsTotal;

  return {
    elecState,
    waterState,
    kwh,
    elecAmount,
    m3,
    quota,
    lowM3,
    highM3,
    lowAmount,
    highAmount,
    waterAmount,
    feesTotal,
    adjustmentsTotal,
    total,
    complete: elecState === "ok" && waterState === "ok",
  };
}

export type FeeMethod = "fixed" | "per_person" | "per_unit";

export type FeeType = {
  id: number;
  name: string;
  method: FeeMethod;
  default_amount: number;
  active: boolean;
};

export type RoomFee = {
  fee_type_id: number;
  enabled: boolean;
  /** Mức riêng của phòng; null = dùng mức mặc định của loại phí. */
  amount: number | null;
  quantity: number;
};

export const FEE_METHOD_LABEL: Record<FeeMethod, string> = {
  fixed: "Cố định mỗi phòng",
  per_person: "Theo số người",
  per_unit: "Theo số lượng (ví dụ số xe)",
};

const money = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Tính danh sách phí của một phòng. Phí = 0 không được đưa vào. */
export function computeFees(types: FeeType[], roomFees: RoomFee[], occupants: number): Fee[] {
  const byType = new Map(roomFees.map((r) => [r.fee_type_id, r]));
  const out: Fee[] = [];
  for (const t of types) {
    if (!t.active) continue;
    const rf = byType.get(t.id);
    if (!rf || !rf.enabled) continue;
    const unit = rf.amount ?? t.default_amount;
    let amount = unit;
    let detail: string | undefined;
    if (t.method === "per_person") {
      amount = unit * occupants;
      detail = `${occupants} người × ${money(unit)}đ`;
    } else if (t.method === "per_unit") {
      amount = unit * rf.quantity;
      detail = `${rf.quantity} × ${money(unit)}đ`;
    }
    amount = Math.round(amount);
    if (amount > 0) out.push({ name: t.name, amount, detail });
  }
  return out;
}
