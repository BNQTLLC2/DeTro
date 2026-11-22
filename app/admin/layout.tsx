import type { ReactNode } from "react";
import { AdminNav } from "@/components/AdminNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  const settings = await getSettings();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 md:pb-10">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">Quản lý phòng trọ</p>
          <p className="truncate text-lg font-bold">{settings.house_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form method="post" action="/api/logout">
            <button type="submit" className="btn-ghost">
              Đăng xuất
            </button>
          </form>
        </div>
        <div className="w-full md:order-last">
          <AdminNav />
        </div>
      </header>
      {children}
    </div>
  );
}
