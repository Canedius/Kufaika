import fs from "node:fs/promises";
import { execSync } from "node:child_process";

const API_ROOT = "https://openapi.keycrm.app/v1";
const token = process.env.KEYCRM_API_TOKEN;

if (!token) {
  throw new Error("KEYCRM_API_TOKEN is not set in the environment.");
}

function getKufSkus() {
  const output = execSync(
    'wrangler d1 execute hoodie-sales --remote --command "SELECT sku FROM product_variants WHERE sku LIKE \'KUF%\'" --json',
    { encoding: "utf8" }
  );
  const json = JSON.parse(output);
  return (json[0]?.results ?? []).map((row) => row.sku).filter(Boolean);
}

const TARGET_SKUS = getKufSkus();
const CHUNK_SIZE = Number(process.env.KEYCRM_SKU_BATCH_SIZE) > 0
  ? Number(process.env.KEYCRM_SKU_BATCH_SIZE)
  : 5;
const RETRY_LIMIT = 5;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`KeyCRM request failed: ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

function normalizeRecord(record) {
  const offer = record.offer ?? record;
  const balance = record.balance ?? record.stocks ?? record;
  const sku = offer?.sku ?? record?.offers_sku ?? record?.sku ?? null;
  if (!sku) {
    return null;
  }
  const inStock = Number(balance?.in_stock ?? balance?.available ?? balance?.stock ?? balance?.quantity ?? 0);
  const inReserve = Number(balance?.in_reserve ?? balance?.reserve ?? 0);
  return { sku, in_stock: inStock, in_reserve: inReserve, found: true };
}

async function fetchStockBatch(skus) {
  let attempt = 0;
  while (attempt < RETRY_LIMIT) {
    attempt += 1;
    try {
      const params = new URLSearchParams({
        limit: String(Math.max(skus.length, 1)),
        page: "1"
      });
      for (const sku of skus) {
        params.append("filter[offers_sku][]", sku);
      }
      const url = `${API_ROOT}/offers/stocks?${params.toString()}`;
      const json = await fetchJson(url);
      const items = Array.isArray(json.data)
        ? json.data
        : Array.isArray(json.items)
          ? json.items
          : [];
      const normalizedMap = new Map();
      for (const item of items) {
        const normalized = normalizeRecord(item);
        if (normalized?.sku) {
          normalizedMap.set(normalized.sku, normalized);
        }
      }
      return skus.map((sku) => {
        if (normalizedMap.has(sku)) {
          return normalizedMap.get(sku);
        }
        return { sku, in_stock: 0, in_reserve: 0, found: false };
      });
    } catch (error) {
      if (error.status === 429) {
        const delay = 1000 * attempt;
        console.warn(`429 for batch [${skus.join(', ')}], retrying in ${delay}ms`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  return skus.map((sku) => ({
    sku,
    in_stock: 0,
    in_reserve: 0,
    found: false,
    error: "Max retries exceeded"
  }));
}

if (TARGET_SKUS.length === 0) {
  console.log("No KUF SKUs found in the database.");
  process.exit(0);
}

const results = [];
for (let index = 0; index < TARGET_SKUS.length; index += CHUNK_SIZE) {
  const chunk = TARGET_SKUS.slice(index, index + CHUNK_SIZE);
  try {
    const batchResults = await fetchStockBatch(chunk);
    results.push(...batchResults);
  } catch (error) {
    console.warn(`Failed to fetch batch [${chunk.join(', ')}]:`, error.message);
    if (error.body) {
      console.warn(error.body);
    }
    for (const sku of chunk) {
      results.push({ sku, in_stock: 0, in_reserve: 0, found: false, error: error.message });
    }
  }
  await sleep(400);
}

const filteredResults = results.filter((entry) => entry?.sku?.startsWith("KUF"));

await fs.mkdir("data", { recursive: true });
await fs.writeFile(
  "data/latest-stocks.json",
  JSON.stringify(filteredResults, null, 2),
  "utf8"
);
console.log(`Saved ${filteredResults.length} KUF stock records to data/latest-stocks.json`);
