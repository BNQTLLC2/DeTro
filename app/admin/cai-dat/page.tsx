import { MoneyInput } from "@/components/MoneyInput";
import { Flash } from "@/components/Flash";
import { first, type SP } from "@/lib/params";
import { getSettings } from "@/lib/queries";
import { saveSettingsAction } from "../actions";

export const metadata = { title: "Cài đặt" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const s = await getSettings();

  return (
    <main className="flex flex-col gap-4">
      <Flash ok={first(sp.ok)} error={first(sp.error)} />
      <h1 className="text-lg font-semibold">Cài đặt</h1>

      <form action={saveSettingsAction} className="flex flex-col gap-4">
        <section className="card flex flex-col gap-3">
          <Head icon="🏠" title="Thông tin chung" />
          <T label="Tên nhà trọ" name="house_name" value={s.house_name} />
          <T
            label="Hạn đóng tiền sau ngày chốt số"
            name="due_days"
            value={String(s.due_days)}
            num
            unit="ngày"
          />
        </section>

        <section className="card flex flex-col gap-3">
          <Head icon="⚡" title="Tiền điện" />
          <T
            label="Giá điện"
            name="elec_price"
            value={String(s.elec_price)}
            money
            unit="đ / kWh"
          />
        </section>

        <section className="card flex flex-col gap-3">
          <Head
            icon="💧"
            title="Tiền nước"
            hint="Mỗi người có một số khối nước định mức tính giá thấp, dùng vượt thì tính giá cao."
          />
          <T
            label="Số khối nước định mức cho mỗi người"
            name="water_quota"
            value={String(s.water_quota)}
            dec
            unit="m³ / người"
          />
          <div className="grid grid-cols-2 gap-3">
            <T
              label="Giá trong định mức"
              name="water_low"
              value={String(s.water_low)}
              money
              unit="đ / m³"
            />
            <T
              label="Giá vượt định mức"
              name="water_high"
              value={String(s.water_high)}
              money
              unit="đ / m³"
            />
          </div>
        </section>

        <p className="text-xs text-muted">
          Đổi giá sẽ áp dụng ngay cho hóa đơn tháng hiện tại chưa công bố. Hóa
          đơn đã công bố giữ nguyên giá cũ.
        </p>
        <button type="submit" className="btn-primary">
          Lưu cài đặt
        </button>
      </form>

      <p className="px-1 text-xs text-muted">
        Các loại phí (rác, wifi, gửi xe...) chỉnh trong trang từng phòng ở mục Phòng. Mật khẩu đăng nhập, tài khoản ngân hàng nhận tiền và kết nối SePay được đặt trong biến môi trường trên
        Vercel (ADMIN_PASSWORD, SEPAY_API_KEY, SEPAY_PREFIX), không chỉnh ở đây.
      </p>
    </main>
  );
}

function Head({
  icon,
  title,
  hint,
}: {
  icon: string;
  title: string;
  hint?: string;
}) {
  return (
    <div>
      <h2 className="text-base font-bold">
        <span aria-hidden className="mr-2">
          {icon}
        </span>
        {title}
      </h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

function T({
  label,
  name,
  value,
  num,
  money,
  dec,
  span,
  placeholder,
  unit,
}: {
  label: string;
  name: string;
  value: string;
  num?: boolean;
  money?: boolean;
  dec?: boolean;
  span?: boolean;
  placeholder?: string;
  unit?: string;
}) {
  return (
    <label className={span ? "col-span-2 block" : "block"}>
      <span className="label">{label}</span>
      <span className="relative block">
        {money ? (
          <MoneyInput name={name} defaultValue={value} placeholder={placeholder} className={unit ? "input pr-20" : "input"} />
        ) : (
          <input
            name={name}
            defaultValue={value}
            inputMode={num ? "numeric" : dec ? "decimal" : undefined}
            placeholder={placeholder}
            className={unit ? "input pr-20" : "input"}
          />
        )}
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">
            {unit}
          </span>
        )}
      </span>
    </label>
  );
}
