import { ConfirmButton } from "@/components/ConfirmButton";
import { Flash } from "@/components/Flash";
import { FEE_METHOD_LABEL, type FeeMethod } from "@/lib/billing";
import { first, type SP } from "@/lib/params";
import { money } from "@/lib/format";
import { getSettings, listFeeTypes } from "@/lib/queries";
import {
  createFeeTypeAction,
  deleteFeeTypeAction,
  saveSettingsAction,
  updateFeeTypeAction,
} from "../actions";

export const metadata = { title: "Cài đặt" };

const METHODS = Object.keys(FEE_METHOD_LABEL) as FeeMethod[];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const [s, fees] = await Promise.all([getSettings(), listFeeTypes()]);

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
            num
            unit="đ / kWh"
          />
        </section>

        <section className="card flex flex-col gap-3">
          <Head
            icon="💧"
            title="Tiền nước"
            hint="Mỗi người được một lượng nước giá rẻ, dùng quá thì tính giá cao."
          />
          <T
            label="Nước giá rẻ cho mỗi người"
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
              num
              unit="đ / m³"
            />
            <T
              label="Giá vượt định mức"
              name="water_high"
              value={String(s.water_high)}
              num
              unit="đ / m³"
            />
          </div>
        </section>

        <p className="text-xs text-muted">
          Đổi giá chỉ áp dụng cho hóa đơn chưa công bố. Hóa đơn đã công bố giữ
          nguyên giá cũ.
        </p>
        <button type="submit" className="btn-primary">
          Lưu cài đặt
        </button>
      </form>

      <section className="card flex flex-col gap-4">
        <Head
          icon="🧾"
          title="Các loại phí khác"
          hint="Rác, wifi, gửi xe... Bấm vào từng loại để sửa. Mức riêng cho từng phòng chỉnh ở mục Phòng. Phí bằng 0 không hiện trên hóa đơn."
        />

        <ul className="flex flex-col gap-3">
          {fees.map((f) => (
            <li key={f.id} className="rounded-xl border border-line">
              <details>
                <summary className="flex min-h-12 cursor-pointer select-none items-center justify-between gap-2 px-3 py-2">
                  <span className="font-medium">
                    {f.name}
                    {!f.active && (
                      <span className="chip ml-2 bg-warn-bg text-warn">
                        Tắt
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-muted">
                    {money(f.default_amount)}
                    {f.method === "per_person"
                      ? " / người"
                      : f.method === "per_unit"
                        ? " / đơn vị"
                        : ""}
                  </span>
                </summary>
                <div className="border-t border-line p-3">
                  <form
                    action={updateFeeTypeAction}
                    className="grid grid-cols-2 gap-3"
                  >
                    <input type="hidden" name="id" value={f.id} />
                    <T label="Tên loại phí" name="name" value={f.name} span />
                    <div>
                      <label htmlFor={`m-${f.id}`} className="label">
                        Cách tính
                      </label>
                      <select
                        id={`m-${f.id}`}
                        name="method"
                        defaultValue={f.method}
                        className="input"
                      >
                        {METHODS.map((m) => (
                          <option key={m} value={m}>
                            {FEE_METHOD_LABEL[m]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <T
                      label="Mức mặc định (đ)"
                      name="amount"
                      value={String(f.default_amount)}
                      num
                    />
                    <label className="col-span-2 flex min-h-11 items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={f.active}
                        className="size-5"
                      />
                      Đang áp dụng
                    </label>
                    <button type="submit" className="btn-primary col-span-2">
                      Lưu
                    </button>
                  </form>
                  <form action={deleteFeeTypeAction} className="mt-2">
                    <input type="hidden" name="id" value={f.id} />
                    <ConfirmButton
                      message={`Xóa loại phí "${f.name}"? Hóa đơn cũ không bị ảnh hưởng.`}
                      className="btn-danger"
                    >
                      Xóa loại phí
                    </ConfirmButton>
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ul>

        <form
          action={createFeeTypeAction}
          className="grid grid-cols-2 gap-3 border-t border-line pt-4"
        >
          <h3 className="col-span-2 text-sm font-bold">+ Thêm loại phí mới</h3>
          <T
            label="Tên loại phí"
            name="name"
            value=""
            placeholder="Gửi xe"
            span
          />
          <div>
            <label htmlFor="new-method" className="label">
              Cách tính
            </label>
            <select
              id="new-method"
              name="method"
              defaultValue="fixed"
              className="input"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {FEE_METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
          <T
            label="Mức mặc định (đ)"
            name="amount"
            value=""
            num
            placeholder="100000"
          />
          <button type="submit" className="btn-ghost col-span-2">
            Thêm loại phí
          </button>
        </form>
      </section>

      <p className="px-1 text-xs text-muted">
        Mật khẩu đăng nhập, tài khoản ngân hàng nhận tiền và kết nối SePay được đặt trong biến môi trường trên
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
  dec,
  span,
  placeholder,
  unit,
}: {
  label: string;
  name: string;
  value: string;
  num?: boolean;
  dec?: boolean;
  span?: boolean;
  placeholder?: string;
  unit?: string;
}) {
  return (
    <label className={span ? "col-span-2 block" : "block"}>
      <span className="label">{label}</span>
      <span className="relative block">
        <input
          name={name}
          defaultValue={value}
          inputMode={num ? "numeric" : dec ? "decimal" : undefined}
          placeholder={placeholder}
          className={unit ? "input pr-20" : "input"}
        />
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">
            {unit}
          </span>
        )}
      </span>
    </label>
  );
}
