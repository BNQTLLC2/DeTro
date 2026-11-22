import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { MoneyInput } from "@/components/MoneyInput";
import { TokenPanel } from "@/components/TokenPanel";
import { getRoom } from "@/lib/queries";
import { saveRoomAction } from "../../actions";

export const metadata = { title: "Chi tiết phòng" };

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const roomId = Number(id);
  if (!Number.isInteger(roomId)) notFound();
  const r = await getRoom(roomId);
  if (!r) notFound();

  return (
    <main className="flex flex-col gap-4">
      <div>
        <Link href="/admin/phong" className="text-sm text-muted no-underline">
          ‹ Tất cả phòng
        </Link>
        <h1 className="mt-1 text-lg font-semibold">{r.name}</h1>
      </div>

      <ActionForm action={saveRoomAction} className="card flex flex-col gap-3">
        <input type="hidden" name="id" value={r.id} />
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

        <SubmitButton className="btn-primary" pendingText="Đang lưu...">
          Lưu phòng
        </SubmitButton>
      </ActionForm>

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
