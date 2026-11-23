import { beforeAll, describe, expect, it } from "vitest";
import { normalizeAccount, parsePayload, roomVa, sepayQrUrl, vaEnvKey } from "@/lib/sepay";

describe("VA của phòng và QR", () => {
  it("tên biến môi trường theo tên phòng, bỏ chữ Phòng và dấu", () => {
    expect(vaEnvKey("Phòng 101")).toBe("VA_101");
    expect(vaEnvKey("101")).toBe("VA_101");
    expect(vaEnvKey("phòng A2")).toBe("VA_A2");
    expect(vaEnvKey("Đà Lạt 1")).toBe("VA_DALAT1");
  });

  it("đọc VA từ biến môi trường, bỏ khoảng trắng và gạch", () => {
    process.env.VA_TESTROOM9 = " 96 247-ABC 123 ";
    expect(roomVa("Phòng TestRoom9")).toBe("96247ABC123");
    expect(roomVa("Phòng KhongCo")).toBe("");
    delete process.env.VA_TESTROOM9;
    expect(normalizeAccount(null)).toBe("");
  });

  it("URL QR SePay và bản tải về", () => {
    const u = sepayQrUrl({ account: "VA123456", bank: "BIDV", amount: 3547500 });
    expect(u).toBe("https://vietqr.app/img?acc=VA123456&bank=BIDV&amount=3547500&template=compact");
    expect(sepayQrUrl({ account: "1", bank: "MB", download: true })).toContain("download=true");
    expect(sepayQrUrl({ account: "1", bank: "MB", amount: 0 })).not.toContain("amount");
  });

  it("kiểm tra dữ liệu webhook, giữ số VA (subAccount)", () => {
    const ok = {
      id: 92704, gateway: "BIDV", transactionDate: "2026-11-22 14:02:37", accountNumber: "0123456789",
      code: null, content: "bất kỳ", transferType: "in", transferAmount: 3547500, accumulated: 0,
      subAccount: "VA123456", referenceCode: "MBVCB.3278907687", description: "",
    };
    const p = parsePayload(ok);
    expect(p?.transferAmount).toBe(3547500);
    expect(p?.subAccount).toBe("VA123456");
    expect(parsePayload({ ...ok, id: -1 })).toBeNull();
    expect(parsePayload({ ...ok, transferAmount: 0 })).toBeNull();
    expect(parsePayload({ ...ok, transferType: "abc" })).toBeNull();
    expect(parsePayload(null)).toBeNull();
  });
});

describe("webhook /api/sepay khớp theo VA của phòng, với database thật", () => {
  let Q: typeof import("@/lib/queries");
  let POST: typeof import("@/app/api/sepay/route").POST;
  let roomId = 0;
  let invoiceId = 0;
  let total = 0;
  const VA = "VA0000001";

  const call = (body: unknown, auth: string | null = "Apikey khoa-bi-mat") =>
    POST(
      new Request("http://localhost/api/sepay", {
        method: "POST",
        headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );

  // Mặc định tiền vào đúng VA của phòng 1; nội dung chuyển khoản không quan trọng.
  const tx = (o: Record<string, unknown>) => ({
    id: 1001, gateway: "BIDV", transactionDate: "2026-11-22 14:02:37", accountNumber: "0123456789",
    code: null, content: "noi dung bi sua", transferType: "in", transferAmount: 1, accumulated: 0, subAccount: VA,
    referenceCode: "x", description: "", ...o,
  });

  const publishMonth = async (period: string, e0: number, e1: number, w0: number, w1: number) => {
    await Q.saveReading(roomId, period, "elec", e0, e1);
    await Q.saveReading(roomId, period, "water", w0, w1);
    await Q.publishInvoice(roomId, period);
    return (await Q.getInvoice(roomId, period))!;
  };

  beforeAll(async () => {
    process.env.PGLITE_DIR = "";
    delete process.env.DATABASE_URL;
    process.env.SEPAY_API_KEY = "khoa-bi-mat";
    process.env.BANK_CODE = "BIDV";
    Q = await import("@/lib/queries");
    ({ POST } = await import("@/app/api/sepay/route"));

    const [room] = await Q.listRooms();
    roomId = room.id;
    process.env[vaEnvKey(room.name)] = VA;
    await Q.saveRoom(room.id, { ...room, rent: 1000000, occupants: 1, tenant_name: "A", billing_day: 20 });
    const inv = await publishMonth("2026-11", 0, 100, 0, 2);
    invoiceId = inv.id;
    total = Q.invoiceResult(inv).othersTotal;
  });

  it("từ chối khi sai hoặc thiếu API key", async () => {
    expect((await call(tx({}), null)).status).toBe(401);
    expect((await call(tx({}), "Apikey sai")).status).toBe(401);
    expect((await call(tx({}), "Bearer khoa-bi-mat")).status).toBe(401);
  });

  it("dữ liệu sai trả 400, tiền ra bỏ qua nhưng báo thành công", async () => {
    expect((await call("không phải json")).status).toBe(400);
    expect((await call({ foo: 1 })).status).toBe(400);
    const out = await call(tx({ id: 5, transferType: "out" }));
    expect(out.status).toBe(200);
    expect(await out.json()).toEqual({ success: true });
    expect(await Q.receivedFor(invoiceId)).toBe(0);
  });

  it("tiền về thiếu: ghi nhận một phần, chưa đánh dấu đã thu", async () => {
    const res = await call(tx({ id: 11, transferAmount: 200000 }));
    expect(await res.json()).toEqual({ success: true });
    expect(await Q.receivedFor(invoiceId)).toBe(200000);
    expect((await Q.getInvoiceById(invoiceId))!.paid_at).toBeNull();
  });

  it("gửi lại cùng giao dịch không bị cộng hai lần", async () => {
    await call(tx({ id: 11, transferAmount: 200000 }));
    expect(await Q.receivedFor(invoiceId)).toBe(200000);
  });

  it("tiền về đủ thì tự đánh dấu đã thu theo ngày giao dịch, VA nằm ở accountNumber cũng khớp", async () => {
    await call(tx({ id: 12, subAccount: null, accountNumber: VA, transferAmount: total - 200000 }));
    expect((await Q.getInvoiceById(invoiceId))!.paid_at).toBe("2026-11-22");
    expect((await Q.listRecentPayments(1))[0].note).toMatch(/đã đủ tiền/);
  });

  it("tiền vào VA lạ hoặc không có VA thì vào danh sách chưa khớp, không đụng hóa đơn", async () => {
    await call(tx({ id: 21, subAccount: "VAKHAC999", transferAmount: 100 }));
    await call(tx({ id: 22, subAccount: null, accountNumber: "0123456789", transferAmount: 100 }));
    const un = await Q.listUnmatchedPayments();
    expect(un.map((p) => p.amount)).toEqual([100, 100]);
    expect(un.map((p) => p.note).join("|")).toMatch(/Không khớp tài khoản VA/);
    expect(await Q.receivedFor(invoiceId)).toBe(total);
  });

  it("VA đúng nhưng không còn khoản nào chờ thu thì ghi chưa khớp kèm lý do", async () => {
    await call(tx({ id: 31, transferAmount: 5000 }));
    const note = (await Q.listRecentPayments(1))[0].note;
    expect(note).toMatch(/không có khoản nào đang chờ thu/);
  });

  it("chọn đợt theo số tiền: đúng số tiền trọ tính tiền trọ, đúng số điện nước tính điện nước", async () => {
    const period = "2027-03";
    const inv = await publishMonth(period, 400, 500, 8, 10);
    const res = Q.invoiceResult(inv);
    expect(res.rent).toBe(1000000);
    await Q.publishRent(roomId, period);

    // Hóa đơn tháng cũ đã trả đủ nên hóa đơn cũ nhất còn nợ là 2027-03
    await call(tx({ id: 71, transferAmount: 1000000 }));
    let after = (await Q.getInvoiceById(inv.id))!;
    expect(after.rent_paid_at).toBe("2026-11-22");
    expect(after.paid_at).toBeNull();
    expect(await Q.receivedFor(inv.id, "rent")).toBe(1000000);

    await call(tx({ id: 72, transferAmount: res.othersTotal }));
    after = (await Q.getInvoiceById(inv.id))!;
    expect(after.paid_at).toBe("2026-11-22");
    expect(await Q.receivedFor(inv.id, "other")).toBe(res.othersTotal);
  });

  it("chuyển gộp đúng tổng cả hai đợt thì cả hai đợt cùng được đánh dấu đã thu", async () => {
    const period = "2027-04";
    const inv = await publishMonth(period, 500, 600, 10, 12);
    await Q.publishRent(roomId, period);
    const res = Q.invoiceResult((await Q.getInvoiceById(inv.id))!);
    await call(tx({ id: 81, transferAmount: res.rent + res.othersTotal }));
    const after = (await Q.getInvoiceById(inv.id))!;
    expect(after.rent_paid_at).toBe("2026-11-22");
    expect(after.paid_at).toBe("2026-11-22");
  });

  it("chưa cấu hình SEPAY_API_KEY thì từ chối mọi yêu cầu", async () => {
    delete process.env.SEPAY_API_KEY;
    expect((await call(tx({ id: 91 }))).status).toBe(503);
    process.env.SEPAY_API_KEY = "khoa-bi-mat";
  });
});
