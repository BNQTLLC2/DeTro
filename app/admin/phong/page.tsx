import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyLinkButton } from "@/components/CopyButton";
import { Flash } from "@/components/Flash";
import { SendLink } from "@/components/SendLink";
import { FEE_METHOD_LABEL } from "@/lib/billing";
import { moneyD } from "@/lib/format";
import { first, type SP } from "@/lib/params";
import { getRoomFeeRows, listRooms } from "@/lib/queries";
import { createRoomAction, deleteRoomAction, regenerateTokenAction, saveRoomAction } from "../actions";

export const metadata = { title: "Quản lý phòng" };

export default async function RoomsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const rooms = await listRooms();
  const feeRows = await Promise.all(rooms.map((r) => getRoomFeeRows(r.id)));

  return (
    <main>
      <Flash ok={first(sp.ok)} error={first(sp.error)} />
      <h1 className="mb-3 text-lg font-semibold">Quản lý phòng</h1>

      <form action={createRoomAction} className="card mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="new-room" className="label">
            Thêm phòng mới
          </label>
          <input id="new-room" name="name" required placeholder="Phòng 10" className="input" />
        </div>
        <button type="submit" className="btn-primary">
          Thêm
        </button>
      </form>

      <ul className="flex flex-col gap-3">
        {rooms.map((r, idx) => (
          <li key={r.id}>
            <details className="card group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className="block truncate text-sm text-muted">
                    {r.is_vacant ? "Phòng trống" : `${r.tenant_name || "Chưa có tên"} · ${r.occupants} người · ${moneyD(r.rent)}`}
                  </span>
                </span>
                <span className="text-muted transition-transform group-open:rotate-90" aria-hidden="true">
                  ›
                </span>
              </summary>

              <form action={saveRoomAction} className="mt-4 flex flex-col gap-3">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="back" value="/admin/phong" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tên / số phòng" name="name" defaultValue={r.name} required />
                  <Field label="Giá thuê (đ/tháng)" name="rent" defaultValue={String(r.rent)} inputMode="numeric" />
                  <Field label="Người đại diện" name="tenant_name" defaultValue={r.tenant_name} />
                  <Field label="Số điện thoại" name="tenant_phone" defaultValue={r.tenant_phone} inputMode="tel" />
                  <Field label="Số người ở" name="occupants" defaultValue={String(r.occupants)} inputMode="numeric" />
                  <Field label="Tiền cọc (đ)" name="deposit" defaultValue={String(r.deposit)} inputMode="numeric" />
                  <Field label="Ngày vào ở" name="move_in_date" type="date" defaultValue={r.move_in_date} />
                  <Field label="Ngày chốt số (1–31)" name="billing_day" defaultValue={String(r.billing_day)} inputMode="numeric" />
                  <Field label="Số điện ban đầu (kWh)" name="init_elec" defaultValue={String(r.init_elec)} inputMode="numeric" />
                  <Field label="Số nước ban đầu (m³)" name="init_water" defaultValue={String(r.init_water)} inputMode="numeric" />
                </div>
                <p className="text-xs text-muted">
                  Số ban đầu chỉ dùng cho tháng đầu tiên. Từ tháng sau, số đầu tự lấy từ số cuối tháng trước.
                </p>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" name="is_vacant" defaultChecked={r.is_vacant} className="size-5" />
                  Phòng đang trống (không tạo hóa đơn)
                </label>

                <fieldset className="flex flex-col gap-2 rounded-xl border border-line p-3">
                  <legend className="px-1 text-sm font-semibold">Các khoản phí của phòng này</legend>
                  {feeRows[idx].length === 0 ? (
                    <p className="text-sm text-muted">Chưa có loại phí nào. Thêm ở mục Cài đặt.</p>
                  ) : null}
                  {feeRows[idx].map((f) => (
                    <div key={f.id} className="grid grid-cols-[auto_1fr_7rem] items-end gap-3 border-t border-line pt-2 first:border-0 first:pt-0">
                      <label className="flex min-h-12 items-center gap-2 text-sm">
                        <input type="checkbox" name={`fee_on_${f.id}`} defaultChecked={f.enabled} className="size-5" />
                        <span className="font-medium">{f.name}</span>
                      </label>
                      <div>
                        <label htmlFor={`fa-${r.id}-${f.id}`} className="label">
                          Mức riêng (mặc định {moneyD(f.default_amount)})
                        </label>
                        <input
                          id={`fa-${r.id}-${f.id}`}
                          name={`fee_amount_${f.id}`}
                          inputMode="numeric"
                          placeholder={String(f.default_amount)}
                          defaultValue={f.room_amount === null ? "" : String(f.room_amount)}
                          className="input"
                        />
                      </div>
                      {f.method === "per_unit" ? (
                        <div>
                          <label htmlFor={`fq-${r.id}-${f.id}`} className="label">
                            Số lượng
                          </label>
                          <input
                            id={`fq-${r.id}-${f.id}`}
                            name={`fee_qty_${f.id}`}
                            inputMode="numeric"
                            defaultValue={String(f.quantity)}
                            className="input"
                          />
                        </div>
                      ) : (
                        <p className="pb-3 text-xs text-muted">{FEE_METHOD_LABEL[f.method]}</p>
                      )}
                    </div>
                  ))}
                </fieldset>

                <button type="submit" className="btn-primary">
                  Lưu phòng
                </button>
              </form>

              <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
                <p className="text-sm font-semibold">Link xem hóa đơn của người thuê</p>
                <p className="break-all rounded-lg bg-bg p-2 text-xs text-muted">/p/{r.token}</p>
                <div className="flex flex-wrap gap-2">
                  <CopyLinkButton path={`/p/${r.token}`} />
                  <form action={regenerateTokenAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <ConfirmButton
                      message="Đổi link? Link cũ sẽ không còn xem được. Bạn cần gửi link mới cho người thuê."
                      className="btn-ghost"
                    >
                      Tạo lại link
                    </ConfirmButton>
                  </form>
                </div>
                <SendLink
                  path={`/p/${r.token}`}
                  phone={r.tenant_phone.replace(/\D/g, "")}
                  message={`Chào ${r.tenant_name || "bạn"}, đây là link xem hóa đơn ${r.name} của bạn: {link}`}
                />
                <p className="text-xs text-muted">
                  Người thuê chỉ thấy các tháng bạn đã bấm công bố. Khi người thuê trả phòng hoặc đổi người, hãy tạo lại link.
                </p>
              </div>

              <form action={deleteRoomAction} className="mt-4 border-t border-line pt-4">
                <input type="hidden" name="id" value={r.id} />
                <ConfirmButton
                  message={`Xóa ${r.name} và toàn bộ hóa đơn của phòng này? Không khôi phục được.`}
                  className="btn-danger"
                >
                  Xóa phòng
                </ConfirmButton>
              </form>
            </details>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  inputMode,
  required,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  inputMode?: "numeric" | "tel" | "text";
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        name={name}
        type={type}
        inputMode={inputMode}
        defaultValue={defaultValue}
        required={required}
        className="input"
      />
    </label>
  );
}
