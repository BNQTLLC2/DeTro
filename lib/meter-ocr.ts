// Đọc số trên ảnh đồng hồ điện/nước bằng mô hình thị giác: Groq (GROQ_API_KEY, rất nhanh) và/hoặc Gemini (GEMINI_API_KEY).
// Có cả hai khóa thì thử Groq trước, lỗi mới sang Gemini. Khóa API chỉ nằm ở máy chủ, trình duyệt không bao giờ thấy.
export type MeterKind = "elec" | "water";
export type MeterResult = { ok: true; reading: number } | { ok: false; code: "no_key" | "quota" | "unreadable" | "error"; message: string };

const DEFAULT_MODEL = "gemini-flash-latest";
// Mức "suy nghĩ" thấp nhất mà mô hình cho phép (xem ô Thinking level trong AI Studio). Mặc định của Google là High nên rất chậm.
const DEFAULT_THINKING = "low"; // gemini-flash-latest báo không nhận "minimal"; "low" là mức thấp nhất còn lại

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

const UNREADABLE: MeterResult = {
  ok: false,
  code: "unreadable",
  message: "Chưa đọc được số trên ảnh (ảnh mờ hoặc bị chói). Chụp lại gần hơn, tránh bóng đèn, hoặc nhập tay.",
};

/** Lấy số từ đoạn JSON mô hình trả về; kiểm tra chặt vì số này sẽ điền vào ô nhập. */
export function parseReadingJson(text: string): MeterResult {
  const unreadable = UNREADABLE;
  try {
    // Một số mô hình bọc JSON trong ```json ... ``` hoặc thêm chữ thừa, nên cắt lấy cặp { } đầu tiên.
    const m = /\{[\s\S]*\}/.exec(text);
    const j = JSON.parse(m ? m[0] : text) as { readable?: unknown; reading?: unknown };
    if (j.readable !== true || typeof j.reading !== "number") return unreadable;
    if (!Number.isFinite(j.reading) || j.reading < 0 || j.reading >= 10_000_000) return unreadable;
    return { ok: true, reading: j.reading };
  } catch {
    return unreadable;
  }
}

/** Phản hồi của Gemini (generateContent). */
export function parseMeterReply(data: unknown): MeterResult {
  const d = data as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return parseReadingJson(d?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "");
}

/** Phản hồi của Groq (chat.completions, định dạng giống OpenAI). */
export function parseGroqReply(data: unknown): MeterResult {
  const d = data as { choices?: { message?: { content?: string } }[] };
  return parseReadingJson(d?.choices?.[0]?.message?.content ?? "");
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

async function readMeterGemini(base64: string, mime: string, kind: MeterKind, key: string, budget = 55_000): Promise<MeterResult> {
  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const fallback = (process.env.GEMINI_FALLBACK_MODEL ?? "").trim();
  // Thử lần lượt các mức suy nghĩ thấp; mô hình nào không nhận mức nào thì Google trả 400 rất nhanh và ta thử mức kế tiếp.
  const levels = (process.env.GEMINI_THINKING_LEVEL ? [process.env.GEMINI_THINKING_LEVEL.toLowerCase()] : [DEFAULT_THINKING]).filter(Boolean);
  let rejected = ""; // lời Google khi từ chối tham số suy nghĩ, để hiện trong thông báo lỗi
  let usedLevel = "mặc định của Google";
  const t0 = Date.now();
  const BUDGET = budget; // tổng thời gian còn lại; Vercel cho chạy tối đa 60 giây (maxDuration của route)
  const left = () => BUDGET - (Date.now() - t0);
  const call = (model: string, level: string | null) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
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
          // Đọc số không cần "suy nghĩ" lâu; nếu mô hình không nhận tham số này (HTTP 400) thì gọi lại không kèm.
          ...(level ? { thinkingConfig: { thinkingLevel: level } } : {}),
        },
      }),
      signal: AbortSignal.timeout(Math.max(3_000, Math.min(22_000, left()))),
    });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Thử mô hình chính, gặp 500/503 (Google đang quá tải) thì chờ chút thử lại một lần, rồi mới sang mô hình dự phòng (nếu có).
  async function tryModel(model: string): Promise<Response> {
    let level: string | null = null;
    let res: Response | null = null;
    for (const l of [...levels, null]) {
      level = l;
      usedLevel = l ?? "mặc định của Google";
      res = await call(model, l);
      if (res.status !== 400) break;
      if (l) rejected = (await res.clone().text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
    }
    if (!res) throw new Error("no response");
    if ((res.status === 503 || res.status === 500) && left() > 8_000) {
      await sleep(2_000);
      res = await call(model, level);
    }
    return res;
  }

  let used = primary;
  try {
    let res = await tryModel(primary);
    if ((res.status === 503 || res.status === 500 || res.status === 429 || res.status === 404) && fallback && fallback !== primary && left() > 8_000) {
      used = fallback;
      res = await tryModel(fallback);
    }
    if (res.status === 429) {
      return { ok: false, code: "quota", message: "Đã hết hạn mức đọc ảnh miễn phí lúc này. Hãy nhập tay hoặc thử lại sau ít phút." };
    }
    if (res.status === 503 || res.status === 500) {
      return { ok: false, code: "error", message: `Google đang quá tải với mô hình ${used} (mã ${res.status}), thường chỉ vài phút. Bấm Chụp lại sau chút, hoặc nhập tay.` };
    }
    if (!res.ok) return { ok: false, code: "error", message: await googleError(res, used) };
    return parseMeterReply(await res.json());
  } catch (err) {
    const e = err as { name?: string; message?: string; cause?: { code?: string } };
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      const sec = Math.round((Date.now() - t0) / 1000);
      return {
        ok: false,
        code: "error",
        message: `Google trả lời quá chậm (đã chờ ${sec} giây, mô hình ${used}, mức suy nghĩ: ${usedLevel}).${rejected ? ` Google từ chối mức suy nghĩ thấp: ${rejected}` : ""} Bấm Chụp lại để thử lần nữa, hoặc nhập tay.`,
      };
    }
    const why = [e?.cause?.code, e?.message].filter(Boolean).join(" ");
    return { ok: false, code: "error", message: `Máy chủ không gọi được Google${why ? ` (${why.slice(0, 120)})` : ""}. Nhập tay nếu cần.` };
  }
}

const GROQ_DEFAULT_MODEL = "qwen/qwen3.8-27b";

async function readMeterGroq(base64: string, mime: string, kind: MeterKind, key: string): Promise<MeterResult> {
  const model = process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL;
  const call = (noThinking: boolean) =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        // Đọc số không cần suy nghĩ dài; mô hình nào không nhận tham số này (HTTP 400) thì gọi lại không kèm.
        ...(noThinking ? { reasoning_effort: "none" } : {}),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: meterPrompt(kind) },
              { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    });
  const t0 = Date.now();
  try {
    let noThinking = true;
    let res = await call(noThinking);
    let rejected = "";
    if (res.status === 400) {
      rejected = (await res.clone().text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
      noThinking = false;
      res = await call(noThinking);
    }
    if (res.status === 503 || res.status === 500) {
      await new Promise((r) => setTimeout(r, 1_500));
      res = await call(noThinking);
    }
    if (res.status === 429) {
      return { ok: false, code: "quota", message: "Groq báo hết hạn mức miễn phí lúc này. Hãy nhập tay hoặc thử lại sau ít phút." };
    }
    if (!res.ok) {
      let detail = "";
      try {
        const j = (await res.json()) as { error?: { message?: string } };
        detail = (j.error?.message ?? "").replace(/\s+/g, " ").slice(0, 160);
      } catch {
        /* không có JSON */
      }
      const why =
        res.status === 401 || res.status === 403
          ? "khóa GROQ_API_KEY sai hoặc bị thu hồi"
          : res.status === 404
            ? `không tìm thấy mô hình "${model}" (kiểm tra GROQ_MODEL)`
            : res.status === 400
              ? `mô hình "${model}" từ chối yêu cầu${rejected ? ` (${rejected})` : ""}`
              : "Groq đang lỗi hoặc quá tải";
      return { ok: false, code: "error", message: `Groq trả lỗi mã ${res.status}: ${why}.${detail ? ` Groq nói: ${detail}` : ""}` };
    }
    return parseGroqReply(await res.json());
  } catch (err) {
    const e = err as { name?: string; message?: string };
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      return { ok: false, code: "error", message: `Groq trả lời quá chậm (đã chờ ${Math.round((Date.now() - t0) / 1000)} giây, mô hình ${model}).` };
    }
    return { ok: false, code: "error", message: `Máy chủ không gọi được Groq${e?.message ? ` (${e.message.slice(0, 100)})` : ""}.` };
  }
}

/** Đọc số trên ảnh. Có GROQ_API_KEY thì dùng Groq trước, lỗi hoặc hết hạn mức mới sang Gemini (nếu có GEMINI_API_KEY). */
export async function readMeter(base64: string, mime: string, kind: MeterKind): Promise<MeterResult> {
  const groq = process.env.GROQ_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  if (!groq && !gemini) {
    return { ok: false, code: "no_key", message: "Chưa cấu hình GROQ_API_KEY (hoặc GEMINI_API_KEY) nên chưa đọc ảnh được. Hãy nhập tay." };
  }
  const start = Date.now();
  let last: MeterResult | null = null;
  if (groq) {
    last = await readMeterGroq(base64, mime, kind, groq);
    if (last.ok || last.code === "unreadable" || !gemini) return last;
  }
  const g = await readMeterGemini(base64, mime, kind, gemini as string, Math.max(10_000, 55_000 - (Date.now() - start)));
  if (g.ok || g.code === "unreadable" || !last) return g;
  return { ok: false, code: g.code, message: `${last.message} Dự phòng Gemini cũng lỗi: ${g.message}` };
}
