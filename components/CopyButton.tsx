"use client";

import { useState } from "react";

/** Sao chép link. `path` là đường dẫn (ví dụ /p/abc); ghép với địa chỉ web đang mở. */
export function CopyLinkButton({ path, label = "Sao chép link" }: { path: string; label?: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    const url = location.origin + path;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Sao chép link này:", url);
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }

  return (
    <button type="button" onClick={copy} className="btn-ghost">
      {done ? "Đã sao chép" : label}
    </button>
  );
}

export function CopyTextButton({ text, label, className = "btn-primary w-full" }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Sao chép nội dung này:", text);
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }

  return (
    <button type="button" onClick={copy} className={className}>
      {done ? "Đã sao chép" : label}
    </button>
  );
}
