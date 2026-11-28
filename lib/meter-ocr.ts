// Đọc số trên ảnh đồng hồ điện/nước bằng Gemini (Google AI Studio, gói miễn phí).
// Khóa API chỉ nằm ở máy chủ (biến GEMINI_API_KEY), trình duyệt không bao giờ thấy.
export type MeterKind = "elec" | "water";
export type MeterResult = { ok: true; reading: number } | { ok: false; code: "no_key" | "quota" | "unreadable" | "error"; message: string };

const DEFAULT_MODEL = "gemini-2.5-flash";

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
    if (!res.ok) return { ok: false, code: "error", message: "Chưa đọc được ảnh lúc này. Hãy thử lại hoặc nhập tay." };
    return parseMeterReply(await res.json());
  } catch {
    return { ok: false, code: "error", message: "Không kết nối được để đọc ảnh. Kiểm tra mạng hoặc nhập tay." };
  }
}
