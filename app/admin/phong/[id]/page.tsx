import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { RoomFormFields } from "@/components/RoomFormFields";
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
        <RoomFormFields
          r={{
            name: r.name,
            rent: String(r.rent),
            tenant_name: r.tenant_name,
            tenant_phone: r.tenant_phone,
            occupants: String(r.occupants),
            move_in_date: r.move_in_date,
            init_elec: String(r.init_elec),
            init_water: String(r.init_water),
            is_vacant: r.is_vacant,
          }}
        />

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
