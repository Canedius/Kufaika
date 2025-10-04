import fs from "node:fs";
const data = JSON.parse(fs.readFileSync('data/latest-stocks.json','utf8'));
const matched = data.filter(item => item.found !== false).map(item => item.sku);
const missing = data.filter(item => item.found === false).map(item => item.sku);
console.log(JSON.stringify({ matched, missing }, null, 2));
