import Link from "next/link";
import { Flash } from "@/components/Flash";
import { SendLink } from "@/components/SendLink";
import {
  moneyD,
  currentPeriod,
  isPeriod,
  periodLabel,
  shiftPeriod,
} from "@/lib/format";
import { first, type SP } from "@/lib/params";
import {
  getSettings,
  invoiceResult,
  listInvoices,
  listRooms,
  listRecentPayments,
  receivedByInvoice,
  type Invoice,
  type Room,
} from "@/lib/queries";
import {
  publishAllAction,
  publishRoomAction,
  setPaidAction,
  unpublishRoomAction,
} from "./actions";

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

const CHIP: Record<Status, { label: string; cls: string; bar: string }> = {
  vacant: {
    label: "Phòng trống",
    cls: "bg-idle-bg text-muted",
    bar: "!border-l-line",
  },
  pending: {
    label: "Chưa nhập đủ số",
    cls: "bg-idle-bg text-muted",
    bar: "!border-l-c-trash",
  },
  draft: {
    label: "Chờ công bố",
    cls: "bg-warn-bg text-warn",
    bar: "!border-l-c-elec",
  },
  unpaid: {
    label: "Chưa thu",
    cls: "bg-bad-bg text-bad",
    bar: "!border-l-bad",
  },
  paid: { label: "Đã thu", cls: "bg-ok-bg text-ok", bar: "!border-l-ok" },
};

export default async function Overview({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const m = first(sp.m);
  const period = isPeriod(m) ? m : currentPeriod();
  const back = `/admin?m=${period}`;

  const [rooms, invoices, settings, received, recent] = await Promise.all([
    listRooms(),
    listInvoices(period),
    getSettings(),
    receivedByInvoice(),
    listRecentPayments(8),
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
  const unmatchedRecent = recent.filter((p) => p.invoice_id === null).length;
  const pct = expected > 0 ? Math.round((collected / expected) * 100) : 0;

  return (
    <main className="flex flex-col gap-4">
      <Flash ok={first(sp.ok)} error={first(sp.error)} />

      <div className="flex items-center justify-between">
        <Link
          href={`/admin?m=${shiftPeriod(period, -1)}`}
          aria-label="Tháng trước"
          className="btn-ghost size-12 !px-0"
        >
          ‹
        </Link>
        <h1 className="text-xl font-bold">Tháng {periodLabel(period)}</h1>
        <Link
          href={`/admin?m=${shiftPeriod(period, 1)}`}
          aria-label="Tháng sau"
          className="btn-ghost size-12 !px-0"
        >
          ›
        </Link>
      </div>

      {/* Tổng kết tiền */}
      <section className="card flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">Đã thu</p>
            <p className="text-3xl font-bold text-ok">{moneyD(collected)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-muted">Còn thiếu</p>
            <p className="text-xl font-bold text-bad">
              {moneyD(expected - collected)}
            </p>
          </div>
        </div>
        <div
          className="h-3 overflow-hidden rounded-full bg-line"
          role="img"
          aria-label={`Đã thu ${pct}%`}
        >
          <div
            className="h-3 rounded-full bg-ok"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-sm text-muted">
          {pct}% của tổng {moneyD(expected)} · {liveCount} phòng đang ở
        </p>
      </section>

      {/* Việc cần làm tiếp theo */}
      {pendingCount > 0 || draftCount > 0 ? (
        <section className="flex flex-col gap-2">
          {pendingCount > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
              <p className="font-medium">
                <span className="mr-2 text-xl font-bold">{pendingCount}</span>
                phòng chưa nhập đủ số
              </p>
              <Link
                href={`/admin/nhap-so?m=${period}`}
                className="btn-ghost shrink-0"
              >
                Nhập số
              </Link>
            </div>
          ) : null}
          {draftCount > 0 ? (
            <form
              action={publishAllAction}
              className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-warn-bg p-4"
            >
              <input type="hidden" name="period" value={period} />
              <input type="hidden" name="back" value={back} />
              <p className="font-medium text-warn">
                <span className="mr-2 text-xl font-bold">{draftCount}</span>
                phòng chờ công bố
              </p>
              <button type="submit" className="btn-primary shrink-0">
                Công bố tất cả
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {/* Danh sách phòng */}
      <ul className="flex flex-col gap-3">
        {rows.map(({ room, inv, status, res, total }) => {
          const chip = CHIP[status];
          const published = status === "unpaid" || status === "paid";
          const got = inv ? (received.get(inv.id) ?? 0) : 0;
          const hidden = { room: room.id, period, back };
          if (status === "pending") {
            // Phòng chưa nhập đủ số: một dòng gọn, bấm vào để nhập (tránh lặp nút giống nhau ở mọi phòng).
            return (
              <li key={room.id}>
                <Link
                  href={`/admin/nhap-so?m=${period}&room=${room.id}`}
                  className={`card flex items-center justify-between gap-3 border-l-8 py-3 no-underline ${chip.bar}`}
                >
                  <span className="min-w-0">
                    <span className="block text-lg font-bold">{room.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {room.tenant_name || "Chưa nhập tên"} · {room.occupants}{" "}
                      người
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-sm font-medium">
                    <span
                      className={
                        res?.elecState === "ok" ? "text-ok" : "text-muted"
                      }
                    >
                      ⚡ {res?.elecState === "ok" ? "✓" : "○"}
                    </span>
                    <span
                      className={
                        res?.waterState === "ok" ? "text-ok" : "text-muted"
                      }
                    >
                      💧 {res?.waterState === "ok" ? "✓" : "○"}
                    </span>
                    <span className="text-xl text-accent" aria-hidden="true">
                      ›
                    </span>
                  </span>
                </Link>
              </li>
            );
          }
          return (
            <li
              key={room.id}
              className={`card border-l-8 ${chip.bar} flex flex-col gap-3 ${status === "vacant" ? "opacity-70" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-bold">{room.name}</p>
                  <p className="truncate text-sm text-muted">
                    {room.is_vacant
                      ? "Chưa có người thuê"
                      : `${room.tenant_name || "Chưa nhập tên"} · ${room.occupants} người`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-lg font-bold">
                    {total !== null ? moneyD(total) : "—"}
                  </p>
                  <span className={`chip ${chip.cls}`}>{chip.label}</span>
                </div>
              </div>

              {got > 0 ? (
                <p className="text-sm font-medium text-ok">
                  Đã nhận qua SePay {moneyD(got)}
                  {total !== null && got < total
                    ? `, còn thiếu ${moneyD(total - got)}`
                    : ""}
                </p>
              ) : null}

              {!room.is_vacant ? (
                <div className="flex flex-col gap-2 border-t border-line pt-3">
                  {status === "draft" ? (
                    <form action={publishRoomAction}>
                      <Hidden {...hidden} />
                      <button type="submit" className="btn-primary w-full">
                        Công bố cho người thuê
                      </button>
                    </form>
                  ) : null}
                  {status === "unpaid" ? (
                    <form action={setPaidAction}>
                      <Hidden {...hidden} />
                      <input type="hidden" name="paid" value="1" />
                      <button type="submit" className="btn-primary w-full">
                        Đánh dấu đã thu
                      </button>
                    </form>
                  ) : null}

                  <details className="group">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium text-accent">
                      <span>Thêm thao tác</span>
                      <span
                        className="transition-transform group-open:rotate-180"
                        aria-hidden="true"
                      >
                        ▾
                      </span>
                    </summary>
                    <div className="mt-2 flex flex-col gap-2">
                      <Link
                        href={`/admin/nhap-so?m=${period}&room=${room.id}`}
                        className="btn-ghost"
                      >
                        Xem / sửa số điện nước
                      </Link>
                      {published ? (
                        <>
                          {status === "paid" ? (
                            <form action={setPaidAction}>
                              <Hidden {...hidden} />
                              <input type="hidden" name="paid" value="0" />
                              <button
                                type="submit"
                                className="btn-ghost w-full"
                              >
                                Bỏ đánh dấu đã thu
                              </button>
                            </form>
                          ) : null}
                          <form action={unpublishRoomAction}>
                            <Hidden {...hidden} />
                            <button type="submit" className="btn-ghost w-full">
                              Hủy công bố
                            </button>
                          </form>
                        </>
                      ) : null}
                      {published && inv && total !== null ? (
                        <SendLink
                          path={`/p/${room.token}`}
                          phone={room.tenant_phone.replace(/\D/g, "")}
                          message={`Chào ${room.tenant_name || "bạn"}, hóa đơn ${room.name} tháng ${periodLabel(period)} là ${moneyD(total)}. Xem chi tiết tại: {link}`}
                        />
                      ) : null}
                    </div>
                  </details>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Giao dịch SePay */}
      {recent.length > 0 ? (
        <details className="card group" open={unmatchedRecent > 0}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2">
            <span className="font-bold">
              Giao dịch SePay gần đây
              {unmatchedRecent > 0 ? (
                <span className="chip ml-2 bg-warn-bg text-warn">
                  {unmatchedRecent} chưa khớp
                </span>
              ) : null}
            </span>
            <span
              className="transition-transform group-open:rotate-180"
              aria-hidden="true"
            >
              ▾
            </span>
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {recent.map((p) => (
              <li key={p.id} className="flex flex-col gap-0.5 py-3">
                <div className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-sm">
                    {p.tx_date.slice(5, 16)} ·{" "}
                    {p.content || "(không có nội dung)"}
                  </span>
                  <b className="shrink-0">{moneyD(p.amount)}</b>
                </div>
                <span
                  className={`text-sm ${p.invoice_id === null ? "font-medium text-warn" : "text-muted"}`}
                >
                  {p.invoice_id === null ? "⚠ Chưa khớp: " : "✓ "}
                  {p.note || "Đã ghi nhận"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">
            Giao dịch chưa khớp thì bạn đối chiếu rồi bấm &quot;Đánh dấu đã
            thu&quot; cho đúng phòng.
          </p>
        </details>
      ) : null}

      {settings.bank_code === "" || settings.bank_account === "" ? (
        <p className="rounded-xl bg-warn-bg p-3 text-sm text-warn">
          Chưa cấu hình tài khoản ngân hàng nên hóa đơn của người thuê chưa có
          mã QR chuyển khoản. Hãy đặt biến môi trường BANK_CODE và BANK_ACCOUNT
          trên Vercel rồi deploy lại.
        </p>
      ) : null}
    </main>
  );
}

function Hidden({
  room,
  period,
  back,
}: {
  room: number;
  period: string;
  back: string;
}) {
  return (
    <>
      <input type="hidden" name="room" value={room} />
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="back" value={back} />
    </>
  );
}
