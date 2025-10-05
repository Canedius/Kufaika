import fs from "node:fs/promises";
import { execSync } from "node:child_process";

const API_ROOT = "https://openapi.keycrm.app/v1";
const API_TOKEN = process.env.KEYCRM_API_TOKEN;

if (!API_TOKEN) {
  console.error("❌ KEYCRM_API_TOKEN environment variable is not set");
  console.log("💡 Set it with: $env:KEYCRM_API_TOKEN='your_token_here'");
  process.exit(1);
}

function getKufSkus() {
  const output = execSync(
    `wrangler d1 execute hoodie-sales --remote --command "SELECT sku FROM product_variants WHERE sku LIKE 'KUF%'" --json`,
    { encoding: "utf8" }
  );
  const json = JSON.parse(output);
  return (json[0]?.results ?? []).map((row) => row.sku).filter(Boolean);
}

const TARGET_SKUS = getKufSkus(); // Всі SKU
const RETRY_LIMIT = 5;
const REQUEST_INTERVAL_MS = 300; // Швидше між запитами
const BATCH_SIZE = 3; // По 3 SKU в батчі

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  console.log(`Requesting: ${url}`);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      Accept: "application/json"
    }
  });
  const text = await res.text();
  console.log(`Response (${res.status} ${res.statusText}): ${text}`);
  if (!res.ok) {
    throw new Error(`KeyCRM request failed: ${res.status} ${res.statusText}`);
  }
  return JSON.parse(text);
}

function normalizeRecord(record) {
  const offer = record.offer ?? record;
  const balance = record.balance ?? record.stocks ?? record;
  const sku = offer?.sku ?? record?.offers_sku ?? record?.sku ?? null;
  if (!sku) {
    return null;
  }
  const inStock = Number(balance?.in_stock ?? balance?.available ?? balance?.stock ?? balance?.quantity ?? 0);
  const inReserve = Number(balance?.in_reserve ?? balance?.reserve ?? balance?.reserved ?? 0);
  return { sku, in_stock: inStock, in_reserve: inReserve, found: true };
}

async function fetchSingleSku(sku) {
  let attempt = 0;
  while (attempt < RETRY_LIMIT) {
    attempt += 1;
    try {
      const params = new URLSearchParams();
      params.set("limit", "1");
      params.set("page", "1");
      params.append("filter[offers_sku]", sku);
      const url = `${API_ROOT}/offers/stocks?${params.toString()}`;
      const json = await fetchJson(url);
      const items = Array.isArray(json.data)
        ? json.data
        : Array.isArray(json.items)
          ? json.items
          : [];
      const normalized = items.length ? normalizeRecord(items[0]) : null;
      if (normalized) {
        console.log(`Normalized: ${JSON.stringify(normalized)}`);
        return normalized;
      }
      console.log(`No data for ${sku}`);
      return { sku, in_stock: 0, in_reserve: 0, found: false };
    } catch (error) {
      console.warn(`Failed ${sku} attempt ${attempt}: ${error.message}`);
      if ((error.status === 429 || (error.status >= 500 && error.status < 600)) && attempt < RETRY_LIMIT) {
        const delay = 1000 * attempt;
        console.warn(`Retry ${attempt} for ${sku} in ${delay}ms`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  return { sku, in_stock: 0, in_reserve: 0, found: false, error: "Max retries exceeded" };
}

if (TARGET_SKUS.length === 0) {
  console.log("No KUF SKUs found in the database.");
  process.exit(0);
}

console.log(`🚀 Починаємо завантаження ${TARGET_SKUS.length} SKU по ${BATCH_SIZE} в батчі...`);

const results = [];
const totalBatches = Math.ceil(TARGET_SKUS.length / BATCH_SIZE);

for (let i = 0; i < TARGET_SKUS.length; i += BATCH_SIZE) {
  const batch = TARGET_SKUS.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  
  console.log(`📦 Батч ${batchNum}/${totalBatches}: [${batch.join(', ')}]`);
  
  // Обробляємо кожен SKU в батчі послідовно
  for (const sku of batch) {
    try {
      const result = await fetchSingleSku(sku);
      results.push(result);
      if (result.found) {
        console.log(`  ✅ ${result.sku}: ${result.in_stock} в наявності, ${result.in_reserve} в резерві`);
      } else {
        console.log(`  ⚠️ ${result.sku}: не знайдено`);
      }
    } catch (error) {
      console.warn(`  ❌ ${sku}: ${error.message}`);
      results.push({ sku, in_stock: 0, in_reserve: 0, found: false, error: error.message });
    }
    await sleep(REQUEST_INTERVAL_MS);
  }
  
  console.log(`✅ Батч ${batchNum} завершено. Всього оброблено: ${results.length}/${TARGET_SKUS.length}`);
  
  // Пауза між батчами
  if (i + BATCH_SIZE < TARGET_SKUS.length) {
    console.log('⏳ Пауза між батчами...');
    await sleep(1000);
  }
}

await fs.mkdir("data", { recursive: true });
await fs.writeFile(
  "data/latest-stocks.json",
  JSON.stringify(results, null, 2),
  "utf8"
);

console.log(`Saved ${results.length} KUF stock records to data/latest-stocks.json`);
