import Link from "next/link";
import { moneyD } from "@/lib/format";
import { listRooms } from "@/lib/queries";

export const metadata = { title: "Quản lý phòng" };

export default async function RoomsPage() {
  const rooms = await listRooms();
  const occupied = rooms.filter((r) => !r.is_vacant).length;

  // Tầng = chữ số đầu của số phòng 3 chữ số (101 -> Tầng 1). Phòng tên khác xếp vào "Khác".
  const byFloor = new Map<string, typeof rooms>();
  for (const r of rooms) {
    const m = r.name.trim().match(/(\d)\d{2}$/);
    const label = m ? `Tầng ${m[1]}` : "Khác";
    byFloor.set(label, [...(byFloor.get(label) ?? []), r]);
  }
  const floors = [...byFloor.entries()]
    .sort(([a], [b]) => (a === "Khác" ? 1 : b === "Khác" ? -1 : a.localeCompare(b)))
    .map(([label, rs]) => ({ label, rooms: rs }));

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-lg font-semibold">Quản lý phòng</h1>
        <p className="text-sm text-muted">
          {occupied}/{rooms.length} phòng đang thuê
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {floors.map((f) => {
          const used = f.rooms.filter((r) => !r.is_vacant).length;
          return (
            <section key={f.label} className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold">{f.label}</h2>
                <span className="text-xs text-muted">
                  {used}/{f.rooms.length} đang thuê
                </span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <ul className="grid grid-cols-3 gap-2 sm:gap-3">
                {f.rooms.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/admin/phong/${r.id}`}
                      className={`card flex h-full flex-col gap-1 border-l-4 !p-3 no-underline transition-colors hover:border-accent ${
                        r.is_vacant ? "border-l-warn" : "border-l-ok"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xl font-bold">{r.name}</span>
                        <span
                          className={`size-2.5 shrink-0 rounded-full ${r.is_vacant ? "bg-warn" : "bg-ok"}`}
                          aria-label={r.is_vacant ? "Trống" : "Đang thuê"}
                        />
                      </div>
                      {r.is_vacant ? (
                        <p className="text-sm font-medium text-warn">Trống</p>
                      ) : (
                        <>
                          <p className={`truncate text-sm font-medium ${r.tenant_name ? "" : "text-muted"}`}>
                            {r.tenant_name || "Chưa có tên"}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {r.rent > 0 ? moneyD(r.rent) : "Chưa có giá"}
                            {" · "}
                            {r.occupants} người
                          </p>
                        </>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
