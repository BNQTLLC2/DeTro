import { describe, expect, it } from "vitest";
import { computeFees, computeInvoice, type BillingInput, type FeeType, type RoomFee } from "@/lib/billing";
import { feeDueDate, normalizePhone, periodLabel, periodName, periodRange, periodShort, rentDay, rentDueDate, rentRange, shiftPeriod, transferNote } from "@/lib/format";

const base: BillingInput = {
  rent: 2800000,
  occupants: 3,
  elecStart: 1512,
  elecEnd: 1647,
  waterStart: 308,
  waterEnd: 322,
  elecPrice: 3500,
  waterQuotaPerPerson: 4,
  waterLow: 15000,
  waterHigh: 25000,
  fees: [{ name: "Tiền rác", amount: 45000 }],
  adjustments: [],
};

describe("computeInvoice", () => {
  it("tính điện theo kWh", () => {
    const r = computeInvoice(base);
    expect(r.kwh).toBe(135);
    expect(r.elecAmount).toBe(472500);
  });

  it("tính nước bậc theo số người: trong và vượt định mức", () => {
    const r = computeInvoice(base); // 14 m³, định mức 3×4 = 12
    expect(r.m3).toBe(14);
    expect(r.quota).toBe(12);
    expect(r.lowM3).toBe(12);
    expect(r.highM3).toBe(2);
    expect(r.lowAmount).toBe(180000);
    expect(r.highAmount).toBe(50000);
    expect(r.waterAmount).toBe(230000);
  });

  it("dùng ít hơn định mức thì không có phần giá cao", () => {
    const r = computeInvoice({ ...base, waterEnd: 315 }); // 7 m³ < 12
    expect(r.lowM3).toBe(7);
    expect(r.highM3).toBe(0);
    expect(r.waterAmount).toBe(105000);
  });

  it("tổng = phòng + điện + nước + phí + phát sinh (cho phép số âm)", () => {
    const r = computeInvoice({ ...base, adjustments: [{ name: "Giảm trừ", amount: -50000 }] });
    expect(r.total).toBe(2800000 + 472500 + 230000 + 45000 - 50000);
    expect(r.complete).toBe(true);
  });

  it("thiếu số điện thì chưa đủ để công bố và không tính tiền điện", () => {
    const r = computeInvoice({ ...base, elecEnd: null });
    expect(r.elecState).toBe("missing");
    expect(r.elecAmount).toBe(0);
    expect(r.complete).toBe(false);
  });

  it("số cuối nhỏ hơn số đầu bị đánh dấu không hợp lệ", () => {
    const r = computeInvoice({ ...base, waterEnd: 300 });
    expect(r.waterState).toBe("invalid");
    expect(r.complete).toBe(false);
    expect(r.waterAmount).toBe(0);
  });

  it("định mức nước thập phân và làm tròn về đồng", () => {
    const r = computeInvoice({ ...base, occupants: 1, waterQuotaPerPerson: 3.5, waterStart: 0, waterEnd: 4.5 });
    expect(r.quota).toBe(3.5);
    expect(r.highM3).toBe(1);
    expect(Number.isInteger(r.total)).toBe(true);
  });
});

describe("computeFees", () => {
  const types: FeeType[] = [
    { id: 1, name: "Tiền rác", method: "fixed", default_amount: 30000, active: true },
    { id: 2, name: "Wifi", method: "fixed", default_amount: 50000, active: true },
    { id: 3, name: "Gửi xe", method: "per_unit", default_amount: 100000, active: true },
    { id: 4, name: "Vệ sinh", method: "per_person", default_amount: 10000, active: true },
    { id: 5, name: "Cũ", method: "fixed", default_amount: 1000, active: false },
  ];
  const rf = (id: number, o: Partial<RoomFee> = {}): RoomFee => ({
    fee_type_id: id,
    enabled: true,
    amount: null,
    quantity: 1,
    ...o,
  });

  it("mỗi phòng một mức rác riêng", () => {
    expect(computeFees(types, [rf(1, { amount: 45000 })], 3)[0].amount).toBe(45000);
    expect(computeFees(types, [rf(1, { amount: 20000 })], 1)[0].amount).toBe(20000);
    expect(computeFees(types, [rf(1)], 1)[0].amount).toBe(30000);
  });

  it("theo số người, theo số lượng, bỏ phí tắt/không hoạt động/bằng 0", () => {
    const fees = computeFees(
      types,
      [rf(1, { enabled: false }), rf(3, { quantity: 2 }), rf(4), rf(5), rf(2, { amount: 0 })],
      3,
    );
    expect(fees.map((f) => [f.name, f.amount])).toEqual([
      ["Gửi xe", 200000],
      ["Vệ sinh", 30000],
    ]);
  });
});

describe("format", () => {
  it("chuẩn hóa số điện thoại", () => {
    expect(normalizePhone("+84 912 345 678")).toBe("0912345678");
    expect(normalizePhone("0912.345.678")).toBe("0912345678");
  });
  it("nội dung chuyển khoản không dấu", () => {
    expect(transferNote("Phòng 3", "2026-11")).toBe("PHONG 3 11/2026");
  });
  it("kỳ tính và hạn đóng", () => {
    expect(shiftPeriod("2026-01", -1)).toBe("2025-12");
    expect(periodRange("2026-11", 20)).toBe("21/10 – 20/11");
    expect(periodRange("2026-03", 31)).toBe("01/03 – 31/03");
  });
  it("tiền trọ thu theo ngày vào ở, thu sau", () => {
    expect(rentDay("2026-03-15", 20)).toBe(15);
    expect(rentDay("", 20)).toBe(20); // chưa nhập ngày vào ở thì dùng ngày chốt số
    expect(rentDueDate("2026-11", "2026-03-15", 20)).toBe("15/11/2026");
    expect(rentDueDate("2026-02", "2026-01-31", 20)).toBe("28/02/2026"); // tháng ngắn
    expect(rentRange("2026-11", "2026-03-15", 20)).toBe("15/10 – 14/11");
    expect(rentRange("2026-11", "2026-03-01", 20)).toBe("01/10 – 31/10");
  });
  it("chi phí khác thu vào ngày cố định hằng tháng, ngày thu đầu tiên sau ngày chốt số", () => {
    expect(feeDueDate("2026-11", 20, 6)).toBe("06/12/2026"); // chốt 20, thu ngày 6 tháng sau
    expect(feeDueDate("2026-11", 3, 6)).toBe("06/11/2026"); // chốt 3, kịp thu ngày 6 cùng tháng
    expect(feeDueDate("2026-12", 20, 6)).toBe("06/01/2027");
  });

  it("tên tháng hiển thị là tháng sử dụng (kỳ chốt đầu tháng 11 là tháng 10)", () => {
    expect(periodLabel("2026-11")).toBe("10/2026");
    expect(periodName("2026-11")).toBe("tháng 10/2026");
    expect(periodShort("2026-11")).toBe("T10");
    expect(periodLabel("2026-01")).toBe("12/2025");
  });
});
