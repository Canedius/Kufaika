import { execSync } from "node:child_process";
import fs from "node:fs";

const additions = {
  "Футболка Premium Kufaika": {
    productId: 5,
    colors: {
      "Чорний": { "L": 19, "M": 15, "XL": 9, "XXL": 8, "S": 4 },
      "Білий": { "L": 2, "XL": 1, "XXL": 1, "S": 1, "M": 1 },
      "Олива": { "L": 4, "XL": 4, "M": 2, "S": 1 },
      "Ніжно-рожевий": { "M": 1, "S": 1 }
    }
  },
  "Худі Утеплений Kufaika Unisex": {
    productId: 8,
    colors: {
      "Чорний": { "L": 8, "M": 8, "XL": 2, "XXL": 2 },
      "Ніжно-рожевий": { "L": 1, "XL": 1 },
      "Сірий Грі": { "M": 1 }
    }
  },
  "Світшот Утеплений Kufaika Unisex": {
    productId: 2,
    colors: {
      "Чорний": { "XL": 3, "M": 2, "XS": 2, "L": 1 }
    }
  },
  "Футболка Relaxed Kufaika": {
    productId: 6,
    colors: {
      "Білий": { "M-L": 1 },
      "Чорний": { "XL-2XL": 1 }
    }
  }
};

const month = 'Жовтень';
const year = 2025;

function execSql(sql) {
  const cmd = `wrangler d1 execute hoodie-sales --remote --command "${sql}" --json`;
  const output = execSync(cmd, { encoding: 'utf8' });
  return JSON.parse(output);
}

const colorRows = execSql('SELECT id, product_id, name FROM colors')[0].results;
const sizeRows = execSql('SELECT id, label FROM sizes')[0].results;
const periodRow = execSql(`SELECT id FROM periods WHERE year = ${year} AND label = '${month}'`)[0].results[0];
if (!periodRow) {
  throw new Error('Period not found');
}
const periodId = periodRow.id;

const colorMap = new Map(colorRows.map(row => [`${row.product_id}|${row.name}`, row.id]));
const sizeMap = new Map(sizeRows.map(row => [row.label, row.id]));

const normalizeSize = (label) => {
  switch (label) {
    case 'M-L':
      return 'M/L';
    case 'XL-2XL':
      return 'XL/XXL';
    default:
      return label;
  }
};

let statements = [];
for (const [productName, info] of Object.entries(additions)) {
  const productId = info.productId;
  for (const [colorName, sizeEntries] of Object.entries(info.colors)) {
    const colorId = colorMap.get(`${productId}|${colorName}`);
    if (!colorId) {
      throw new Error(`Color not found: ${productName} ${colorName}`);
    }
    for (const [sizeLabelRaw, quantity] of Object.entries(sizeEntries)) {
      const sizeLabel = normalizeSize(sizeLabelRaw);
      const sizeId = sizeMap.get(sizeLabel);
      if (!sizeId) {
        throw new Error(`Size not found: ${productName} ${sizeLabel} (from ${sizeLabelRaw})`);
      }
      const sql = `INSERT INTO sales (product_id, color_id, size_id, period_id, quantity)\n` +
        `VALUES (${productId}, ${colorId}, ${sizeId}, ${periodId}, ${quantity})\n` +
        `ON CONFLICT(product_id, color_id, size_id, period_id) DO UPDATE SET quantity = sales.quantity + ${quantity};`;
      statements.push(sql);
    }
  }
}

fs.writeFileSync('data/append-oct-sales.sql', statements.join('\n'), 'utf8');
console.log(`Generated ${statements.length} statements in data/append-oct-sales.sql`);
