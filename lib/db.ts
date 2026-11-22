// Kết nối database.
// - Có DATABASE_URL: dùng Neon Postgres (cách dùng khi deploy lên Vercel).
// - Không có DATABASE_URL và không phải production: dùng PGlite (Postgres chạy ngay trong
//   Node, dữ liệu lưu ở thư mục .data/) để chạy thử cục bộ không cần cài gì.
// Bảng được tạo tự động ở lần truy vấn đầu tiên, không cần chạy migration thủ công.
import { neon } from "@neondatabase/serverless";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
type Runner = (text: string, params: unknown[]) => Promise<Row[]>;

// Giữ kết nối và trạng thái khởi tạo trên globalThis để mọi route/trang trong cùng tiến trình dùng chung
// (Next có thể đóng gói mỗi route thành một module riêng, nếu không sẽ mở nhiều kết nối PGlite khi chạy thử).
const g = globalThis as unknown as { __ptRunner?: Promise<Runner> | null; __ptSchema?: Promise<void> | null };

async function makeRunner(): Promise<Runner> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const sql = neon(url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return async (text, params) => (await sql.query(text, params as any[])) as Row[];
  }
  if (process.env.NODE_ENV === "production" && !process.env.PGLITE) {
    throw new Error("Thiếu biến môi trường DATABASE_URL (chuỗi kết nối Neon Postgres).");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR === undefined ? ".data/pglite" : process.env.PGLITE_DIR;
  const db = dir ? new PGlite(dir) : new PGlite();
  await db.waitReady;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (text, params) => (await db.query(text, params as any[])).rows as Row[];
}

const SCHEMA: string[] = [
  `create table if not exists settings (
    key text primary key,
    value text not null
  )`,
  `create table if not exists rooms (
    id serial primary key,
    name text not null,
    sort int not null default 0,
    rent int not null default 0,
    tenant_name text not null default '',
    tenant_phone text not null default '',
    occupants int not null default 1,
    deposit int not null default 0,
    move_in_date text not null default '',
    billing_day int not null default 1,
    is_vacant boolean not null default false,
    init_elec int not null default 0,
    init_water int not null default 0,
    token text not null unique
  )`,
  `create table if not exists fee_types (
    id serial primary key,
    name text not null,
    method text not null default 'fixed',
    default_amount int not null default 0,
    active boolean not null default true,
    sort int not null default 0
  )`,
  `create table if not exists room_fees (
    room_id int not null references rooms(id) on delete cascade,
    fee_type_id int not null references fee_types(id) on delete cascade,
    enabled boolean not null default true,
    amount int,
    quantity int not null default 1,
    primary key (room_id, fee_type_id)
  )`,
  `create table if not exists invoices (
    id serial primary key,
    room_id int not null references rooms(id) on delete cascade,
    period text not null,
    elec_start int,
    elec_end int,
    elec_read_at text,
    water_start numeric,
    water_end numeric,
    water_read_at text,
    occupants int not null default 1,
    rent int not null default 0,
    elec_price int not null default 0,
    water_quota numeric not null default 0,
    water_low int not null default 0,
    water_high int not null default 0,
    fees jsonb not null default '[]'::jsonb,
    adjustments jsonb not null default '[]'::jsonb,
    published boolean not null default false,
    published_at timestamptz,
    paid_at text,
    unique (room_id, period)
  )`,
  `create table if not exists payments (
    id serial primary key,
    sepay_id bigint not null unique,
    invoice_id int references invoices(id) on delete set null,
    amount int not null,
    content text not null default '',
    code text,
    account text not null default '',
    gateway text not null default '',
    tx_date text not null default '',
    created_at timestamptz not null default now()
  )`,
  `create table if not exists login_attempts (
    ip text not null,
    at timestamptz not null default now()
  )`,
];

const TOKEN_SQL = "replace(gen_random_uuid()::text, '-', '')";

async function seed(run: Runner): Promise<void> {
  const defaults: Record<string, string> = {
    house_name: "Nhà trọ",
    elec_price: "3500",
    water_quota: "4",
    water_low: "15000",
    water_high: "25000",
    due_days: "5",
    bank_code: "",
    bank_account: "",
    bank_holder: "",
    sepay_prefix: "TRO",
  };
  for (const [k, v] of Object.entries(defaults)) {
    await run("insert into settings (key, value) values ($1, $2) on conflict (key) do nothing", [k, v]);
  }
  await run(
    `insert into rooms (name, sort, token)
     select 'Phòng ' || g, g, ${TOKEN_SQL} from generate_series(1, 9) g
     where not exists (select 1 from rooms)`,
    [],
  );
  await run(
    `insert into fee_types (name, method, default_amount, sort)
     select v.name, v.method, v.amount, v.sort
     from (values ('Tiền rác', 'fixed', 30000, 1), ('Wifi', 'fixed', 50000, 2)) as v(name, method, amount, sort)
     where not exists (select 1 from fee_types)`,
    [],
  );
  // Phòng nào chưa có dòng phí thì thêm: rác bật sẵn, các loại khác tắt (chủ trọ tự bật theo phòng).
  await run(
    `insert into room_fees (room_id, fee_type_id, enabled)
     select r.id, f.id, (f.name = 'Tiền rác')
     from rooms r cross join fee_types f
     where not exists (select 1 from room_fees x where x.room_id = r.id and x.fee_type_id = f.id)`,
    [],
  );
}

async function init(run: Runner): Promise<void> {
  for (const stmt of SCHEMA) await run(stmt, []);
  await seed(run);
}

async function getRunner(): Promise<Runner> {
  if (!g.__ptRunner) g.__ptRunner = makeRunner();
  return g.__ptRunner;
}

/** Chạy một câu SQL có tham số $1, $2... và trả về các dòng. */
export async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  const run = await getRunner();
  if (!g.__ptSchema) {
    g.__ptSchema = init(run).catch((e) => {
      g.__ptSchema = null; // cho phép thử lại lần sau
      throw e;
    });
  }
  await g.__ptSchema;
  return run(text, params);
}

export { TOKEN_SQL };
