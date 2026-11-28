import { describe, expect, it } from "vitest";
import { parseGroqReply } from "@/lib/meter-ocr";

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
