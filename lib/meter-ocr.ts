// Đọc số trên ảnh đồng hồ điện/nước bằng mô hình thị giác của Groq (rất nhanh, có gói miễn phí).
// Khóa API chỉ nằm ở máy chủ (biến GROQ_API_KEY), trình duyệt không bao giờ thấy.
export type MeterKind = "elec" | "water";
export type MeterResult = { ok: true; reading: number; unsure?: true; raw?: string } | { ok: false; code: "no_key" | "quota" | "unreadable" | "error"; message: string };

const DEFAULT_MODEL = "qwen/qwen3.8-27b";

export function meterPrompt(kind: MeterKind): string {
  const what =
    kind === "elec"
      ? [
          "an electricity meter with an LCD (often a small single-phase multifunction module).",
          "The cumulative energy in kWh is the LARGE digits on the TOP row. Leading zeros are shown (for example 00060.0 means 60.0 kWh) and the last digit after the decimal point is part of the reading.",
          "A smaller second row, if present, shows current, voltage or power with a unit such as A, V or W. Never use that row.",
        ].join(" ")
      : [
          "a mechanical water meter (m3) whose digit window may be tilted or rotated in the photo, so read the digits along the length of the window from the first cell to the last.",
          "Read only the BLACK digits (whole cubic metres), including leading zeros, for example \"0097\". Ignore the red digits and the small dials.",
          "The thin dark slanted bars between neighbouring cells are separators of the rolling drums, NOT the digit 1; a real 1 has its own cell, so never insert a 1 between two digits. Count only real digit glyphs.",
        ].join(" ");
  const example = kind === "elec" ? "00060.0" : "0097";
  const decimalHint = kind === "elec" ? "with a dot for the decimal point" : "with no decimal point";
  return [
    `The photo shows ${what}`,
    "First look at the digit cells from left to right and transcribe EVERY real digit, including leading zeros. Do not skip, merge, drop or invent a digit.",
    `Return JSON only: {"readable": boolean, "digits": string|null, "unsure": boolean}, where digits is the transcription ${decimalHint}, for example "${example}".`,
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

/**
 * Đồng hồ nước cơ có vách ngăn nghiêng giữa các ô số; mô hình hay đọc mỗi vách thành một số "1",
 * ví dụ ô thật "0 0 9 7" thành "0101917". Nếu mọi ký tự ở vị trí lẻ đều là "1" thì đó chính là vách, bỏ đi.
 * Chuỗi quá ngắn thì giữ nguyên vì không phân biệt được với số thật.
 */
export function dropSeparatorOnes(digits: string): string {
  if (digits.length < 5 || digits.includes(".")) return digits;
  const odd = [...digits].filter((_, i) => i % 2 === 1);
  if (odd.length < 2 || !odd.every((c) => c === "1")) return digits;
  return [...digits].filter((_, i) => i % 2 === 0).join("");
}

/** Lấy số từ đoạn JSON mô hình trả về; kiểm tra chặt vì số này sẽ điền vào ô nhập. */
export function parseReadingJson(text: string, kind?: MeterKind): MeterResult {
  try {
    // Một số mô hình bọc JSON trong ```json ... ``` hoặc thêm chữ thừa, nên cắt lấy cặp { } đầu tiên.
    const m = /\{[\s\S]*\}/.exec(text);
    const j = JSON.parse(m ? m[0] : text) as { readable?: unknown; reading?: unknown; digits?: unknown; unsure?: unknown };
    if (j.readable !== true) return UNREADABLE;
    let value: number | null = null;
    let stripped = false;
    if (typeof j.digits === "string") {
      // Chuỗi chữ số giữ nguyên số 0 đứng đầu ("00060.0"), nên mô hình khó nuốt mất một chữ số như khi trả thẳng một con số.
      let d = j.digits.replace(/[\s_]/g, "").replace(",", ".");
      if (kind === "water") {
        const fixed = dropSeparatorOnes(d);
        if (fixed !== d) {
          d = fixed;
          stripped = true;
        }
      }
      if (/^\d+(\.\d+)?$/.test(d)) value = Number(d);
    } else if (typeof j.reading === "number") {
      value = j.reading;
    }
    if (value === null || !Number.isFinite(value) || value < 0 || value >= 10_000_000) return UNREADABLE;
    return j.unsure === true || stripped ? { ok: true, reading: value, unsure: true } : { ok: true, reading: value };
  } catch {
    return UNREADABLE;
  }
}

/** Phản hồi của Groq (chat.completions, định dạng giống OpenAI). */
export function parseGroqReply(data: unknown, kind?: MeterKind): MeterResult {
  const d = data as { choices?: { message?: { content?: string } }[] };
  return parseReadingJson(d?.choices?.[0]?.message?.content ?? "", kind);
}

/** Chuỗi chữ số thô mô hình đã trả (ví dụ "0097"), để hiển thị cho người dùng đối chiếu với ảnh. */
function digitsOf(raw: unknown): string | undefined {
  try {
    const d = raw as { choices?: { message?: { content?: string } }[] };
    const m = /\{[\s\S]*\}/.exec(d?.choices?.[0]?.message?.content ?? "");
    const j = JSON.parse(m ? m[0] : "") as { digits?: unknown };
    return typeof j.digits === "string" ? j.digits.slice(0, 20) : undefined;
  } catch {
    return undefined;
  }
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
    const first = parseGroqReply(raw1, kind);
    if (first.ok) return { ...first, raw: digitsOf(raw1) };
    // Lần đầu không đọc được: thử thêm một lần ở chế độ "suy nghĩ" (chậm hơn nhưng đọc ảnh khó tốt hơn),
    // chỉ khi còn đủ thời gian trong giới hạn 30 giây của máy chủ.
    let last = raw1;
    const left = 27_000 - (Date.now() - t0);
    if (left > 4_000) {
      try {
        const retry = await call(false, left);
        if (retry.ok) {
          const raw2: unknown = await retry.json();
          const second = parseGroqReply(raw2, kind);
          if (second.ok) return { ...second, raw: digitsOf(raw2) };
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
