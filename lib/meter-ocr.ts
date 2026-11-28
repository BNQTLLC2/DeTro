// Đọc số trên ảnh đồng hồ điện/nước bằng Gemini (Google AI Studio, gói miễn phí).
// Khóa API chỉ nằm ở máy chủ (biến GEMINI_API_KEY), trình duyệt không bao giờ thấy.
export type MeterKind = "elec" | "water";
export type MeterResult = { ok: true; reading: number } | { ok: false; code: "no_key" | "quota" | "unreadable" | "error"; message: string };

const DEFAULT_MODEL = "gemini-3.8-flash";

export function meterPrompt(kind: MeterKind): string {
  const what =
    kind === "elec"
      ? "an electricity meter (kWh). Read the cumulative reading shown on the display. Ignore any digit after the decimal point or digits shown in red or in a separate box."
      : "a water meter (m3). Read only the black digits of the cumulative reading. Ignore the red digits and the small dials after them.";
  return [
    `The photo shows ${what}`,
    "Return JSON only: {\"readable\": boolean, \"reading\": number|null}.",
    "Set readable=false and reading=null when the digits are blurry, cut off, covered by glare or you are not sure.",
    "Never guess a digit. Do not include units. Do not read serial numbers, dates or other numbers on the device.",
  ].join(" ");
}

/** Chuyển phản hồi của Gemini thành số đọc được; kiểm tra chặt vì số này sẽ điền vào ô nhập. */
export function parseMeterReply(data: unknown): MeterResult {
  const unreadable: MeterResult = {
    ok: false,
    code: "unreadable",
    message: "Chưa đọc được số trên ảnh (ảnh mờ hoặc bị chói). Chụp lại gần hơn, tránh bóng đèn, hoặc nhập tay.",
  };
  try {
    const d = data as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const j = JSON.parse(text) as { readable?: unknown; reading?: unknown };
    if (j.readable !== true || typeof j.reading !== "number") return unreadable;
    if (!Number.isFinite(j.reading) || j.reading < 0 || j.reading >= 10_000_000) return unreadable;
    return { ok: true, reading: j.reading };
  } catch {
    return unreadable;
  }
}

/** Giải thích lỗi HTTP của Google bằng tiếng Việt, kèm nguyên nhân gốc để dễ sửa cấu hình. */
async function googleError(res: Response, model: string): Promise<string> {
  let detail = "";
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    detail = (j.error?.message ?? "").replace(/\s+/g, " ").slice(0, 160);
  } catch {
    /* không có nội dung JSON */
  }
  const tail = detail ? ` Google nói: ${detail}` : "";
  if (res.status === 404) return `Google không tìm thấy mô hình "${model}". Kiểm tra lại biến GEMINI_MODEL.${tail}`;
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    return `Google từ chối (mã ${res.status}): khóa GEMINI_API_KEY sai, bị thu hồi hoặc chưa được phép dùng mô hình này.${tail}`;
  }
  return `Google trả lỗi (mã ${res.status}). Thử lại sau ít phút hoặc nhập tay.${tail}`;
}

export async function readMeter(base64: string, mime: string, kind: MeterKind): Promise<MeterResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { ok: false, code: "no_key", message: "Chưa cấu hình GEMINI_API_KEY nên chưa đọc ảnh được. Hãy nhập tay." };
  }
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: meterPrompt(kind) }, { inline_data: { mime_type: mime, data: base64 } }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: { readable: { type: "BOOLEAN" }, reading: { type: "NUMBER", nullable: true } },
            required: ["readable"],
          },
        },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (res.status === 429) {
      return { ok: false, code: "quota", message: "Đã hết hạn mức đọc ảnh miễn phí lúc này. Hãy nhập tay hoặc thử lại sau ít phút." };
    }
    if (!res.ok) return { ok: false, code: "error", message: await googleError(res, model) };
    return parseMeterReply(await res.json());
  } catch (err) {
    const e = err as { name?: string; message?: string; cause?: { code?: string } };
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      return { ok: false, code: "error", message: "Google trả lời quá chậm (hơn 25 giây). Thử lại, hoặc đổi GEMINI_MODEL sang mô hình Flash nhẹ hơn." };
    }
    const why = [e?.cause?.code, e?.message].filter(Boolean).join(" ");
    return { ok: false, code: "error", message: `Máy chủ không gọi được Google${why ? ` (${why.slice(0, 120)})` : ""}. Nhập tay nếu cần.` };
  }
}
