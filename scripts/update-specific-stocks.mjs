import fs from "node:fs/promises";

const token = process.env.KEYCRM_API_TOKEN;
if (!token) {
  throw new Error('KEYCRM_API_TOKEN is not set.');
}

const TARGET_SKUS = ['KUF006PKXL'];

async function fetchStock(sku) {
  const params = new URLSearchParams({ limit: '1', page: '1', 'filter[offers_sku]': sku });
  const url = `https://openapi.keycrm.app/v1/offers/stocks?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`KeyCRM ${res.status} ${res.statusText}: ${body}`);
  }
  const json = await res.json();
  const record = (json.data ?? json.items ?? [])[0];
  if (!record) {
    return { sku, in_stock: 0, in_reserve: 0, found: false };
  }
  const balance = record.balance ?? record.stocks ?? record;
  const inStock = Number(balance?.in_stock ?? balance?.available ?? balance?.stock ?? balance?.quantity ?? 0);
  const inReserve = Number(balance?.in_reserve ?? balance?.reserve ?? 0);
  return { sku: record?.sku ?? sku, in_stock: inStock, in_reserve: inReserve, found: true };
}

const path = 'data/latest-stocks.json';
const data = JSON.parse(await fs.readFile(path, 'utf8'));
const bySku = new Map(data.map(item => [item.sku, item]));

for (const sku of TARGET_SKUS) {
  const stock = await fetchStock(sku);
  bySku.set(stock.sku, stock);
  console.log('Updated', stock);
}

await fs.writeFile(path, JSON.stringify(Array.from(bySku.values()), null, 2), 'utf8');
