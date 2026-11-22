import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentWatcher } from "@/components/AutoRefresh";
import { CopyTextButton } from "@/components/CopyButton";
import { FontSizeToggle } from "@/components/FontSizeToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  dmy,
  feeDueDate,
  rentDueDate,
  rentRange,
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
  autoPublishRent,
  listVisibleInvoices,
  receivedFor,
  type Invoice,
} from "@/lib/queries";
import { paymentContent, sepayQrUrl, type PayTarget } from "@/lib/sepay";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hóa đơn phòng trọ",
  robots: { index: false, follow: false },
};

// Số thập phân kiểu Việt Nam: 112318,5 -> "112.318,5"
const n1 = (n: number) => {
  const [int, dec] = String(Math.round(n * 100) / 100).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec ? `${grouped},${dec}` : grouped;
};

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

  await autoPublishRent(room.id); // đến ngày thu thì tự công bố tiền trọ
  const [settings, invoices] = await Promise.all([getSettings(), listVisibleInvoices(room.id)]);

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
      <div className="flex shrink-0 items-center gap-2">
        <FontSizeToggle />
        <ThemeToggle />
      </div>
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
  // Hai đợt thu độc lập: tiền trọ (công bố riêng) và chi phí khác (điện, nước, phí, phát sinh)
  const rentShown = inv.rent_published && inv.rent > 0;
  const otherShown = inv.published;
  const rentPaid = !!inv.rent_paid_at;
  const otherPaid = !!inv.paid_at;
  const publishedList = invoices.filter((i) => i.published);
  const prev: Invoice | undefined = [...publishedList].reverse().find((i) => i.period < inv.period);
  const res = invoiceResult(inv);
  const prevRes = prev ? invoiceResult(prev) : null;

  // Các phần của tổng tiền, bỏ khoản bằng 0
  const parts = [
    ...(rentShown ? [{ name: "Tiền trọ", amount: inv.rent, color: "var(--c-rent)" }] : []),
    ...(otherShown
      ? [
          { name: "Tiền điện", amount: res.elecAmount, color: "var(--c-elec)" },
          { name: "Tiền nước", amount: res.waterAmount, color: "var(--c-water)" },
          ...inv.fees.map((f) => ({ name: f.name, amount: f.amount, color: "var(--c-trash)", detail: f.detail })),
        ]
      : []),
  ].filter((p) => p.amount > 0);
  const partsTotal = parts.reduce((s, p) => s + p.amount, 0);

  const last6 = publishedList.slice(-6);
  const chartData = last6.map((i) => ({ i, r: invoiceResult(i) }));

  // Thanh toán: mỗi đợt một QR SePay, số tiền = còn thiếu, nội dung có mã riêng từng đợt để tự khớp
  const bankReady = settings.bank_code !== "" && settings.bank_account !== "";
  const autoConfirm = !!process.env.SEPAY_API_KEY;
  // Hai đợt thu cùng chưa đóng (tiền trọ đã công bố mà điện, nước, phí khác vẫn chưa đóng): gộp thành 1 QR duy nhất.
  const merged = rentShown && otherShown && !rentPaid && !otherPaid;
  const payInfo = async (part: PayTarget, total: number, paid: boolean) => {
    const received = paid
      ? 0
      : part === "all"
        ? (await receivedFor(inv.id, "rent")) + (await receivedFor(inv.id, "other"))
        : await receivedFor(inv.id, part);
    const remaining = Math.max(total - received, 0);
    const content = paymentContent(settings.sepay_prefix, room.name, inv.period, part);
    const qrReady = !paid && bankReady;
    const opts = { account: settings.bank_account, bank: settings.bank_code, amount: remaining, content };
    return {
      part,
      invoiceId: inv.id,
      paid,
      received,
      remaining,
      content,
      qrReady,
      qrUrl: qrReady ? sepayQrUrl(opts) : "",
      qrDownloadUrl: qrReady ? sepayQrUrl({ ...opts, download: true }) : "",
    };
  };
  const rentPay = rentShown && !merged ? await payInfo("rent", inv.rent, rentPaid) : null;
  const otherPay = otherShown && !merged ? await payInfo("other", res.othersTotal, otherPaid) : null;
  const allPay = merged ? await payInfo("all", inv.rent + res.othersTotal, false) : null;
  const payList = [allPay, rentPay, otherPay];
  const invState = (i: Invoice) => {
    const rentOpen = i.rent_published && i.rent > 0 && !i.rent_paid_at;
    const otherOpen = i.published && !i.paid_at;
    return rentOpen || otherOpen;
  };
  const invAmount = (i: Invoice) => {
    const r = invoiceResult(i);
    return (i.rent_published ? i.rent : 0) + (i.published ? r.othersTotal : 0);
  };

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-md flex-col gap-4 overflow-x-clip px-4 py-6">
      {payList.map((p) =>
        p && !p.qrReady ? (
          <PaymentWatcher key={p.part} token={token} invoiceId={p.invoiceId} part={p.part} paid={p.paid} received={p.received} />
        ) : null,
      )}
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
                className={`flex min-h-14 min-w-[112px] shrink-0 flex-col justify-center py-1 rounded-xl border px-3 no-underline ${
                  active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-ink"
                }`}
              >
                <span className="text-sm font-bold">Tháng {periodLabel(i.period)}</span>
                <span className="text-xs font-medium">{invState(i) ? "Chưa đóng" : "Đã đóng"}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Hai đợt thu */}
      {rentShown ? (
        <CollectCard
          title={`Tiền trọ ${periodName(inv.period)}`}
          amount={inv.rent}
          paid={rentPaid}
          paidAt={inv.rent_paid_at}
          range={`Kỳ thuê: ${rentRange(inv.period, room.move_in_date, room.billing_day)}`}
          due={rentDueDate(inv.period, room.move_in_date, room.billing_day)}
        />
      ) : null}
      {otherShown ? (
        <CollectCard
          title={`Điện, nước và các phí khác (nếu có) ${periodName(inv.period)}`}
          amount={res.othersTotal}
          paid={otherPaid}
          paidAt={inv.paid_at}
          range={`Kỳ tính: ${periodRange(inv.period, room.billing_day)}`}
          due={feeDueDate(inv.period, room.billing_day, settings.fee_day)}
        />
      ) : (
        <section className="card text-sm text-muted">
          Điện, nước và các phí khác của {periodName(inv.period)} chưa được công bố. Khi chủ trọ chốt số và công bố, bạn sẽ thấy ở đây.
        </section>
      )}

      {/* Tiền đi vào đâu */}
      {parts.length > 0 ? (
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
          {(otherShown ? inv.adjustments : []).map((a, i) => (
            <li key={`adj${i}`} className="flex items-center gap-3 border-t border-line py-2.5">
              <span className="flex-1 font-medium">{a.name}</span>
              <span className="min-w-24 text-right font-semibold">{moneyD(a.amount)}</span>
            </li>
          ))}
        </ul>
      </section>
      ) : null}

      {/* Điện */}
      {otherShown && res.elecAmount > 0 ? (
        <section className="card flex flex-col gap-4">
          <SectionHead
            title="Tiền điện"
            amount={res.elecAmount}
            color="c-elec"
            d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"
          />
          <MeterBox
            label="Chỉ số công tơ điện"
            from={inv.elec_start}
            to={inv.elec_end}
          />
          <dl className="flex flex-col gap-2 rounded-xl bg-c-elec-soft p-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-sm">Số điện đã dùng</dt>
              <dd className="text-lg font-bold">{n1(res.kwh)} số</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-sm">Giá mỗi số (1 kWh)</dt>
              <dd className="font-semibold">{moneyD(inv.elec_price)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-black/10 pt-2">
              <dt className="text-sm">Thành tiền</dt>
              <dd className="text-lg font-bold">{moneyD(res.elecAmount)}</dd>
            </div>
          </dl>
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
      {otherShown && res.waterAmount > 0 ? (
        <section className="card flex flex-col gap-4">
          <SectionHead
            title="Tiền nước"
            amount={res.waterAmount}
            color="c-water"
            d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"
          />
          <MeterBox
            label="Chỉ số đồng hồ nước"
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
          <dl className="flex flex-col gap-2.5 rounded-xl bg-c-water-soft p-3.5">
            <div className="text-sm">
              Định mức: {inv.occupants} người × {n1(inv.water_quota)} = <b>{n1(res.quota)} khối</b>
            </div>
            <div className="flex items-start justify-between gap-3 border-t border-black/10 pt-2.5">
              <div>
                <dt className="font-semibold">Trong định mức</dt>
                <dd className="text-sm text-muted">
                  {n1(res.lowM3)} khối × {moneyD(inv.water_low)}
                </dd>
              </div>
              <dd className="shrink-0 whitespace-nowrap font-semibold">{moneyD(res.lowAmount)}</dd>
            </div>
            {res.highM3 > 0 ? (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <dt className="font-semibold">Vượt định mức</dt>
                  <dd className="text-sm text-muted">
                    {n1(res.highM3)} khối × {moneyD(inv.water_high)}
                  </dd>
                </div>
                <dd className="shrink-0 whitespace-nowrap font-semibold">{moneyD(res.highAmount)}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-3 border-t border-black/10 pt-2.5">
              <dt className="text-sm">Thành tiền</dt>
              <dd className="text-lg font-bold">{moneyD(res.waterAmount)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {/* Chuyển khoản: mỗi đợt thu một mã QR và nội dung riêng */}
      {[
        {
          p: allPay,
          title: "Chuyển khoản một lần",
          what: "tất cả các khoản",
          edge: "!border-l-accent",
          chip: "bg-accent text-accent-ink",
        },
        { p: rentPay, title: "Chuyển khoản tiền trọ", what: "tiền trọ", edge: "!border-l-c-rent", chip: "bg-c-rent text-white" },
        { p: otherPay, title: "Chuyển khoản điện, nước và các phí khác", what: "điện, nước và các phí khác", edge: "!border-l-c-elec", chip: "bg-c-elec text-white" },
      ].map(({ p, title, what, edge, chip }) =>
        p && p.qrReady ? (
          <section key={p.part} className={`card flex flex-col items-center gap-3 border-l-8 ${edge}`}>
            <h2 className="self-start text-lg font-bold">{title}</h2>
            {p.part === "all" ? (
              <>
                <div className={`w-full rounded-xl px-3 py-3 text-center ${chip}`}>
                  <p className="text-sm font-medium">Số tiền cần chuyển</p>
                  <p className="text-3xl font-bold leading-tight">{moneyD(p.remaining)}</p>
                </div>
                <dl className="grid w-full grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-muted">Tiền trọ</dt>
                  <dd className="text-right font-semibold">{moneyD(inv.rent)}</dd>
                  <dt className="text-muted">Điện, nước, phí khác</dt>
                  <dd className="text-right font-semibold">{moneyD(res.othersTotal)}</dd>
                </dl>
              </>
            ) : (
              <p className={`w-full rounded-xl px-3 py-2 text-center text-base font-bold ${chip}`}>
                Mã QR này để trả {what}: {moneyD(p.remaining)}
              </p>
            )}
            {p.received > 0 ? (
              <p className="w-full rounded-xl bg-warn-bg p-3 text-sm font-medium text-warn">
                Đã nhận {moneyD(p.received)}. Còn thiếu {moneyD(p.remaining)}.
              </p>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.qrUrl}
              alt={`Mã QR chuyển khoản ${moneyD(p.remaining)} nội dung ${p.content}`}
              width={260}
              height={260}
              className="rounded-xl bg-white"
            />
            <a href={p.qrDownloadUrl} download className="btn-ghost w-full">
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
              <dd className="text-right font-semibold">{moneyD(p.remaining)}</dd>
              <dt className="text-muted">Nội dung</dt>
              <dd className="text-right font-semibold">{p.content}</dd>
            </dl>
            <CopyTextButton text={p.content} label="Sao chép nội dung chuyển khoản" />
            <PaymentWatcher token={token} invoiceId={p.invoiceId} part={p.part} paid={p.paid} received={p.received} showButton />
            <p className="text-center text-xs leading-5 text-muted">
              Hãy giữ nguyên nội dung chuyển khoản {p.part === "all" ? "" : "(mỗi khoản có nội dung riêng, đừng chuyển gộp)."}{" "}
              {autoConfirm
                ? "Hệ thống tự ghi nhận khi tiền về (thường trong vài phút), trang này sẽ tự cập nhật."
                : "Chủ trọ sẽ xác nhận sau khi nhận được tiền."}
            </p>
          </section>
        ) : null,
      )}

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
              note={`Vạch cam đứt là định mức nước của tháng đang xem (${n1(res.quota)} khối). Cột nào cao hơn vạch thì phần vượt định mức tính giá cao hơn.`}
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
                  <span className="block text-sm text-muted">{moneyD(invAmount(i))}</span>
                </span>
                <span className={`chip ${invState(i) ? "bg-bad-bg text-bad" : "bg-ok-bg text-ok"}`}>
                  {invState(i) ? "Chưa đóng" : "Đã đóng"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function CollectCard({
  title,
  amount,
  paid,
  paidAt,
  range,
  due,
}: {
  title: string;
  amount: number;
  paid: boolean;
  paidAt: string | null;
  range: string;
  due: string;
}) {
  return (
    <section className="card flex flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted">{title}</p>
        <span className={`chip shrink-0 ${paid ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`}>
          {paid ? "Đã đóng tiền" : "Chưa thanh toán"}
        </span>
      </div>
      <p className="text-4xl font-bold leading-tight">{moneyD(amount)}</p>
      <p className="text-sm text-muted">{range}</p>
      {paid && paidAt ? (
        <p className="text-sm font-semibold text-ok">Đã nhận tiền ngày {dmy(new Date(paidAt + "T00:00:00Z"))}</p>
      ) : (
        <p className="text-sm font-semibold text-bad">Hạn đóng tiền: {due}</p>
      )}
    </section>
  );
}

function SectionHead({
  title,
  amount,
  color,
  d,
}: {
  title: string;
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
      <h2 className="min-w-0 flex-1 text-lg font-bold">{title}</h2>
      <p className="shrink-0 whitespace-nowrap text-lg font-bold">{moneyD(amount)}</p>
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
      <span className={`w-[4.5rem] shrink-0 whitespace-nowrap text-sm ${strong ? "font-semibold" : "text-muted"}`}>{r.label}</span>
      <div className="h-[22px] min-w-0 flex-1 rounded-md bg-line">
        <div
          className={`h-[22px] rounded-md ${colorClass} ${strong ? "" : "opacity-50"}`}
          style={{ width: `${Math.round((r.value / max) * 100)}%` }}
        />
      </div>
      <span className={`min-w-[4.5rem] shrink-0 whitespace-nowrap text-right text-sm ${strong ? "font-bold" : "font-semibold"}`}>{n1(r.value)}</span>
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
        style={{ height: `calc(${H}px + 2.5rem)` }}
        role="img"
        aria-label={`${title}: ${data.map((d) => `${periodLabel(d.key)} ${d.text}`).join(", ")}`}
      >
        {data.map((d) => (
          <div key={d.key} aria-hidden="true" className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" style={{ height: `calc(${H}px + 2.5rem)` }}>
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
            style={{ bottom: `calc(1.25rem + ${Math.round((line / max) * H)}px)` }}
          />
        ) : null}
      </div>
      <p className="text-sm leading-6 text-muted">{note}</p>
    </div>
  );
}
