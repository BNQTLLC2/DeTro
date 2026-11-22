"use client";

import { useState } from "react";
import { money } from "@/lib/format";

type Common = {
  action: (fd: FormData) => void | Promise<void>;
  roomId: number;
  period: string;
  back: string;
  defaultStart: number;
  defaultEnd: number | null;
  saved: boolean;
};

type Props =
  | (Common & { kind: "elec"; price: number })
  | (Common & { kind: "water"; quota: number; low: number; high: number });

const fmtNum = (n: number) =>
  String(Math.round(n * 100) / 100).replace(".", ",");

/** Form nhập số điện hoặc nước cho một phòng, tính thử tiền ngay khi gõ. */
export function ReadingForm(p: Props) {
  const [start, setStart] = useState(String(p.defaultStart));
  const [end, setEnd] = useState(
    p.defaultEnd === null ? "" : String(p.defaultEnd),
  );

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

  const unit = p.kind === "elec" ? "kWh" : "m³";
  const dirty =
    !p.saved ||
    end !== (p.defaultEnd === null ? "" : String(p.defaultEnd)) ||
    start !== String(p.defaultStart);

  const submitLabel = `${p.saved ? "Cập nhật" : "Lưu"} số ${p.kind === "elec" ? "điện" : "nước"}`;
  const tone = p.kind === "elec" ? "bg-c-elec-soft" : "bg-c-water-soft";

  return (
    <form action={p.action} className="flex flex-col gap-3">
      <input type="hidden" name="room" value={p.roomId} />
      <input type="hidden" name="period" value={p.period} />
      <input type="hidden" name="back" value={p.back} />
      <input type="hidden" name="kind" value={p.kind} />

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
        <button type="submit" disabled={!ok} className="btn-primary">
          {submitLabel}
        </button>
      )}
    </form>
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
