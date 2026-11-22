import { AddFeeForm } from "@/components/AddFeeForm";
import { FEE_METHOD_LABEL, type FeeMethod } from "@/lib/billing";
import { addAdjustmentAction, createFeeTypeAction } from "@/app/admin/actions";

const METHODS = (Object.keys(FEE_METHOD_LABEL) as FeeMethod[]).map((m) => ({
  value: m,
  label: FEE_METHOD_LABEL[m],
}));

/**
 * Thêm khoản phí mới từ trang Nhập số: loại phí hằng tháng (gửi xe, giặt đồ...)
 * hoặc khoản chỉ tính tháng này (sửa chữa, đền bù, giảm trừ).
 * Loại phí mới chỉ bật cho phòng hiện tại, các phòng khác để tắt.
 */
export function FeeTypes({
  roomId,
  back,
  period,
}: {
  roomId: number;
  back: string;
  /** Kỳ đang xem (YYYY-MM): hóa đơn kỳ đó cập nhật theo khoản mới. */
  period: string;
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
      <AddFeeForm
        roomId={roomId}
        back={back}
        period={period}
        methods={METHODS}
        createAction={createFeeTypeAction}
        onceAction={addAdjustmentAction}
      />
    </details>
  );
}
