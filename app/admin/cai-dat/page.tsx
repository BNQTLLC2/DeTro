import { ConfirmButton } from "@/components/ConfirmButton";
import { Flash } from "@/components/Flash";
import { FEE_METHOD_LABEL, type FeeMethod } from "@/lib/billing";
import { first, type SP } from "@/lib/params";
import { getSettings, listFeeTypes } from "@/lib/queries";
import { CopyLinkButton } from "@/components/CopyButton";
import {
  createFeeTypeAction,
  deleteFeeTypeAction,
  saveSettingsAction,
  updateFeeTypeAction,
} from "../actions";

export const metadata = { title: "Cài đặt" };

const METHODS = Object.keys(FEE_METHOD_LABEL) as FeeMethod[];

export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [s, fees] = await Promise.all([getSettings(), listFeeTypes()]);

  return (
    <main className="flex flex-col gap-4">
      <Flash ok={first(sp.ok)} error={first(sp.error)} />
      <h1 className="text-lg font-semibold">Cài đặt</h1>

      <form action={saveSettingsAction} className="card flex flex-col gap-4">
        <h2 className="text-base font-bold">Giá điện, nước và thông tin nhận tiền</h2>
        <p className="text-sm text-muted">
          Đổi giá chỉ áp dụng cho hóa đơn chưa từng công bố. Hóa đơn đã công bố giữ nguyên giá cũ.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <T label="Tên nhà trọ" name="house_name" value={s.house_name} span />
          <T label="Giá điện (đ/kWh)" name="elec_price" value={String(s.elec_price)} num />
          <T label="Hạn đóng sau ngày chốt (ngày)" name="due_days" value={String(s.due_days)} num />
          <T label="Nước giá rẻ mỗi người (m³)" name="water_quota" value={String(s.water_quota)} dec />
          <T label="Giá nước trong định mức (đ/m³)" name="water_low" value={String(s.water_low)} num />
          <T label="Giá nước vượt định mức (đ/m³)" name="water_high" value={String(s.water_high)} num />
        </div>

        <h3 className="text-sm font-bold">Tài khoản nhận tiền (để hiện mã QR chuyển khoản)</h3>
        <div className="grid grid-cols-2 gap-3">
          <T label="Mã ngân hàng (VietQR)" name="bank_code" value={s.bank_code} placeholder="VCB, MB, TCB, ACB, BIDV..." />
          <T label="Số tài khoản" name="bank_account" value={s.bank_account} num />
          <T label="Tên chủ tài khoản" name="bank_holder" value={s.bank_holder} span />
        </div>

        <h3 className="text-sm font-bold">SePay (tự động ghi nhận tiền về)</h3>
        <div className="grid grid-cols-2 gap-3">
          <T label="Tiền tố mã thanh toán" name="sepay_prefix" value={s.sepay_prefix} placeholder="TRO" />
          <div className="flex items-end pb-1 text-sm">
            {process.env.SEPAY_API_KEY ? (
              <span className="chip bg-ok-bg text-ok">Đã đặt SEPAY_API_KEY</span>
            ) : (
              <span className="chip bg-warn-bg text-warn">Chưa đặt SEPAY_API_KEY</span>
            )}
          </div>
        </div>
        <p className="text-xs text-muted">
          Mã ngân hàng là tên viết tắt theo VietQR, ví dụ Vietcombank = VCB, MB Bank = MB, Techcombank = TCB, ACB = ACB,
          BIDV = BIDV, VPBank = VPB, Agribank = VBA. Để trống thì hóa đơn không hiện mã QR.
        </p>

        <button type="submit" className="btn-primary">
          Lưu cài đặt
        </button>
      </form>

      <section className="card flex flex-col gap-4">
        <h2 className="text-base font-bold">Các loại phí khác (rác, wifi, gửi xe...)</h2>
        <p className="text-sm text-muted">
          Thêm hoặc bớt tùy ý. Mức phí của từng phòng (ví dụ tiền rác mỗi phòng một mức) chỉnh ở mục Phòng. Khoản phí bằng
          0 không hiện trên hóa đơn.
        </p>

        <ul className="flex flex-col gap-3">
          {fees.map((f) => (
            <li key={f.id} className="rounded-xl border border-line p-3">
              <form action={updateFeeTypeAction} className="grid grid-cols-2 gap-3">
                <input type="hidden" name="id" value={f.id} />
                <T label="Tên loại phí" name="name" value={f.name} span />
                <div>
                  <label htmlFor={`m-${f.id}`} className="label">
                    Cách tính
                  </label>
                  <select id={`m-${f.id}`} name="method" defaultValue={f.method} className="input">
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {FEE_METHOD_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </div>
                <T label="Mức mặc định (đ)" name="amount" value={String(f.default_amount)} num />
                <label className="col-span-2 flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" name="active" defaultChecked={f.active} className="size-5" />
                  Đang áp dụng
                </label>
                <button type="submit" className="btn-primary col-span-2">
                  Lưu
                </button>
              </form>
              <form action={deleteFeeTypeAction} className="mt-2">
                <input type="hidden" name="id" value={f.id} />
                <ConfirmButton message={`Xóa loại phí "${f.name}"? Hóa đơn cũ không bị ảnh hưởng.`} className="btn-danger">
                  Xóa loại phí
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>

        <form action={createFeeTypeAction} className="grid grid-cols-2 gap-3 border-t border-line pt-4">
          <h3 className="col-span-2 text-sm font-bold">Thêm loại phí</h3>
          <T label="Tên loại phí" name="name" value="" placeholder="Gửi xe" span />
          <div>
            <label htmlFor="new-method" className="label">
              Cách tính
            </label>
            <select id="new-method" name="method" defaultValue="fixed" className="input">
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {FEE_METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
          <T label="Mức mặc định (đ)" name="amount" value="" num placeholder="100000" />
          <button type="submit" className="btn-ghost col-span-2">
            Thêm loại phí
          </button>
        </form>
      </section>

      <section className="card flex flex-col gap-3 text-sm">
        <h2 className="text-base font-bold">Cách bật tự động ghi nhận tiền với SePay</h2>
        <ol className="list-decimal space-y-2 pl-5 text-muted">
          <li>Đăng ký sepay.vn và liên kết tài khoản ngân hàng nhận tiền (đúng tài khoản đã nhập ở trên).</li>
          <li>
            Trong SePay, vào <b>Cấu hình công ty → Cấu trúc mã thanh toán</b>, đặt tiền tố đúng bằng{" "}
            <b>{s.sepay_prefix}</b> (kiểu số ở phần sau).
          </li>
          <li>
            Vào <b>Tích hợp Webhooks → Thêm webhook</b>: sự kiện <b>Có tiền vào</b>, kiểu xác thực <b>API Key</b>, đặt một
            khóa bí mật bất kỳ. URL nhận webhook là địa chỉ bên dưới.
          </li>
          <li>
            Trên Vercel, thêm biến môi trường <b>SEPAY_API_KEY</b> bằng đúng khóa vừa đặt, rồi deploy lại.
          </li>
        </ol>
        <p className="break-all rounded-lg bg-bg p-2 text-xs text-muted">POST /api/sepay</p>
        <div>
          <CopyLinkButton path="/api/sepay" label="Sao chép URL webhook" />
        </div>
        <p className="text-xs text-muted">
          Người thuê quét QR (đã có sẵn số tiền và nội dung chứa mã hóa đơn). Khi tiền về đủ, hóa đơn tự chuyển sang
          &quot;Đã thu&quot;. Tiền về mà không khớp hóa đơn sẽ hiện ở trang Tổng quan để bạn tự đối chiếu. Ngân hàng nào
          yêu cầu nội dung cố định (ví dụ VietinBank với SePay) thì cần chỉnh theo hướng dẫn của SePay.
        </p>
      </section>

      <section className="card text-sm text-muted">
        <h2 className="mb-1 text-base font-bold text-ink">Đăng nhập</h2>
        Mật khẩu chủ trọ đặt trong biến môi trường <b>ADMIN_PASSWORD</b> trên Vercel. Muốn đổi mật khẩu, sửa biến này rồi
        deploy lại.
      </section>
    </main>
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
}: {
  label: string;
  name: string;
  value: string;
  num?: boolean;
  dec?: boolean;
  span?: boolean;
  placeholder?: string;
}) {
  return (
    <label className={span ? "col-span-2 block" : "block"}>
      <span className="label">{label}</span>
      <input
        name={name}
        defaultValue={value}
        inputMode={num ? "numeric" : dec ? "decimal" : undefined}
        placeholder={placeholder}
        className="input"
      />
    </label>
  );
}
