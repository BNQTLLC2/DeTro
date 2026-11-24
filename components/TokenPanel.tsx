"use client";

import { useState, useTransition } from "react";
import { regenerateTokenInlineAction } from "@/app/admin/actions";

const ICON = {
  share: "M12 3v12M8 7l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6",
  copy: "M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2zM5 15V5a2 2 0 0 1 2-2h10",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  refresh: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
} as const;

function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/**
 * Link xem hóa đơn của một phòng: chia sẻ, sao chép, xem trước như người thuê, tạo lại link.
 * Đổi link cập nhật ngay tại chỗ, không tải lại trang.
 */
export function TokenPanel({
  roomId,
  initialToken,
  roomName,
  tenantName,
}: {
  roomId: number;
  initialToken: string;
  roomName: string;
  tenantName: string;
}) {
  const [token, setToken] = useState(initialToken);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const path = `/p/${token}`;
  const shortPath = `/p/${token.slice(0, 8)}…${token.slice(-5)}`;
  const greeting = `Chào ${tenantName || "bạn"}, đây là link xem hóa đơn phòng ${roomName} của bạn:`;

  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function copyLink() {
    const ok = await copyText(location.origin + path);
    setNote(
      ok
        ? { kind: "ok", text: "Đã sao chép link." }
        : { kind: "error", text: "Không sao chép được tự động. Hãy nhấn giữ vào link để chép." },
    );
  }

  // Mở khung chia sẻ của điện thoại (Zalo, tin nhắn...). Máy không hỗ trợ thì sao chép sẵn tin nhắn kèm link.
  async function share() {
    const url = location.origin + path;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `Hóa đơn phòng ${roomName}`, text: greeting, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // chủ trọ tự đóng khung chia sẻ
      }
    }
    const ok = await copyText(`${greeting} ${url}`);
    setNote(
      ok
        ? { kind: "ok", text: "Đã sao chép tin nhắn kèm link. Dán vào Zalo hoặc tin nhắn để gửi." }
        : { kind: "error", text: "Không chia sẻ được tự động. Hãy dùng nút Sao chép." },
    );
  }

  function regenerate() {
    if (!window.confirm("Đổi link? Link cũ sẽ không còn xem được. Bạn cần gửi link mới cho người thuê.")) return;
    start(async () => {
      const r = await regenerateTokenInlineAction(roomId);
      if ("token" in r) {
        setToken(r.token);
        setNote({ kind: "ok", text: "Đã đổi link. Link cũ không còn dùng được, hãy gửi link mới cho người thuê." });
      } else {
        setNote({ kind: "error", text: r.error });
      }
    });
  }

  const btn = "!min-h-[60px] !flex-col !gap-0.5 !px-1 text-center !text-[15px] leading-tight";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Link của người thuê</h2>
        <button
          type="button"
          onClick={regenerate}
          disabled={pending}
          className="btn-ghost !min-h-10 shrink-0 !gap-1.5 !px-3 !text-sm text-muted disabled:opacity-60"
        >
          <Icon d={ICON.refresh} size={16} />
          {pending ? "Đang đổi..." : "Tạo lại"}
        </button>
      </div>

      <p className="truncate rounded-xl border border-line bg-bg px-3 py-3 font-mono text-sm" aria-label="Đường dẫn link">
        {shortPath}
      </p>

      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={share} className={`btn-primary ${btn}`}>
          <Icon d={ICON.share} />
          Chia sẻ
        </button>
        <button type="button" onClick={copyLink} className={`btn-ghost ${btn}`}>
          <Icon d={ICON.copy} />
          Sao chép
        </button>
        <a href={path} target="_blank" rel="noopener" className={`btn-ghost ${btn}`}>
          <Icon d={ICON.eye} />
          Xem trước
        </a>
      </div>

      {note ? (
        <p
          role="status"
          className={`rounded-xl px-3 py-2.5 text-sm font-medium ${note.kind === "ok" ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`}
        >
          {note.text}
        </p>
      ) : null}

      <p className="text-sm leading-6 text-muted">
        Người thuê chỉ thấy các tháng bạn đã bấm công bố. Đổi người thuê thì bấm “Tạo lại” để link cũ hết dùng được.
      </p>
    </div>
  );
}
