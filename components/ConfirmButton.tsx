"use client";

import { useId, type ReactNode } from "react";
import { useActionForm, type FormAction } from "@/components/ActionForm";

/**
 * Nút trong ActionForm, hỏi lại trước khi thực hiện (xóa, đổi link...).
 * - Không có `action`: gửi chính form chứa nó.
 * - Có `action`: chạy action riêng với dữ liệu của form. Nút này là type="button" nên bấm Enter
 *   trong một ô nhập sẽ không bao giờ vô tình kích hoạt nó.
 */
export function ConfirmButton({
  message,
  className,
  children,
  action,
  pendingText = "Đang xóa...",
}: {
  message: string;
  className?: string;
  children: ReactNode;
  action?: FormAction;
  pendingText?: string;
}) {
  const { pending, submitter, submitWith } = useActionForm();
  const id = useId();
  const mine = pending && submitter === id;

  return (
    <button
      data-submit-id={id}
      type={action ? "button" : "submit"}
      className={className}
      disabled={pending}
      aria-busy={mine || undefined}
      onClick={(e) => {
        if (!confirm(message)) {
          e.preventDefault();
          return;
        }
        if (action) submitWith(action, e.currentTarget);
      }}
    >
      {mine ? pendingText : children}
    </button>
  );
}
