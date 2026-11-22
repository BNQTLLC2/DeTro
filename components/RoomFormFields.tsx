"use client";

import { useState } from "react";
import { MoneyInput } from "@/components/MoneyInput";

type RoomValues = {
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
      <label
        className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm font-semibold transition-colors ${
          vacant ? "border-warn bg-warn-bg text-warn" : "border-line bg-bg text-ink"
        }`}
      >
        <input
          type="checkbox"
          name="is_vacant"
          checked={vacant}
          onChange={(e) => setVacant(e.target.checked)}
          className="size-5"
        />
        Phòng đang trống (không tạo hóa đơn)
      </label>

      {/* Ẩn bằng CSS (không gỡ khỏi form) để dữ liệu cũ vẫn được giữ nguyên khi lưu */}
      <div hidden={vacant} className="flex flex-col gap-5">
        <Section title="Người thuê">
          <Field label="Người đại diện" name="tenant_name" defaultValue={r.tenant_name} />
          <Field label="Số điện thoại" name="tenant_phone" defaultValue={r.tenant_phone} inputMode="tel" />
          <Field label="Số người ở" name="occupants" defaultValue={r.occupants} inputMode="numeric" />
          <Field label="Ngày vào ở" name="move_in_date" type="date" defaultValue={r.move_in_date} />
        </Section>

        <Section title="Tiền phòng">
          <div className="col-span-2">
            <Field label="Giá thuê (đ/tháng)" name="rent" defaultValue={r.rent} money />
          </div>
        </Section>

        <Section
          title="Số ban đầu"
          hint="Chỉ dùng cho tháng đầu tiên. Từ tháng sau, số đầu tự lấy từ số cuối tháng trước."
        >
          <Field label="Điện (kWh)" name="init_elec" defaultValue={r.init_elec} inputMode="numeric" />
          <Field label="Nước (m³)" name="init_water" defaultValue={r.init_water} inputMode="numeric" />
        </Section>
      </div>
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 border-0 p-0">
      <legend className="mb-3 flex w-full items-center gap-3 text-xs font-bold uppercase tracking-wide text-muted">
        {title}
        <span className="h-px flex-1 bg-line" />
      </legend>
      <div className="grid grid-cols-2 gap-3">{children}</div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </fieldset>
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
