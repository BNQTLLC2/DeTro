// Toàn bộ truy vấn database của ứng dụng.
import { q, TOKEN_SQL, type Row } from "./db";
import {
  computeFees,
  computeInvoice,
  type BillingInput,
  type BillingResult,
  type Fee,
  type FeeMethod,
  type FeeType,
  type RoomFee,
} from "./billing";
import { currentPeriod, isRentPeriod, rentDueISO, rentForPeriod, shiftPeriod, todayVN } from "./format";
import { normalizeAccount, roomVa, type PayTarget, type PaymentPart, type SepayPayload } from "./sepay";

/* ------------------------------ Kiểu dữ liệu ------------------------------ */

export type Settings = {
  house_name: string;
  elec_price: number;
  water_quota: number;
  water_low: number;
  water_high: number;
  /** Ngày thu các chi phí khác (điện, nước, phí...) hằng tháng. */
  fee_day: number;
  bank_code: string;
  bank_holder: string;
};

export type Room = {
  id: number;
  name: string;
  sort: number;
  rent: number;
  /** Số tháng mỗi lần thu tiền trọ: 1 hoặc 3. */
  rent_cycle: number;
  tenant_name: string;
  tenant_phone: string;
  occupants: number;
  deposit: number;
  move_in_date: string;
  billing_day: number;
  is_vacant: boolean;
  init_elec: number;
  init_water: number;
  token: string;
};

export type Invoice = {
  id: number;
  room_id: number;
  period: string;
  elec_start: number | null;
  elec_end: number | null;
  elec_read_at: string | null;
  water_start: number | null;
  water_end: number | null;
  water_read_at: string | null;
  occupants: number;
  rent: number;
  elec_price: number;
  water_quota: number;
  water_low: number;
  water_high: number;
  fees: Fee[];
  adjustments: Fee[];
  published: boolean;
  published_at: string | null;
  /** Đã thu chi phí khác (điện, nước, phí, phát sinh). */
  paid_at: string | null;
  /** Tiền trọ được công bố riêng, không cần số điện nước. */
  rent_published: boolean;
  rent_auto_done: boolean;
  rent_paid_at: string | null;
};

export type RoomFeeRow = FeeType & {
  enabled: boolean;
  room_amount: number | null;
  quantity: number;
};

/* ------------------------------- Chuyển đổi ------------------------------- */

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function toRoom(r: Row): Room {
  return {
    id: r.id,
    name: r.name,
    sort: r.sort,
    rent: r.rent,
    rent_cycle: r.rent_cycle === 3 ? 3 : 1,
    tenant_name: r.tenant_name,
    tenant_phone: r.tenant_phone,
    occupants: r.occupants,
    deposit: r.deposit,
    move_in_date: r.move_in_date,
    billing_day: r.billing_day,
    is_vacant: r.is_vacant,
    init_elec: r.init_elec,
    init_water: r.init_water,
    token: r.token,
  };
}

function toInvoice(r: Row): Invoice {
  return {
    id: r.id,
    room_id: r.room_id,
    period: r.period,
    elec_start: num(r.elec_start),
    elec_end: num(r.elec_end),
    elec_read_at: r.elec_read_at,
    water_start: num(r.water_start),
    water_end: num(r.water_end),
    water_read_at: r.water_read_at,
    occupants: r.occupants,
    rent: r.rent,
    elec_price: r.elec_price,
    water_quota: Number(r.water_quota),
    water_low: r.water_low,
    water_high: r.water_high,
    fees: (r.fees ?? []) as Fee[],
    adjustments: (r.adjustments ?? []) as Fee[],
    published: r.published,
    published_at: r.published_at ? new Date(r.published_at).toISOString() : null,
    paid_at: r.paid_at,
    rent_published: !!r.rent_published,
    rent_auto_done: !!r.rent_auto_done,
    rent_paid_at: r.rent_paid_at ?? null,
  };
}

export function invoiceInput(inv: Invoice): BillingInput {
  return {
    rent: inv.rent,
    occupants: inv.occupants,
    elecStart: inv.elec_start,
    elecEnd: inv.elec_end,
    waterStart: inv.water_start,
    waterEnd: inv.water_end,
    elecPrice: inv.elec_price,
    waterQuotaPerPerson: inv.water_quota,
    waterLow: inv.water_low,
    waterHigh: inv.water_high,
    fees: inv.fees,
    adjustments: inv.adjustments,
  };
}

export function invoiceResult(inv: Invoice): BillingResult {
  return computeInvoice(invoiceInput(inv));
}

/* -------------------------------- Cài đặt -------------------------------- */

export async function getSettings(): Promise<Settings> {
  const rows = await q("select key, value from settings");
  const m = new Map(rows.map((r) => [r.key as string, r.value as string]));
  const s = (k: string, d = "") => m.get(k) ?? d;
  const n = (k: string, d: number) => {
    const v = Number(m.get(k));
    return Number.isFinite(v) ? v : d;
  };
  return {
    house_name: s("house_name", "Nhà trọ"),
    elec_price: n("elec_price", 3500),
    water_quota: n("water_quota", 4),
    water_low: n("water_low", 15000),
    water_high: n("water_high", 25000),
    fee_day: n("fee_day", 6),
    bank_code: (process.env.BANK_CODE ?? "").trim().toUpperCase(),
    bank_holder: (process.env.BANK_HOLDER ?? "").trim(),
  };
}

export async function saveSettings(p: Partial<Record<Exclude<keyof Settings, "bank_code" | "bank_holder">, string | number>>): Promise<void> {
  for (const [k, v] of Object.entries(p)) {
    await q(
      "insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value",
      [k, String(v)],
    );
  }
}

/**
 * Áp giá điện/nước hiện hành (cài đặt) cho hóa đơn của kỳ `period` chưa thu tiền (kể cả đã công bố).
 * Hóa đơn đã thu tiền giữ nguyên giá đã chốt. Trả về số hóa đơn được cập nhật.
 */
export async function applyPricesToPeriod(period: string): Promise<number> {
  const s = await getSettings();
  const rows = await q(
    `update invoices set elec_price=$2, water_quota=$3, water_low=$4, water_high=$5
     where period=$1 and paid_at is null returning id`,
    [period, s.elec_price, s.water_quota, s.water_low, s.water_high],
  );
  return rows.length;
}

/* ---------------------------------- Phòng --------------------------------- */

export async function listRooms(): Promise<Room[]> {
  return (await q("select * from rooms order by sort, id")).map(toRoom);
}

export async function getRoom(id: number): Promise<Room | null> {
  const rows = await q("select * from rooms where id = $1", [id]);
  return rows[0] ? toRoom(rows[0]) : null;
}

export async function getRoomByToken(token: string): Promise<Room | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const rows = await q("select * from rooms where token = $1", [token]);
  return rows[0] ? toRoom(rows[0]) : null;
}

export type RoomInput = Omit<Room, "id" | "sort" | "token">;

export async function saveRoom(id: number, r: RoomInput): Promise<void> {
  await q(
    `update rooms set name=$2, rent=$3, tenant_name=$4, tenant_phone=$5, occupants=$6, deposit=$7,
       move_in_date=$8, billing_day=$9, is_vacant=$10, init_elec=$11, init_water=$12, rent_cycle=$13 where id=$1`,
    [
      id,
      r.name,
      r.rent,
      r.tenant_name,
      r.tenant_phone,
      r.occupants,
      r.deposit,
      r.move_in_date,
      r.billing_day,
      r.is_vacant,
      r.init_elec,
      r.init_water,
      r.rent_cycle === 3 ? 3 : 1,
    ],
  );
}

export async function createRoom(name: string): Promise<number> {
  const rows = await q(
    `insert into rooms (name, sort, token)
     values ($1, coalesce((select max(sort) from rooms), 0) + 1, ${TOKEN_SQL}) returning id`,
    [name],
  );
  const id = rows[0].id as number;
  await q(
    "insert into room_fees (room_id, fee_type_id, enabled) select $1, id, true from fee_types on conflict do nothing",
    [id],
  );
  return id;
}

/** Đổi link của phòng: link cũ không còn xem được. */
export async function regenerateToken(id: number): Promise<void> {
  await q(`update rooms set token = ${TOKEN_SQL} where id = $1`, [id]);
}

/* ----------------------------------- Phí ---------------------------------- */

function toFeeType(r: Row): FeeType {
  return {
    id: r.id,
    name: r.name,
    method: r.method as FeeMethod,
    default_amount: r.default_amount,
    active: r.active,
  };
}

export async function listFeeTypes(): Promise<FeeType[]> {
  return (await q("select * from fee_types order by sort, id")).map(toFeeType);
}

/** Thêm loại phí. Có roomId thì chỉ bật cho phòng đó, các phòng khác để tắt; không có thì bật cho mọi phòng. */
export async function createFeeType(
  name: string,
  method: FeeMethod,
  amount: number,
  roomId?: number,
): Promise<void> {
  const rows = await q(
    `insert into fee_types (name, method, default_amount, sort)
     values ($1, $2, $3, coalesce((select max(sort) from fee_types), 0) + 1) returning id`,
    [name, method, amount],
  );
  if (roomId) {
    await q(
      "insert into room_fees (room_id, fee_type_id, enabled) select id, $1, (id = $2) from rooms on conflict do nothing",
      [rows[0].id, roomId],
    );
  } else {
    await q(
      "insert into room_fees (room_id, fee_type_id, enabled) select id, $1, true from rooms on conflict do nothing",
      [rows[0].id],
    );
  }
}

export async function updateFeeType(
  id: number,
  name: string,
  method: FeeMethod,
  amount: number,
  active: boolean,
): Promise<void> {
  await q("update fee_types set name=$2, method=$3, default_amount=$4, active=$5 where id=$1", [
    id,
    name,
    method,
    amount,
    active,
  ]);
}

/** Khoản mặc định, luôn giữ lại (chỉ tắt cho phòng nào không dùng). */
const PROTECTED_FEE = "Tiền rác";

export async function deleteFeeType(id: number): Promise<void> {
  const rows = await q("select name from fee_types where id = $1", [id]);
  if (rows[0]?.name === PROTECTED_FEE) throw new Error(`${PROTECTED_FEE} là khoản mặc định, không xóa được. Bỏ chọn nếu phòng không dùng.`);
  const gone = await q("delete from fee_types where id = $1 returning id", [id]);
  if (gone.length === 0) throw new Error("Không tìm thấy loại phí để xóa. Tải lại trang rồi thử lại.");
}

export async function getRoomFeeRows(roomId: number): Promise<RoomFeeRow[]> {
  const rows = await q(
    `select f.id, f.name, f.method, f.default_amount, f.active,
            coalesce(rf.enabled, false) as enabled, rf.amount as room_amount, coalesce(rf.quantity, 1) as quantity
     from fee_types f
     left join room_fees rf on rf.fee_type_id = f.id and rf.room_id = $1
     order by f.sort, f.id`,
    [roomId],
  );
  return rows.map((r) => ({
    ...toFeeType(r),
    enabled: r.enabled,
    room_amount: num(r.room_amount),
    quantity: r.quantity,
  }));
}

export async function saveRoomFees(
  roomId: number,
  items: { fee_type_id: number; enabled: boolean; amount: number | null; quantity: number }[],
): Promise<void> {
  for (const it of items) {
    await q(
      `insert into room_fees (room_id, fee_type_id, enabled, amount, quantity) values ($1, $2, $3, $4, $5)
       on conflict (room_id, fee_type_id) do update
       set enabled = excluded.enabled, amount = excluded.amount, quantity = excluded.quantity`,
      [roomId, it.fee_type_id, it.enabled, it.amount, it.quantity],
    );
  }
}

/**
 * Lưu các khoản phí của phòng ngay trên trang Nhập số.
 * Cài đặt phí được ghi nhớ theo phòng nên tháng sau tự dùng lại số của tháng này,
 * đồng thời cập nhật phí của hóa đơn tháng đang xem (hóa đơn đã công bố tự chuyển về "chưa công bố").
 */
export async function saveInvoiceFees(
  roomId: number,
  period: string,
  items: { fee_type_id: number; enabled: boolean; amount: number | null; quantity: number }[],
): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("Không tìm thấy phòng.");
  await saveRoomFees(roomId, items);
  const inv = await ensureInvoice(room, period);
  const fees = await feesForRoom(room);
  await q("update invoices set fees=$2::jsonb, published=false where id=$1", [inv.id, JSON.stringify(fees)]);
}

/** Cập nhật lại phí của hóa đơn tháng này theo cài đặt hiện tại (không tạo hóa đơn mới nếu chưa có). */
export async function refreshInvoiceFees(roomId: number, period: string): Promise<void> {
  const room = await getRoom(roomId);
  const inv = await getInvoice(roomId, period);
  if (!room || !inv) return;
  const fees = await feesForRoom(room);
  await q("update invoices set fees=$2::jsonb, published=false where id=$1", [inv.id, JSON.stringify(fees)]);
}

async function feesForRoom(room: Room): Promise<Fee[]> {
  const rows = await getRoomFeeRows(room.id);
  const types: FeeType[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    method: r.method,
    default_amount: r.default_amount,
    active: r.active,
  }));
  const rfs: RoomFee[] = rows.map((r) => ({
    fee_type_id: r.id,
    enabled: r.enabled,
    amount: r.room_amount,
    quantity: r.quantity,
  }));
  return computeFees(types, rfs, room.occupants);
}

/* -------------------------------- Hóa đơn -------------------------------- */

export async function listInvoices(period: string): Promise<Invoice[]> {
  return (await q("select * from invoices where period = $1", [period])).map(toInvoice);
}

export async function getInvoice(roomId: number, period: string): Promise<Invoice | null> {
  const rows = await q("select * from invoices where room_id = $1 and period = $2", [roomId, period]);
  return rows[0] ? toInvoice(rows[0]) : null;
}

/** Mọi hóa đơn của một phòng (kể cả chưa công bố), tháng cũ đến mới. Chỉ dùng cho chế độ xem trước của chủ trọ. */
export async function listRoomInvoices(roomId: number): Promise<Invoice[]> {
  return (await q("select * from invoices where room_id = $1 order by period asc", [roomId])).map(toInvoice);
}

/** Các hóa đơn đã công bố của một phòng, tháng cũ đến mới. */
export async function listPublishedInvoices(roomId: number): Promise<Invoice[]> {
  return (
    await q("select * from invoices where room_id = $1 and published = true order by period asc", [roomId])
  ).map(toInvoice);
}

/** Các hóa đơn người thuê được xem: đã công bố chi phí khác hoặc đã công bố tiền trọ. */
export async function listVisibleInvoices(roomId: number): Promise<Invoice[]> {
  return (
    await q(
      "select * from invoices where room_id = $1 and (published = true or rent_published = true) order by period asc",
      [roomId],
    )
  ).map(toInvoice);
}

/** Chốt số gần nhất trước kỳ này (dùng làm số đầu mặc định). */
export async function previousEnds(
  roomId: number,
  period: string,
): Promise<{ elec: number | null; water: number | null }> {
  const e = await q(
    `select elec_end from invoices where room_id=$1 and period < $2 and elec_end is not null
     order by period desc limit 1`,
    [roomId, period],
  );
  const w = await q(
    `select water_end from invoices where room_id=$1 and period < $2 and water_end is not null
     order by period desc limit 1`,
    [roomId, period],
  );
  return { elec: e[0] ? num(e[0].elec_end) : null, water: w[0] ? num(w[0].water_end) : null };
}

export async function readingDefaults(
  room: Room,
  inv: Invoice | null,
  period: string,
): Promise<{ elecStart: number; waterStart: number }> {
  const prev = await previousEnds(room.id, period);
  return {
    elecStart: inv?.elec_start ?? prev.elec ?? room.init_elec,
    waterStart: inv?.water_start ?? prev.water ?? room.init_water,
  };
}

async function snapshotValues(room: Room, period: string) {
  const s = await getSettings();
  const fees = await feesForRoom(room);
  return {
    // Phòng thu 3 tháng một lần: kỳ thu = giá × 3, các kỳ còn lại không có tiền trọ.
    rent: rentForPeriod(room, period),
    occupants: room.occupants,
    elec_price: s.elec_price,
    water_quota: s.water_quota,
    water_low: s.water_low,
    water_high: s.water_high,
    fees: JSON.stringify(fees),
  };
}

async function refreshSnapshot(invoiceId: number, room: Room, period: string): Promise<void> {
  const v = await snapshotValues(room, period);
  await q(
    `update invoices set rent=$2, occupants=$3, elec_price=$4, water_quota=$5, water_low=$6, water_high=$7,
       fees=$8::jsonb where id=$1`,
    [invoiceId, v.rent, v.occupants, v.elec_price, v.water_quota, v.water_low, v.water_high, v.fees],
  );
}

export async function ensureInvoice(room: Room, period: string): Promise<Invoice> {
  const existing = await getInvoice(room.id, period);
  if (existing) return existing;
  const v = await snapshotValues(room, period);
  await q(
    `insert into invoices (room_id, period, rent, occupants, elec_price, water_quota, water_low, water_high, fees)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) on conflict (room_id, period) do nothing`,
    [room.id, period, v.rent, v.occupants, v.elec_price, v.water_quota, v.water_low, v.water_high, v.fees],
  );
  return (await getInvoice(room.id, period)) as Invoice;
}

/**
 * Lưu số điện hoặc số nước (hai việc độc lập, có thể làm ở hai ngày khác nhau).
 * Nếu hóa đơn đang công bố thì tự chuyển về "chưa công bố" để chủ trọ kiểm tra rồi công bố lại.
 */
export async function saveReading(
  roomId: number,
  period: string,
  kind: "elec" | "water",
  start: number,
  end: number,
  readAt = todayVN(),
): Promise<void> {
  if (!(start >= 0) || !(end >= 0)) throw new Error("Số phải lớn hơn hoặc bằng 0.");
  if (end < start) throw new Error("Số cuối nhỏ hơn số đầu. Kiểm tra lại, hoặc sửa số đầu nếu vừa đổi công tơ/đồng hồ.");
  const room = await getRoom(roomId);
  if (!room) throw new Error("Không tìm thấy phòng.");
  const inv = await ensureInvoice(room, period);
  const cols = kind === "elec" ? ["elec_start", "elec_end", "elec_read_at"] : ["water_start", "water_end", "water_read_at"];
  await q(
    `update invoices set ${cols[0]}=$2, ${cols[1]}=$3, ${cols[2]}=$4, published=false where id=$1`,
    [inv.id, start, end, readAt],
  );
  // Chưa từng công bố thì cập nhật lại giá/phí/số người theo hiện tại. Đã từng công bố thì giữ nguyên giá đã chốt.
  if (!inv.published_at) await refreshSnapshot(inv.id, room, period);
}

export async function addAdjustment(roomId: number, period: string, name: string, amount: number): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("Không tìm thấy phòng.");
  const inv = await ensureInvoice(room, period);
  const next = [...inv.adjustments, { name, amount: Math.round(amount) }];
  await q("update invoices set adjustments=$2::jsonb, published=false where id=$1", [inv.id, JSON.stringify(next)]);
}

export async function removeAdjustment(roomId: number, period: string, index: number): Promise<void> {
  const inv = await getInvoice(roomId, period);
  if (!inv) return;
  const next = inv.adjustments.filter((_, i) => i !== index);
  await q("update invoices set adjustments=$2::jsonb, published=false where id=$1", [inv.id, JSON.stringify(next)]);
}

export async function publishInvoice(roomId: number, period: string): Promise<void> {
  const room = await getRoom(roomId);
  const inv = await getInvoice(roomId, period);
  if (!room || !inv) throw new Error("Chưa có hóa đơn để công bố.");
  if (!invoiceResult(inv).complete) throw new Error("Cần nhập đủ và đúng số điện và số nước trước khi công bố.");
  if (!inv.published_at) await refreshSnapshot(inv.id, room, period);
  await q("update invoices set published = true, published_at = coalesce(published_at, now()) where id = $1", [inv.id]);
  // Tiền có thể đã về trước khi công bố: nếu đủ thì đánh dấu đã thu luôn.
  const fresh = await getInvoiceById(inv.id);
  if (fresh) await settleInvoice(fresh, "other", todayVN());
}

export async function unpublishInvoice(roomId: number, period: string): Promise<void> {
  await q("update invoices set published = false where room_id = $1 and period = $2", [roomId, period]);
}

/** Công bố tiền trọ của kỳ này cho người thuê (không cần nhập số điện nước). */
export async function publishRent(roomId: number, period: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("Không tìm thấy phòng.");
  if (room.rent <= 0) throw new Error("Phòng này chưa có tiền trọ. Nhập tiền trọ ở trang phòng trước.");
  if (!isRentPeriod(period, room.move_in_date, room.rent_cycle)) {
    throw new Error(`Phòng này thu tiền trọ ${room.rent_cycle} tháng một lần, kỳ này không phải kỳ thu.`);
  }
  const inv = await ensureInvoice(room, period);
  // Chưa công bố gì thì lấy tiền trọ hiện tại của phòng; đã công bố thì giữ mức đã chốt.
  if (!inv.rent_published && (!inv.published_at || inv.rent <= 0)) await q("update invoices set rent=$2 where id=$1", [inv.id, rentForPeriod(room, period)]);
  await q("update invoices set rent_published = true, rent_auto_done = true where id = $1", [inv.id]);
  const fresh = await getInvoiceById(inv.id);
  if (fresh) await settleInvoice(fresh, "rent", todayVN());
}

/**
 * Tự công bố tiền trọ đúng ngày thu (ngày vào ở; phòng thu 3 tháng một lần thì cứ 3 tháng) cho kỳ này và kỳ trước (phòng nào chưa được công bố).
 * Phòng trống, chưa có tiền trọ, hoặc tháng đầu mới vào ở (chưa đủ một kỳ thuê) thì bỏ qua.
 * Chủ trọ đã tự công bố hoặc hủy công bố thì không tự công bố lại. Trả về số phòng đã công bố.
 * Gọi khi mở trang (không cần tác vụ định kỳ) và từ /api/cron/rent mỗi sáng.
 */
export async function autoPublishRent(roomId?: number): Promise<number> {
  const today = todayVN();
  const cur = currentPeriod();
  const periods = [shiftPeriod(cur, -1), cur];
  const rooms = (await listRooms()).filter(
    (r) => !r.is_vacant && r.rent > 0 && (roomId === undefined || r.id === roomId),
  );
  if (rooms.length === 0) return 0;
  const done = await q(
    "select room_id, period from invoices where period = any($1) and (rent_published = true or rent_auto_done = true)",
    [periods],
  );
  const skip = new Set(done.map((r) => `${r.room_id}|${r.period}`));
  let n = 0;
  for (const room of rooms) {
    for (const period of periods) {
      if (skip.has(`${room.id}|${period}`)) continue;
      // Kỳ thuê đầu tiên kết thúc vào ngày vào ở của tháng sau, nên chưa thu trong tháng vào ở.
      if (room.move_in_date && room.move_in_date.slice(0, 7) >= period) continue;
      // Phòng thu 3 tháng một lần chỉ thu ở các kỳ đúng chu kỳ.
      if (!isRentPeriod(period, room.move_in_date, room.rent_cycle)) continue;
      if (rentDueISO(period, room.move_in_date, room.billing_day) > today) continue;
      await publishRent(room.id, period);
      n++;
    }
  }
  return n;
}

export async function unpublishRent(roomId: number, period: string): Promise<void> {
  await q("update invoices set rent_published = false, rent_auto_done = true where room_id = $1 and period = $2", [roomId, period]);
}

/** Công bố tất cả phòng đã nhập đủ điện và nước nhưng chưa công bố. Trả về số phòng đã công bố. */
export async function publishAll(period: string): Promise<number> {
  const rooms = await listRooms();
  const invoices = await listInvoices(period);
  let n = 0;
  for (const room of rooms) {
    if (room.is_vacant) continue;
    const inv = invoices.find((i) => i.room_id === room.id);
    if (!inv || inv.published || !invoiceResult(inv).complete) continue;
    await publishInvoice(room.id, period);
    n++;
  }
  return n;
}

/** Đánh dấu đã thu / bỏ đánh dấu cho một đợt thu (tiền trọ hoặc chi phí khác). */
export async function setPaid(roomId: number, period: string, paid: boolean, part: PaymentPart = "other"): Promise<void> {
  const col = part === "rent" ? "rent_paid_at" : "paid_at";
  const gate = part === "rent" ? "rent_published" : "published";
  await q(`update invoices set ${col} = $3 where room_id = $1 and period = $2 and ${gate} = true`, [
    roomId,
    period,
    paid ? todayVN() : null,
  ]);
}

/* ------------------------------ Giới hạn đăng nhập ------------------------------ */

const MAX_FAILS = 5;
const WINDOW_MIN = 15;

export async function isLoginLocked(ip: string): Promise<boolean> {
  const rows = await q(
    `select count(*)::int as n from login_attempts where ip = $1 and at > now() - ($2 || ' minutes')::interval`,
    [ip, String(WINDOW_MIN)],
  );
  return rows[0].n >= MAX_FAILS;
}

export async function recordLoginFailure(ip: string): Promise<void> {
  await q("insert into login_attempts (ip) values ($1)", [ip]);
  await q("delete from login_attempts where at < now() - interval '1 day'");
}

export async function clearLoginFailures(ip: string): Promise<void> {
  await q("delete from login_attempts where ip = $1", [ip]);
}

/* ------------------------------ Thanh toán SePay ------------------------------ */

export type Payment = {
  id: number;
  invoice_id: number | null;
  amount: number;
  content: string;
  account: string;
  gateway: string;
  tx_date: string;
  /** Kết quả xử lý: đã khớp hóa đơn nào, vì sao chưa khớp... */
  note: string;
  /** Đợt thu: tiền trọ, chi phí khác, hoặc gộp cả hai. */
  part: PayTarget;
};

function toPayment(r: Row): Payment {
  return {
    id: r.id,
    invoice_id: r.invoice_id,
    amount: r.amount,
    content: r.content,
    account: r.account,
    gateway: r.gateway,
    tx_date: r.tx_date,
    note: r.note ?? "",
    part: r.part === "rent" ? "rent" : r.part === "all" ? "all" : "other",
  };
}

export async function getInvoiceById(id: number): Promise<Invoice | null> {
  const rows = await q("select * from invoices where id = $1", [id]);
  return rows[0] ? toInvoice(rows[0]) : null;
}

/**
 * Chia số tiền đã nhận cho từng đợt thu. Tiền chuyển đúng mã của đợt nào thì tính cho đợt đó;
 * tiền chuyển theo mã gộp ("all") được chia cho chi phí khác (đến hạn trước) rồi đến tiền trọ. Phần dư không tính.
 */
function splitReceived(inv: Invoice, sums: Record<PayTarget, number>): Record<PaymentPart, number> {
  const res = invoiceResult(inv);
  const needOther = Math.max(res.othersTotal - sums.other, 0);
  const toOther = Math.min(sums.all, needOther);
  const needRent = Math.max(res.rent - sums.rent, 0);
  const toRent = Math.min(sums.all - toOther, needRent);
  return { other: sums.other + toOther, rent: sums.rent + toRent };
}

async function paymentSums(invoiceIds: number[]): Promise<Map<number, Record<PayTarget, number>>> {
  const rows = await q(
    "select invoice_id, part, sum(amount)::int as total from payments where invoice_id = any($1) group by invoice_id, part",
    [invoiceIds],
  );
  const m = new Map<number, Record<PayTarget, number>>();
  for (const r of rows) {
    const cur = m.get(r.invoice_id as number) ?? { rent: 0, other: 0, all: 0 };
    cur[r.part === "rent" ? "rent" : r.part === "all" ? "all" : "other"] += r.total as number;
    m.set(r.invoice_id as number, cur);
  }
  return m;
}

/** Tổng số tiền đã nhận qua SePay cho từng hóa đơn, tách theo đợt thu (đã chia phần chuyển gộp). */
export async function receivedByInvoice(): Promise<Map<number, Record<PaymentPart, number>>> {
  const ids = (await q("select distinct invoice_id from payments where invoice_id is not null")).map((r) => r.invoice_id as number);
  const out = new Map<number, Record<PaymentPart, number>>();
  if (ids.length === 0) return out;
  const sums = await paymentSums(ids);
  const invs = await q("select * from invoices where id = any($1)", [ids]);
  for (const r of invs) {
    const inv = toInvoice(r);
    out.set(inv.id, splitReceived(inv, sums.get(inv.id) ?? { rent: 0, other: 0, all: 0 }));
  }
  return out;
}

/** Số tiền đã nhận của từng hóa đơn trong danh sách, tách theo đợt thu (để hiện "chưa đóng đủ"). */
export async function receivedForInvoices(invs: Invoice[]): Promise<Map<number, Record<PaymentPart, number>>> {
  const out = new Map<number, Record<PaymentPart, number>>();
  if (invs.length === 0) return out;
  const sums = await paymentSums(invs.map((i) => i.id));
  for (const inv of invs) out.set(inv.id, splitReceived(inv, sums.get(inv.id) ?? { rent: 0, other: 0, all: 0 }));
  return out;
}

export async function receivedFor(invoiceId: number, part: PaymentPart = "other"): Promise<number> {
  const inv = await getInvoiceById(invoiceId);
  if (!inv) return 0;
  const sums = (await paymentSums([invoiceId])).get(invoiceId) ?? { rent: 0, other: 0, all: 0 };
  return splitReceived(inv, sums)[part];
}

/**
 * Trạng thái thanh toán của một đợt thu đã công bố (cho trang người thuê hỏi nhanh theo thời gian thật).
 * part = "all": đã đóng khi cả hai đợt đã đóng, số đã nhận là tổng hai đợt.
 */
export async function paymentStatus(
  token: string,
  invoiceId: number,
  part: PayTarget = "other",
): Promise<{ paid: boolean; received: number } | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const rows = await q(
    "select i.* from invoices i join rooms r on r.id = i.room_id where r.token = $1 and i.id = $2",
    [token, invoiceId],
  );
  if (!rows[0]) return null;
  const inv = toInvoice(rows[0]);
  const sums = (await paymentSums([inv.id])).get(inv.id) ?? { rent: 0, other: 0, all: 0 };
  const got = splitReceived(inv, sums);
  if (part === "rent") return inv.rent_published ? { paid: !!inv.rent_paid_at, received: got.rent } : null;
  if (part === "other") return inv.published ? { paid: !!inv.paid_at, received: got.other } : null;
  if (!inv.rent_published || !inv.published) return null;
  return { paid: !!inv.rent_paid_at && !!inv.paid_at, received: got.rent + got.other };
}

/** Giao dịch tiền vào chưa khớp hóa đơn nào (người thuê quên/ghi sai nội dung). */
export async function listUnmatchedPayments(limit = 10): Promise<Payment[]> {
  return (
    await q(
      `select * from payments where invoice_id is null and created_at > now() - interval '60 days'
       order by id desc limit $1`,
      [limit],
    )
  ).map(toPayment);
}

/** Giao dịch SePay gần đây (kèm kết quả xử lý) để chủ trọ đối chiếu. */
export async function listRecentPayments(limit = 8): Promise<Payment[]> {
  return (await q("select * from payments order by id desc limit $1", [limit])).map(toPayment);
}

/**
 * Với phòng có VA riêng: chọn hóa đơn cũ nhất còn khoản chờ thu và đợt thu phù hợp với số tiền.
 * Đúng số còn thiếu của tiền trọ, của chi phí khác hoặc của cả hai thì tính đúng đợt đó;
 * không khớp số nào thì chia theo thứ tự chi phí khác rồi đến tiền trọ (như chuyển gộp).
 */
async function pickVaTarget(roomId: number, amount: number): Promise<{ inv: Invoice; part: PayTarget } | null> {
  const all = (await q("select * from invoices where room_id = $1 order by period asc", [roomId])).map(toInvoice);
  for (const inv of all) {
    const res = invoiceResult(inv);
    const rentOpen = inv.rent_published && res.rent > 0 && !inv.rent_paid_at;
    const otherOpen = inv.published && res.complete && !inv.paid_at;
    if (!rentOpen && !otherOpen) continue;
    const rentLeft = rentOpen ? Math.max(res.rent - (await receivedFor(inv.id, "rent")), 0) : 0;
    const otherLeft = otherOpen ? Math.max(res.othersTotal - (await receivedFor(inv.id, "other")), 0) : 0;
    let part: PayTarget;
    if (rentOpen && otherOpen) {
      part =
        amount === rentLeft ? "rent" : amount === otherLeft ? "other" : "all";
    } else {
      part = rentOpen ? "rent" : "other";
    }
    return { inv, part };
  }
  return null;
}

export type PaymentResult = "duplicate" | "unmatched" | "recorded" | "paid";

/**
 * Ghi nhận một giao dịch tiền vào từ SePay.
 * - Trùng `id` giao dịch: bỏ qua (SePay có thể gửi lại).
 * - Khớp được hóa đơn: cộng vào số đã nhận; đủ tiền thì tự đánh dấu đã thu.
 * - Không khớp: vẫn lưu để chủ trọ thấy trong danh sách "chưa khớp".
 */
export async function recordSepayPayment(tx: SepayPayload): Promise<PaymentResult> {
  // Mỗi phòng một VA (biến môi trường VA_<TÊN PHÒNG>): tiền vào đúng VA nào thì tính cho phòng đó,
  // không phụ thuộc nội dung chuyển khoản (người thuê sửa nội dung cũng không ảnh hưởng).
  const rooms = await listRooms();
  const accounts = [normalizeAccount(tx.subAccount), normalizeAccount(tx.accountNumber)].filter(Boolean);
  const vaRoom = rooms.find((r) => {
    const va = roomVa(r.name);
    return va !== "" && accounts.includes(va);
  });

  let part: PayTarget = "other";
  let inv: Invoice | null = null;
  let note = "";
  if (vaRoom) {
    const t = await pickVaTarget(vaRoom.id, tx.transferAmount);
    inv = t?.inv ?? null;
    part = t?.part ?? "other";
    if (!inv) note = `Tiền vào tài khoản riêng của ${vaRoom.name} nhưng không có khoản nào đang chờ thu`;
  } else {
    note = "Không khớp tài khoản VA của phòng nào";
  }
  const partName = part === "rent" ? "tiền trọ" : part === "all" ? "gộp tiền trọ và chi phí khác" : "chi phí khác";

  const rows = await q(
    `insert into payments (sepay_id, invoice_id, amount, content, code, account, gateway, tx_date, note, part)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (sepay_id) do nothing returning id`,
    [tx.id, inv ? inv.id : null, tx.transferAmount, tx.content, tx.code, tx.accountNumber, tx.gateway, tx.transactionDate, note, part],
  );
  if (rows.length === 0) return "duplicate";
  if (!inv) return "unmatched";

  const payDate = /^\d{4}-\d{2}-\d{2}/.test(tx.transactionDate) ? tx.transactionDate.slice(0, 10) : todayVN();
  if (part === "all") {
    // Chuyển gộp: chia tiền cho chi phí khác trước rồi đến tiền trọ, đợt nào đủ thì tự đánh dấu đã thu.
    const o = await settleInvoice(inv, "other", payDate);
    const r = await settleInvoice(inv, "rent", payDate);
    const paidParts = [o.state === "paid" ? "chi phí khác" : "", r.state === "paid" ? "tiền trọ" : ""].filter(Boolean);
    const allNote = paidParts.length
      ? `Khớp hóa đơn #${inv.id} (${partName}), đã đủ tiền: ${paidParts.join(" và ")}, tự đánh dấu đã thu`
      : `Khớp hóa đơn #${inv.id} (${partName}), mới nhận ${(o.received + r.received).toLocaleString("vi-VN")}đ / ${(o.total + r.total).toLocaleString("vi-VN")}đ, còn thiếu`;
    await q("update payments set note = $2 where sepay_id = $1", [tx.id, allNote]);
    return paidParts.length ? "paid" : "recorded";
  }
  const result = await settleInvoice(inv, part, payDate);
  let finalNote = result.state === "paid" ? `Khớp hóa đơn #${inv.id} (${partName}), đã đủ tiền và tự đánh dấu đã thu` : "";
  if (result.state === "recorded") {
    finalNote = !result.published
      ? `Khớp hóa đơn #${inv.id} (${partName}) nhưng chưa công bố (sẽ tự đánh dấu đã thu khi công bố nếu đủ tiền)`
      : !result.complete
        ? `Khớp hóa đơn #${inv.id} (${partName}) nhưng chưa nhập đủ điện và nước`
        : `Khớp hóa đơn #${inv.id} (${partName}), mới nhận ${result.received.toLocaleString("vi-VN")}đ / ${result.total.toLocaleString("vi-VN")}đ, còn thiếu`;
  }
  await q("update payments set note = $2 where sepay_id = $1", [tx.id, finalNote]);
  return result.state;
}

/** Nếu đợt thu đã công bố, đủ số liệu và tiền đã nhận đủ thì đánh dấu đã thu. */
async function settleInvoice(
  inv: Invoice,
  part: PaymentPart,
  date: string,
): Promise<{ state: "paid" | "recorded"; complete: boolean; published: boolean; received: number; total: number }> {
  const res = invoiceResult(inv);
  const received = await receivedFor(inv.id, part);
  const rent = part === "rent";
  const total = rent ? res.rent : res.othersTotal;
  const published = rent ? inv.rent_published : inv.published;
  const complete = rent ? res.rent > 0 : res.complete;
  const paidAt = rent ? inv.rent_paid_at : inv.paid_at;
  if (published && complete && received >= total && !paidAt) {
    await q(`update invoices set ${rent ? "rent_paid_at" : "paid_at"} = $2 where id = $1`, [inv.id, date]);
    return { state: "paid", complete, published, received, total };
  }
  return { state: "recorded", complete, published, received, total };
}
