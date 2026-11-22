import Link from "next/link";
import { notFound } from "next/navigation";
import { MoneyInput } from "@/components/MoneyInput";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Flash } from "@/components/Flash";
import { FeeTypes } from "@/components/FeeTypes";
import { TokenPanel } from "@/components/TokenPanel";
import { FEE_METHOD_LABEL } from "@/lib/billing";
import { moneyD } from "@/lib/format";
import { first, type SP } from "@/lib/params";
import { getRoom, getRoomFeeRows, listFeeTypes } from "@/lib/queries";
import { deleteRoomAction, saveRoomAction } from "../../actions";

export const metadata = { title: "Chi tiết phòng" };

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SP;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const roomId = Number(id);
  if (!Number.isInteger(roomId)) notFound();
  const r = await getRoom(roomId);
  if (!r) notFound();
  const [feeRows, feeTypes] = await Promise.all([
    getRoomFeeRows(r.id),
    listFeeTypes(),
  ]);

  return (
    <main className="flex flex-col gap-4">
      <Flash ok={first(sp.ok)} error={first(sp.error)} />
      <div>
        <Link href="/admin/phong" className="text-sm text-muted no-underline">
          ‹ Tất cả phòng
        </Link>
        <h1 className="mt-1 text-lg font-semibold">{r.name}</h1>
      </div>

      <form action={saveRoomAction} className="card flex flex-col gap-3">
        <input type="hidden" name="id" value={r.id} />
        <input type="hidden" name="back" value={`/admin/phong/${r.id}`} />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Tên / số phòng"
            name="name"
            defaultValue={r.name}
            required
          />
          <Field
            label="Giá thuê (đ/tháng)"
            name="rent"
            defaultValue={String(r.rent)}
            money
          />
          <Field
            label="Người đại diện"
            name="tenant_name"
            defaultValue={r.tenant_name}
          />
          <Field
            label="Số điện thoại"
            name="tenant_phone"
            defaultValue={r.tenant_phone}
            inputMode="tel"
          />
          <Field
            label="Số người ở"
            name="occupants"
            defaultValue={String(r.occupants)}
            inputMode="numeric"
          />
          <Field
            label="Tiền cọc (đ)"
            name="deposit"
            defaultValue={String(r.deposit)}
            money
          />
          <Field
            label="Ngày vào ở"
            name="move_in_date"
            type="date"
            defaultValue={r.move_in_date}
          />
          <Field
            label="Ngày chốt số (1–31)"
            name="billing_day"
            defaultValue={String(r.billing_day)}
            inputMode="numeric"
          />
          <Field
            label="Số điện ban đầu (kWh)"
            name="init_elec"
            defaultValue={String(r.init_elec)}
            inputMode="numeric"
          />
          <Field
            label="Số nước ban đầu (m³)"
            name="init_water"
            defaultValue={String(r.init_water)}
            inputMode="numeric"
          />
        </div>
        <p className="text-xs text-muted">
          Số ban đầu chỉ dùng cho tháng đầu tiên. Từ tháng sau, số đầu tự lấy từ
          số cuối tháng trước.
        </p>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="is_vacant"
            defaultChecked={r.is_vacant}
            className="size-5"
          />
          Phòng đang trống (không tạo hóa đơn)
        </label>

        <fieldset className="flex flex-col gap-2 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">
            Các khoản phí của phòng này
          </legend>
          {feeRows.length === 0 ? (
            <p className="text-sm text-muted">
              Chưa có loại phí nào. Thêm ở phần &quot;Thêm / sửa loại phí&quot; bên dưới.
            </p>
          ) : null}
          {feeRows.map((f) => (
            <div
              key={f.id}
              className="grid grid-cols-[auto_1fr_7rem] items-end gap-3 border-t border-line pt-2 first:border-0 first:pt-0"
            >
              <label className="flex min-h-12 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`fee_on_${f.id}`}
                  defaultChecked={f.enabled}
                  className="size-5"
                />
                <span className="font-medium">{f.name}</span>
              </label>
              <div>
                <label htmlFor={`fa-${r.id}-${f.id}`} className="label">
                  Mức riêng (mặc định {moneyD(f.default_amount)})
                </label>
                <MoneyInput
                  id={`fa-${r.id}-${f.id}`}
                  name={`fee_amount_${f.id}`}
                  placeholder={String(f.default_amount)}
                  defaultValue={f.room_amount === null ? "" : String(f.room_amount)}
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
                <p className="pb-3 text-xs text-muted">
                  {FEE_METHOD_LABEL[f.method]}
                </p>
              )}
            </div>
          ))}
        </fieldset>

        <button type="submit" className="btn-primary">
          Lưu phòng
        </button>
      </form>

      <FeeTypes fees={feeTypes} roomId={r.id} back={`/admin/phong/${r.id}`} />

      <section className="card flex flex-col gap-3">
        <h2 className="text-base font-bold">Link xem hóa đơn của người thuê</h2>
        <TokenPanel
          roomId={r.id}
          initialToken={r.token}
          roomName={r.name}
          tenantName={r.tenant_name}
          phone={r.tenant_phone.replace(/\D/g, "")}
        />
        <p className="text-xs text-muted">
          Người thuê chỉ thấy các tháng bạn đã bấm công bố. Khi người thuê trả
          phòng hoặc đổi người, hãy tạo lại link.
        </p>
      </section>

      <form action={deleteRoomAction} className="card">
        <input type="hidden" name="id" value={r.id} />
        <ConfirmButton
          message={`Xóa ${r.name} và toàn bộ hóa đơn của phòng này? Không khôi phục được.`}
          className="btn-danger"
        >
          Xóa phòng
        </ConfirmButton>
      </form>
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
  money,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  inputMode?: "numeric" | "tel" | "text";
  required?: boolean;
  money?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {money ? (
        <MoneyInput name={name} defaultValue={defaultValue} required={required} />
      ) : (
        <input
          name={name}
          type={type}
          inputMode={inputMode}
          defaultValue={defaultValue}
          required={required}
          className="input"
        />
      )}
    </label>
  );
}
