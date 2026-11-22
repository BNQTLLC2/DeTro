import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
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
  autoPublishRent,
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
  setPaidAllAction,
  unpublishRentAction,
  unpublishRoomAction,
} from "./actions";

export const metadata = { title: "Tổng quan tháng" };

/** Nút phụ: viền mảnh, thấp hơn nút chính, cùng bo góc và độ rộng để hàng nút gọn gàng. */
const BTN_2ND =
  "inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl border bg-surface px-4 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45";
const SUBTLE = `${BTN_2ND} border-line text-muted hover:bg-idle-bg`;
const CANCEL = `${BTN_2ND} border-bad/40 text-bad hover:bg-bad-bg`;
const NEUTRAL = `${BTN_2ND} border-line text-ink hover:bg-idle-bg`;

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

  await autoPublishRent(); // đến ngày thu thì tự công bố tiền trọ
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
          <ActionForm action={publishAllAction}>
            <input type="hidden" name="period" value={period} />
            <SubmitButton className="btn-primary w-full" pendingText="Đang công bố...">
              Công bố điện, nước tất cả ({rows.filter((r) => r.parts.some((p) => p.key === "other" && p.status === "draft")).length} phòng)
            </SubmitButton>
          </ActionForm>
        ) : null}

        <ul className="card divide-y divide-line overflow-hidden !p-0">
          {shown.map((row) => (
            <RoomItem
              key={row.room.id}
              row={row}
              period={period}
              got={row.inv ? (received.get(row.inv.id) ?? { rent: 0, other: 0 }) : { rent: 0, other: 0 }}
            />
          ))}
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

function Hidden({ room, period }: { room: number; period: string }) {
  return (
    <>
      <input type="hidden" name="room" value={room} />
      <input type="hidden" name="period" value={period} />
    </>
  );
}


type RowData = {
  room: Room;
  inv: Invoice | undefined;
  status: Status;
  res: ReturnType<typeof invoiceResult> | null;
  parts: PartInfo[];
};

/** Chip nhỏ cạnh hạn thu: Chưa công bố / Chưa nhập số. */
const CHIP = "chip w-fit !px-2 !py-0.5 !text-xs bg-warn-bg text-warn";

/**
 * Thẻ thu tiền của một phòng.
 * - "Gộp": cả tiền trọ và chi phí khác đều đã công bố → một thanh tổng, một nút xác nhận chung.
 * - "Chưa gộp": còn đợt chưa công bố / chưa nhập số → mỗi đợt có nút riêng.
 */
function RoomItem({
  row,
  period,
  got,
}: {
  row: RowData;
  period: string;
  got: { rent: number; other: number };
}) {
  const { room, inv, status, res, parts } = row;

  if (status === "vacant") {
    return (
      <li className="flex min-h-[4.5rem] items-center gap-3 px-4 py-3">
        <span
          className={`flex size-12 shrink-0 items-center justify-center rounded-xl text-xl font-bold ${ST.vacant.badge}`}
        >
          {room.name.replace(/^Phòng\s*/i, "")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{room.name}</span>
          <span className="block text-sm text-muted">Chưa có người thuê</span>
        </span>
      </li>
    );
  }

  const hidden = { room: room.id, period };
  const total = parts.reduce((t, p) => t + (p.amount ?? 0), 0);
  const merged =
    parts.length === 2 && parts.every((p) => p.status === "unpaid" || p.status === "paid");
  const unpaidParts = parts.filter((p) => p.status === "unpaid");
  const allPaid = merged && unpaidParts.length === 0;

  // Số đã thu của một đợt: đã đánh dấu thu thì đủ, chưa thì tính theo tiền SePay đã nhận.
  const collectedOf = (p: PartInfo) =>
    p.status === "paid" ? (p.amount ?? 0) : Math.min(got[p.key], p.amount ?? 0);
  const collected = parts.reduce((t, p) => t + collectedOf(p), 0);
  const remaining = Math.max(total - collected, 0);
  const pct = total > 0 ? Math.min(Math.round((collected / total) * 100), 100) : 0;

  // Màu và chữ ở đầu thẻ
  let tone: Status;
  let toneLabel: string;
  if (merged) {
    tone = allPaid ? "paid" : "unpaid";
    toneLabel = allPaid ? "Đã thu đủ" : "Chưa thu đủ";
  } else {
    const unpaidSum = unpaidParts.reduce((t, p) => t + (p.amount ?? 0), 0);
    tone = (["draft", "unpaid", "pending"] as const).find((st) => parts.some((p) => p.status === st)) ?? "paid";
    toneLabel =
      unpaidParts.length > 0
        ? `Chưa thu ${moneyD(unpaidSum)}`
        : tone === "draft"
          ? "Chưa công bố"
          : tone === "pending"
            ? "Chưa nhập số"
            : "Đã thu";
  }
  const s = ST[tone];

  return (
    <li>
      <details className="group">
        <summary className="flex min-h-[4.5rem] cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span
            className={`flex size-12 shrink-0 items-center justify-center rounded-xl text-xl font-bold ${s.badge}`}
          >
            {room.name.replace(/^Phòng\s*/i, "")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{room.name}</span>
            <span className="block break-words text-sm text-muted">
              {room.tenant_name || "Chưa nhập tên"}
            </span>
          </span>
          <span className="shrink-0 text-right">
            {total > 0 ? <span className="block whitespace-nowrap font-bold">{moneyD(total)}</span> : null}
            <span className={`block whitespace-nowrap text-sm font-semibold ${s.text}`}>{toneLabel}</span>
          </span>
          <span
            className="shrink-0 text-muted transition-transform group-open:rotate-180"
            aria-hidden="true"
          >
            ▾
          </span>
        </summary>

        <div className="flex flex-col border-t border-line">
          {/* Gộp: thanh tổng + tiến độ */}
          {merged ? (
            <div className="flex flex-col gap-2 px-4 pt-3 pb-3">
              {allPaid ? (
                <p className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ok px-4 text-center text-base font-bold text-white">
                  <span aria-hidden="true">✓</span> Đã thu đủ {moneyD(total)}
                </p>
              ) : (
                <>
                  <p className="flex min-h-11 items-center justify-center rounded-xl bg-bad-bg px-4 text-center text-base font-bold text-bad">
                    Chưa thu đủ · còn {moneyD(remaining)}
                  </p>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-idle-bg"
                    role="img"
                    aria-label={`Đã thu ${pct}%`}
                  >
                    <div className="h-1.5 rounded-full bg-ok" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-sm text-muted">
                    Đã thu {moneyD(collected)} / {moneyD(total)}
                  </p>
                </>
              )}
            </div>
          ) : null}

          {parts.map((p) => {
            const ps = ST[p.status];
            const rcv = got[p.key];
            const rowCls = "flex flex-col gap-2 border-t border-line px-4 py-3 first:border-t-0";
            return (
              <div key={p.key} className={rowCls}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">{p.label}</p>
                    <p className="text-sm text-muted">Hạn thu {p.due}</p>
                  </div>
                  {p.amount !== null ? (
                    <p className="shrink-0 font-bold">{moneyD(p.amount)}</p>
                  ) : null}
                </div>

                {/* Chip trạng thái (chỉ khi chưa gộp) */}
                {!merged && p.status === "draft" ? <span className={CHIP}>Chưa công bố</span> : null}
                {!merged && p.status === "pending" ? <span className={CHIP}>Chưa nhập số</span> : null}
                {!merged && p.status === "paid" ? (
                  <span className={`chip w-fit !px-2 !py-0.5 !text-xs ${ps.badge}`}>Đã thu</span>
                ) : null}

                {p.key === "other" && p.status === "pending" ? (
                  <p className="text-sm text-muted">
                    Nhập số điện, nước tháng này để tính tiền và công bố cho người thuê.
                  </p>
                ) : null}

                {p.key === "other" && inv && res && p.amount !== null ? (
                  <dl className="flex flex-col gap-1 rounded-xl bg-bg px-3 py-2 text-sm">
                    {(
                      [
                        ["Điện (" + res.kwh + " kWh)", moneyD(res.elecAmount)],
                        ["Nước (" + res.m3 + " m³)", moneyD(res.waterAmount)],
                        ["Phí khác", moneyD(res.feesTotal + res.adjustmentsTotal)],
                      ] as const
                    ).map(([label, val]) => (
                      <div key={label} className="flex justify-between gap-3">
                        <dt className="text-muted">{label}</dt>
                        <dd className="font-semibold">{val}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                {!merged && (p.status === "draft" || p.status === "unpaid") && rcv > 0 && p.amount !== null ? (
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
                  <ActionForm action={p.key === "rent" ? publishRentAction : publishRoomAction}>
                    <Hidden {...hidden} />
                    <SubmitButton className="btn-primary w-full" pendingText="Đang công bố...">
                      {p.key === "rent" ? "Công bố tiền trọ" : "Công bố chi phí"}
                    </SubmitButton>
                  </ActionForm>
                ) : null}

                {p.status === "unpaid" ? (
                  <div className={merged ? "" : "grid grid-cols-[1.4fr_1fr] gap-2"}>
                    {!merged ? (
                      <ActionForm action={setPaidAction}>
                        <Hidden {...hidden} />
                        <input type="hidden" name="part" value={p.key} />
                        <input type="hidden" name="paid" value="1" />
                        <SubmitButton className="btn-primary w-full" pendingText="Đang lưu...">
                          Xác nhận đã thu
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                    <ActionForm action={p.key === "rent" ? unpublishRentAction : unpublishRoomAction}>
                      <Hidden {...hidden} />
                      <ConfirmButton
                        message={`Hủy công bố ${p.key === "rent" ? "tiền trọ" : "điện, nước, phí khác"} của ${room.name}? Người thuê sẽ không còn thấy khoản này.`}
                        className={merged ? CANCEL : `${NEUTRAL} !min-h-12`}
                        pendingText="Đang hủy..."
                      >
                        Hủy công bố
                      </ConfirmButton>
                    </ActionForm>
                  </div>
                ) : null}

                {!merged && p.status === "paid" ? (
                  <ActionForm action={setPaidAction}>
                    <Hidden {...hidden} />
                    <input type="hidden" name="part" value={p.key} />
                    <input type="hidden" name="paid" value="0" />
                    <SubmitButton className={SUBTLE} pendingText="Đang lưu...">
                      Bỏ đánh dấu đã thu
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </div>
            );
          })}

          {/* Gộp: một nút chung ở cuối thẻ */}
          {merged ? (
            <div className="border-t border-line px-4 py-3">
              <ActionForm action={setPaidAllAction}>
                <Hidden {...hidden} />
                <input type="hidden" name="paid" value={allPaid ? "0" : "1"} />
                <SubmitButton
                  className={allPaid ? SUBTLE : "btn-primary w-full"}
                  pendingText="Đang lưu..."
                >
                  {allPaid ? "Bỏ đánh dấu đã thu" : `Xác nhận đã thu · ${moneyD(remaining)}`}
                </SubmitButton>
              </ActionForm>
            </div>
          ) : null}

          <div className="border-t border-line px-4 py-3">
            <Link
              href={`/admin/nhap-so?m=${period}&room=${room.id}`}
              className="text-sm font-semibold text-accent"
            >
              Xem / sửa chi tiết phòng
            </Link>
          </div>
        </div>
      </details>
    </li>
  );
}
