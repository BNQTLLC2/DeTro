import Link from "next/link";
import { Flash } from "@/components/Flash";
import { moneyD } from "@/lib/format";
import { first, type SP } from "@/lib/params";
import { listRooms } from "@/lib/queries";

export const metadata = { title: "Quản lý phòng" };

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const rooms = await listRooms();
  const occupied = rooms.filter((r) => !r.is_vacant).length;

  return (
    <main className="flex flex-col gap-4">
      <Flash ok={first(sp.ok)} error={first(sp.error)} />
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-lg font-semibold">Quản lý phòng</h1>
        <p className="text-sm text-muted">
          {occupied}/{rooms.length} phòng đang thuê
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {rooms.map((r) => (
          <li key={r.id}>
            <Link
              href={`/admin/phong/${r.id}`}
              className="card flex h-full flex-col gap-3 no-underline transition-colors hover:border-accent"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-lg font-bold">{r.name}</span>
                {r.is_vacant ? (
                  <span className="chip bg-warn-bg text-warn">Trống</span>
                ) : (
                  <span className="chip bg-ok-bg text-ok">Đang thuê</span>
                )}
              </div>

              {r.is_vacant ? (
                <p className="text-sm text-muted">Chưa có người thuê</p>
              ) : (
                <div className="min-w-0">
                  <p
                    className={`break-words font-medium ${r.tenant_name ? "" : "text-muted"}`}
                  >
                    {r.tenant_name || "Chưa nhập tên người thuê"}
                  </p>
                  <p className="break-words text-sm text-muted">
                    {r.tenant_phone || "Chưa có số điện thoại"}
                  </p>
                </div>
              )}

              <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                <Stat
                  label="Tiền phòng"
                  value={r.rent > 0 ? moneyD(r.rent) : "—"}
                />
                <Stat
                  label="Số người"
                  value={r.is_vacant ? "—" : String(r.occupants)}
                />
                <Stat label="Chốt số" value={`ngày ${r.billing_day}`} />
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="break-words text-sm font-semibold">{value}</dd>
    </div>
  );
}
