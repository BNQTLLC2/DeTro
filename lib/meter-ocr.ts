// Đọc số trên ảnh đồng hồ điện/nước bằng mô hình thị giác của Groq (rất nhanh, có gói miễn phí).
// Khóa API chỉ nằm ở máy chủ (biến GROQ_API_KEY), trình duyệt không bao giờ thấy.
export type MeterKind = "elec" | "water";
export type MeterResult = { ok: true; reading: number; unsure?: true } | { ok: false; code: "no_key" | "quota" | "unreadable" | "error"; message: string };

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
    "Return JSON only: {\"readable\": boolean, \"digits\": string|null, \"unsure\": boolean}, where digits is the transcription with a dot for the decimal point, for example \"00060.0\".",
    "If the digit row is at least partly visible, always give your best transcription, even when the photo is a little blurry or small: a person will double-check it against the photo.",
    "Set unsure=true when any digit is a guess. Set readable=false and digits=null only when no digit row is visible at all or it is completely covered by glare.",
    "Do not include units. Do not read serial numbers, dates, labels or other numbers on the device.",
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
    const j = JSON.parse(m ? m[0] : text) as { readable?: unknown; reading?: unknown; digits?: unknown; unsure?: unknown };
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
    return j.unsure === true ? { ok: true, reading: value, unsure: true } : { ok: true, reading: value };
  } catch {
    return UNREADABLE;
  }
}

/** Phản hồi của Groq (chat.completions, định dạng giống OpenAI). */
export function parseGroqReply(data: unknown): MeterResult {
  const d = data as { choices?: { message?: { content?: string } }[] };
  return parseReadingJson(d?.choices?.[0]?.message?.content ?? "");
}

/** Gắn vài chữ mô hình đã trả vào thông báo "không đọc được", để biết nó thấy gì (hoặc trả rỗng) khi gỡ lỗi. */
function withDebug(r: MeterResult, raw: unknown): MeterResult {
  if (r.ok) return r;
  const d = raw as { choices?: { message?: { content?: string } }[] };
  const t = String(d?.choices?.[0]?.message?.content ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  return { ...r, message: `${r.message} [Groq trả: ${t || "rỗng"}]` };
}

// Nhớ trong bộ nhớ máy chủ: nếu mô hình đã từ chối "reasoning_effort" thì các lần sau bỏ luôn tham số đó, khỏi tốn thêm một lượt gọi.
let skipNoThinking = false;

export async function readMeter(base64: string, mime: string, kind: MeterKind): Promise<MeterResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return { ok: false, code: "no_key", message: "Chưa cấu hình GROQ_API_KEY nên chưa đọc ảnh được. Hãy nhập tay." };
  }
  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;
  const call = (noThinking: boolean, timeoutMs = 12_000) =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        // Đáp án chỉ là một đoạn JSON ngắn; tắt suy nghĩ và giới hạn độ dài để trả lời nhanh nhất.
        ...(noThinking ? { reasoning_effort: "none", max_completion_tokens: 150 } : { max_completion_tokens: 2048 }),
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
      signal: AbortSignal.timeout(timeoutMs),
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
    const raw1: unknown = await res.json();
    const first = parseGroqReply(raw1);
    if (first.ok) return first;
    // Lần đầu không đọc được: thử thêm một lần ở chế độ "suy nghĩ" (chậm hơn nhưng đọc ảnh khó tốt hơn),
    // chỉ khi còn đủ thời gian trong giới hạn 30 giây của máy chủ.
    let last = raw1;
    const left = 27_000 - (Date.now() - t0);
    if (left > 4_000) {
      try {
        const retry = await call(false, left);
        if (retry.ok) {
          const raw2: unknown = await retry.json();
          const second = parseGroqReply(raw2);
          if (second.ok) return second;
          last = raw2;
        }
      } catch {
        /* lần thử lại quá chậm hoặc mất mạng: giữ kết quả lần đầu */
      }
    }
    return withDebug(first, last);
  } catch (err) {
    const e = err as { name?: string; message?: string };
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      return { ok: false, code: "error", message: `Groq trả lời quá chậm (đã chờ ${Math.round((Date.now() - t0) / 1000)} giây, mô hình ${model}). Bấm Chụp lại hoặc nhập tay.` };
    }
    return { ok: false, code: "error", message: `Máy chủ không gọi được Groq${e?.message ? ` (${e.message.slice(0, 100)})` : ""}.` };
  }
}
