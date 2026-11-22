"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type FormAction } from "@/components/ActionForm";
import { MoneyInput } from "@/components/MoneyInput";

/**
 * Form thêm khoản phí. Một ô chọn "Loại khoản" gồm các cách tính hằng tháng
 * (lưu thành loại phí), "Chỉ tháng này" (khoản phát sinh một lần, nhập số âm để giảm trừ)
 * và "Giảm giá" (nhập số dương, hệ thống tự trừ vào hóa đơn tháng này).
 */
export function AddFeeForm({
  roomId,
  period,
  methods,
  createAction,
  onceAction,
}: {
  roomId: number;
  period: string;
  methods: { value: string; label: string }[];
  createAction: FormAction;
  onceAction: FormAction;
}) {
  const [kind, setKind] = useState("fixed");
  const discount = kind === "discount";
  const once = kind === "once" || discount;

  return (
    <ActionForm action={once ? onceAction : createAction} className="mt-3 grid grid-cols-2 gap-3" resetOnOk>
      <input type="hidden" name="room" value={roomId} />
      <input type="hidden" name="period" value={period} />
      {once ? null : <input type="hidden" name="method" value={kind} />}
      {discount ? <input type="hidden" name="discount" value="1" /> : null}
      <p className="col-span-2 text-sm text-muted">
        {discount
          ? "Giảm trừ cho tháng này. Nhập số tiền giảm (số dương), hệ thống tự trừ vào hóa đơn."
          : once
          ? "Chỉ tính cho tháng này (sửa chữa, đền bù...). Nhập số âm để giảm trừ."
          : "Khoản phí mới chỉ bật cho phòng này và tự lấy cho các tháng sau. Phí bằng 0 không hiện trên hóa đơn."}
      </p>
      <label className="col-span-2 block">
        <span className="label">Tên khoản</span>
        <input name="name" required placeholder={discount ? "Giảm giá tiền phòng" : once ? "Sửa vòi nước" : "Gửi xe"} className="input" />
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
            <option value="discount">Giảm giá (chỉ tháng này)</option>
          </optgroup>
        </select>
      </div>
      <label className="block">
        <span className="label">{discount ? "Số tiền giảm (đ)" : once ? "Số tiền (đ)" : "Mức mặc định (đ)"}</span>
        <MoneyInput
          key={kind}
          name="amount"
          defaultValue=""
          placeholder={discount ? "50000" : once ? "120000" : "100000"}
          allowNegative={kind === "once"}
          required={once}
          className="input"
        />
      </label>
      <SubmitButton className="btn-ghost col-span-2" pendingText="Đang thêm...">
        {discount ? "Thêm giảm giá" : once ? "Thêm khoản" : "Thêm loại phí"}
      </SubmitButton>
    </ActionForm>
  );
}
