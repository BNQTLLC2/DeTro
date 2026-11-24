import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { RoomFormFields } from "@/components/RoomFormFields";
import { TokenPanel } from "@/components/TokenPanel";
import { getRoom, listRooms } from "@/lib/queries";
import { saveRoomAction } from "../../actions";

export const metadata = { title: "Chi tiết phòng" };

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const roomId = Number(id);
  if (!Number.isInteger(roomId)) notFound();
  const r = await getRoom(roomId);
  if (!r) notFound();

  const all = await listRooms();

  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/admin/phong"
        className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-muted no-underline"
      >
        <span aria-hidden className="text-lg leading-none">‹</span>
        Tất cả phòng
      </Link>

      <ActionForm action={saveRoomAction} className="card flex flex-col gap-3">
        <input type="hidden" name="id" value={r.id} />
        <RoomFormFields
          roomId={r.id}
          roomName={r.name}
          rooms={all.map((x) => ({ id: x.id, name: x.name, is_vacant: x.is_vacant }))}
          r={{
            rent: String(r.rent),
            rent_cycle: String(r.rent_cycle),
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

      <section className="card">
        <TokenPanel
          roomId={r.id}
          initialToken={r.token}
          roomName={r.name}
          tenantName={r.tenant_name}
        />
      </section>
    </main>
  );
}
