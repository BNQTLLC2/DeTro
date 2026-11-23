import Link from "next/link";
import { MoneyInput } from "@/components/MoneyInput";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FeeTypes } from "@/components/FeeTypes";
import { ReadingForm } from "@/components/ReadingForm";
import { FEE_METHOD_LABEL, computeInvoice } from "@/lib/billing";
import {
  currentPeriod,
  isPeriod,
  moneyD,
  periodLabel,
  shiftPeriod,
  shortDate,
} from "@/lib/format";
import { first, type SP } from "@/lib/params";
import {
  getInvoice,
  getRoom,
  getRoomFeeRows,
  getSettings,
  invoiceInput,
  invoiceResult,
  listInvoices,
  listRooms,
  readingDefaults,
} from "@/lib/queries";
import {
  deleteFeeTypeAction,
  publishRoomAction,
  removeAdjustmentAction,
  saveFeesAction,
  saveReadingAction,
  unpublishRoomAction,
} from "../actions";

export const metadata = { title: "Nhập chỉ số" };

export default async function EnterReadings({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const m = first(sp.m);
  const period = isPeriod(m) ? m : currentPeriod();

  const rooms = (await listRooms()).filter((r) => !r.is_vacant);
  const invoices = await listInvoices(period);
  const byRoom = new Map(invoices.map((i) => [i.room_id, i]));

  const roomParam = Number(first(sp.room));
  const selected = rooms.find((r) => r.id === roomParam) ?? rooms[0];

  const header = (
    <div className="mb-3 flex items-center justify-between">
      <Link
        href={`/admin/nhap-so?m=${shiftPeriod(period, -1)}`}
        aria-label="Tháng trước"
        className="btn-ghost size-11 !px-0"
      >
        ‹
      </Link>
      <h1 className="text-lg font-semibold">
        Nhập chỉ số · Tháng {periodLabel(period)}
      </h1>
      <Link
        href={`/admin/nhap-so?m=${shiftPeriod(period, 1)}`}
        aria-label="Tháng sau"
        className="btn-ghost size-11 !px-0"
      >
        ›
      </Link>
    </div>
  );

  if (!selected) {
    return (
      <main>
        {header}
        <p className="card text-sm text-muted">
          Chưa có phòng nào đang ở. Vào mục Phòng để thêm thông tin người thuê.
        </p>
      </main>
    );
  }

  const settings = await getSettings();
  const inv =
    byRoom.get(selected.id) ?? (await getInvoice(selected.id, period));
  const defaults = await readingDefaults(selected, inv, period);
  const feeRows = await getRoomFeeRows(selected.id);

  // Tạm tính: dùng số đã lưu và giá hiện hành (nếu chưa có hóa đơn thì dùng cài đặt hiện tại).
  const res = inv
    ? invoiceResult(inv)
    : computeInvoice({
        rent: selected.rent,
        occupants: selected.occupants,
        elecStart: null,
        elecEnd: null,
        waterStart: null,
        waterEnd: null,
        elecPrice: settings.elec_price,
        waterQuotaPerPerson: settings.water_quota,
        waterLow: settings.water_low,
        waterHigh: settings.water_high,
        fees: [],
        adjustments: [],
      });
  const input = inv ? invoiceInput(inv) : null;
  const elecDone = res.elecState === "ok";
  const waterDone = res.waterState === "ok";
  const roomChip =
    elecDone && waterDone
      ? { text: "Đủ số", cls: "bg-ok-bg text-ok" }
      : elecDone
        ? { text: "Thiếu nước", cls: "bg-warn-bg text-warn" }
        : waterDone
          ? { text: "Thiếu điện", cls: "bg-warn-bg text-warn" }
          : { text: "Chưa nhập", cls: "bg-idle-bg text-muted" };
  const published = !!inv?.published;
  const price = inv?.elec_price ?? settings.elec_price;
  const quotaPer = inv?.water_quota ?? settings.water_quota;
  const quota = selected.occupants * quotaPer;
  const lowP = inv?.water_low ?? settings.water_low;
  const highP = inv?.water_high ?? settings.water_high;

  return (
    <main>
      {header}

      <nav
        aria-label="Chọn phòng"
        className="-mx-4 mb-4 no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1"
      >
        {rooms.map((r) => {
          const i = byRoom.get(r.id);
          const rr = i ? invoiceResult(i) : null;
          const active = r.id === selected.id;
          const elecOk = rr?.elecState === "ok";
          const waterOk = rr?.waterState === "ok";
          return (
            <Link
              key={r.id}
              href={`/admin/nhap-so?m=${period}&room=${r.id}`}
              aria-current={active ? "true" : undefined}
              className={`flex min-w-[88px] flex-1 shrink-0 basis-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2 no-underline ${
                active
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-surface"
              }`}
            >
              <span className="whitespace-nowrap text-base font-bold">
                {r.name}
              </span>
              <span className="flex items-center gap-1.5">
                <MeterBadge kind="elec" on={elecOk} />
                <MeterBadge kind="water" on={waterOk} />
              </span>
              <span className="sr-only">
                Điện {elecOk ? "đã" : "chưa"} nhập, nước {waterOk ? "đã" : "chưa"} nhập
              </span>
            </Link>
          );
        })}
      </nav>

      <section className="card mb-3 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 11 12 3l9 8M5 10v10h14V10M10 20v-6h4v6" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="whitespace-nowrap text-2xl font-bold leading-tight">
              {/^phòng\b/i.test(selected.name) ? selected.name : `Phòng ${selected.name}`}
            </h2>
            <p className="text-sm text-muted">
              {selected.tenant_name || "Chưa có tên người thuê"} · {selected.occupants} người
            </p>
          </div>
          <span className={`chip shrink-0 ${roomChip.cls}`}>{roomChip.text}</span>
        </div>
        <ul className="flex flex-col border-t border-line">
          <MeterStatus kind="elec" label="Điện" on={res.elecState === "ok"} />
          <MeterStatus kind="water" label="Nước" on={res.waterState === "ok"} />
        </ul>
      </section>

      <section className="card mb-3 flex flex-col gap-3 border-l-4 !border-l-c-elec">
        <MeterHead
          icon="⚡"
          title="Điện"
          ok={res.elecState === "ok"}
          date={inv?.elec_read_at}
        />
        <ReadingForm
          key={`e-${selected.id}-${period}-${inv?.elec_end ?? "x"}-${inv?.elec_start ?? "x"}`}
          kind="elec"
          action={saveReadingAction}
          roomId={selected.id}
          period={period}
          defaultStart={defaults.elecStart}
          defaultEnd={inv?.elec_end ?? null}
          saved={res.elecState === "ok"}
          price={price}
        />
      </section>

      <section className="card mb-3 flex flex-col gap-3 border-l-4 !border-l-c-water">
        <MeterHead
          icon="💧"
          title="Nước"
          ok={res.waterState === "ok"}
          date={inv?.water_read_at}
          sub={`Định mức ${quota} m³ (${selected.occupants} người × ${quotaPer})`}
        />
        <ReadingForm
          key={`w-${selected.id}-${period}-${inv?.water_end ?? "x"}-${inv?.water_start ?? "x"}`}
          kind="water"
          action={saveReadingAction}
          roomId={selected.id}
          period={period}
          defaultStart={defaults.waterStart}
          defaultEnd={inv?.water_end ?? null}
          saved={res.waterState === "ok"}
          quota={quota}
          low={lowP}
          high={highP}
        />
      </section>

      <section className="card mb-3">
        <ActionForm
          action={saveFeesAction}
          className="flex flex-col gap-3"
          key={`fees-${selected.id}-${period}`}
        >
          <input type="hidden" name="room" value={selected.id} />
          <input type="hidden" name="period" value={period} />
          <div>
            <h3 className="text-base font-bold">Các khoản phí khác</h3>
            <p className="text-sm text-muted">
              Tự lấy theo lần lưu gần nhất (tháng trước). Bấm lưu để áp dụng cho
              tháng này và các tháng sau.
            </p>
          </div>
          {feeRows.length === 0 ? (
            <p className="text-sm text-muted">
              Chưa có loại phí nào. Thêm ở phần &quot;Thêm khoản phí hoặc giảm giá&quot;
              bên dưới.
            </p>
          ) : null}
          {feeRows.map((f) => (
            <div
              key={`${f.id}-${f.enabled}-${f.room_amount}-${f.quantity}`}
              className="flex flex-col gap-2 border-t border-line pt-3"
            >
              <div className="flex items-center gap-2">
                <label className="flex min-h-11 flex-1 items-center gap-3">
                  <input
                    type="checkbox"
                    name={`fee_on_${f.id}`}
                    defaultChecked={f.enabled}
                    className="size-5"
                  />
                  <span className="font-medium">{f.name}</span>
                  <span className="ml-auto text-xs text-muted">
                    {FEE_METHOD_LABEL[f.method]}
                  </span>
                </label>
                {f.name !== "Tiền rác" ? (
                  <ConfirmButton
                    message={`Xóa "${f.name}" khỏi tất cả các phòng? Hóa đơn đã công bố không bị ảnh hưởng.`}
                    className="btn-ghost !min-h-9 shrink-0 !px-3 text-sm"
                    action={deleteFeeTypeAction.bind(null, f.id)}
                  >
                    Xóa
                  </ConfirmButton>
                ) : null}
              </div>
              <div
                className={
                  f.method === "per_unit" ? "grid grid-cols-2 gap-3" : ""
                }
              >
                <div>
                  <label htmlFor={`fa-${f.id}`} className="label">
                    Mức (mặc định {moneyD(f.default_amount)})
                  </label>
                  <MoneyInput
                    id={`fa-${f.id}`}
                    name={`fee_amount_${f.id}`}
                    placeholder={String(f.default_amount)}
                    defaultValue={
                      f.room_amount === null ? "" : String(f.room_amount)
                    }
                  />
                </div>
                {f.method === "per_unit" ? (
                  <div>
                    <label htmlFor={`fq-${f.id}`} className="label">
                      Số lượng
                    </label>
                    <input
                      id={`fq-${f.id}`}
                      name={`fee_qty_${f.id}`}
                      inputMode="numeric"
                      defaultValue={String(f.quantity)}
                      className="input"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {feeRows.length > 0 ? (
            <SubmitButton className="btn-primary" pendingText="Đang lưu...">
              Lưu các khoản phí
            </SubmitButton>
          ) : null}
        </ActionForm>
        {inv && inv.adjustments.length > 0 ? (
          <div className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
            <h4 className="font-semibold">Chỉ tháng này</h4>
            <ul className="flex flex-col divide-y divide-line">
              {inv.adjustments.map((a, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span>{a.name}</span>
                  <span className="flex items-center gap-2">
                    <b>{moneyD(a.amount)}</b>
                    <ActionForm action={removeAdjustmentAction}>
                      <input type="hidden" name="room" value={selected.id} />
                      <input type="hidden" name="period" value={period} />
                      <input type="hidden" name="index" value={idx} />
                      <ConfirmButton
                        message="Bỏ khoản này?"
                        className="btn-ghost !min-h-9 !px-3 text-sm"
                      >
                        Xóa
                      </ConfirmButton>
                    </ActionForm>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <FeeTypes roomId={selected.id} period={period} />
      <div className="mb-3" />

      <section className="card flex flex-col gap-2">
        <h3 className="text-base font-bold">
          Tạm tính chi phí khác {selected.name}
        </h3>
        <p className="text-sm text-muted">
          Tiền trọ ({moneyD(inv?.rent ?? selected.rent)}) thu riêng theo ngày vào ở, công bố ở trang Tổng quan.
        </p>
        <Row
          label="Tiền điện"
          value={res.elecState === "ok" ? moneyD(res.elecAmount) : "Chưa nhập"}
        />
        <Row
          label="Tiền nước"
          value={
            res.waterState === "ok" ? moneyD(res.waterAmount) : "Chưa nhập"
          }
        />
        {(input?.fees ?? []).map((f, i) => (
          <Row key={i} label={f.name} value={moneyD(f.amount)} />
        ))}
        {(input?.adjustments ?? []).map((f, i) => (
          <Row key={`a${i}`} label={f.name} value={moneyD(f.amount)} />
        ))}
        <div className="flex items-baseline justify-between border-t border-line pt-2">
          <span className="font-semibold">
            {res.complete ? "Tổng chi phí khác" : "Tạm tính (chưa đủ)"}
          </span>
          <span className="text-xl font-bold">{moneyD(res.othersTotal)}</span>
        </div>
        <p className="text-sm text-muted">
          {published
            ? "Người thuê đang xem được điện, nước và các phí này."
            : res.complete
              ? "Đã đủ số điện và nước. Người thuê chưa thấy gì cho đến khi bạn bấm công bố."
              : "Cần lưu đủ số điện và số nước mới công bố được."}
        </p>

        <div className="grid grid-cols-2 gap-2">
          {published ? (
            <>
              <ActionForm action={unpublishRoomAction} className="col-span-2">
                <input type="hidden" name="room" value={selected.id} />
                <input type="hidden" name="period" value={period} />
                <SubmitButton className="btn-ghost w-full" pendingText="Đang hủy...">
                  Hủy công bố
                </SubmitButton>
              </ActionForm>
            </>
          ) : (
            <ActionForm action={publishRoomAction} className="col-span-2">
              <input type="hidden" name="room" value={selected.id} />
              <input type="hidden" name="period" value={period} />
              <SubmitButton
                disabled={!res.complete}
                className="btn-primary w-full"
                pendingText="Đang công bố..."
              >
                Công bố cho người thuê
              </SubmitButton>
            </ActionForm>
          )}
        </div>
      </section>
    </main>
  );
}

const METER_ICON = {
  elec: "M13 2L4 14h7l-1 8 9-12h-7l1-8z",
  water: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
} as const;

/** Biểu tượng điện/nước: tô màu là đã nhập, viền đứt là chưa nhập. */
function MeterBadge({ kind, on, size = 24 }: { kind: "elec" | "water"; on: boolean; size?: number }) {
  const tone = on ? (kind === "elec" ? "border-c-elec bg-c-elec text-white" : "border-c-water bg-c-water text-white") : "border-dashed border-line text-muted";
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] ${tone}`}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d={METER_ICON[kind]} />
      </svg>
    </span>
  );
}

function MeterStatus({ kind, label, on }: { kind: "elec" | "water"; label: string; on: boolean }) {
  return (
    <li className="grid grid-cols-[30px_1fr_auto] items-center gap-x-3 border-t border-dashed border-line py-2.5 first:border-t-0">
      <MeterBadge kind={kind} on={on} size={30} />
      <span className="font-semibold">{label}</span>
      <span className={`flex items-center gap-1 text-sm ${on ? "font-semibold text-ok" : "text-muted"}`}>
        {on ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5 10 17.5 19 7.5" />
          </svg>
        ) : null}
        {on ? "Đã nhập" : "Chưa nhập"}
      </span>
    </li>
  );
}

function MeterHead({
  icon,
  title,
  ok,
  date,
  sub,
}: {
  icon: string;
  title: string;
  ok: boolean;
  date?: string | null;
  sub?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold">
          <span aria-hidden="true" className="mr-2">
            {icon}
          </span>
          {title}
        </h3>
        {ok ? (
          <span className="chip bg-ok-bg text-ok">
            Đã ghi nhận {shortDate(date)}
          </span>
        ) : (
          <span className="chip bg-idle-bg text-muted">Chưa nhập</span>
        )}
      </div>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
