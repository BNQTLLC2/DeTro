"use client";

import { useState } from "react";

/**
 * Gửi link hóa đơn cho người thuê theo số điện thoại đã lưu.
 * - Zalo: sao chép sẵn tin nhắn rồi mở khung chat Zalo của số đó (dán và gửi).
 * Không dùng được khi phòng chưa công bố hoặc chưa có số điện thoại.
 */
export function SendLink({
  path,
  phone,
  message,
}: {
  path: string;
  phone: string;
  message: string; // chứa {link} để thay bằng link thật
}) {
  const [note, setNote] = useState("");

  const full = () => message.replace("{link}", location.origin + path);

  async function zalo() {
    const text = full();
    try {
      await navigator.clipboard.writeText(text);
      setNote("Đã sao chép tin nhắn. Dán vào khung chat Zalo rồi gửi.");
    } catch {
      setNote("Không sao chép được tự động. Hãy chép tin nhắn thủ công.");
    }
    // Link Zalo dùng đầu số quốc tế: 0912... -> 84912...
    const zaloNumber = phone.startsWith("0") ? "84" + phone.slice(1) : phone;
    window.open(`https://zalo.me/${zaloNumber}`, "_blank", "noopener");
  }

  if (!phone) {
    return <p className="text-xs text-muted">Chưa có số điện thoại, thêm ở mục Phòng để gửi link.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={zalo} className="btn-primary">
          Gửi qua Zalo
        </button>
      </div>
      {note ? <p className="text-xs text-muted">{note}</p> : null}
    </div>
  );
}
