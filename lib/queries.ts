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
import { todayVN } from "./format";
import { isValidPrefix, parsePaymentCode, type SepayPayload } from "./sepay";

/* ------------------------------ Kiểu dữ liệu ------------------------------ */

export type Settings = {
  house_name: string;
  elec_price: number;
  water_quota: number;
  water_low: number;
  water_high: number;
  due_days: number;
  bank_code: string;
  bank_account: string;
  bank_holder: string;
  /** Tiền tố mã thanh toán (biến môi trường SEPAY_PREFIX), trùng "Cấu trúc mã thanh toán" bên SePay. */
  sepay_prefix: string;
};

function sepayPrefixFromEnv(): string {
  const p = (process.env.SEPAY_PREFIX ?? "").trim().toUpperCase();
  return isValidPrefix(p) ? p : "TRO";
}

export type Room = {
  id: number;
  name: string;
  sort: number;
  rent: number;
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
  paid_at: string | null;
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
    due_days: n("due_days", 5),
    bank_code: (process.env.BANK_CODE ?? "").trim().toUpperCase(),
    bank_account: (process.env.BANK_ACCOUNT ?? "").replace(/\s/g, ""),
    bank_holder: (process.env.BANK_HOLDER ?? "").trim(),
    sepay_prefix: sepayPrefixFromEnv(),
  };
}

export async function saveSettings(p: Partial<Record<Exclude<keyof Settings, "sepay_prefix" | "bank_code" | "bank_account" | "bank_holder">, string | number>>): Promise<void> {
  for (const [k, v] of Object.entries(p)) {
    await q(
      "insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value",
      [k, String(v)],
    );
  }
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
       move_in_date=$8, billing_day=$9, is_vacant=$10, init_elec=$11, init_water=$12 where id=$1`,
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

export async function deleteRoom(id: number): Promise<void> {
  await q("delete from rooms where id = $1", [id]);
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

export async function createFeeType(name: string, method: FeeMethod, amount: number): Promise<void> {
  const rows = await q(
    `insert into fee_types (name, method, default_amount, sort)
     values ($1, $2, $3, coalesce((select max(sort) from fee_types), 0) + 1) returning id`,
    [name, method, amount],
  );
  await q(
    "insert into room_fees (room_id, fee_type_id, enabled) select id, $1, true from rooms on conflict do nothing",
    [rows[0].id],
  );
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

export async function deleteFeeType(id: number): Promise<void> {
  await q("delete from fee_types where id = $1", [id]);
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

/** Các hóa đơn đã công bố của một phòng, tháng cũ đến mới. */
export async function listPublishedInvoices(roomId: number): Promise<Invoice[]> {
  return (
    await q("select * from invoices where room_id = $1 and published = true order by period asc", [roomId])
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

async function snapshotValues(room: Room) {
  const s = await getSettings();
  const fees = await feesForRoom(room);
  return {
    rent: room.rent,
    occupants: room.occupants,
    elec_price: s.elec_price,
    water_quota: s.water_quota,
    water_low: s.water_low,
    water_high: s.water_high,
    fees: JSON.stringify(fees),
  };
}

async function refreshSnapshot(invoiceId: number, room: Room): Promise<void> {
  const v = await snapshotValues(room);
  await q(
    `update invoices set rent=$2, occupants=$3, elec_price=$4, water_quota=$5, water_low=$6, water_high=$7,
       fees=$8::jsonb where id=$1`,
    [invoiceId, v.rent, v.occupants, v.elec_price, v.water_quota, v.water_low, v.water_high, v.fees],
  );
}

export async function ensureInvoice(room: Room, period: string): Promise<Invoice> {
  const existing = await getInvoice(room.id, period);
  if (existing) return existing;
  const v = await snapshotValues(room);
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
  if (!inv.published_at) await refreshSnapshot(inv.id, room);
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
  if (!inv.published_at) await refreshSnapshot(inv.id, room);
  await q("update invoices set published = true, published_at = coalesce(published_at, now()) where id = $1", [inv.id]);
}

export async function unpublishInvoice(roomId: number, period: string): Promise<void> {
  await q("update invoices set published = false where room_id = $1 and period = $2", [roomId, period]);
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

export async function setPaid(roomId: number, period: string, paid: boolean): Promise<void> {
  await q("update invoices set paid_at = $3 where room_id = $1 and period = $2 and published = true", [
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
  };
}

export async function getInvoiceById(id: number): Promise<Invoice | null> {
  const rows = await q("select * from invoices where id = $1", [id]);
  return rows[0] ? toInvoice(rows[0]) : null;
}

/** Tổng số tiền đã nhận qua SePay cho từng hóa đơn. */
export async function receivedByInvoice(): Promise<Map<number, number>> {
  const rows = await q(
    "select invoice_id, sum(amount)::int as total from payments where invoice_id is not null group by invoice_id",
  );
  return new Map(rows.map((r) => [r.invoice_id as number, r.total as number]));
}

export async function receivedFor(invoiceId: number): Promise<number> {
  const rows = await q("select coalesce(sum(amount), 0)::int as total from payments where invoice_id = $1", [invoiceId]);
  return rows[0].total;
}

/** Trạng thái thanh toán của một hóa đơn đã công bố (cho trang người thuê hỏi nhanh theo thời gian thật). */
export async function paymentStatus(token: string, invoiceId: number): Promise<{ paid: boolean; received: number } | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const rows = await q(
    `select (i.paid_at is not null) as paid,
            coalesce((select sum(amount) from payments p where p.invoice_id = i.id), 0)::int as received
     from invoices i join rooms r on r.id = i.room_id
     where r.token = $1 and i.id = $2 and i.published = true`,
    [token, invoiceId],
  );
  return rows[0] ? { paid: !!rows[0].paid, received: rows[0].received } : null;
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

export type PaymentResult = "duplicate" | "unmatched" | "recorded" | "paid";

/**
 * Ghi nhận một giao dịch tiền vào từ SePay.
 * - Trùng `id` giao dịch: bỏ qua (SePay có thể gửi lại).
 * - Khớp được hóa đơn: cộng vào số đã nhận; đủ tiền thì tự đánh dấu đã thu.
 * - Không khớp: vẫn lưu để chủ trọ thấy trong danh sách "chưa khớp".
 */
export async function recordSepayPayment(tx: SepayPayload): Promise<PaymentResult> {
  const settings = await getSettings();
  const wrongAccount = settings.bank_account !== "" && tx.accountNumber !== "" && tx.accountNumber !== settings.bank_account;
  const invoiceId = wrongAccount ? null : parsePaymentCode(settings.sepay_prefix, tx.code, tx.content);
  const inv = invoiceId ? await getInvoiceById(invoiceId) : null;

  const rows = await q(
    `insert into payments (sepay_id, invoice_id, amount, content, code, account, gateway, tx_date)
     values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (sepay_id) do nothing returning id`,
    [tx.id, inv ? inv.id : null, tx.transferAmount, tx.content, tx.code, tx.accountNumber, tx.gateway, tx.transactionDate],
  );
  if (rows.length === 0) return "duplicate";
  if (!inv) return "unmatched";

  const res = invoiceResult(inv);
  const received = await receivedFor(inv.id);
  if (inv.published && res.complete && received >= res.total && !inv.paid_at) {
    const date = /^\d{4}-\d{2}-\d{2}/.test(tx.transactionDate) ? tx.transactionDate.slice(0, 10) : todayVN();
    await q("update invoices set paid_at = $2 where id = $1", [inv.id, date]);
    return "paid";
  }
  return "recorded";
}
