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
  const idx = all.findIndex((x) => x.id === r.id);
  const prev = idx > 0 ? all[idx - 1] : null;
  const next = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
  const floor = r.name.trim().match(/(\d)\d{2}$/)?.[1];

  return (
    <main className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/admin/phong"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink no-underline transition-colors hover:border-accent"
          >
            <span aria-hidden className="text-lg leading-none">←</span>
            Tất cả phòng
          </Link>
          <nav className="flex items-center gap-2" aria-label="Chuyển phòng">
            <RoomStep room={prev} dir="prev" />
            <RoomStep room={next} dir="next" />
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-bold">
            <span className="font-medium text-muted">Phòng </span>
            {r.name}
          </h1>
          {floor && <span className="chip bg-accent-soft text-accent">Tầng {floor}</span>}
          {r.is_vacant ? (
            <span className="chip bg-warn-bg text-warn">Trống</span>
          ) : (
            <span className="chip bg-ok-bg text-ok">Đang thuê</span>
          )}
        </div>
      </header>

      <ActionForm action={saveRoomAction} className="card flex flex-col gap-3">
        <input type="hidden" name="id" value={r.id} />
        <RoomFormFields
          r={{
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

function RoomStep({ room, dir }: { room: { id: number; name: string } | null; dir: "prev" | "next" }) {
  const cls =
    "inline-flex min-h-11 min-w-16 items-center justify-center gap-1 rounded-xl border border-line bg-surface px-3 text-sm font-semibold no-underline";
  const arrow = dir === "prev" ? "‹" : "›";
  if (!room)
    return (
      <span className={`${cls} opacity-35`} aria-hidden>
        {dir === "prev" ? arrow : null}
        {dir === "prev" ? null : arrow}
      </span>
    );
  return (
    <Link
      href={`/admin/phong/${room.id}`}
      aria-label={`${dir === "prev" ? "Phòng trước" : "Phòng sau"}: ${room.name}`}
      className={`${cls} text-ink transition-colors hover:border-accent`}
    >
      {dir === "prev" && <span aria-hidden>{arrow}</span>}
      {room.name}
      {dir === "next" && <span aria-hidden>{arrow}</span>}
    </Link>
  );
}
