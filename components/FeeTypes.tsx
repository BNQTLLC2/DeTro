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
    <section className="card">
      <form action={createFeeTypeAction} className="grid grid-cols-2 gap-3">
        <input type="hidden" name="room" value={roomId} />
        <input type="hidden" name="back" value={back} />
        {period ? <input type="hidden" name="period" value={period} /> : null}
        <div className="col-span-2">
          <h2 className="text-base font-bold">
            <span aria-hidden className="mr-2">
              🧾
            </span>
            Thêm khoản phí mới
          </h2>
          <p className="mt-1 text-sm text-muted">
            Khoản phí mới chỉ bật cho phòng này. Phí bằng 0 không hiện trên hóa
            đơn.
          </p>
        </div>
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
    </section>
  );
}
