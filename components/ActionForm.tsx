"use client";

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import type { ActionState } from "@/lib/action-state";
import { anchorOf, useNotice } from "@/components/Notice";

export type FormAction = (fd: FormData) => Promise<ActionState>;

type Ctx = {
  pending: boolean;
  /** Mã của nút vừa được bấm (để chỉ nút đó hiện "Đang lưu..."). */
  submitter: string | null;
  submitWith: (action: FormAction, by: HTMLElement | null) => void;
};

const FormCtx = createContext<Ctx>({ pending: false, submitter: null, submitWith: () => {} });

export function useActionForm(): Ctx {
  return useContext(FormCtx);
}

const nextFrames = () =>
  new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));

/**
 * Form gọi server action ngay tại chỗ, KHÔNG chuyển trang và KHÔNG kéo lên đầu trang.
 * Kết quả (thành công / lỗi) hiện thành bong bóng ngay cạnh nút vừa bấm.
 *
 * Cố ý không dùng <form action={fn}>: React sẽ tự xóa sạch các ô đang nhập sau mỗi lần gửi,
 * kể cả khi báo lỗi, người dùng mất hết chữ vừa gõ.
 */
export function ActionForm({
  action,
  className,
  resetOnOk = false,
  children,
}: {
  action: FormAction;
  className?: string;
  /** Xóa trắng các ô sau khi thành công (form thêm mới). */
  resetOnOk?: boolean;
  children: ReactNode;
}) {
  const { notify } = useNotice();
  const formRef = useRef<HTMLFormElement>(null);
  const busy = useRef(false);
  const [pending, startTransition] = useTransition();
  const [submitter, setSubmitter] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const submitWith = useCallback(
    (act: FormAction, by: HTMLElement | null) => {
      const form = formRef.current;
      if (!form || busy.current) return;
      busy.current = true;
      setSubmitter(by?.dataset.submitId ?? null);

      const before = anchorOf(by ?? form);
      // FormData chỉ nhận nút gửi (type=submit) thuộc chính form này.
      const asSubmitter =
        by instanceof HTMLButtonElement && by.type === "submit" && by.form === form ? by : null;
      const fd = new FormData(form, asSubmitter);

      startTransition(async () => {
        let result: ActionState;
        try {
          result = await act(fd);
        } catch {
          result = { error: "Chưa gửi được yêu cầu. Hãy kiểm tra mạng rồi thử lại." };
        }
        busy.current = false;
        await nextFrames(); // chờ trang cập nhật xong để tính vị trí nút cho đúng
        const at = by && by.isConnected ? anchorOf(by) : before;
        if (result.error) {
          notify("error", result.error, at);
        } else if (result.ok) {
          notify("ok", result.ok, at);
          if (resetOnOk) setResetKey((k) => k + 1);
        }
      });
    },
    [notify, resetOnOk],
  );

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const by = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    submitWith(action, by);
  }

  return (
    <FormCtx.Provider value={{ pending, submitter, submitWith }}>
      <form ref={formRef} onSubmit={onSubmit} className={className}>
        <Fragment key={resetKey}>{children}</Fragment>
      </form>
    </FormCtx.Provider>
  );
}

/** Nút gửi của ActionForm: khóa khi đang xử lý (tránh bấm đúp) và hiện chữ "Đang ..." . */
export function SubmitButton({
  children,
  className,
  pendingText = "Đang lưu...",
  disabled,
}: {
  children: ReactNode;
  className?: string;
  pendingText?: string;
  disabled?: boolean;
}) {
  const { pending, submitter } = useActionForm();
  const id = useId();
  const mine = pending && (submitter === null || submitter === id);
  return (
    <button
      data-submit-id={id}
      type="submit"
      className={className}
      disabled={disabled || pending}
      aria-busy={mine || undefined}
    >
      {mine ? pendingText : children}
    </button>
  );
}
