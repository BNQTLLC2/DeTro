"use client";

import { useRef, useState } from "react";

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function format(raw: string, negative: boolean): string {
  const neg = negative && raw.trim().startsWith("-");
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return (neg ? "-" : "") + group(digits);
}

/**
 * Ô nhập số tiền, tự thêm dấu phẩy phân cách hàng nghìn khi gõ (350000 -> 350,000).
 * Giá trị gửi lên server là số thuần (không dấu) qua ô ẩn cùng tên.
 */
export function MoneyInput({
  name,
  defaultValue = "",
  id,
  placeholder,
  required,
  allowNegative,
  className = "input",
}: {
  name: string;
  defaultValue?: string | number;
  id?: string;
  placeholder?: string;
  required?: boolean;
  allowNegative?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(() => format(String(defaultValue), !!allowNegative));
  const ref = useRef<HTMLInputElement>(null);
  const raw = text.replace(/,/g, "");

  function onChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const el = ev.target;
    const caret = el.selectionStart ?? el.value.length;
    const digitsBefore = el.value.slice(0, caret).replace(/[^\d]/g, "").length;
    const next = format(el.value, !!allowNegative);
    setText(next);
    // Giữ con trỏ đúng chỗ sau khi thêm/bớt dấu phẩy.
    requestAnimationFrame(() => {
      let seen = 0;
      let pos = 0;
      while (pos < next.length && seen < digitsBefore) {
        if (/\d/.test(next[pos])) seen++;
        pos++;
      }
      ref.current?.setSelectionRange(pos, pos);
    });
  }

  return (
    <>
      <input
        ref={ref}
        id={id}
        value={text}
        onChange={onChange}
        inputMode={allowNegative ? "text" : "numeric"}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className={className}
      />
      <input type="hidden" name={name} value={raw === "-" ? "" : raw} />
    </>
  );
}
