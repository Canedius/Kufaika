import fs from "node:fs/promises";

const payload = JSON.parse(await fs.readFile(new URL("../data/webhook-1427-kuf.json", import.meta.url), "utf8"));

if (!Array.isArray(payload) || payload.length === 0) {
  throw new Error("No data to replay");
}

const res = await fetch("https://hoodie-sales-worker.kanedius.workers.dev/webhooks/keycrm", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "keycrm-webhook": "stocks"
  },
  body: JSON.stringify(payload)
});

if (!res.ok) {
  const body = await res.text();
  throw new Error(`Worker responded ${res.status} ${res.statusText}: ${body}`);
}

console.log("Worker response:", await res.text());
