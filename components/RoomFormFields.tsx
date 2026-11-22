"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

export type RoomOption = { id: number; name: string; is_vacant: boolean };

const floorOf = (name: string) => name.trim().match(/(\d)\d{2}$/)?.[1];

export function RoomFormFields({
  r,
  roomId,
  roomName,
  rooms,
}: {
  r: RoomValues;
  roomId: number;
  roomName: string;
  rooms: RoomOption[];
}) {
  const [vacant, setVacant] = useState(r.is_vacant);
  const [open, setOpen] = useState(false);
  const floor = floorOf(roomName);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const groups = new Map<string, RoomOption[]>();
  for (const x of rooms) {
    const f = floorOf(x.name);
    const label = f ? `Tầng ${f}` : "Khác";
    groups.set(label, [...(groups.get(label) ?? []), x]);
  }
  const floors = [...groups.entries()].sort(([a], [b]) =>
    a === "Khác" ? 1 : b === "Khác" ? -1 : a.localeCompare(b),
  );

  return (
    <>
      {/* Khi phòng trống, gửi is_vacant lên server (công tắc bên dưới không có name) */}
      {vacant && <input type="hidden" name="is_vacant" value="on" />}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`Phòng ${roomName}. Bấm để chọn phòng khác`}
          className="flex size-16 shrink-0 cursor-pointer flex-col items-center justify-center rounded-2xl border border-transparent bg-accent-soft leading-none text-accent transition-colors hover:border-accent"
        >
          <span className="text-[11px] font-bold tracking-wide">{floor ? `TẦNG ${floor}` : "PHÒNG"}</span>
          <span className="mt-1 text-2xl font-extrabold">{roomName}</span>
          <span aria-hidden className="mt-0.5 text-[10px] opacity-70">▾</span>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold">Phòng {roomName}</h1>
          <p className="truncate text-sm text-muted">
            {vacant ? "Đang trống" : r.tenant_name || "Chưa nhập người thuê"}
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer flex-col items-center gap-1 text-[11px] font-bold">
          <input
            type="checkbox"
            checked={!vacant}
            onChange={(e) => setVacant(!e.target.checked)}
            className="peer sr-only"
            aria-label="Phòng đang thuê"
          />
          <span className="relative block h-7 w-12 rounded-full bg-warn-bg ring-1 ring-warn/40 transition-colors peer-checked:bg-ok peer-checked:ring-0 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:left-0.5 after:top-0.5 after:size-6 after:rounded-full after:bg-warn after:transition-all after:content-[''] peer-checked:after:left-[22px] peer-checked:after:bg-white" />
          <span className={vacant ? "text-warn" : "text-ok"}>{vacant ? "Trống" : "Đang thuê"}</span>
        </label>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Chọn phòng"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-4 sm:rounded-3xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">Chọn phòng</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Đóng"
                className="flex size-11 cursor-pointer items-center justify-center rounded-xl text-xl text-muted"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {floors.map(([label, list]) => (
                <section key={label}>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{label}</h3>
                  <ul className="grid grid-cols-3 gap-2">
                    {list.map((x) => {
                      const current = x.id === roomId;
                      return (
                        <li key={x.id}>
                          <Link
                            href={`/admin/phong/${x.id}`}
                            onClick={() => setOpen(false)}
                            aria-current={current ? "page" : undefined}
                            className={`flex min-h-14 flex-col items-center justify-center rounded-xl border text-lg font-bold no-underline ${
                              current ? "border-accent bg-accent text-accent-ink" : "border-line bg-bg text-ink"
                            }`}
                          >
                            {x.name}
                            <span
                              className={`text-[11px] font-semibold ${
                                current ? "text-accent-ink" : x.is_vacant ? "text-warn" : "text-ok"
                              }`}
                            >
                              {x.is_vacant ? "Trống" : "Đang thuê"}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      <hr className="border-0 border-t border-line" />

      {/* Ẩn bằng CSS (không gỡ khỏi form) để dữ liệu cũ vẫn được giữ nguyên khi lưu */}
      <div className={vacant ? "hidden" : "flex flex-col gap-5"}>
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
