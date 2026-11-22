"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Tự tải lại dữ liệu trang mỗi vài giây khi đang chờ thanh toán, để thấy "Đã đóng tiền" ngay khi tiền về. */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
