import fs from "node:fs";

const stocks = JSON.parse(fs.readFileSync('data/latest-stocks.json', 'utf8'));
const knownRaw = JSON.parse(fs.readFileSync('data/known-skus.json', 'utf8'));
const known = new Set((knownRaw[0]?.results ?? []).map(row => row.sku));
const missing = stocks.filter(item => !known.has(item.sku));
console.log(JSON.stringify(missing, null, 2));