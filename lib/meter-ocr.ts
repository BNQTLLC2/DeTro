// Đọc số trên ảnh đồng hồ điện/nước bằng mô hình thị giác của Groq (rất nhanh, có gói miễn phí).
// Khóa API chỉ nằm ở máy chủ (biến GROQ_API_KEY), trình duyệt không bao giờ thấy.
export type MeterKind = "elec" | "water";
export type MeterResult = { ok: true; reading: number } | { ok: false; code: "no_key" | "quota" | "unreadable" | "error"; message: string };

const DEFAULT_MODEL = "qwen/qwen3.8-27b";

export function meterPrompt(kind: MeterKind): string {
  const what =
    kind === "elec"
      ? [
          "an electricity meter with an LCD (often a small single-phase multifunction module).",
          "The cumulative energy in kWh is the LARGE digits on the TOP row. Leading zeros are shown (for example 00060.0 means 60.0 kWh) and the last digit after the decimal point is part of the reading.",
          "A smaller second row, if present, shows current, voltage or power with a unit such as A, V or W. Never use that row.",
        ].join(" ")
      : "a water meter (m3). Read only the black digits of the cumulative reading, left to right, including leading zeros. Ignore the red digits and the small dials after them.";
  return [
    `The photo shows ${what}`,
    "First look at the digit cells of that row from left to right and transcribe EVERY cell, including leading zeros. Do not skip, merge or drop a digit, and do not drop a zero that sits before the decimal point.",
    "Return JSON only: {\"readable\": boolean, \"digits\": string|null}, where digits is the transcription with a dot for the decimal point, for example \"00060.0\".",
    "Set readable=false and digits=null when the digits are blurry, cut off, covered by glare or you are not sure.",
    "Never guess a digit. Do not include units. Do not read serial numbers, dates, labels or other numbers on the device.",
  ].join(" ");
}

const UNREADABLE: MeterResult = {
  ok: false,
  code: "unreadable",
  message: "Chưa đọc được số trên ảnh (ảnh mờ hoặc bị chói). Chụp lại gần hơn, tránh bóng đèn, hoặc nhập tay.",
};

/** Lấy số từ đoạn JSON mô hình trả về; kiểm tra chặt vì số này sẽ điền vào ô nhập. */
export function parseReadingJson(text: string): MeterResult {
  try {
    // Một số mô hình bọc JSON trong ```json ... ``` hoặc thêm chữ thừa, nên cắt lấy cặp { } đầu tiên.
    const m = /\{[\s\S]*\}/.exec(text);
    const j = JSON.parse(m ? m[0] : text) as { readable?: unknown; reading?: unknown; digits?: unknown };
    if (j.readable !== true) return UNREADABLE;
    let value: number | null = null;
    if (typeof j.digits === "string") {
      // Chuỗi chữ số giữ nguyên số 0 đứng đầu ("00060.0"), nên mô hình khó nuốt mất một chữ số như khi trả thẳng một con số.
      const d = j.digits.replace(/[\s_]/g, "").replace(",", ".");
      if (/^\d+(\.\d+)?$/.test(d)) value = Number(d);
    } else if (typeof j.reading === "number") {
      value = j.reading;
    }
    if (value === null || !Number.isFinite(value) || value < 0 || value >= 10_000_000) return UNREADABLE;
    return { ok: true, reading: value };
  } catch {
    return UNREADABLE;
  }
}

/** Phản hồi của Groq (chat.completions, định dạng giống OpenAI). */
export function parseGroqReply(data: unknown): MeterResult {
  const d = data as { choices?: { message?: { content?: string } }[] };
  return parseReadingJson(d?.choices?.[0]?.message?.content ?? "");
}

// Nhớ trong bộ nhớ máy chủ: nếu mô hình đã từ chối "reasoning_effort" thì các lần sau bỏ luôn tham số đó, khỏi tốn thêm một lượt gọi.
let skipNoThinking = false;

export async function readMeter(base64: string, mime: string, kind: MeterKind): Promise<MeterResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return { ok: false, code: "no_key", message: "Chưa cấu hình GROQ_API_KEY nên chưa đọc ảnh được. Hãy nhập tay." };
  }
  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;
  const call = (noThinking: boolean) =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        // Đáp án chỉ là một đoạn JSON ngắn; tắt suy nghĩ và giới hạn độ dài để trả lời nhanh nhất.
        ...(noThinking ? { reasoning_effort: "none", max_completion_tokens: 150 } : { max_completion_tokens: 1024 }),
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
    let noThinking = !skipNoThinking;
    let res = await call(noThinking);
    let rejected = "";
    if (res.status === 400 && noThinking) {
      rejected = (await res.clone().text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
      skipNoThinking = true;
      noThinking = false;
      res = await call(noThinking);
    }
    if (res.status === 503 || res.status === 500) {
      await new Promise((r) => setTimeout(r, 1_000));
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
    const first = parseGroqReply(await res.json());
    if (first.ok) return first;
    // Lần đầu không đọc được (mờ, JSON cụt...): thử thêm đúng một lần nữa trước khi bỏ cuộc.
    const retry = await call(noThinking);
    return retry.ok ? parseGroqReply(await retry.json()) : first;
  } catch (err) {
    const e = err as { name?: string; message?: string };
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      return { ok: false, code: "error", message: `Groq trả lời quá chậm (đã chờ ${Math.round((Date.now() - t0) / 1000)} giây, mô hình ${model}). Bấm Chụp lại hoặc nhập tay.` };
    }
    return { ok: false, code: "error", message: `Máy chủ không gọi được Groq${e?.message ? ` (${e.message.slice(0, 100)})` : ""}.` };
  }
}
