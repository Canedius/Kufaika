import { execSync } from "node:child_process";
import fs from "node:fs";

const productName = 'Світшот Утеплений Kufaika Unisex';
const productId = 2;

const additions = {
  'Січень': {
    year: 2025,
    colors: {
      'Чорний': { 'M': 37, 'L': 29, 'XL': 10, 'XXL': 7, 'S': 5, '3XL': 1, 'XS': 1 }
    }
  },
  'Лютий': {
    year: 2025,
    colors: {
      'Чорний': { 'L': 20, 'M': 18, 'XXL': 12, 'S': 11, 'XL': 10, 'XS': 1 },
      'Інший Колір': { 'Інший розмір': 20 }
    }
  },
  'Березень': {
    year: 2025,
    colors: {
      'Чорний': { 'M': 13, 'L': 11, 'XL': 3, 'XXL': 2, 'S': 2 },
      'Інший Колір': { 'Інший розмір': 69 }
    }
  },
  'Квітень': {
    year: 2025,
    colors: {
      'Чорний': { 'M': 13, 'L': 10, 'XL': 8, 'S': 6, 'XXL': 1 }
    }
  },
  'Травень': {
    year: 2025,
    colors: {
      'Чорний': { 'L': 5, 'XL': 5, 'M': 4 }
    }
  },
  'Червень': {
    year: 2025,
    colors: {
      'Чорний': { 'XL': 1, 'S': 1, 'L': 1, 'M': 1 }
    }
  },
  'Липень': {
    year: 2025,
    colors: {
      'Чорний': { 'M': 5, 'L': 4, 'XL': 3, 'XXL': 1 }
    }
  },
  'Серпень': {
    year: 2025,
    colors: {
      'Чорний': { 'M': 5, 'L': 4, 'S': 3, 'XS': 2, 'XL': 2, 'XXL': 2, '3XL': 1 }
    }
  },
  'Вересень': {
    year: 2025,
    colors: {
      'Чорний': { 'M': 21, 'S': 13, 'L': 13, 'XL': 9, '3XL': 1 }
    }
  }
};

function execSql(sql) {
  const cmd = `wrangler d1 execute hoodie-sales --remote --command "${sql}" --json`;
  const output = execSync(cmd, { encoding: 'utf8' });
  return JSON.parse(output);
}

const colorRows = execSql('SELECT id, product_id, name FROM colors')[0].results;
const sizeRows = execSql('SELECT id, label FROM sizes')[0].results;

function getPeriodId(year, label) {
  const rows = execSql(`SELECT id FROM periods WHERE year = ${year} AND label = '${label}'`)[0].results;
  if (!rows || rows.length === 0) {
    throw new Error(`Period not found: ${label} ${year}`);
  }
  return rows[0].id;
}

const colorMap = new Map(colorRows.map(row => [`${row.product_id}|${row.name}`, row.id]));
const sizeMap = new Map(sizeRows.map(row => [row.label, row.id]));

const statements = [];
for (const [monthLabel, info] of Object.entries(additions)) {
  const periodId = getPeriodId(info.year, monthLabel);
  for (const [colorName, sizeEntries] of Object.entries(info.colors)) {
    const colorId = colorMap.get(`${productId}|${colorName}`);
    if (!colorId) {
      throw new Error(`Color not found: ${colorName}`);
    }
    for (const [sizeLabel, quantity] of Object.entries(sizeEntries)) {
      const sizeId = sizeMap.get(sizeLabel);
      if (!sizeId) {
        throw new Error(`Size not found: ${sizeLabel}`);
      }
      const sql = `INSERT INTO sales (product_id, color_id, size_id, period_id, quantity)\n` +
        `VALUES (${productId}, ${colorId}, ${sizeId}, ${periodId}, ${quantity})\n` +
        `ON CONFLICT(product_id, color_id, size_id, period_id) DO UPDATE SET quantity = sales.quantity + ${quantity};`;
      statements.push(sql);
    }
  }
}

fs.writeFileSync('data/update-sweatshirt-sales.sql', statements.join('\n'), 'utf8');
console.log(`Generated ${statements.length} statements in data/update-sweatshirt-sales.sql`);
