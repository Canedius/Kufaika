import fs from "node:fs/promises";

const WORKER_URL = process.env.KUF_WORKER_STOCK_URL ?? "https://hoodie-sales-worker.kanedius.workers.dev/webhooks/keycrm";
const CHUNK_SIZE = Number(process.env.WORKER_STOCK_CHUNK_SIZE) > 0 ? Number(process.env.WORKER_STOCK_CHUNK_SIZE) : 30;

const raw = await fs.readFile("data/latest-stocks.json", "utf8");
const payload = JSON.parse(raw);

if (!Array.isArray(payload) || payload.length === 0) {
  throw new Error("data/latest-stocks.json is empty or invalid");
}

const kufOnly = payload.filter((entry) => entry?.sku?.startsWith("KUF"));
if (kufOnly.length === 0) {
  throw new Error("No KUF entries found in payload. Aborting to avoid sending irrelevant SKU.");
}

async function postChunk(chunk) {
  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "keycrm-webhook": "stocks"
    },
    body: JSON.stringify(chunk)
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Worker responded ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

const responses = [];
for (let index = 0; index < kufOnly.length; index += CHUNK_SIZE) {
  const chunk = kufOnly.slice(index, index + CHUNK_SIZE);
  const response = await postChunk(chunk);
  responses.push(response);
  console.log(`Chunk ${index / CHUNK_SIZE + 1}:`, response);
}

console.log(`Pushed ${kufOnly.length} KUF stock records to worker in ${responses.length} chunk(s).`);
