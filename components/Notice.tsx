"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * Thông báo nổi ngay cạnh nút vừa bấm (thay vì hiện ở đầu trang rồi bắt kéo lên xem).
 * - Vị trí tính theo tọa độ của nút lúc bấm, nên vẫn đúng chỗ kể cả khi nút biến mất sau khi lưu.
 * - Tự chọn hiện phía dưới hoặc phía trên nút cho vừa màn hình, tránh thanh điều hướng cố định ở đáy.
 * - Không chặn thao tác bên dưới; tự tắt, hoặc tắt ngay khi bấm/gõ chỗ khác.
 */

export type NoticeKind = "ok" | "error";

/** Hộp bao quanh nút, tính theo tọa độ của cả trang (không phải của màn hình). */
export type Anchor = { left: number; right: number; top: number; bottom: number };

export function anchorOf(el: Element): Anchor {
  const r = el.getBoundingClientRect();
  return {
    left: r.left + window.scrollX,
    right: r.right + window.scrollX,
    top: r.top + window.scrollY,
    bottom: r.bottom + window.scrollY,
  };
}

type Bubble = { id: number; kind: NoticeKind; text: string; anchor: Anchor; width: number };
type Place = { top: number; left: number; above: boolean; arrow: number };

type Ctx = {
  notify: (kind: NoticeKind, text: string, anchor?: Anchor | null) => void;
  dismiss: () => void;
};

const NoticeCtx = createContext<Ctx>({ notify: () => {}, dismiss: () => {} });

export function useNotice(): Ctx {
  return useContext(NoticeCtx);
}

const GAP = 10;
const MARGIN = 8;

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const idRef = useRef(0);
  const timer = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current);
    setBubble(null);
    setPlace(null);
  }, []);

  const notify = useCallback(
    (kind: NoticeKind, text: string, anchor?: Anchor | null) => {
      window.clearTimeout(timer.current);
      const vw = document.documentElement.clientWidth;
      const fallbackY = window.scrollY + window.innerHeight - 140;
      const a: Anchor = anchor ?? {
        left: window.scrollX + vw / 2,
        right: window.scrollX + vw / 2,
        top: fallbackY,
        bottom: fallbackY,
      };
      setPlace(null);
      setBubble({ id: ++idRef.current, kind, text, anchor: a, width: Math.min(380, vw - MARGIN * 2) });
      // Lỗi ở lại lâu hơn để kịp đọc; thành công tự tắt nhanh.
      timer.current = window.setTimeout(dismiss, kind === "ok" ? 4000 : 12000);
    },
    [dismiss],
  );

  // Đo chiều cao thật của hộp rồi mới chọn phía trên hay phía dưới nút.
  useLayoutEffect(() => {
    if (!bubble || !boxRef.current) return;
    const h = boxRef.current.offsetHeight;
    const a = bubble.anchor;
    const vw = document.documentElement.clientWidth;
    const viewTop = window.scrollY;
    const viewBottom = window.scrollY + window.innerHeight;
    // Trên điện thoại có thanh điều hướng cố định ở đáy màn hình.
    const reservedBottom = vw < 768 ? 96 : MARGIN;

    const fitsBelow = a.bottom + GAP + h <= viewBottom - reservedBottom;
    const fitsAbove = a.top - GAP - h >= viewTop + MARGIN;
    const above = !fitsBelow && fitsAbove;

    const center = (a.left + a.right) / 2;
    const minLeft = window.scrollX + MARGIN;
    const maxLeft = window.scrollX + vw - bubble.width - MARGIN;
    const left = Math.max(minLeft, Math.min(center - bubble.width / 2, maxLeft));
    const arrow = Math.max(18, Math.min(center - left, bubble.width - 18));

    setPlace({ top: above ? a.top - GAP : a.bottom + GAP, left, above, arrow });
  }, [bubble]);

  // Bấm hoặc gõ chỗ khác (sau một khoảnh khắc) thì tắt; quay lại trang trước cũng tắt.
  useEffect(() => {
    if (!bubble) return;
    const born = Date.now();
    const off = () => {
      if (Date.now() - born > 500) dismiss();
    };
    window.addEventListener("pointerdown", off, true);
    window.addEventListener("keydown", off, true);
    window.addEventListener("popstate", dismiss);
    return () => {
      window.removeEventListener("pointerdown", off, true);
      window.removeEventListener("keydown", off, true);
      window.removeEventListener("popstate", dismiss);
    };
  }, [bubble, dismiss]);

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);
  const tone =
    bubble?.kind === "error"
      ? "border-bad/40 bg-bad-bg text-bad"
      : "border-ok/40 bg-ok-bg text-ok";

  return (
    <NoticeCtx.Provider value={value}>
      {children}

      {/* Bản đọc cho trình đọc màn hình (bong bóng nổi chỉ để nhìn). */}
      <div className="sr-only" role="status" aria-live="polite">
        {bubble?.kind === "ok" ? <p key={bubble.id}>{bubble.text}</p> : null}
      </div>
      <div className="sr-only" role="alert">
        {bubble?.kind === "error" ? <p key={bubble.id}>{bubble.text}</p> : null}
      </div>

      {bubble
        ? createPortal(
            <div
              key={bubble.id}
              ref={boxRef}
              aria-hidden="true"
              className={`notice-pop pointer-events-none absolute z-50 rounded-xl border px-4 py-3 text-base font-semibold leading-snug shadow-lg ${tone}`}
              style={{
                top: place?.top ?? 0,
                left: place?.left ?? 0,
                width: bubble.width,
                transform: place?.above ? "translateY(-100%)" : undefined,
                visibility: place ? "visible" : "hidden",
              }}
            >
              <span
                className={`absolute size-3 rotate-45 ${tone} ${
                  place?.above ? "-bottom-1.5 border-r border-b" : "-top-1.5 border-t border-l"
                }`}
                style={{ left: (place?.arrow ?? 0) - 6 }}
              />
              <span className="relative">
                {bubble.kind === "ok" ? "✓ " : "⚠ "}
                {bubble.text}
              </span>
            </div>,
            document.body,
          )
        : null}
    </NoticeCtx.Provider>
  );
}
