import { beforeAll, describe, expect, it } from "vitest";
import { paymentContent, parsePaymentCode, parsePayload, sepayQrUrl, isValidPrefix } from "@/lib/sepay";

describe("mã thanh toán và QR", () => {
  it("nội dung chuyển khoản có mã hóa đơn và tên phòng không dấu", () => {
    expect(paymentContent("tro", 123, "Phòng 3")).toBe("TRO123 PHONG3");
    expect(paymentContent("TRO", 7, "")).toBe("TRO7");
  });

  it("lấy mã hóa đơn từ code hoặc từ nội dung, kể cả khi ngân hàng bỏ khoảng trắng", () => {
    expect(parsePaymentCode("TRO", "TRO123", "x")).toBe(123);
    expect(parsePaymentCode("TRO", null, "MBVCB.123 TRO45 PHONG3")).toBe(45);
    expect(parsePaymentCode("TRO", null, "TRO45PHONG311/2026")).toBe(45);
    expect(parsePaymentCode("TRO", null, "tro9 phong 1")).toBe(9);
    expect(parsePaymentCode("TRO", null, "chuyen tien")).toBeNull();
    expect(parsePaymentCode("T.O", null, "TXO5")).toBeNull(); // tiền tố sai định dạng không bị coi là regex
  });

  it("tiền tố hợp lệ", () => {
    expect(isValidPrefix("TRO")).toBe(true);
    expect(isValidPrefix("T")).toBe(false);
    expect(isValidPrefix("TRO1")).toBe(false);
  });

  it("URL QR SePay và bản tải về", () => {
    const u = sepayQrUrl({ account: "0123456789", bank: "VCB", amount: 3547500, content: "TRO123 PHONG3" });
    expect(u).toBe("https://vietqr.app/img?acc=0123456789&bank=VCB&amount=3547500&des=TRO123%20PHONG3&template=compact");
    expect(sepayQrUrl({ account: "1", bank: "MB", content: "A", download: true })).toContain("download=true");
    expect(sepayQrUrl({ account: "1", bank: "MB", amount: 0 })).not.toContain("amount");
  });

  it("kiểm tra dữ liệu webhook", () => {
    const ok = {
      id: 92704, gateway: "Vietcombank", transactionDate: "2026-11-22 14:02:37", accountNumber: "0123456789",
      code: null, content: "TRO1 PHONG3", transferType: "in", transferAmount: 3547500, accumulated: 0,
      subAccount: null, referenceCode: "MBVCB.3278907687", description: "",
    };
    expect(parsePayload(ok)?.transferAmount).toBe(3547500);
    expect(parsePayload({ ...ok, id: "x" })).toBeNull();
    expect(parsePayload({ ...ok, transferAmount: 0 })).toBeNull();
    expect(parsePayload({ ...ok, transferType: "abc" })).toBeNull();
    expect(parsePayload(null)).toBeNull();
  });
});

describe("webhook /api/sepay với database thật", () => {
  let Q: typeof import("@/lib/queries");
  let POST: typeof import("@/app/api/sepay/route").POST;
  let invoiceId = 0;
  let total = 0;

  const call = (body: unknown, auth: string | null = "Apikey khoa-bi-mat") =>
    POST(
      new Request("http://localhost/api/sepay", {
        method: "POST",
        headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );

  const tx = (o: Record<string, unknown>) => ({
    id: 1001, gateway: "Vietcombank", transactionDate: "2026-11-22 14:02:37", accountNumber: "0123456789",
    code: null, content: "", transferType: "in", transferAmount: 1, accumulated: 0, subAccount: null,
    referenceCode: "x", description: "", ...o,
  });

  beforeAll(async () => {
    process.env.PGLITE_DIR = "";
    delete process.env.DATABASE_URL;
    process.env.SEPAY_API_KEY = "khoa-bi-mat";
    Q = await import("@/lib/queries");
    ({ POST } = await import("@/app/api/sepay/route"));

    process.env.BANK_CODE = "VCB";
    process.env.BANK_ACCOUNT = "0123456789";
    process.env.BANK_HOLDER = "A";
    const [room] = await Q.listRooms();
    await Q.saveRoom(room.id, { ...room, rent: 1000000, occupants: 1, tenant_name: "A", billing_day: 20 });
    await Q.saveReading(room.id, "2026-11", "elec", 0, 100);
    await Q.saveReading(room.id, "2026-11", "water", 0, 2);
    await Q.publishInvoice(room.id, "2026-11");
    const inv = (await Q.getInvoice(room.id, "2026-11"))!;
    invoiceId = inv.id;
    total = Q.invoiceResult(inv).total;
  });

  it("từ chối khi sai hoặc thiếu API key", async () => {
    expect((await call(tx({}), null)).status).toBe(401);
    expect((await call(tx({}), "Apikey sai")).status).toBe(401);
    expect((await call(tx({}), "Bearer khoa-bi-mat")).status).toBe(401);
  });

  it("dữ liệu sai trả 400, tiền ra bỏ qua nhưng báo thành công", async () => {
    expect((await call("không phải json")).status).toBe(400);
    expect((await call({ foo: 1 })).status).toBe(400);
    const out = await call(tx({ id: 5, transferType: "out", content: `TRO${invoiceId}` }));
    expect(out.status).toBe(200);
    expect(await out.json()).toEqual({ success: true });
    expect(await Q.receivedFor(invoiceId)).toBe(0);
  });

  it("tiền về thiếu: ghi nhận một phần, chưa đánh dấu đã thu", async () => {
    const res = await call(tx({ id: 11, content: `TRO${invoiceId} PHONG1`, transferAmount: 500000 }));
    expect(await res.json()).toEqual({ success: true });
    expect(await Q.receivedFor(invoiceId)).toBe(500000);
    expect((await Q.getInvoiceById(invoiceId))!.paid_at).toBeNull();
  });

  it("gửi lại cùng giao dịch không bị cộng hai lần", async () => {
    const res = await call(tx({ id: 11, content: `TRO${invoiceId}`, transferAmount: 500000 }));
    expect(await res.json()).toEqual({ success: true });
    expect(await Q.receivedFor(invoiceId)).toBe(500000);
  });

  it("tiền về đủ thì tự đánh dấu đã thu theo ngày giao dịch", async () => {
    await call(tx({ id: 12, code: `TRO${invoiceId}`, content: "x", transferAmount: total - 500000 }));
    const inv = (await Q.getInvoiceById(invoiceId))!;
    expect(inv.paid_at).toBe("2026-11-22");
  });

  it("tiền về không có mã hoặc sai tài khoản thì vào danh sách chưa khớp, không đụng hóa đơn", async () => {
    await call(tx({ id: 21, content: "chuyen tien tro", transferAmount: 100 }));
    await call(tx({ id: 22, accountNumber: "9999999999", content: `TRO${invoiceId}`, transferAmount: 100 }));
    const un = await Q.listUnmatchedPayments();
    expect(un.map((p) => p.amount).sort()).toEqual([100, 100]);
    expect(await Q.receivedFor(invoiceId)).toBe(total);
  });

  it("chưa cấu hình SEPAY_API_KEY thì từ chối mọi yêu cầu", async () => {
    delete process.env.SEPAY_API_KEY;
    expect((await call(tx({ id: 31 }))).status).toBe(503);
    process.env.SEPAY_API_KEY = "khoa-bi-mat";
  });
});
