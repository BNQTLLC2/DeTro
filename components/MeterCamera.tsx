"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  kind: "elec" | "water";
  /** Nhận ảnh đã cắt đúng vùng trong khung ngắm. */
  onCapture: (file: File) => void;
  onClose: () => void;
  /** Dùng camera mặc định của máy khi trình duyệt không cho mở camera trong trang. */
  onNative: () => void;
};

/**
 * Camera toàn màn hình có khung ngắm vuông: người dùng căn mặt đồng hồ vừa khung, bấm chụp,
 * ảnh được cắt đúng phần trong khung từ khung hình độ phân giải cao của camera, nên chữ số trên màn hình LCD lớn và nét hơn
 * so với chụp cả cảnh rồi thu nhỏ.
 */
export function MeterCamera({ kind, onCapture, onClose, onNative }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ w: 360, h: 640 });

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Đo kích thước vùng hiển thị thật để tính đúng vị trí khung.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        // Lấy nét liên tục nếu máy hỗ trợ (không hỗ trợ thì bỏ qua).
        try {
          const track = stream.getVideoTracks()[0];
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] });
        } catch {
          /* không chỉnh được nét */
        }
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        if (!cancelled) setReady(true);
      } catch (err) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Trình duyệt chưa được cấp quyền dùng camera. Hãy cho phép camera cho trang này, hoặc dùng camera mặc định của máy."
            : "Không mở được camera trong trang. Hãy dùng camera mặc định của máy.",
        );
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [stop]);

  // Khung vuông, rộng 88% chiều ngang, đặt hơi cao hơn giữa màn hình để chừa chỗ cho nút chụp.
  const fs = Math.min(size.w * 0.88, size.h * 0.62);
  const fx = (size.w - fs) / 2;
  const fy = Math.max(64, (size.h - fs) / 2 - size.h * 0.05);

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    // Video hiển thị kiểu object-fit: cover, nên đổi toạ độ khung trên màn hình sang toạ độ điểm ảnh của video.
    const scale = Math.max(size.w / v.videoWidth, size.h / v.videoHeight);
    const ox = (size.w - v.videoWidth * scale) / 2;
    const oy = (size.h - v.videoHeight * scale) / 2;
    const sx = Math.max(0, (fx - ox) / scale);
    const sy = Math.max(0, (fy - oy) / scale);
    const sw = Math.min(fs / scale, v.videoWidth - sx);
    const sh = Math.min(fs / scale, v.videoHeight - sy);
    const k = Math.min(1, 1600 / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(sw * k));
    c.height = Math.max(1, Math.round(sh * k));
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
    c.toBlob(
      (blob) => {
        if (!blob) {
          setError("Không chụp được ảnh. Hãy thử lại hoặc dùng camera mặc định của máy.");
          return;
        }
        stop();
        onCapture(new File([blob], "dong-ho.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }

  const corner = "absolute size-7 border-white";
  const ui = (
    <div ref={boxRef} className="fixed inset-0 z-[100] bg-black text-white" role="dialog" aria-modal="true" aria-label="Chụp đồng hồ">
      <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />

      {/* Khung ngắm: phần ngoài khung được làm tối để dễ căn. */}
      <div
        className="pointer-events-none absolute rounded-2xl"
        style={{ left: fx, top: fy, width: fs, height: fs, boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}
      >
        <span className={`${corner} -left-0.5 -top-0.5 rounded-tl-2xl border-l-4 border-t-4`} />
        <span className={`${corner} -right-0.5 -top-0.5 rounded-tr-2xl border-r-4 border-t-4`} />
        <span className={`${corner} -bottom-0.5 -left-0.5 rounded-bl-2xl border-b-4 border-l-4`} />
        <span className={`${corner} -bottom-0.5 -right-0.5 rounded-br-2xl border-b-4 border-r-4`} />
      </div>

      <button
        type="button"
        onClick={() => {
          stop();
          onClose();
        }}
        className="absolute right-3 top-3 min-h-11 rounded-full bg-black/60 px-4 text-sm font-semibold"
      >
        Đóng
      </button>

      <div className="absolute inset-x-0 px-5 text-center" style={{ top: fy + fs + 14 }}>
        <p className="text-base font-semibold">
          {kind === "elec" ? "Căng mặt đồng hồ điện cho vừa khung" : "Căng mặt đồng hồ nước cho vừa khung"}
        </p>
        <p className="mt-1 text-sm text-white/80">Giữ máy thẳng, chờ nét rồi bấm chụp. Tránh bóng đèn chiếu vào màn hình.</p>
      </div>

      {error ? (
        <div className="absolute inset-x-4 bottom-6 rounded-2xl bg-black/85 p-4 text-center">
          <p className="text-sm font-semibold">{error}</p>
          <div className="mt-3 flex justify-center gap-3">
            <button type="button" onClick={onNative} className="min-h-11 rounded-full bg-white px-5 text-sm font-semibold text-black">
              Dùng camera của máy
            </button>
            <button type="button" onClick={onClose} className="min-h-11 rounded-full bg-white/20 px-5 text-sm font-semibold">
              Đóng
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={snap}
          disabled={!ready}
          aria-label="Chụp"
          className="absolute bottom-6 left-1/2 size-[72px] -translate-x-1/2 rounded-full border-4 border-white bg-white/25 disabled:opacity-40"
        >
          <span className="mx-auto block size-[52px] rounded-full bg-white" />
        </button>
      )}
    </div>
  );
  return createPortal(ui, document.body);
}
