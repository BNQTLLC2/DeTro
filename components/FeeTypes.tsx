import { MoneyInput } from "@/components/MoneyInput";
import { FEE_METHOD_LABEL, type FeeMethod } from "@/lib/billing";
import { createFeeTypeAction } from "@/app/admin/actions";

const METHODS = Object.keys(FEE_METHOD_LABEL) as FeeMethod[];

/**
 * Thêm loại phí mới (gửi xe, giặt đồ...) từ trang từng phòng.
 * Phí mới chỉ bật cho phòng hiện tại, các phòng khác để tắt.
 */
export function FeeTypes({
  roomId,
  back,
  period,
}: {
  roomId: number;
  back: string;
  /** Kỳ đang xem (YYYY-MM): có thì hóa đơn kỳ đó cập nhật theo phí mới. */
  period?: string;
}) {
  return (
    <details className="card group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 font-bold [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xl leading-none text-accent transition-transform group-open:rotate-45"
        >
          +
        </span>
        Thêm khoản phí mới
      </summary>
      <form action={createFeeTypeAction} className="mt-3 grid grid-cols-2 gap-3">
        <input type="hidden" name="room" value={roomId} />
        <input type="hidden" name="back" value={back} />
        {period ? <input type="hidden" name="period" value={period} /> : null}
        <p className="col-span-2 text-sm text-muted">
          Khoản phí mới chỉ bật cho phòng này. Phí bằng 0 không hiện trên hóa đơn.
        </p>
        <label className="col-span-2 block">
          <span className="label">Tên loại phí</span>
          <input name="name" placeholder="Gửi xe" className="input" />
        </label>
        <div>
          <label htmlFor="new-method" className="label">
            Cách tính
          </label>
          <select
            id="new-method"
            name="method"
            defaultValue="fixed"
            className="input"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {FEE_METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <label className="block">
          <span className="label">Mức mặc định (đ)</span>
          <MoneyInput
            name="amount"
            defaultValue=""
            placeholder="100000"
            className="input"
          />
        </label>
        <button type="submit" className="btn-ghost col-span-2">
          Thêm loại phí
        </button>
      </form>
    </details>
  );
}
