import { describe, expect, it } from "vitest";
import { parseGroqReply, parseMeterReply } from "@/lib/meter-ocr";

const reply = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });

describe("parseMeterReply", () => {
  it("đọc được số hợp lệ", () => {
    expect(parseMeterReply(reply('{"readable":true,"reading":1342}'))).toEqual({ ok: true, reading: 1342 });
  });
  it("không chắc thì báo chưa đọc được", () => {
    expect(parseMeterReply(reply('{"readable":false,"reading":null}')).ok).toBe(false);
    expect(parseMeterReply(reply('{"readable":true,"reading":null}')).ok).toBe(false);
  });
  it("chặn số âm, quá lớn, sai định dạng", () => {
    expect(parseMeterReply(reply('{"readable":true,"reading":-5}')).ok).toBe(false);
    expect(parseMeterReply(reply('{"readable":true,"reading":99999999}')).ok).toBe(false);
    expect(parseMeterReply(reply("không phải JSON")).ok).toBe(false);
    expect(parseMeterReply({}).ok).toBe(false);
  });
});

describe("parseGroqReply", () => {
  const g = (content: string) => ({ choices: [{ message: { content } }] });
  it("đọc JSON thường và JSON bọc trong khối mã", () => {
    expect(parseGroqReply(g('{"readable":true,"reading":260.8}'))).toEqual({ ok: true, reading: 260.8 });
    expect(parseGroqReply(g('```json\n{"readable": true, "reading": 1342}\n```'))).toEqual({ ok: true, reading: 1342 });
  });
  it("không chắc hoặc sai định dạng thì báo chưa đọc được", () => {
    expect(parseGroqReply(g('{"readable":false,"reading":null}')).ok).toBe(false);
    expect(parseGroqReply(g("xin lỗi"))).toMatchObject({ ok: false, code: "unreadable" });
    expect(parseGroqReply({}).ok).toBe(false);
  });
});
