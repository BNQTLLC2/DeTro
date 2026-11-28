"use client";

import { useEffect, useRef, useState } from "react";
import { ActionForm, SubmitButton, type FormAction } from "@/components/ActionForm";
import { money } from "@/lib/format";

type Common = {
  action: FormAction;
  roomId: number;
  period: string;
  defaultStart: number;
  defaultEnd: number | null;
  saved: boolean;
  /** Mức dùng kỳ trước, để cảnh báo khi số mới lệch bất thường. */
  prevUsed?: number | null;
};

type Props =
  | (Common & { kind: "elec"; price: number })
  | (Common & { kind: "water"; quota: number; low: number; high: number });

const fmtNum = (n: number) =>
  String(Math.round(n * 100) / 100).replace(".", ",");

type Shot =
  | { status: "idle" }
  | { status: "reading"; url: string }
  | { status: "done"; url: string; value: number }
  | { status: "error"; url: string | null; message: string };

/** Thu nhỏ ảnh về tối đa 1600px, JPEG; chữ số LCD nhỏ nên thu nhỏ quá mức sẽ làm mô hình đọc nhầm. */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL("image/jpeg", 0.88);
}

/** Form nhập số điện hoặc nước cho một phòng, tính thử tiền ngay khi gõ. */
export function ReadingForm(p: Props) {
  const [start, setStart] = useState(String(p.defaultStart));
  const [end, setEnd] = useState(
    p.defaultEnd === null ? "" : String(p.defaultEnd),
  );

  const [shot, setShot] = useState<Shot>({ status: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  async function onPick(file: File | undefined) {
    if (!file) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const hadPhotoValue = shot.status === "done"; // số cũ đọc từ ảnh trước, bỏ đi nếu lần chụp mới thất bại
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    setShot({ status: "reading", url });
    const fail = (message: string) => {
      if (hadPhotoValue) setEnd("");
      setShot({ status: "error", url, message });
    };
    let dataUrl: string;
    try {
      dataUrl = await shrink(file);
    } catch {
      fail("Điện thoại không xử lý được ảnh này. Thử chụp lại hoặc nhập tay.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    try {
      const res = await fetch("/api/meter-read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: dataUrl.split(",")[1], mime: "image/jpeg", kind: p.kind }),
      });
      let j: { ok: boolean; reading?: number; message?: string } | null = null;
      try {
        j = await res.json();
      } catch {
        /* máy chủ không trả JSON (ví dụ bị Vercel cắt vì quá thời gian) */
      }
      if (!j) {
        fail(
          res.status === 413
            ? "Ảnh quá lớn. Hãy chụp lại."
            : res.status === 504 || res.status === 408
              ? "Máy chủ xử lý quá lâu nên bị ngắt. Bấm Chụp lại, hoặc nhập tay."
              : `Máy chủ trả lỗi không đọc được (mã ${res.status}). Thử lại hoặc nhập tay.`,
        );
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      if (j.ok && typeof j.reading === "number") {
        setEnd(String(j.reading));
        setShot({ status: "done", url, value: j.reading });
      } else {
        fail(j.message ?? "Chưa đọc được ảnh. Hãy nhập tay.");
      }
    } catch {
      fail("Điện thoại không gửi được ảnh lên máy chủ. Kiểm tra mạng rồi bấm Chụp lại.");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const s = Number(start.replace(",", "."));
  const e = Number(end.replace(",", "."));
  const has =
    start.trim() !== "" &&
    end.trim() !== "" &&
    Number.isFinite(s) &&
    Number.isFinite(e);
  const invalid = has && e < s;
  const ok = has && !invalid;
  const used = ok ? e - s : 0;
  // Mức dùng gấp nhiều lần kỳ trước thường là thừa hoặc đọc sai một chữ số.
  const odd =
    ok && p.prevUsed != null && p.prevUsed > 0 && used >= p.prevUsed * 4 && used - p.prevUsed >= (p.kind === "elec" ? 50 : 5);

  const unit = p.kind === "elec" ? "kWh" : "m³";
  const dirty =
    !p.saved ||
    end !== (p.defaultEnd === null ? "" : String(p.defaultEnd)) ||
    start !== String(p.defaultStart);

  const submitLabel = odd
    ? "Lưu dù sao"
    : `${p.saved ? "Cập nhật" : "Lưu"} số ${p.kind === "elec" ? "điện" : "nước"}`;
  const tone = p.kind === "elec" ? "bg-c-elec-soft" : "bg-c-water-soft";

  return (
    <ActionForm action={p.action} className="flex flex-col gap-3">
      <input type="hidden" name="room" value={p.roomId} />
      <input type="hidden" name="period" value={p.period} />
      <input type="hidden" name="kind" value={p.kind} />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Chụp đồng hồ ${p.kind === "elec" ? "điện" : "nước"}`}
        onChange={(ev) => void onPick(ev.target.files?.[0])}
      />
      {shot.status === "idle" ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-accent bg-accent-soft px-4 text-base font-semibold text-accent"
        >
          <CameraIcon />
          Chụp đồng hồ để điền số
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          {shot.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shot.url} alt="Ảnh đồng hồ vừa chụp" className="max-h-56 w-full rounded-xl bg-black/80 object-contain" />
          ) : null}
          {shot.status === "reading" ? (
            <p role="status" className="flex items-center gap-2.5 font-semibold">
              <span className="size-5 animate-spin rounded-full border-[3px] border-accent-soft border-t-accent" aria-hidden="true" />
              Đang đọc số trên ảnh...
            </p>
          ) : (
            <div className="flex items-center justify-between gap-2">
              {shot.status === "done" ? (
                <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent">
                  ✓ Đọc từ ảnh: <b>{fmtNum(shot.value)}</b>
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="ml-auto min-h-10 shrink-0 px-1 text-sm font-semibold text-accent"
              >
                Chụp lại
              </button>
            </div>
          )}
          {shot.status === "error" ? (
            <p role="alert" className="rounded-xl bg-bad-bg p-3 text-sm font-semibold text-bad">
              {shot.message}
            </p>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto_1.3fr] items-end gap-2">
        <div>
          <label htmlFor={`${p.kind}-start`} className="label">
            Số đầu
          </label>
          <input
            id={`${p.kind}-start`}
            name="start"
            inputMode="decimal"
            value={start}
            onChange={(ev) => setStart(ev.target.value)}
            className="input text-muted"
          />
        </div>
        <span className="pb-3 text-muted" aria-hidden="true">
          →
        </span>
        <div>
          <label htmlFor={`${p.kind}-end`} className="label">
            Số cuối ({unit})
          </label>
          <input
            id={`${p.kind}-end`}
            name="end"
            inputMode="decimal"
            placeholder="Nhập số"
            value={end}
            onChange={(ev) => setEnd(ev.target.value)}
            className="input !border-2 !font-semibold"
          />
        </div>
      </div>

      {invalid ? (
        <p
          role="alert"
          className="rounded-xl bg-bad-bg p-3 text-sm font-semibold text-bad"
        >
          Số cuối nhỏ hơn số đầu. Kiểm tra lại, hoặc sửa số đầu nếu vừa đổi công
          tơ/đồng hồ.
        </p>
      ) : null}

      {odd ? (
        <p role="alert" className="rounded-xl bg-warn-bg p-3 text-sm font-semibold text-warn">
          Mức dùng {fmtNum(used)} {unit}, cao gấp {Math.round(used / (p.prevUsed ?? 1))} lần kỳ trước ({fmtNum(p.prevUsed ?? 0)} {unit}).
          Có thể thừa một chữ số. Kiểm tra lại số và ảnh.
        </p>
      ) : null}

      {ok ? (
        <div className={`rounded-xl p-3 ${tone}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span>
              <span className="text-2xl font-bold">{fmtNum(used)}</span>{" "}
              <span className="text-sm text-muted">{unit} đã dùng</span>
            </span>
            <span className="text-xl font-bold">
              {p.kind === "elec"
                ? money(Math.round(used * p.price))
                : money(waterAmount(used, p.quota, p.low, p.high))}
              đ
            </span>
          </div>
          {p.kind === "elec" ? (
            <p className="mt-1 text-xs text-muted">
              {fmtNum(used)} × {money(p.price)}đ
            </p>
          ) : (
            <WaterBreakdown
              used={used}
              quota={p.quota}
              low={p.low}
              high={p.high}
            />
          )}
        </div>
      ) : null}

      {p.saved && !dirty ? (
        <p className="text-center text-sm font-medium text-ok">✓ Đã lưu</p>
      ) : (
        <SubmitButton disabled={!ok} className="btn-primary" pendingText="Đang lưu...">
          {submitLabel}
        </SubmitButton>
      )}
    </ActionForm>
  );
}

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function waterAmount(
  used: number,
  quota: number,
  low: number,
  high: number,
): number {
  return (
    Math.round(Math.min(used, quota) * low) +
    Math.round(Math.max(used - quota, 0) * high)
  );
}

function WaterBreakdown({
  used,
  quota,
  low,
  high,
}: {
  used: number;
  quota: number;
  low: number;
  high: number;
}) {
  const lowM3 = Math.min(used, quota);
  const highM3 = Math.max(used - quota, 0);
  return (
    <dl className="mt-2 flex flex-col gap-1 border-t border-black/10 pt-2 text-xs">
      <div className="flex justify-between gap-2">
        <dt className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-c-water" aria-hidden="true" />{" "}
          Trong định mức: {fmtNum(lowM3)} × {money(low)}đ
        </dt>
        <dd className="font-semibold">{money(Math.round(lowM3 * low))}đ</dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-c-high" aria-hidden="true" />{" "}
          Vượt định mức: {fmtNum(highM3)} × {money(high)}đ
        </dt>
        <dd className="font-semibold">{money(Math.round(highM3 * high))}đ</dd>
      </div>
    </dl>
  );
}
