"use client";

import { useState } from "react";
import { MoneyInput } from "@/components/MoneyInput";

type RoomValues = {
  name: string;
  rent: string;
  tenant_name: string;
  tenant_phone: string;
  occupants: string;
  move_in_date: string;
  init_elec: string;
  init_water: string;
  is_vacant: boolean;
};

export function RoomFormFields({ r }: { r: RoomValues }) {
  const [vacant, setVacant] = useState(r.is_vacant);

  return (
    <>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="is_vacant"
          checked={vacant}
          onChange={(e) => setVacant(e.target.checked)}
          className="size-5"
        />
        Phòng đang trống (không tạo hóa đơn)
      </label>

      <Field label="Tên / số phòng" name="name" defaultValue={r.name} required />

      {/* Ẩn bằng CSS (không gỡ khỏi form) để dữ liệu cũ vẫn được giữ nguyên khi lưu */}
      <div hidden={vacant} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Giá thuê (đ/tháng)" name="rent" defaultValue={r.rent} money />
          <Field label="Người đại diện" name="tenant_name" defaultValue={r.tenant_name} />
          <Field label="Số điện thoại" name="tenant_phone" defaultValue={r.tenant_phone} inputMode="tel" />
          <Field label="Số người ở" name="occupants" defaultValue={r.occupants} inputMode="numeric" />
          <Field label="Ngày vào ở" name="move_in_date" type="date" defaultValue={r.move_in_date} />
          <span />
          <Field label="Số điện ban đầu (kWh)" name="init_elec" defaultValue={r.init_elec} inputMode="numeric" />
          <Field label="Số nước ban đầu (m³)" name="init_water" defaultValue={r.init_water} inputMode="numeric" />
        </div>
        <p className="text-xs text-muted">
          Số ban đầu chỉ dùng cho tháng đầu tiên. Từ tháng sau, số đầu tự lấy từ số cuối tháng trước.
        </p>
      </div>
    </>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  inputMode,
  required,
  money,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  inputMode?: "numeric" | "tel" | "text";
  required?: boolean;
  money?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {money ? (
        <MoneyInput name={name} defaultValue={defaultValue} required={required} />
      ) : (
        <input
          name={name}
          type={type}
          inputMode={inputMode}
          defaultValue={defaultValue}
          required={required}
          className="input"
        />
      )}
    </label>
  );
}
