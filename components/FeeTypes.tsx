import { AddFeeForm } from "@/components/AddFeeForm";
import { FEE_METHOD_LABEL, type FeeMethod } from "@/lib/billing";
import { addAdjustmentAction, createFeeTypeAction } from "@/app/admin/actions";

const METHODS = (Object.keys(FEE_METHOD_LABEL) as FeeMethod[]).map((m) => ({
  value: m,
  label: FEE_METHOD_LABEL[m],
}));

/**
 * Thêm khoản phí hoặc giảm giá từ trang Nhập số: loại phí hằng tháng (gửi xe, giặt đồ...)
 * hoặc khoản chỉ tính tháng này (sửa chữa, đền bù, giảm trừ).
 * Loại phí mới chỉ bật cho phòng hiện tại, các phòng khác để tắt.
 */
export function FeeTypes({
  roomId,
  period,
}: {
  roomId: number;
  /** Kỳ đang xem (YYYY-MM): hóa đơn kỳ đó cập nhật theo khoản mới. */
  period: string;
}) {
  return (
    <details className="card group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 font-bold [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="relative size-8 shrink-0 rounded-full bg-accent-soft text-accent transition-transform group-open:rotate-45"
        >
          {/* Vẽ dấu + bằng hai thanh để luôn nằm chính giữa vòng tròn (ký tự "+" bị lệch theo font) */}
          <span className="absolute left-1/2 top-1/2 h-0.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
          <span className="absolute left-1/2 top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
        </span>
        Thêm khoản phí hoặc giảm giá
      </summary>
      <AddFeeForm
        roomId={roomId}
        period={period}
        methods={METHODS}
        createAction={createFeeTypeAction}
        onceAction={addAdjustmentAction}
      />
    </details>
  );
}
