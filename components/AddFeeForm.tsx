"use client";

import { useState } from "react";
import { MoneyInput } from "@/components/MoneyInput";

type Action = (fd: FormData) => void | Promise<void>;

/**
 * Form thêm khoản phí. Một ô chọn "Loại khoản" gồm các cách tính hằng tháng
 * (lưu thành loại phí) và "Chỉ tháng này" (khoản phát sinh một lần, nhập số âm để giảm trừ).
 */
export function AddFeeForm({
  roomId,
  back,
  period,
  methods,
  createAction,
  onceAction,
}: {
  roomId: number;
  back: string;
  period: string;
  methods: { value: string; label: string }[];
  createAction: Action;
  onceAction: Action;
}) {
  const [kind, setKind] = useState("fixed");
  const once = kind === "once";

  return (
    <form action={once ? onceAction : createAction} className="mt-3 grid grid-cols-2 gap-3">
      <input type="hidden" name="room" value={roomId} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="period" value={period} />
      {once ? null : <input type="hidden" name="method" value={kind} />}
      <p className="col-span-2 text-sm text-muted">
        {once
          ? "Chỉ tính cho tháng này (sửa chữa, đền bù...). Nhập số âm để giảm trừ."
          : "Khoản phí mới chỉ bật cho phòng này và tự lấy cho các tháng sau. Phí bằng 0 không hiện trên hóa đơn."}
      </p>
      <label className="col-span-2 block">
        <span className="label">Tên khoản</span>
        <input name="name" required placeholder={once ? "Sửa vòi nước" : "Gửi xe"} className="input" />
      </label>
      <div>
        <label htmlFor="new-kind" className="label">
          Loại khoản
        </label>
        <select id="new-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="input">
          <optgroup label="Tính hằng tháng">
            {methods.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Không lặp lại">
            <option value="once">Chỉ tháng này</option>
          </optgroup>
        </select>
      </div>
      <label className="block">
        <span className="label">{once ? "Số tiền (đ)" : "Mức mặc định (đ)"}</span>
        <MoneyInput
          key={once ? "once" : "monthly"}
          name="amount"
          defaultValue=""
          placeholder={once ? "120000" : "100000"}
          allowNegative={once}
          required={once}
          className="input"
        />
      </label>
      <button type="submit" className="btn-ghost col-span-2">
        {once ? "Thêm khoản" : "Thêm loại phí"}
      </button>
    </form>
  );
}
