"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Tổng quan", d: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" },
  { href: "/admin/nhap-so", label: "Nhập số", d: "M4 20h4L18 10l-4-4L4 16v4zM13 7l4 4" },
  { href: "/admin/phong", label: "Phòng", d: "M5 21V4h10v17M3 21h18" },
  { href: "/admin/cai-dat", label: "Cài đặt", d: "M4 7h10M18 7h2M4 17h2M10 17h10M16 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-20 grid min-h-[72px] grid-cols-4 border-t border-line bg-surface md:static md:h-auto md:max-w-xl md:grid-cols-4 md:gap-1 md:border-0 md:bg-transparent"
    >
      {items.map((it) => {
        const active = it.href === "/admin" ? path === "/admin" : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-1 py-2 text-[14px] leading-tight no-underline md:min-h-11 md:flex-row md:justify-center md:gap-2 md:rounded-xl md:text-sm ${
              active ? "font-semibold text-accent md:bg-accent-soft" : "text-muted"
            }`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={it.d} />
            </svg>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
