import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED = {
  products: ["id", "name", ["price"], ["image_url", "image"]],
  cart_items: ["id", "user_id", "product_id", "quantity"],
  orders: ["id", "user_id", "total", "status", "payment_status", ["delivery_address", "address"], "created_at"],
  order_items: ["order_id", "product_id", "quantity", ["unit_price", "price"]],
  profiles: [["id", "user_id"], ["first_name", "firstname"], ["last_name", "lastname"], "phone", "address"],
};

function ensureEnv() {
  const url = process.env.SUPABASE_DB_POOLER_URL || process.env.SUPABASE_DB_DIRECT_URL || "";
  if (!url) throw new Error("Missing SUPABASE_DB_POOLER_URL or SUPABASE_DB_DIRECT_URL");
  return url;
}

function resolveColumns(actual, expectedSpec) {
  const actualSet = new Set(actual.map((c) => c.toLowerCase()));
  const missing = [];
  for (const spec of expectedSpec) {
    if (Array.isArray(spec)) {
      const anyPresent = spec.some((alt) => actualSet.has(String(alt).toLowerCase()));
      if (!anyPresent) missing.push(spec.join("|"));
    } else {
      if (!actualSet.has(String(spec).toLowerCase())) missing.push(spec);
    }
  }
  return missing;
}

async function fetchColumns(pool, table) {
  const sql = `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`;
  const res = await pool.query(sql, [table]);
  return res.rows.map((r) => r.column_name);
}

export async function GET() {
  let pool;
  try {
    const conn = ensureEnv();
    pool = new Pool({ connectionString: conn, max: 1, idleTimeoutMillis: 1_000 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }

  const results = {};
  let ok = true;
  for (const [table, spec] of Object.entries(REQUIRED)) {
    try {
      const cols = await fetchColumns(pool, table);
      if (cols.length === 0) {
        ok = false;
        results[table] = { ok: false, error: "table not found", columns: [], missing: spec.flat(), suggest: `-- create table ${table} (...)` };
        continue;
      }
      const missing = resolveColumns(cols, spec);
      const tableOk = missing.length === 0;
      ok = ok && tableOk;
      results[table] = { ok: tableOk, columns: cols, missing };
    } catch (e) {
      ok = false;
      results[table] = { ok: false, error: e?.message || String(e) };
    }
  }

  try { await pool.end(); } catch {}

  return NextResponse.json({ ok, time: Date.now(), results }, { status: ok ? 200 : 500 });
}

