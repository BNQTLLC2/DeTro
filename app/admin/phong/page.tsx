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
              <ul className="flex flex-col gap-2.5">
                {f.rooms.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/admin/phong/${r.id}`}
                      className={`card flex items-start justify-between gap-3 border-l-4 !px-4 !py-3 no-underline transition-colors hover:border-accent ${
                        r.is_vacant ? "border-l-warn" : "border-l-ok"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block break-words text-xl font-bold leading-tight">
                          {`Phòng ${r.name.trim().replace(/^Phòng\s*/i, "")}`}
                        </span>
                        {r.is_vacant ? null : (
                          <>
                            <span className={`block break-words text-sm font-medium ${r.tenant_name ? "" : "text-muted"}`}>
                              {r.tenant_name || "Chưa có tên"}
                            </span>
                            <span className="block text-[13px] text-muted">
                              {r.rent > 0 ? moneyD(r.rent) : "Chưa có giá"}
                              {" · "}
                              {r.occupants} người
                            </span>
                          </>
                        )}
                      </span>
                      <span
                        className={`flex shrink-0 items-center gap-2 text-sm font-semibold ${r.is_vacant ? "text-warn" : "text-ok"}`}
                      >
                        <span
                          className={`size-2.5 rounded-full ${r.is_vacant ? "bg-warn" : "bg-ok"}`}
                          aria-hidden="true"
                        />
                        {r.is_vacant ? "Trống" : "Đang thuê"}
                      </span>
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
