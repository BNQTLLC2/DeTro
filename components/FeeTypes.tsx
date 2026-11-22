import { MoneyInput } from "@/components/MoneyInput";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FEE_METHOD_LABEL, type FeeMethod, type FeeType } from "@/lib/billing";
import { money } from "@/lib/format";
import {
  createFeeTypeAction,
  deleteFeeTypeAction,
  updateFeeTypeAction,
} from "@/app/admin/actions";

const METHODS = Object.keys(FEE_METHOD_LABEL) as FeeMethod[];

/**
 * Thêm / sửa / xóa các loại phí (rác, wifi, gửi xe...), đặt trong trang từng phòng.
 * Phí mới thêm ở đây chỉ bật cho phòng hiện tại. Sửa tên, cách tính, mức mặc định
 * và xóa thì dùng chung cho mọi phòng.
 */
export function FeeTypes({
  fees,
  roomId,
  back,
}: {
  fees: FeeType[];
  roomId: number;
  back: string;
}) {
  return (
    <section className="card flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold">
          <span aria-hidden className="mr-2">
            🧾
          </span>
          Thêm / sửa loại phí
        </h2>
        <p className="mt-1 text-sm text-muted">
          Phí mới thêm ở đây chỉ bật cho phòng này. Sửa hoặc xóa loại phí sẽ áp
          dụng cho mọi phòng. Phí bằng 0 không hiện trên hóa đơn.
        </p>
      </div>

      {fees.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {fees.map((f) => (
            <li key={f.id} className="rounded-xl border border-line">
              <details>
                <summary className="flex min-h-12 cursor-pointer select-none items-center justify-between gap-2 px-3 py-2">
                  <span className="font-medium">
                    {f.name}
                    {!f.active && (
                      <span className="chip ml-2 bg-warn-bg text-warn">
                        Tắt
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-muted">
                    {money(f.default_amount)}
                    {f.method === "per_person"
                      ? " / người"
                      : f.method === "per_unit"
                        ? " / đơn vị"
                        : ""}
                  </span>
                </summary>
                <div className="border-t border-line p-3">
                  <form
                    action={updateFeeTypeAction}
                    className="grid grid-cols-2 gap-3"
                  >
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="back" value={back} />
                    <label className="col-span-2 block">
                      <span className="label">Tên loại phí</span>
                      <input
                        name="name"
                        defaultValue={f.name}
                        className="input"
                      />
                    </label>
                    <div>
                      <label htmlFor={`m-${f.id}`} className="label">
                        Cách tính
                      </label>
                      <select
                        id={`m-${f.id}`}
                        name="method"
                        defaultValue={f.method}
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
                        defaultValue={String(f.default_amount)}
                        className="input"
                      />
                    </label>
                    <label className="col-span-2 flex min-h-11 items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={f.active}
                        className="size-5"
                      />
                      Đang áp dụng
                    </label>
                    <button type="submit" className="btn-primary col-span-2">
                      Lưu
                    </button>
                  </form>
                  <form action={deleteFeeTypeAction} className="mt-2">
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="back" value={back} />
                    <ConfirmButton
                      message={`Xóa loại phí "${f.name}" khỏi tất cả các phòng? Hóa đơn cũ không bị ảnh hưởng.`}
                      className="btn-danger"
                    >
                      Xóa loại phí
                    </ConfirmButton>
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        action={createFeeTypeAction}
        className="grid grid-cols-2 gap-3 border-t border-line pt-4"
      >
        <input type="hidden" name="room" value={roomId} />
        <input type="hidden" name="back" value={back} />
        <h3 className="col-span-2 text-sm font-bold">+ Thêm loại phí mới</h3>
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
