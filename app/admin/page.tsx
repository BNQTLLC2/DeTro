import Link from "next/link";
import { Flash } from "@/components/Flash";
import { SendLink } from "@/components/SendLink";
import {
  moneyD,
  currentPeriod,
  feeDueDate,
  rentDueDate,
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
  publishRentAction,
  publishRoomAction,
  setPaidAction,
  unpublishRentAction,
} from "./actions";

export const metadata = { title: "Tổng quan tháng" };

type Status = "vacant" | "pending" | "draft" | "unpaid" | "paid";

/** Một đợt thu của phòng: tiền trọ (thu theo ngày vào ở) hoặc chi phí khác (thu ngày cố định). */
type PartInfo = {
  key: "rent" | "other";
  label: string;
  status: Status;
  amount: number | null;
  due: string;
};

function rentPart(room: Room, inv: Invoice | undefined, period: string): PartInfo | null {
  const amount = inv?.rent ?? room.rent;
  if (amount <= 0) return null;
  const status: Status = !inv?.rent_published ? "draft" : inv.rent_paid_at ? "paid" : "unpaid";
  return {
    key: "rent",
    label: "Tiền trọ",
    status,
    amount,
    due: rentDueDate(period, room.move_in_date, room.billing_day),
  };
}

function otherPart(room: Room, inv: Invoice | undefined, period: string, feeDay: number): PartInfo {
  const res = inv ? invoiceResult(inv) : null;
  const status: Status =
    !inv || !res?.complete ? "pending" : !inv.published ? "draft" : inv.paid_at ? "paid" : "unpaid";
  return {
    key: "other",
    label: "Điện, nước, phí khác",
    status,
    amount: res?.complete ? res.othersTotal : null,
    due: feeDueDate(period, room.billing_day, feeDay),
  };
}

/** Trạng thái chung của phòng (để tô màu): việc cần làm nhất hiện lên trước. */
function roomStatus(room: Room, parts: PartInfo[]): Status {
  if (room.is_vacant) return "vacant";
  for (const st of ["unpaid", "draft", "pending"] as const) {
    if (parts.some((p) => p.status === st)) return st;
  }
  return "paid";
}

const ST: Record<Status, { label: string; badge: string; text: string }> = {
  vacant: {
    label: "Phòng trống",
    badge: "border-2 border-dashed border-line text-muted",
    text: "text-muted",
  },
  pending: { label: "Chưa nhập số", badge: "bg-idle-bg text-muted", text: "text-muted" },
  draft: { label: "Chờ công bố", badge: "bg-warn-bg text-warn", text: "text-warn" },
  unpaid: { label: "Chưa thu", badge: "bg-bad-bg text-bad", text: "text-bad" },
  paid: { label: "Đã thu", badge: "bg-ok-bg text-ok", text: "text-ok" },
};

/** 3.424.500 -> "3,42tr"; 425.000 -> "425k" */
function moneyShort(n: number): string {
  if (Math.abs(n) >= 1_000_000)
    return `${(n / 1_000_000)
      .toFixed(2)
      .replace(/\.?0+$/, "")
      .replace(".", ",")}tr`;
  return `${Math.round(n / 1000)}k`;
}

type Filter = "all" | "unpaid" | "draft" | "pending" | "paid";
const FILTERS: Filter[] = ["all", "unpaid", "draft", "pending", "paid"];

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
  const countAny: Record<Status, number> = {
    vacant: 0,
    pending: 0,
    draft: 0,
    unpaid: 0,
    paid: 0,
  };
  const count: Record<Status, number> = {
    vacant: 0,
    pending: 0,
    draft: 0,
    unpaid: 0,
    paid: 0,
  };
  const sum: Record<Status, number> = {
    vacant: 0,
    pending: 0,
    draft: 0,
    unpaid: 0,
    paid: 0,
  };
  const rows = rooms.map((room) => {
    const inv = byRoom.get(room.id);
    const parts: PartInfo[] = room.is_vacant
      ? []
      : [rentPart(room, inv, period), otherPart(room, inv, period, settings.fee_day)].filter(
          (p): p is PartInfo => p !== null,
        );
    const status = roomStatus(room, parts);
    const res = inv ? invoiceResult(inv) : null;
    for (const p of parts) {
      if (p.amount === null) continue;
      expected += p.amount;
      sum[p.status] += p.amount;
      if (p.status === "paid") collected += p.amount;
    }
    count[status] = (count[status] ?? 0) + 1;
    // Số phòng theo từng trạng thái (phòng có đợt thu nào ở trạng thái đó)
    for (const st of new Set(parts.map((p) => p.status))) countAny[st]++;
    return { room, inv, status, res, parts };
  });

  const remaining = expected - collected;
  const pct = expected > 0 ? Math.round((collected / expected) * 100) : 0;
  const live = rooms.length - count.vacant;

  const v = first(sp.v);
  const view: Filter = FILTERS.find((f) => f === v) ?? "all";
  const shown = view === "all" ? rows : rows.filter((r) => r.parts.some((p) => p.status === view));
  const unmatchedRecent = recent.filter((p) => p.invoice_id === null).length;

  return (
    <main className="flex flex-col gap-4">
      <Flash ok={first(sp.ok)} error={first(sp.error)} />

      {/* Tổng kết tháng */}
      <section className="rounded-3xl bg-accent p-4 text-accent-ink">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/admin?m=${shiftPeriod(period, -1)}`}
            aria-label="Tháng trước"
            className="flex size-11 items-center justify-center rounded-full bg-accent-ink/15 text-2xl no-underline"
          >
            ‹
          </Link>
          <div className="text-center">
            <h1 className="text-lg font-bold leading-tight">
              Tháng {periodLabel(period)}
            </h1>
            <p className="text-sm opacity-80">
              {live}/{rooms.length} phòng đang thuê
            </p>
          </div>
          <Link
            href={`/admin?m=${shiftPeriod(period, 1)}`}
            aria-label="Tháng sau"
            className="flex size-11 items-center justify-center rounded-full bg-accent-ink/15 text-2xl no-underline"
          >
            ›
          </Link>
        </div>

        <div className="mt-5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base opacity-80">
              {expected === 0
                ? "Chưa có hóa đơn"
                : remaining === 0
                  ? "Đã thu đủ"
                  : "Còn phải thu"}
            </p>
            <p className="text-3xl font-bold leading-tight">
              {moneyD(remaining)}
            </p>
          </div>
          <p className="shrink-0 rounded-full bg-accent-ink/15 px-3 py-1 text-lg font-bold">
            {pct}%
          </p>
        </div>

        <div
          className="mt-4 h-2.5 overflow-hidden rounded-full bg-accent-ink/20"
          role="img"
          aria-label={`Đã thu ${pct}%`}
        >
          <div
            className="h-2.5 rounded-full bg-accent-ink"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-base opacity-90">
          Đã thu {moneyD(collected)} / tổng {moneyD(expected)}
        </p>
      </section>

      {/* Ba con số theo trạng thái, bấm để lọc danh sách */}
      <section className="grid grid-cols-3 gap-2">
        {(
          [
            ["paid", "Đã thu"],
            ["unpaid", "Chưa thu"],
            ["draft", "Chờ công bố"],
          ] as const
        ).map(([k, label]) => (
          <Link
            key={k}
            href={`/admin?m=${period}&v=${view === k ? "all" : k}`}
            aria-current={view === k ? "page" : undefined}
            className={`card flex flex-col gap-0.5 !p-3 no-underline ${
              view === k ? "!border-2 !border-accent" : ""
            }`}
          >
            <span className={`text-sm font-semibold ${ST[k].text}`}>{label}</span>
            <span className="text-xl font-bold leading-tight text-ink">
              {moneyShort(sum[k])}
            </span>
            <span className="text-sm text-muted">{countAny[k]} phòng</span>
          </Link>
        ))}
      </section>

      {/* Danh sách phòng: mỗi phòng hai dòng, bấm để xem chi tiết */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Các phòng</h2>
          {view !== "all" ? (
            <Link
              href={`/admin?m=${period}&v=all`}
              className="flex min-h-11 items-center font-semibold text-accent"
            >
              Xem tất cả
            </Link>
          ) : null}
        </div>

        {rows.filter((r) => r.parts.some((p) => p.key === "other" && p.status === "draft")).length > 1 ? (
          <form action={publishAllAction}>
            <input type="hidden" name="period" value={period} />
            <input type="hidden" name="back" value={back} />
            <button type="submit" className="btn-primary w-full">
              Công bố điện, nước tất cả ({rows.filter((r) => r.parts.some((p) => p.key === "other" && p.status === "draft")).length} phòng)
            </button>
          </form>
        ) : null}

        <ul className="card divide-y divide-line overflow-hidden !p-0">
          {shown.map(({ room, inv, status, res, parts }) => {
            const s = ST[status];
            const got = inv ? (received.get(inv.id) ?? { rent: 0, other: 0 }) : { rent: 0, other: 0 };
            const total = parts.reduce((t, p) => t + (p.amount ?? 0), 0);
            const hidden = { room: room.id, period, back };
            const head = (
              <>
                <span
                  className={`flex size-12 shrink-0 items-center justify-center rounded-xl text-xl font-bold ${s.badge}`}
                >
                  {room.name.replace(/^Phòng\s*/i, "")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{room.name}</span>
                  <span className="block break-words text-sm text-muted">
                    {room.is_vacant
                      ? "Chưa có người thuê"
                      : room.tenant_name || "Chưa nhập tên"}
                  </span>
                  <span className={`block text-sm font-semibold ${s.text}`}>
                    {s.label}
                  </span>
                </span>
                {total > 0 ? (
                  <span className="shrink-0 whitespace-nowrap text-right font-bold">
                    {moneyD(total)}
                  </span>
                ) : null}
              </>
            );

            if (status === "vacant") {
              return (
                <li
                  key={room.id}
                  className="flex min-h-[4.5rem] items-center gap-3 px-4 py-3"
                >
                  {head}
                </li>
              );
            }

            return (
              <li key={room.id}>
                <details className="group">
                  <summary className="flex min-h-[4.5rem] cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    {head}
                    <span
                      className="shrink-0 text-muted transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    >
                      ▾
                    </span>
                  </summary>

                  <div className="flex flex-col gap-3 px-4 pb-4">
                    {parts.map((p) => {
                      const ps = ST[p.status];
                      const rcv = got[p.key];
                      return (
                        <div
                          key={p.key}
                          className="flex flex-col gap-2 rounded-xl border border-line p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-bold">{p.label}</p>
                              <p className="text-sm text-muted">Hạn thu {p.due}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              {p.amount !== null ? (
                                <p className="font-bold">{moneyD(p.amount)}</p>
                              ) : null}
                              <p className={`text-sm font-semibold ${ps.text}`}>
                                {p.key === "rent" && p.status === "draft"
                                  ? "Chưa công bố"
                                  : ps.label}
                              </p>
                            </div>
                          </div>

                          {p.key === "other" && inv && res && p.amount !== null ? (
                            <dl className="flex flex-col gap-1 text-sm">
                              {(
                                [
                                  ["Điện (" + res.kwh + " kWh)", moneyD(res.elecAmount)],
                                  ["Nước (" + res.m3 + " m³)", moneyD(res.waterAmount)],
                                  [
                                    "Phí khác",
                                    moneyD(res.feesTotal + res.adjustmentsTotal),
                                  ],
                                ] as const
                              ).map(([label, val]) => (
                                <div key={label} className="flex justify-between gap-3">
                                  <dt className="text-muted">{label}</dt>
                                  <dd className="font-semibold">{val}</dd>
                                </div>
                              ))}
                            </dl>
                          ) : null}

                          {(p.status === "draft" || p.status === "unpaid") &&
                          rcv > 0 &&
                          p.amount !== null ? (
                            <p className="text-sm font-medium text-ok">
                              Đã nhận {moneyD(rcv)}
                              {rcv < p.amount ? `, còn ${moneyD(p.amount - rcv)}` : ""}
                            </p>
                          ) : null}

                          {p.key === "other" && p.status === "pending" ? (
                            <Link
                              href={`/admin/nhap-so?m=${period}&room=${room.id}`}
                              className="btn-primary w-full"
                            >
                              Nhập số điện, nước
                            </Link>
                          ) : null}

                          {p.status === "draft" ? (
                            <form action={p.key === "rent" ? publishRentAction : publishRoomAction}>
                              <Hidden {...hidden} />
                              <button type="submit" className="btn-primary w-full">
                                {p.key === "rent"
                                  ? "Công bố tiền trọ cho người thuê"
                                  : "Công bố cho người thuê"}
                              </button>
                            </form>
                          ) : null}

                          {p.status === "unpaid" ? (
                            <div className="flex flex-wrap gap-2">
                              <form
                                action={setPaidAction}
                                className="min-w-0 flex-1 basis-40"
                              >
                                <Hidden {...hidden} />
                                <input type="hidden" name="part" value={p.key} />
                                <input type="hidden" name="paid" value="1" />
                                <button type="submit" className="btn-primary w-full">
                                  Đã thu {p.key === "rent" ? "tiền trọ" : "chi phí khác"}
                                </button>
                              </form>
                              {inv && p.amount !== null ? (
                                <SendLink
                                  compact
                                  path={`/p/${room.token}`}
                                  phone={room.tenant_phone.replace(/\D/g, "")}
                                  message={`Chào ${room.tenant_name || "bạn"}, ${p.key === "rent" ? "tiền trọ" : "tiền điện, nước và các chi phí khác"} ${room.name} tháng ${periodLabel(period)} là ${moneyD(p.amount)}, hạn ${p.due}. Xem chi tiết tại: {link}`}
                                />
                              ) : null}
                            </div>
                          ) : null}

                          {p.status === "paid" || (p.key === "rent" && p.status === "unpaid") ? (
                            <form
                              action={
                                p.status === "paid" ? setPaidAction : unpublishRentAction
                              }
                            >
                              <Hidden {...hidden} />
                              {p.status === "paid" ? (
                                <>
                                  <input type="hidden" name="part" value={p.key} />
                                  <input type="hidden" name="paid" value="0" />
                                </>
                              ) : null}
                              <button type="submit" className="btn-ghost w-full">
                                {p.status === "paid" ? "Bỏ đánh dấu đã thu" : "Hủy công bố tiền trọ"}
                              </button>
                            </form>
                          ) : null}
                        </div>
                      );
                    })}

                    <Link
                      href={`/admin/nhap-so?m=${period}&room=${room.id}`}
                      className="text-sm font-semibold text-accent"
                    >
                      Xem / sửa chi tiết phòng
                    </Link>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

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
                  <span className="min-w-0 break-words text-sm">
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
