import { describe, expect, it } from "vitest";
import { dropSeparatorOnes, parseGroqReply } from "@/lib/meter-ocr";

const g = (content: string) => ({ choices: [{ message: { content } }] });

describe("parseGroqReply", () => {
  it("đọc JSON thường và JSON bọc trong khối mã", () => {
    expect(parseGroqReply(g('{"readable":true,"reading":260.8}'))).toEqual({ ok: true, reading: 260.8 });
    expect(parseGroqReply(g('```json\n{"readable": true, "reading": 1342}\n```'))).toEqual({ ok: true, reading: 1342 });
  });
  it("đọc chuỗi chữ số có số 0 đứng đầu", () => {
    expect(parseGroqReply(g('{"readable":true,"digits":"00060.0"}'))).toEqual({ ok: true, reading: 60 });
    expect(parseGroqReply(g('{"readable":true,"digits":"0006 0,0"}'))).toEqual({ ok: true, reading: 60 });
    expect(parseGroqReply(g('{"readable":true,"digits":"00x60.0"}')).ok).toBe(false);
  });
  it("đọc được nhưng chưa chắc thì vẫn trả số kèm cờ unsure", () => {
    expect(parseGroqReply(g('{"readable":true,"digits":"00060.0","unsure":true}'))).toEqual({ ok: true, reading: 60, unsure: true });
    expect(parseGroqReply(g('{"readable":true,"digits":"00060.0","unsure":false}'))).toEqual({ ok: true, reading: 60 });
  });
  it("không chắc hoặc sai định dạng thì báo chưa đọc được", () => {
    expect(parseGroqReply(g('{"readable":false,"reading":null}')).ok).toBe(false);
    expect(parseGroqReply(g('{"readable":true,"reading":null}')).ok).toBe(false);
    expect(parseGroqReply(g("xin lỗi"))).toMatchObject({ ok: false, code: "unreadable" });
    expect(parseGroqReply({}).ok).toBe(false);
  });
  it("chặn số âm hoặc quá lớn", () => {
    expect(parseGroqReply(g('{"readable":true,"reading":-5}')).ok).toBe(false);
    expect(parseGroqReply(g('{"readable":true,"reading":99999999}')).ok).toBe(false);
  });
});

describe("dropSeparatorOnes (đồng hồ nước)", () => {
  it("bỏ các số 1 do vách ngăn bị đọc nhầm", () => {
    expect(dropSeparatorOnes("0101917")).toBe("0097");
    expect(dropSeparatorOnes("01019171")).toBe("0097");
  });
  it("giữ nguyên số thật", () => {
    expect(dropSeparatorOnes("0097")).toBe("0097");
    expect(dropSeparatorOnes("0111")).toBe("0111");
    expect(dropSeparatorOnes("00123")).toBe("00123");
    expect(dropSeparatorOnes("1917.5")).toBe("1917.5");
  });
  it("chỉ áp dụng cho nước và đánh dấu chưa chắc", () => {
    const g = (content: string) => ({ choices: [{ message: { content } }] });
    expect(parseGroqReply(g('{"readable":true,"digits":"0101917"}'), "water")).toEqual({ ok: true, reading: 97, unsure: true });
    expect(parseGroqReply(g('{"readable":true,"digits":"0101917"}'), "elec")).toEqual({ ok: true, reading: 101917 });
  });
});
