import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", override: false, quiet: true });

const DEFAULT_TERMS = ["rice", "pepper", "peper", "ata rodo", "beans", "oil"];
const terms = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_TERMS;
const connectionString = process.env.SUPABASE_DB_POOLER_URL || process.env.SUPABASE_DB_DIRECT_URL;

if (!connectionString) {
  throw new Error("Set SUPABASE_DB_POOLER_URL or SUPABASE_DB_DIRECT_URL before running this script.");
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const collectPlanNodes = (node, out = []) => {
  if (!node) return out;
  out.push({
    node: node["Node Type"],
    relation: node["Relation Name"] || "",
    index: node["Index Name"] || "",
    actualRows: node["Actual Rows"],
    planRows: node["Plan Rows"],
    filter: node.Filter || "",
    indexCond: node["Index Cond"] || "",
  });
  for (const child of node.Plans || []) collectPlanNodes(child, out);
  return out;
};

await client.connect();

try {
  const marketResult = await client.query(`
    select id, code
    from public.markets
    where status = 'active'
    order by created_at asc nulls last, id asc
    limit 1
  `);
  const market = marketResult.rows[0];
  if (!market?.id) throw new Error("No active market found.");

  console.log(`Market: ${market.code || market.id}`);

  const indexResult = await client.query(`
    select tablename, indexname
    from pg_indexes
    where schemaname = 'public'
      and (
        indexname like '%search%trgm%'
        or indexname like 'product%card%lookup%'
        or indexname like 'product%market%listed%'
      )
    order by tablename, indexname
  `);
  console.log("Relevant indexes:");
  for (const row of indexResult.rows) {
    console.log(`- ${row.tablename}.${row.indexname}`);
  }

  for (const term of terms) {
    const explainResult = await client.query(
      `explain (analyze, buffers, format json)
       select
         product_id,
         name,
         category_name,
         main_image_url,
         default_variant_id,
         unit,
         starting_price,
         old_price,
         stock_count,
         in_stock
       from public.product_card_catalog
       where market_id = $1
         and search_text ilike ('%' || $2 || '%')
       order by product_id asc
       limit 13`,
      [market.id, term]
    );

    const root = explainResult.rows[0]["QUERY PLAN"][0];
    const nodes = collectPlanNodes(root.Plan);
    const indexes = [...new Set(nodes.map((node) => node.index).filter(Boolean))];
    const filters = nodes.map((node) => node.filter).filter(Boolean).slice(0, 4);

    console.log(JSON.stringify({
      term,
      planningMs: Number(root["Planning Time"].toFixed(3)),
      executionMs: Number(root["Execution Time"].toFixed(3)),
      returnedRows: root.Plan["Actual Rows"],
      scannedNodeRows: nodes.reduce((sum, node) => sum + (Number(node.actualRows) || 0), 0),
      topNode: root.Plan["Node Type"],
      indexes,
      filters,
    }));
  }
} finally {
  await client.end();
}
