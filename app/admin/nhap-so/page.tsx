import Link from "next/link";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Flash } from "@/components/Flash";
import { ReadingForm } from "@/components/ReadingForm";
import { SendLink } from "@/components/SendLink";
import { computeInvoice } from "@/lib/billing";
import { currentPeriod, isPeriod, moneyD, periodLabel, shiftPeriod, shortDate } from "@/lib/format";
import { first, type SP } from "@/lib/params";
import {
  getInvoice,
  getRoom,
  getSettings,
  invoiceInput,
  invoiceResult,
  listInvoices,
  listRooms,
  readingDefaults,
} from "@/lib/queries";
import {
  addAdjustmentAction,
  publishRoomAction,
  removeAdjustmentAction,
  saveReadingAction,
  setPaidAction,
  unpublishRoomAction,
} from "../actions";

export const metadata = { title: "Nhập chỉ số" };

export default async function EnterReadings({ searchParams }: { searchParams: SP }) {
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
      <Link href={`/admin/nhap-so?m=${shiftPeriod(period, -1)}`} aria-label="Tháng trước" className="btn-ghost size-11 !px-0">
        ‹
      </Link>
      <h1 className="text-lg font-semibold">Nhập chỉ số · Tháng {periodLabel(period)}</h1>
      <Link href={`/admin/nhap-so?m=${shiftPeriod(period, 1)}`} aria-label="Tháng sau" className="btn-ghost size-11 !px-0">
        ›
      </Link>
    </div>
  );

  if (!selected) {
    return (
      <main>
        {header}
        <p className="card text-sm text-muted">Chưa có phòng nào đang ở. Vào mục Phòng để thêm thông tin người thuê.</p>
      </main>
    );
  }

  const settings = await getSettings();
  const inv = byRoom.get(selected.id) ?? (await getInvoice(selected.id, period));
  const defaults = await readingDefaults(selected, inv, period);
  const back = `/admin/nhap-so?m=${period}&room=${selected.id}`;

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
  const published = !!inv?.published;
  const price = inv?.elec_price ?? settings.elec_price;
  const quotaPer = inv?.water_quota ?? settings.water_quota;
  const quota = selected.occupants * quotaPer;
  const lowP = inv?.water_low ?? settings.water_low;
  const highP = inv?.water_high ?? settings.water_high;

  return (
    <main>
      <Flash ok={first(sp.ok)} error={first(sp.error)} />
      {header}

      <p className="mb-2 text-sm text-muted">
        Chọn một phòng. Điện và nước nhập riêng, mỗi phần có nút lưu riêng nên có thể nhập vào hai ngày khác nhau.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {rooms.map((r) => {
          const i = byRoom.get(r.id);
          const rr = i ? invoiceResult(i) : null;
          const active = r.id === selected.id;
          return (
            <Link
              key={r.id}
              href={`/admin/nhap-so?m=${period}&room=${r.id}`}
              aria-current={active ? "true" : undefined}
              className={`flex min-h-[76px] flex-col gap-1 rounded-xl border p-3 no-underline ${
                active ? "border-2 border-accent bg-accent-soft" : "border-line bg-surface"
              }`}
            >
              <span className="text-sm font-bold">
                {r.name} <span className="text-xs font-medium text-muted">· {r.tenant_name || "chưa có tên"}</span>
              </span>
              <span className="text-xs">
                {rr?.elecState === "ok" ? "✓" : "○"} Điện: {i?.elec_read_at ? shortDate(i.elec_read_at) : "chưa nhập"}
              </span>
              <span className="text-xs">
                {rr?.waterState === "ok" ? "✓" : "○"} Nước: {i?.water_read_at ? shortDate(i.water_read_at) : "chưa nhập"}
              </span>
            </Link>
          );
        })}
      </div>

      <section className="mb-3">
        <h2 className="text-xl font-bold">
          {selected.name} · {selected.tenant_name || "chưa có tên người thuê"}
        </h2>
        <p className="text-sm text-muted">
          {selected.occupants} người ở · chốt số ngày {selected.billing_day} hàng tháng
        </p>
      </section>

      {published ? (
        <p className="mb-3 rounded-xl bg-ok-bg p-3 text-sm text-ok">
          Hóa đơn này đã công bố. Nếu bạn sửa số hoặc khoản phát sinh, hóa đơn tự chuyển về &quot;chưa công bố&quot; để bạn kiểm
          tra rồi công bố lại.
        </p>
      ) : null}

      <section className="card mb-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold">Điện</h3>
          {res.elecState === "ok" ? (
            <span className="chip bg-ok-bg text-ok">Đã ghi nhận {shortDate(inv?.elec_read_at)}</span>
          ) : (
            <span className="chip bg-bad-bg text-bad">Chưa nhập</span>
          )}
        </div>
        <ReadingForm
          key={`e-${selected.id}-${period}-${inv?.elec_end ?? "x"}-${inv?.elec_start ?? "x"}`}
          kind="elec"
          action={saveReadingAction}
          roomId={selected.id}
          period={period}
          back={back}
          defaultStart={defaults.elecStart}
          defaultEnd={inv?.elec_end ?? null}
          saved={res.elecState === "ok"}
          price={price}
        />
      </section>

      <section className="card mb-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold">Nước</h3>
          {res.waterState === "ok" ? (
            <span className="chip bg-ok-bg text-ok">Đã ghi nhận {shortDate(inv?.water_read_at)}</span>
          ) : (
            <span className="chip bg-bad-bg text-bad">Chưa nhập</span>
          )}
        </div>
        <p className="text-sm text-muted">
          Định mức giá rẻ: {selected.occupants} người × {quotaPer} = {quota} khối
        </p>
        <ReadingForm
          key={`w-${selected.id}-${period}-${inv?.water_end ?? "x"}-${inv?.water_start ?? "x"}`}
          kind="water"
          action={saveReadingAction}
          roomId={selected.id}
          period={period}
          back={back}
          defaultStart={defaults.waterStart}
          defaultEnd={inv?.water_end ?? null}
          saved={res.waterState === "ok"}
          quota={quota}
          low={lowP}
          high={highP}
        />
      </section>

      <section className="card mb-3 flex flex-col gap-3">
        <h3 className="text-lg font-bold">Khoản phát sinh</h3>
        <p className="text-sm text-muted">Sửa chữa, đền bù, giảm trừ... Nhập số âm để giảm trừ.</p>
        {inv && inv.adjustments.length > 0 ? (
          <ul className="flex flex-col divide-y divide-line">
            {inv.adjustments.map((a, idx) => (
              <li key={idx} className="flex items-center justify-between gap-3 py-2">
                <span>{a.name}</span>
                <span className="flex items-center gap-2">
                  <b>{moneyD(a.amount)}</b>
                  <form action={removeAdjustmentAction}>
                    <input type="hidden" name="room" value={selected.id} />
                    <input type="hidden" name="period" value={period} />
                    <input type="hidden" name="back" value={back} />
                    <input type="hidden" name="index" value={idx} />
                    <ConfirmButton message="Bỏ khoản phát sinh này?" className="btn-ghost">
                      Bỏ
                    </ConfirmButton>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <form action={addAdjustmentAction} className="grid grid-cols-[1fr_8rem] gap-2">
          <input type="hidden" name="room" value={selected.id} />
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="back" value={back} />
          <div>
            <label htmlFor="adj-name" className="label">
              Tên khoản
            </label>
            <input id="adj-name" name="name" required className="input" placeholder="Sửa vòi nước" />
          </div>
          <div>
            <label htmlFor="adj-amount" className="label">
              Số tiền
            </label>
            <input id="adj-amount" name="amount" required inputMode="numeric" className="input" placeholder="120000" />
          </div>
          <button type="submit" className="btn-ghost col-span-2">
            Thêm khoản
          </button>
        </form>
      </section>

      <section className="card flex flex-col gap-2">
        <h3 className="text-lg font-bold">Tạm tính hóa đơn {selected.name}</h3>
        <Row label="Tiền phòng" value={moneyD(inv?.rent ?? selected.rent)} />
        <Row label="Tiền điện" value={res.elecState === "ok" ? moneyD(res.elecAmount) : "Chưa nhập"} />
        <Row label="Tiền nước" value={res.waterState === "ok" ? moneyD(res.waterAmount) : "Chưa nhập"} />
        {(input?.fees ?? []).map((f, i) => (
          <Row key={i} label={f.name} value={moneyD(f.amount)} />
        ))}
        {(input?.adjustments ?? []).map((f, i) => (
          <Row key={`a${i}`} label={f.name} value={moneyD(f.amount)} />
        ))}
        <div className="flex items-baseline justify-between border-t border-line pt-2">
          <span className="font-semibold">{res.complete ? "Tổng cộng" : "Tạm tính (chưa đủ)"}</span>
          <span className="text-xl font-bold">{moneyD(res.total)}</span>
        </div>
        <p className="text-sm text-muted">
          {published
            ? "Người thuê đang xem được hóa đơn này."
            : res.complete
              ? "Đã đủ số điện và nước. Người thuê chưa thấy gì cho đến khi bạn bấm công bố."
              : "Cần lưu đủ số điện và số nước mới công bố được."}
        </p>

        <div className="flex flex-wrap gap-2">
          {published ? (
            <>
              <form action={unpublishRoomAction}>
                <input type="hidden" name="room" value={selected.id} />
                <input type="hidden" name="period" value={period} />
                <input type="hidden" name="back" value={back} />
                <button type="submit" className="btn-ghost">
                  Hủy công bố
                </button>
              </form>
              <form action={setPaidAction}>
                <input type="hidden" name="room" value={selected.id} />
                <input type="hidden" name="period" value={period} />
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="paid" value={inv?.paid_at ? "0" : "1"} />
                <button type="submit" className={inv?.paid_at ? "btn-ghost" : "btn-primary"}>
                  {inv?.paid_at ? "Bỏ đánh dấu đã thu" : "Đánh dấu đã thu"}
                </button>
              </form>
            </>
          ) : (
            <form action={publishRoomAction}>
              <input type="hidden" name="room" value={selected.id} />
              <input type="hidden" name="period" value={period} />
              <input type="hidden" name="back" value={back} />
              <button type="submit" disabled={!res.complete} className="btn-primary">
                Công bố cho người thuê
              </button>
            </form>
          )}
        </div>

        {published ? (
          <SendLink
            path={`/p/${selected.token}`}
            phone={selected.tenant_phone.replace(/\D/g, "")}
            message={`Chào ${selected.tenant_name || "bạn"}, hóa đơn ${selected.name} tháng ${periodLabel(period)} là ${moneyD(res.total)}. Xem chi tiết tại: {link}`}
          />
        ) : null}
      </section>
    </main>
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
