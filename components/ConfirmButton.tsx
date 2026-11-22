"use client";

import type { ReactNode } from "react";

/** Nút trong form, hỏi lại trước khi gửi (xóa, đổi link...). Có thể gửi form tới một action riêng bằng formAction. */
export function ConfirmButton({
  message,
  className,
  children,
  formAction,
  name,
  value,
}: {
  message: string;
  className?: string;
  children: ReactNode;
  formAction?: (fd: FormData) => void | Promise<void>;
  name?: string;
  value?: string | number;
}) {
  return (
    <button
      type="submit"
      className={className}
      formAction={formAction}
      formNoValidate={formAction ? true : undefined}
      name={name}
      value={value}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
