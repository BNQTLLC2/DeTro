"use client";

import { useEffect, useState } from "react";

const LEVELS = ["m", "l", "xl"] as const;
type Level = (typeof LEVELS)[number];
const LABEL: Record<Level, string> = { m: "Cỡ chữ vừa", l: "Cỡ chữ lớn", xl: "Cỡ chữ rất lớn" };

/** Nút "Aa": đổi cỡ chữ cả trang qua 3 mức (vừa, lớn, rất lớn), nhớ lại cho lần sau. */
export function FontSizeToggle() {
  const [level, setLevel] = useState<Level>("m");

  useEffect(() => {
    const v = document.documentElement.dataset.fs;
    setLevel(v === "l" || v === "xl" ? v : "m");
  }, []);

  function next() {
    const n = LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length];
    setLevel(n);
    if (n === "m") delete document.documentElement.dataset.fs;
    else document.documentElement.dataset.fs = n;
    try {
      if (n === "m") localStorage.removeItem("fs");
      else localStorage.setItem("fs", n);
    } catch {
      /* bỏ qua nếu trình duyệt chặn localStorage */
    }
  }

  return (
    <button
      type="button"
      onClick={next}
      aria-label={`${LABEL[level]}. Bấm để đổi cỡ chữ`}
      title={LABEL[level]}
      className="inline-flex h-12 min-w-12 cursor-pointer items-center justify-center gap-0.5 rounded-xl border border-line bg-surface px-2 font-bold text-ink"
    >
      <span className="text-sm">A</span>
      <span className="text-xl leading-none">A</span>
    </button>
  );
}
