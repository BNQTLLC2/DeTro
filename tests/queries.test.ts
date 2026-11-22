// Chạy toàn bộ luồng với Postgres thật (PGlite chạy trong bộ nhớ).
import { beforeAll, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = ""; // trong bộ nhớ
delete process.env.DATABASE_URL;

type Q = typeof import("@/lib/queries");
let Qm: Q;

beforeAll(async () => {
  Qm = await import("@/lib/queries");
});

describe("luồng chủ trọ -> người thuê", () => {
  it("khởi tạo sẵn 9 phòng, cài đặt và phí rác/wifi", async () => {
    const rooms = await Qm.listRooms();
    expect(rooms).toHaveLength(9);
    const types = await Qm.listFeeTypes();
    expect(types.map((t) => t.name)).toEqual(["Tiền rác", "Wifi"]);
    const s = await Qm.getSettings();
    expect(s.elec_price).toBe(3500);
    expect(new Set(rooms.map((r) => r.token)).size).toBe(9);
    expect(rooms[0].token).toMatch(/^[0-9a-f]{32}$/);
  });

  it("nhập điện và nước ở hai thời điểm khác nhau, công bố, người thuê chỉ thấy hóa đơn đã công bố", async () => {
    const [room] = await Qm.listRooms();
    await Qm.saveRoom(room.id, {
      name: "Phòng 3", rent: 2800000, tenant_name: "Thu Hà", tenant_phone: "0912345678",
      occupants: 3, deposit: 0, move_in_date: "", billing_day: 20, is_vacant: false, init_elec: 1512, init_water: 308,
    });
    await Qm.saveRoomFees(room.id, [{ fee_type_id: (await Qm.listFeeTypes())[0].id, enabled: true, amount: 45000, quantity: 1 }]);

    const period = "2026-11";
    expect(await Qm.readingDefaults((await Qm.getRoom(room.id))!, null, period)).toEqual({ elecStart: 1512, waterStart: 308 });

    // Chỉ nhập điện trước
    await Qm.saveReading(room.id, period, "elec", 1512, 1647, "2026-11-20");
    let inv = (await Qm.getInvoice(room.id, period))!;
    expect(Qm.invoiceResult(inv).complete).toBe(false);
    await expect(Qm.publishInvoice(room.id, period)).rejects.toThrow(/đủ/);
    expect(await Qm.listPublishedInvoices(room.id)).toHaveLength(0);

    // Nhập nước sau
    await Qm.saveReading(room.id, period, "water", 308, 322, "2026-11-21");
    inv = (await Qm.getInvoice(room.id, period))!;
    const r = Qm.invoiceResult(inv);
    expect(r.complete).toBe(true);
    expect(r.total).toBe(2800000 + 472500 + 230000 + 45000);
    expect(inv.elec_read_at).toBe("2026-11-20");
    expect(inv.water_read_at).toBe("2026-11-21");

    // Chưa công bố -> người thuê chưa thấy
    expect(await Qm.listPublishedInvoices(room.id)).toHaveLength(0);
    await Qm.publishInvoice(room.id, period);
    expect(await Qm.listPublishedInvoices(room.id)).toHaveLength(1);

    // Đổi giá điện sau khi công bố không làm đổi hóa đơn đã công bố
    await Qm.saveSettings({ elec_price: 4000 });
    const after = (await Qm.getInvoice(room.id, period))!;
    expect(Qm.invoiceResult(after).total).toBe(r.total);

    // Đánh dấu đã thu
    await Qm.setPaid(room.id, period, true);
    expect((await Qm.getInvoice(room.id, period))!.paid_at).toBeTruthy();

    // Sửa số sau khi công bố -> tự về chưa công bố
    await Qm.saveReading(room.id, period, "elec", 1512, 1650, "2026-11-22");
    expect((await Qm.getInvoice(room.id, period))!.published).toBe(false);
    expect(await Qm.listPublishedInvoices(room.id)).toHaveLength(0);
    // Giá vẫn là giá đã chốt lúc công bố (3.500), không đổi sang 4.000
    expect((await Qm.getInvoice(room.id, period))!.elec_price).toBe(3500);
    await Qm.saveSettings({ elec_price: 3500 });
  });

  it("số đầu kỳ sau tự lấy từ số cuối kỳ trước; từ chối số cuối nhỏ hơn số đầu", async () => {
    const [room] = await Qm.listRooms();
    const d = await Qm.readingDefaults(room, null, "2026-12");
    expect(d.elecStart).toBe(1650);
    expect(d.waterStart).toBe(322);
    await expect(Qm.saveReading(room.id, "2026-12", "elec", 1650, 1600)).rejects.toThrow(/nhỏ hơn/);
  });

  it("công bố tất cả chỉ áp dụng cho phòng đã đủ số và bỏ qua phòng trống", async () => {
    const rooms = await Qm.listRooms();
    const period = "2026-10";
    for (const r of rooms.slice(0, 3)) {
      await Qm.saveReading(r.id, period, "elec", 0, 100);
      await Qm.saveReading(r.id, period, "water", 0, 5);
    }
    await Qm.saveReading(rooms[3].id, period, "elec", 0, 100); // thiếu nước
    await Qm.saveRoom(rooms[2].id, { ...rooms[2], is_vacant: true });
    expect(await Qm.publishAll(period)).toBe(2);
    expect(await Qm.publishAll(period)).toBe(0);
  });

  it("phát sinh: thêm, bỏ, cho phép số âm", async () => {
    const [room] = await Qm.listRooms();
    await Qm.addAdjustment(room.id, "2026-12", "Sửa vòi nước", 120000);
    await Qm.addAdjustment(room.id, "2026-12", "Giảm trừ", -20000);
    let inv = (await Qm.getInvoice(room.id, "2026-12"))!;
    expect(Qm.invoiceResult(inv).adjustmentsTotal).toBe(100000);
    await Qm.removeAdjustment(room.id, "2026-12", 0);
    inv = (await Qm.getInvoice(room.id, "2026-12"))!;
    expect(inv.adjustments).toEqual([{ name: "Giảm trừ", amount: -20000 }]);
  });

  it("đổi giá áp dụng ngay cho hóa đơn kỳ chỉ định chưa công bố, bỏ qua hóa đơn đã công bố và kỳ khác", async () => {
    const rooms = await Qm.listRooms();
    const [a, b] = rooms.slice(-2);
    const period = "2026-08";
    const before = await Qm.getSettings();

    await Qm.saveReading(a.id, period, "elec", 0, 100);
    await Qm.saveReading(a.id, period, "water", 0, 5);
    await Qm.saveReading(b.id, period, "elec", 0, 100);
    await Qm.saveReading(b.id, "2026-07", "elec", 0, 50); // kỳ khác
    await Qm.publishInvoice(a.id, period); // chốt giá cũ

    await Qm.saveSettings({ elec_price: 4200, water_quota: 5, water_low: 8000, water_high: 20000 });
    expect(await Qm.applyPricesToPeriod(period)).toBe(1); // chỉ hóa đơn của b

    const ia = (await Qm.getInvoice(a.id, period))!;
    expect(ia.elec_price).toBe(before.elec_price); // đã công bố -> giữ giá cũ
    const ib = (await Qm.getInvoice(b.id, period))!;
    expect([ib.elec_price, ib.water_quota, ib.water_low, ib.water_high]).toEqual([4200, 5, 8000, 20000]);
    const other = (await Qm.getInvoice(b.id, "2026-07"))!;
    expect(other.elec_price).toBe(before.elec_price); // kỳ khác không bị đụng

    await Qm.saveSettings({
      elec_price: before.elec_price,
      water_quota: before.water_quota,
      water_low: before.water_low,
      water_high: before.water_high,
    });
  });

  it("đổi link của phòng làm link cũ không còn dùng được", async () => {
    const [room] = await Qm.listRooms();
    expect((await Qm.getRoomByToken(room.token))?.id).toBe(room.id);
    await Qm.regenerateToken(room.id);
    expect(await Qm.getRoomByToken(room.token)).toBeNull();
    expect(await Qm.getRoomByToken("../../etc/passwd")).toBeNull();
  });

  it("thêm loại phí mới và phòng mới tự có dòng phí; giới hạn đăng nhập sai", async () => {
    await Qm.createFeeType("Gửi xe", "per_unit", 100000);
    const id = await Qm.createRoom("Phòng 10");
    const rows = await Qm.getRoomFeeRows(id);
    expect(rows.map((r) => r.name)).toEqual(["Tiền rác", "Wifi", "Gửi xe"]);
    expect(rows.every((r) => r.enabled)).toBe(true);

    expect(await Qm.isLoginLocked("1.2.3.4")).toBe(false);
    for (let i = 0; i < 5; i++) await Qm.recordLoginFailure("1.2.3.4");
    expect(await Qm.isLoginLocked("1.2.3.4")).toBe(true);
    expect(await Qm.isLoginLocked("5.6.7.8")).toBe(false);
    await Qm.clearLoginFailures("1.2.3.4");
    expect(await Qm.isLoginLocked("1.2.3.4")).toBe(false);
  });
});
