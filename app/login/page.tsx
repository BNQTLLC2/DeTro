import { passwordConfigured } from "@/lib/auth";

export const metadata = { title: "Đăng nhập" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const configured = passwordConfigured();
  const msg =
    e === "bad"
      ? "Mật khẩu không đúng."
      : e === "locked"
        ? "Nhập sai quá nhiều lần. Hãy thử lại sau 15 phút."
        : "";

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-5">
      <div>
        <p className="text-sm text-muted">Quản lý phòng trọ</p>
        <h1 className="text-2xl font-bold">Đăng nhập chủ trọ</h1>
      </div>
      {!configured ? (
        <p className="rounded-xl bg-warn-bg p-3 text-sm text-warn">
          Chưa đặt biến môi trường <b>ADMIN_PASSWORD</b>. Thêm biến này trong cài đặt Vercel (hoặc file .env.local khi
          chạy thử) rồi tải lại trang.
        </p>
      ) : null}
      {msg ? (
        <p role="alert" className="rounded-xl bg-bad-bg p-3 text-sm text-bad">
          {msg}
        </p>
      ) : null}
      <form method="post" action="/api/login" className="flex flex-col gap-3">
        <div>
          <label htmlFor="password" className="label">
            Mật khẩu
          </label>
          <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus className="input" />
        </div>
        <button type="submit" className="btn-primary h-12">
          Đăng nhập
        </button>
      </form>
    </main>
  );
}
