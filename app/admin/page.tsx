import Link from "next/link";
import { Flash } from "@/components/Flash";
import { SendLink } from "@/components/SendLink";
import { moneyD, currentPeriod, isPeriod, periodLabel, shiftPeriod } from "@/lib/format";
import { first, type SP } from "@/lib/params";
import {
  getSettings,
  invoiceResult,
  listInvoices,
  listRooms,
  listUnmatchedPayments,
  receivedByInvoice,
  type Invoice,
  type Room,
} from "@/lib/queries";
import { publishAllAction, publishRoomAction, setPaidAction, unpublishRoomAction } from "./actions";

export const metadata = { title: "Tổng quan tháng" };

type Status = "vacant" | "pending" | "draft" | "unpaid" | "paid";

function statusOf(room: Room, inv: Invoice | undefined): Status {
  if (room.is_vacant) return "vacant";
  if (!inv) return "pending";
  const complete = invoiceResult(inv).complete;
  if (!complete) return "pending";
  if (!inv.published) return "draft";
  return inv.paid_at ? "paid" : "unpaid";
}

const CHIP: Record<Status, { label: string; cls: string }> = {
  vacant: { label: "Phòng trống", cls: "bg-idle-bg text-muted" },
  pending: { label: "Chưa nhập đủ số", cls: "bg-idle-bg text-muted" },
  draft: { label: "Chưa công bố", cls: "bg-warn-bg text-warn" },
  unpaid: { label: "Chưa thu", cls: "bg-bad-bg text-bad" },
  paid: { label: "Đã thu", cls: "bg-ok-bg text-ok" },
};

export default async function Overview({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const m = first(sp.m);
  const period = isPeriod(m) ? m : currentPeriod();
  const back = `/admin?m=${period}`;

  const [rooms, invoices, settings, received, unmatched] = await Promise.all([
    listRooms(),
    listInvoices(period),
    getSettings(),
    receivedByInvoice(),
    listUnmatchedPayments(10),
  ]);
  const byRoom = new Map(invoices.map((i) => [i.room_id, i]));

  let expected = 0;
  let collected = 0;
  let draftCount = 0;
  let pendingCount = 0;
  let liveCount = 0;
  const rows = rooms.map((room) => {
    const inv = byRoom.get(room.id);
    const status = statusOf(room, inv);
    const res = inv ? invoiceResult(inv) : null;
    const total = res && res.complete ? res.total : null;
    if (total !== null) {
      expected += total;
      if (status === "paid") collected += total;
    }
    if (status === "draft") draftCount++;
    if (status === "pending") pendingCount++;
    if (!room.is_vacant) liveCount++;
    return { room, inv, status, res, total };
  });
  const pct = expected > 0 ? Math.round((collected / expected) * 100) : 0;

  return (
    <main>
      <Flash ok={first(sp.ok)} error={first(sp.error)} />

      <div className="mb-3 flex items-center justify-between">
        <Link href={`/admin?m=${shiftPeriod(period, -1)}`} aria-label="Tháng trước" className="btn-ghost size-11 !px-0">
          ‹
        </Link>
        <h1 className="text-lg font-semibold">Tháng {periodLabel(period)}</h1>
        <Link href={`/admin?m=${shiftPeriod(period, 1)}`} aria-label="Tháng sau" className="btn-ghost size-11 !px-0">
          ›
        </Link>
      </div>

      <section className="card mb-3 flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-xs text-muted">Dự kiến</p>
            <p className="text-base font-bold">{moneyD(expected)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Đã thu</p>
            <p className="text-base font-bold text-ok">{moneyD(collected)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Chưa thu</p>
            <p className="text-base font-bold text-bad">{moneyD(expected - collected)}</p>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded bg-line" role="img" aria-label={`Đã thu ${pct}%`}>
          <div className="h-2 rounded bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm text-muted">
          {liveCount} phòng đang ở · {pendingCount} phòng chưa nhập đủ số · {draftCount} phòng chờ công bố
        </p>
        <form action={publishAllAction}>
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="back" value={back} />
          <button type="submit" disabled={draftCount === 0} className="btn-primary w-full">
            {draftCount === 0 ? "Không có phòng nào chờ công bố" : `Công bố tất cả (${draftCount} phòng)`}
          </button>
        </form>
        <p className="text-xs text-muted">Chỉ phòng đã công bố mới hiện hóa đơn trên trang của người thuê.</p>
      </section>

      {unmatched.length > 0 ? (
        <section className="mb-3 rounded-2xl border border-line bg-warn-bg p-4 text-warn">
          <h2 className="font-bold">Tiền về chưa khớp hóa đơn ({unmatched.length})</h2>
          <p className="mb-2 text-sm">
            Người thuê có thể quên hoặc ghi sai nội dung chuyển khoản. Bạn đối chiếu rồi bấm &quot;Đánh dấu đã thu&quot; cho
            đúng phòng.
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {unmatched.map((p) => (
              <li key={p.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {p.tx_date.slice(0, 10)} · {p.content || "(không có nội dung)"}
                </span>
                <b className="shrink-0">{moneyD(p.amount)}</b>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ul className="flex flex-col gap-3">
        {rows.map(({ room, inv, status, res, total }) => {
          const chip = CHIP[status];
          const published = status === "unpaid" || status === "paid";
          return (
            <li key={room.id} className="card flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-sm font-bold text-accent">
                  {room.name.replace(/^Phòng\s*/i, "").slice(0, 4)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{room.name}</p>
                  <p className="truncate text-sm text-muted">
                    {room.is_vacant ? "Chưa có người thuê" : room.tenant_name || "Chưa nhập tên người thuê"}
                    {!room.is_vacant ? ` · ${room.occupants} người` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="font-semibold">{total !== null ? moneyD(total) : "—"}</p>
                  <span className={`chip ${chip.cls}`}>{chip.label}</span>
                </div>
              </div>

              {inv && (received.get(inv.id) ?? 0) > 0 ? (
                <p className="text-xs font-medium text-ok">
                  Đã nhận qua SePay: {moneyD(received.get(inv.id) ?? 0)}
                  {total !== null && (received.get(inv.id) ?? 0) < total ? ` (còn thiếu ${moneyD(total - (received.get(inv.id) ?? 0))})` : ""}
                </p>
              ) : null}

              {!room.is_vacant ? (
                <p className="text-xs text-muted">
                  Điện: {res?.elecState === "ok" ? "đã nhập" : res?.elecState === "invalid" ? "số sai" : "chưa nhập"} ·
                  Nước: {res?.waterState === "ok" ? "đã nhập" : res?.waterState === "invalid" ? "số sai" : "chưa nhập"}
                </p>
              ) : null}

              {!room.is_vacant ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <Link href={`/admin/nhap-so?m=${period}&room=${room.id}`} className="btn-ghost">
                    Nhập số
                  </Link>

                  {status === "draft" ? (
                    <form action={publishRoomAction}>
                      <input type="hidden" name="room" value={room.id} />
                      <input type="hidden" name="period" value={period} />
                      <input type="hidden" name="back" value={back} />
                      <button type="submit" className="btn-primary">
                        Công bố
                      </button>
                    </form>
                  ) : null}

                  {published ? (
                    <>
                      <form action={unpublishRoomAction}>
                        <input type="hidden" name="room" value={room.id} />
                        <input type="hidden" name="period" value={period} />
                        <input type="hidden" name="back" value={back} />
                        <button type="submit" className="btn-ghost">
                          Hủy công bố
                        </button>
                      </form>
                      <form action={setPaidAction}>
                        <input type="hidden" name="room" value={room.id} />
                        <input type="hidden" name="period" value={period} />
                        <input type="hidden" name="back" value={back} />
                        <input type="hidden" name="paid" value={status === "paid" ? "0" : "1"} />
                        <button type="submit" className={status === "paid" ? "btn-ghost" : "btn-primary"}>
                          {status === "paid" ? "Bỏ đánh dấu đã thu" : "Đánh dấu đã thu"}
                        </button>
                      </form>
                    </>
                  ) : null}
                </div>
              ) : null}

              {published && inv && total !== null ? (
                <SendLink
                  path={`/p/${room.token}`}
                  phone={room.tenant_phone.replace(/\D/g, "")}
                  message={`Chào ${room.tenant_name || "bạn"}, hóa đơn ${room.name} tháng ${periodLabel(period)} là ${moneyD(total)}. Xem chi tiết tại: {link}`}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      {settings.bank_code === "" || settings.bank_account === "" ? (
        <p className="mt-4 rounded-xl bg-warn-bg p-3 text-sm text-warn">
          Chưa nhập thông tin ngân hàng nên hóa đơn của người thuê chưa có mã QR chuyển khoản. Vào{" "}
          <Link href="/admin/cai-dat" className="underline">
            Cài đặt
          </Link>{" "}
          để thêm.
        </p>
      ) : null}
    </main>
  );
}
