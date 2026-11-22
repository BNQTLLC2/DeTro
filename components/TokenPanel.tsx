"use client";

import { useState, useTransition } from "react";
import { regenerateTokenInlineAction } from "@/app/admin/actions";
import { CopyLinkButton } from "./CopyButton";
import { SendLink } from "./SendLink";

/** Link xem hóa đơn của một phòng. Đổi link cập nhật ngay tại chỗ, không tải lại trang. */
export function TokenPanel({
  roomId,
  initialToken,
  roomName,
  tenantName,
  phone,
}: {
  roomId: number;
  initialToken: string;
  roomName: string;
  tenantName: string;
  phone: string;
}) {
  const [token, setToken] = useState(initialToken);
  const [note, setNote] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const [pending, start] = useTransition();

  function regenerate() {
    if (
      !window.confirm(
        "Đổi link? Link cũ sẽ không còn xem được. Bạn cần gửi link mới cho người thuê.",
      )
    )
      return;
    start(async () => {
      const r = await regenerateTokenInlineAction(roomId);
      if ("token" in r) {
        setToken(r.token);
        setNote({
          kind: "ok",
          text: "Đã đổi link. Link cũ không còn dùng được, hãy gửi link mới cho người thuê.",
        });
      } else {
        setNote({ kind: "error", text: r.error });
      }
    });
  }

  const path = `/p/${token}`;
  return (
    <div className="flex flex-col gap-3">
      <p className="break-all rounded-lg bg-bg p-2 text-xs text-muted">
        {path}
      </p>
      <div className="flex flex-wrap gap-2">
        <CopyLinkButton path={path} />
        <button
          type="button"
          onClick={regenerate}
          disabled={pending}
          className="btn-ghost disabled:opacity-60"
        >
          {pending ? "Đang đổi..." : "Tạo lại link"}
        </button>
      </div>
      {note ? (
        <p
          role="status"
          className={`rounded-xl p-3 text-sm ${note.kind === "ok" ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`}
        >
          {note.text}
        </p>
      ) : null}
      <SendLink
        path={path}
        phone={phone}
        message={`Chào ${tenantName || "bạn"}, đây là link xem hóa đơn ${roomName} của bạn: {link}`}
      />
    </div>
  );
}
