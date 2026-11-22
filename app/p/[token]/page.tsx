import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CopyTextButton } from "@/components/CopyButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  dmy,
  dueDate,
  moneyD,
  money,
  periodLabel,
  periodName,
  periodRange,
  periodShort,
  isPeriod,
} from "@/lib/format";
import { first, type SP } from "@/lib/params";
import {
  getRoomByToken,
  getSettings,
  invoiceResult,
  listPublishedInvoices,
  receivedFor,
  type Invoice,
} from "@/lib/queries";
import { paymentContent, sepayQrUrl } from "@/lib/sepay";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hóa đơn phòng trọ",
  robots: { index: false, follow: false },
};

const n1 = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

export default async function TenantPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: SP;
}) {
  const { token } = await params;
  const room = await getRoomByToken(token);
  if (!room) notFound();

  const [settings, invoices] = await Promise.all([getSettings(), listPublishedInvoices(room.id)]);

  const header = (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-muted">{settings.house_name}</p>
        <h1 className="text-3xl font-bold leading-tight">{room.name}</h1>
        <p className="text-sm text-muted">
          {room.tenant_name ? `${room.tenant_name} · ` : ""}
          {room.occupants} người
        </p>
      </div>
      <ThemeToggle />
    </header>
  );

  if (invoices.length === 0) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-6">
        {header}
        <p className="card text-sm text-muted">
          Chưa có hóa đơn nào được gửi lên. Khi chủ trọ công bố hóa đơn, bạn sẽ thấy ở đây. Hãy lưu lại link này để xem
          lại.
        </p>
      </main>
    );
  }

  const sp = await searchParams;
  const m = first(sp.m);
  const idx = isPeriod(m) ? invoices.findIndex((i) => i.period === m) : -1;
  const selIdx = idx >= 0 ? idx : invoices.length - 1;
  const inv = invoices[selIdx];
  const prev: Invoice | undefined = invoices[selIdx - 1];
  const res = invoiceResult(inv);
  const prevRes = prev ? invoiceResult(prev) : null;
  const paid = !!inv.paid_at;

  // Các phần của tổng tiền, bỏ khoản bằng 0
  const parts = [
    { name: "Tiền phòng", amount: inv.rent, color: "var(--c-rent)" },
    { name: "Tiền điện", amount: res.elecAmount, color: "var(--c-elec)" },
    { name: "Tiền nước", amount: res.waterAmount, color: "var(--c-water)" },
    ...inv.fees.map((f) => ({ name: f.name, amount: f.amount, color: "var(--c-trash)", detail: f.detail })),
  ].filter((p) => p.amount > 0);
  const partsTotal = parts.reduce((s, p) => s + p.amount, 0);

  const last6 = invoices.slice(-6);
  const chartData = last6.map((i) => ({ i, r: invoiceResult(i) }));

  // Thanh toán: QR SePay, số tiền = còn thiếu (trừ phần đã nhận), nội dung có mã hóa đơn để tự khớp
  const received = paid ? 0 : await receivedFor(inv.id);
  const remaining = Math.max(res.total - received, 0);
  const qrReady = !paid && settings.bank_code !== "" && settings.bank_account !== "";
  const content = paymentContent(settings.sepay_prefix, inv.id, room.name);
  const qrOpts = { account: settings.bank_account, bank: settings.bank_code, amount: remaining, content };
  const qrUrl = qrReady ? sepayQrUrl(qrOpts) : "";
  const qrDownloadUrl = qrReady ? sepayQrUrl({ ...qrOpts, download: true }) : "";
  const autoConfirm = !!process.env.SEPAY_API_KEY;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
      {header}

      {/* Chọn tháng */}
      <section aria-labelledby="months" className="flex flex-col gap-2">
        <h2 id="months" className="text-sm font-semibold">
          Chọn tháng để xem lại
        </h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[...invoices].reverse().map((i) => {
            const active = i.period === inv.period;
            return (
              <Link
                key={i.period}
                href={`/p/${token}?m=${i.period}`}
                aria-current={active ? "page" : undefined}
                className={`flex h-14 min-w-[92px] shrink-0 flex-col justify-center rounded-xl border px-3 no-underline ${
                  active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-ink"
                }`}
              >
                <span className="text-sm font-bold">Tháng {Number(i.period.split("-")[1])}</span>
                <span className="text-xs font-medium">{i.paid_at ? "Đã đóng" : "Chưa đóng"}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Tổng tiền */}
      <section className="card flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-muted">Tổng tiền {periodName(inv.period)}</p>
          <span className={`chip ${paid ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`}>
            {paid ? "Đã đóng tiền" : "Chưa thanh toán"}
          </span>
        </div>
        <p className="text-4xl font-bold leading-tight">{moneyD(res.total)}</p>
        <p className="text-sm text-muted">Kỳ tính: {periodRange(inv.period, room.billing_day)}</p>
        {paid ? (
          <p className="text-sm font-semibold text-ok">Đã nhận tiền ngày {dmy(new Date(inv.paid_at + "T00:00:00Z"))}</p>
        ) : (
          <p className="text-sm font-semibold text-bad">
            Hạn đóng tiền: {dueDate(inv.period, room.billing_day, settings.due_days)}
          </p>
        )}
      </section>

      {/* Tiền đi vào đâu */}
      <section className="card flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-bold">Tiền của bạn đi vào đâu?</h2>
          <p className="text-sm text-muted">Mỗi màu là một khoản. Thanh càng dài thì khoản đó càng tốn nhiều.</p>
        </div>
        <div
          className="flex h-5 gap-[3px]"
          role="img"
          aria-label={parts.map((p) => `${p.name} ${money(p.amount)} đồng`).join(", ")}
        >
          {parts.map((p) => (
            <div
              key={p.name}
              aria-hidden="true"
              style={{ flex: `${p.amount} 1 0`, minWidth: 6, background: p.color }}
              className="rounded-md"
            />
          ))}
        </div>
        <ul>
          {parts.map((p) => (
            <li key={p.name} className="flex items-center gap-3 border-t border-line py-2.5">
              <span aria-hidden="true" className="size-3.5 shrink-0 rounded" style={{ background: p.color }} />
              <span className="flex-1">
                <span className="block font-medium">{p.name}</span>
                {"detail" in p && p.detail ? <span className="block text-xs text-muted">{p.detail}</span> : null}
              </span>
              <span className="text-sm text-muted">{Math.round((p.amount / partsTotal) * 100)}%</span>
              <span className="min-w-24 text-right font-semibold">{moneyD(p.amount)}</span>
            </li>
          ))}
          {inv.adjustments.map((a, i) => (
            <li key={`adj${i}`} className="flex items-center gap-3 border-t border-line py-2.5">
              <span className="flex-1 font-medium">{a.name}</span>
              <span className="min-w-24 text-right font-semibold">{moneyD(a.amount)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Điện */}
      {res.elecAmount > 0 ? (
        <section className="card flex flex-col gap-4">
          <SectionHead
            title="Tiền điện"
            hint="Dùng càng nhiều điện, tiền càng cao"
            amount={res.elecAmount}
            color="c-elec"
            d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"
          />
          <MeterBox
            label="Công tơ điện ở phòng bạn đã chạy từ số này đến số kia:"
            from={inv.elec_start}
            to={inv.elec_end}
          />
          <div className="flex flex-col gap-1.5 rounded-xl bg-c-elec-soft p-3.5">
            <p className="text-sm">Số mới trừ số cũ = số điện đã dùng</p>
            <p className="text-lg font-bold">{n1(res.kwh)} số điện</p>
            <p className="text-sm">Mỗi 1 số điện (1 kWh) giá {moneyD(inv.elec_price)}</p>
            <p className="font-semibold">
              {n1(res.kwh)} × {moneyD(inv.elec_price)} = {moneyD(res.elecAmount)}
            </p>
          </div>
          <Compare
            title="Dùng nhiều hay ít hơn tháng trước?"
            colorClass="bg-c-elec"
            cur={{ label: `Tháng ${Number(inv.period.split("-")[1])}`, value: res.kwh }}
            prev={prevRes && prev ? { label: `Tháng ${Number(prev.period.split("-")[1])}`, value: prevRes.kwh } : null}
            sentence={
              prevRes
                ? res.kwh > prevRes.kwh
                  ? `Nhiều hơn tháng trước ${n1(res.kwh - prevRes.kwh)} số điện, tức là thêm ${moneyD(Math.round((res.kwh - prevRes.kwh) * inv.elec_price))}.`
                  : res.kwh < prevRes.kwh
                    ? `Ít hơn tháng trước ${n1(prevRes.kwh - res.kwh)} số điện, tức là bớt ${moneyD(Math.round((prevRes.kwh - res.kwh) * inv.elec_price))}.`
                    : "Bằng tháng trước."
                : ""
            }
          />
        </section>
      ) : null}

      {/* Nước */}
      {res.waterAmount > 0 ? (
        <section className="card flex flex-col gap-4">
          <SectionHead
            title="Tiền nước"
            hint="Nước dùng ít thì giá rẻ, dùng nhiều thì giá cao hơn"
            amount={res.waterAmount}
            color="c-water"
            d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"
          />
          <MeterBox
            label="Đồng hồ nước ở phòng bạn đã chạy từ số này đến số kia:"
            from={inv.water_start}
            to={inv.water_end}
          />
          <div>
            <p className="text-lg font-bold">Đã dùng {n1(res.m3)} khối nước</p>
            <p className="text-sm text-muted">1 khối nước = 1.000 lít</p>
          </div>
          <Compare
            title="Dùng nhiều hay ít hơn tháng trước?"
            colorClass="bg-c-water"
            cur={{ label: `Tháng ${Number(inv.period.split("-")[1])}`, value: res.m3 }}
            prev={prevRes && prev ? { label: `Tháng ${Number(prev.period.split("-")[1])}`, value: prevRes.m3 } : null}
            sentence={
              prevRes
                ? res.m3 > prevRes.m3
                  ? `So với tháng trước: dùng nhiều hơn ${n1(res.m3 - prevRes.m3)} khối nước.`
                  : res.m3 < prevRes.m3
                    ? `So với tháng trước: dùng ít hơn ${n1(prevRes.m3 - res.m3)} khối nước.`
                    : "So với tháng trước: dùng bằng nhau."
                : ""
            }
          />
          <div className="flex flex-col gap-1.5 rounded-xl bg-c-water-soft p-3.5">
            <p className="text-sm">
              Mỗi người được {n1(inv.water_quota)} khối nước giá rẻ. Phòng bạn có {inv.occupants} người nên được{" "}
              {n1(res.quota)} khối giá rẻ.
            </p>
            <p className="font-semibold">
              {n1(res.lowM3)} khối × {moneyD(inv.water_low)} = {moneyD(res.lowAmount)}
            </p>
            <p className="font-semibold">
              {n1(res.highM3)} khối × {moneyD(inv.water_high)} = {moneyD(res.highAmount)}
            </p>
            <p className="text-sm">Cộng lại: {moneyD(res.waterAmount)}</p>
          </div>
        </section>
      ) : null}

      {/* Chuyển khoản */}
      {qrReady ? (
        <section className="card flex flex-col items-center gap-3">
          {autoConfirm ? <AutoRefresh seconds={10} /> : null}
          <h2 className="self-start text-lg font-bold">Chuyển khoản</h2>
          {received > 0 ? (
            <p className="w-full rounded-xl bg-warn-bg p-3 text-sm font-medium text-warn">
              Đã nhận {moneyD(received)}. Còn thiếu {moneyD(remaining)}.
            </p>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt={`Mã QR chuyển khoản ${moneyD(remaining)} nội dung ${content}`}
            width={260}
            height={260}
            className="rounded-xl bg-white"
          />
          <a href={qrDownloadUrl} download className="btn-ghost w-full">
            Tải mã QR về máy
          </a>
          <dl className="grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Ngân hàng</dt>
            <dd className="text-right font-semibold">{settings.bank_code}</dd>
            <dt className="text-muted">Số tài khoản</dt>
            <dd className="text-right font-semibold">{settings.bank_account}</dd>
            {settings.bank_holder ? (
              <>
                <dt className="text-muted">Chủ tài khoản</dt>
                <dd className="text-right font-semibold">{settings.bank_holder}</dd>
              </>
            ) : null}
            <dt className="text-muted">Số tiền</dt>
            <dd className="text-right font-semibold">{moneyD(remaining)}</dd>
            <dt className="text-muted">Nội dung</dt>
            <dd className="text-right font-semibold">{content}</dd>
          </dl>
          <CopyTextButton text={content} label="Sao chép nội dung chuyển khoản" />
          <p className="text-center text-xs leading-5 text-muted">
            Hãy giữ nguyên nội dung chuyển khoản.{" "}
            {autoConfirm
              ? "Hệ thống tự ghi nhận khi tiền về (thường trong vài phút), trang này sẽ tự cập nhật."
              : "Chủ trọ sẽ xác nhận sau khi nhận được tiền."}
          </p>
        </section>
      ) : null}

      {/* Thống kê */}
      {chartData.length >= 2 ? (
        <section className="card flex flex-col gap-5">
          <div>
            <h2 className="text-lg font-bold">Thống kê {chartData.length} tháng gần nhất</h2>
            <p className="text-sm text-muted">Cột sáng đậm là tháng đang xem</p>
          </div>
          <Chart
            title="Tổng tiền mỗi tháng"
            colorClass="bg-accent"
            data={chartData.map(({ i, r }) => ({ key: i.period, label: periodShort(i.period), value: r.total, text: `${(r.total / 1_000_000).toFixed(2).replace(".", ",")}tr` }))}
            selected={inv.period}
            note={`Trung bình khoảng ${moneyD(Math.round(chartData.reduce((s, c) => s + c.r.total, 0) / chartData.length))} mỗi tháng.`}
          />
          {chartData.some((c) => c.r.kwh > 0) ? (
            <Chart
              title="Số điện đã dùng (số)"
              colorClass="bg-c-elec"
              data={chartData.map(({ i, r }) => ({ key: i.period, label: periodShort(i.period), value: r.kwh, text: n1(r.kwh) }))}
              selected={inv.period}
              note={(() => {
                const max = chartData.reduce((a, b) => (b.r.kwh > a.r.kwh ? b : a));
                const min = chartData.reduce((a, b) => (b.r.kwh < a.r.kwh ? b : a));
                return `Nhiều nhất: ${periodLabel(max.i.period)} (${n1(max.r.kwh)} số). Ít nhất: ${periodLabel(min.i.period)} (${n1(min.r.kwh)} số).`;
              })()}
            />
          ) : null}
          {chartData.some((c) => c.r.m3 > 0) ? (
            <Chart
              title="Nước đã dùng (khối)"
              colorClass="bg-c-water"
              data={chartData.map(({ i, r }) => ({ key: i.period, label: periodShort(i.period), value: r.m3, text: n1(r.m3) }))}
              selected={inv.period}
              line={res.quota > 0 ? res.quota : undefined}
              note={`Vạch cam đứt là mức nước giá rẻ của tháng đang xem (${n1(res.quota)} khối). Cột nào cao hơn vạch thì phần vượt phải trả giá cao.`}
            />
          ) : null}
        </section>
      ) : null}

      {/* Lịch sử */}
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Các tháng đã qua</h2>
        <ul className="rounded-2xl border border-line bg-surface px-2">
          {[...invoices].reverse().map((i) => (
            <li key={i.period} className="border-b border-line last:border-0">
              <Link
                href={`/p/${token}?m=${i.period}`}
                className={`flex min-h-[60px] items-center justify-between gap-3 rounded-xl px-3 py-2 no-underline ${
                  i.period === inv.period ? "bg-accent-soft" : ""
                }`}
              >
                <span>
                  <span className="block font-semibold">Tháng {periodLabel(i.period)}</span>
                  <span className="block text-sm text-muted">{moneyD(invoiceResult(i).total)}</span>
                </span>
                <span className={`chip ${i.paid_at ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`}>
                  {i.paid_at ? "Đã đóng" : "Chưa đóng"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function SectionHead({
  title,
  hint,
  amount,
  color,
  d,
}: {
  title: string;
  hint: string;
  amount: number;
  color: "c-elec" | "c-water";
  d: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
          color === "c-elec" ? "bg-c-elec-soft text-c-elec" : "bg-c-water-soft text-c-water"
        }`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={d} />
        </svg>
      </span>
      <div className="flex-1">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-muted">{hint}</p>
      </div>
      <p className="text-lg font-bold">{moneyD(amount)}</p>
    </div>
  );
}

function MeterBox({ label, from, to }: { label: string; from: number | null; to: number | null }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">{label}</p>
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-xl border border-line bg-bg px-3 py-2.5">
          <p className="text-xs text-muted">Số cũ</p>
          <p className="text-2xl font-bold">{from === null ? "—" : money(from)}</p>
        </div>
        <svg className="shrink-0 text-muted" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
        <div className="flex-1 rounded-xl border border-line bg-bg px-3 py-2.5">
          <p className="text-xs text-muted">Số mới</p>
          <p className="text-2xl font-bold">{to === null ? "—" : money(to)}</p>
        </div>
      </div>
    </div>
  );
}

function Compare({
  title,
  colorClass,
  cur,
  prev,
  sentence,
}: {
  title: string;
  colorClass: string;
  cur: { label: string; value: number };
  prev: { label: string; value: number } | null;
  sentence: string;
}) {
  const max = Math.max(cur.value, prev?.value ?? 0, 1);
  const row = (r: { label: string; value: number }, strong: boolean) => (
    <div className="flex items-center gap-2.5">
      <span className={`w-[70px] shrink-0 text-sm ${strong ? "font-semibold" : "text-muted"}`}>{r.label}</span>
      <div className="h-[22px] flex-1 rounded-md bg-line">
        <div
          className={`h-[22px] rounded-md ${colorClass} ${strong ? "" : "opacity-50"}`}
          style={{ width: `${Math.round((r.value / max) * 100)}%` }}
        />
      </div>
      <span className={`w-10 shrink-0 text-right text-sm ${strong ? "font-bold" : "font-semibold"}`}>{n1(r.value)}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-sm font-semibold">{title}</p>
      <div className="flex flex-col gap-1.5">
        {prev ? row(prev, false) : null}
        {row(cur, true)}
      </div>
      {sentence ? <p className="text-sm text-muted">{sentence}</p> : null}
    </div>
  );
}

function Chart({
  title,
  colorClass,
  data,
  selected,
  note,
  line,
}: {
  title: string;
  colorClass: string;
  data: { key: string; label: string; value: number; text: string }[];
  selected: string;
  note: string;
  line?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), line ?? 0, 1);
  const H = 100; // chiều cao vùng cột (px)
  return (
    <div className="flex flex-col gap-2">
      <p className="font-semibold">{title}</p>
      <div
        className="relative flex items-end gap-2"
        style={{ height: H + 40 }}
        role="img"
        aria-label={`${title}: ${data.map((d) => `${periodLabel(d.key)} ${d.text}`).join(", ")}`}
      >
        {data.map((d) => (
          <div key={d.key} aria-hidden="true" className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" style={{ height: H + 40 }}>
            <span className="text-xs font-semibold leading-4">{d.text}</span>
            <div
              className={`w-full max-w-[34px] rounded-t-md ${colorClass} ${d.key === selected ? "" : "opacity-45"}`}
              style={{ height: Math.max(Math.round((d.value / max) * H), 4) }}
            />
            <span className="text-xs leading-4 text-muted">{periodShort(d.key)}</span>
          </div>
        ))}
        {line !== undefined ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-c-high"
            style={{ bottom: 20 + Math.round((line / max) * H) }}
          />
        ) : null}
      </div>
      <p className="text-sm leading-6 text-muted">{note}</p>
    </div>
  );
}
