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

const fmtNum = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Form nhập số điện hoặc nước cho một phòng, tính thử tiền ngay khi gõ. */
export function ReadingForm(p: Props) {
  const [start, setStart] = useState(String(p.defaultStart));
  const [end, setEnd] = useState(p.defaultEnd === null ? "" : String(p.defaultEnd));

  const s = Number(start.replace(",", "."));
  const e = Number(end.replace(",", "."));
  const has = start.trim() !== "" && end.trim() !== "" && Number.isFinite(s) && Number.isFinite(e);
  const invalid = has && e < s;
  const ok = has && !invalid;
  const used = ok ? e - s : 0;

  const unit = p.kind === "elec" ? "kWh" : "m³";
  const dirty = !p.saved || end !== (p.defaultEnd === null ? "" : String(p.defaultEnd)) || start !== String(p.defaultStart);

  return (
    <form action={p.action} className="flex flex-col gap-3">
      <input type="hidden" name="room" value={p.roomId} />
      <input type="hidden" name="period" value={p.period} />
      <input type="hidden" name="back" value={p.back} />
      <input type="hidden" name="kind" value={p.kind} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${p.kind}-start`} className="label">
            Số đầu (kỳ trước)
          </label>
          <input
            id={`${p.kind}-start`}
            name="start"
            inputMode="decimal"
            value={start}
            onChange={(ev) => setStart(ev.target.value)}
            className="input"
          />
        </div>
        <div>
          <label htmlFor={`${p.kind}-end`} className="label">
            Số cuối ({unit})
          </label>
          <input
            id={`${p.kind}-end`}
            name="end"
            inputMode="decimal"
            placeholder={p.kind === "elec" ? "Nhập số điện" : "Nhập số nước"}
            value={end}
            onChange={(ev) => setEnd(ev.target.value)}
            className="input"
          />
        </div>
      </div>

      {invalid ? (
        <p role="alert" className="rounded-xl bg-bad-bg p-3 text-sm font-semibold text-bad">
          Số cuối nhỏ hơn số đầu. Kiểm tra lại, hoặc sửa số đầu nếu vừa đổi công tơ/đồng hồ.
        </p>
      ) : null}

      {ok && p.kind === "elec" ? (
        <p className="rounded-xl bg-c-elec-soft p-3 text-sm">
          Đã dùng <b>{fmtNum(used)} số điện</b> × {money(p.price)}đ = <b>{money(Math.round(used * p.price))}đ</b>
        </p>
      ) : null}

      {ok && p.kind === "water" ? (
        <WaterPreview used={used} quota={p.quota} low={p.low} high={p.high} />
      ) : null}

      <button type="submit" disabled={!ok || !dirty} className="btn-primary">
        {p.saved ? (dirty ? "Cập nhật" : "Đã lưu") : "Lưu"} {p.kind === "elec" ? "số điện" : "số nước"}
      </button>
    </form>
  );
}

function WaterPreview({ used, quota, low, high }: { used: number; quota: number; low: number; high: number }) {
  const lowM3 = Math.min(used, quota);
  const highM3 = Math.max(used - quota, 0);
  const lowAmt = Math.round(lowM3 * low);
  const highAmt = Math.round(highM3 * high);
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-c-water-soft p-3 text-sm">
      <p>
        Đã dùng <b>{fmtNum(used)} khối</b> (định mức giá rẻ {fmtNum(quota)} khối)
      </p>
      <p>
        {fmtNum(lowM3)} khối × {money(low)}đ = {money(lowAmt)}đ
      </p>
      <p>
        {fmtNum(highM3)} khối × {money(high)}đ = {money(highAmt)}đ
      </p>
      <p>
        Tiền nước: <b>{money(lowAmt + highAmt)}đ</b>
      </p>
    </div>
  );
}
