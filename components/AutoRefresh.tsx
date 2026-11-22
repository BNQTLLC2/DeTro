"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Theo dõi thanh toán theo thời gian thật: hỏi trạng thái hóa đơn 10 giây một lần (chỉ khi đang mở trang),
 * hễ có tiền về hoặc chủ trọ đánh dấu đã thu thì tải lại dữ liệu trang và báo ngay.
 */
export function PaymentWatcher({
  token,
  invoiceId,
  part = "other",
  paid,
  received,
  seconds = 10,
  showButton = false,
}: {
  token: string;
  invoiceId: number;
  /** Đợt thu đang theo dõi: tiền trọ, chi phí khác, hoặc cả hai (QR gộp). */
  part?: "rent" | "other" | "all";
  paid: boolean;
  received: number;
  seconds?: number;
  /** Hiện nút "Kiểm tra thanh toán" để người thuê tự bấm. */
  showButton?: boolean;
}) {
  const router = useRouter();
  const [toast, setToast] = useState("");
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState("");
  const checkRef = useRef<(manual: boolean) => Promise<void>>(async () => {});
  const last = useRef({ paid, received });

  useEffect(() => {
    last.current = { paid, received };
  }, [paid, received]);

  useEffect(() => {
    if (paid) return;
    let stop = false;
    let busy = false;

    async function check(manual = false) {
      if (busy || (!manual && document.visibilityState !== "visible")) return;
      busy = true;
      if (manual) {
        setChecking(true);
        setMsg("");
      }
      try {
        const r = await fetch(`/api/p/${token}/status?inv=${invoiceId}&part=${part}`, { cache: "no-store" });
        if (!r.ok || stop) {
          if (manual) setMsg("Không kiểm tra được lúc này. Hãy thử lại sau.");
          return;
        }
        const s: { paid: boolean; received: number } = await r.json();
        if (s.paid !== last.current.paid || s.received !== last.current.received) {
          setToast(s.paid ? "Đã nhận đủ tiền. Cảm ơn bạn!" : "Đã nhận được một khoản thanh toán.");
          last.current = s;
          router.refresh();
        } else if (manual) {
          setMsg("Chưa nhận được thanh toán mới. Nếu bạn vừa chuyển khoản, hãy đợi một lát rồi bấm lại.");
        }
      } catch {
        if (manual) setMsg("Không kết nối được. Hãy kiểm tra mạng rồi thử lại.");
      } finally {
        busy = false;
        if (manual) setChecking(false);
      }
    }

    checkRef.current = check;
    const tick = () => void check(false);
    const id = setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [token, invoiceId, part, paid, seconds, router]);

  return (
    <>
      {toast ? (
        <div
          role="status"
          className="fixed inset-x-4 top-4 z-30 mx-auto max-w-md rounded-xl bg-ok px-4 py-3 text-center text-sm font-semibold text-white shadow-lg"
        >
          {toast}
        </div>
      ) : null}
      {showButton && !paid ? (
        <div className="flex w-full flex-col gap-2">
          <button type="button" onClick={() => void checkRef.current(true)} disabled={checking} className="btn-ghost w-full">
            {checking ? "Đang kiểm tra..." : "Kiểm tra thanh toán"}
          </button>
          {msg ? (
            <p role="status" className="text-center text-xs text-muted">
              {msg}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
