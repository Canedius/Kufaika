import { execSync } from "node:child_process";
import fs from "node:fs";

function execSql(sql) {
  const cmd = `wrangler d1 execute hoodie-sales --remote --command "${sql}" --json`;
  return JSON.parse(execSync(cmd, {encoding: 'utf8'}));
}

const colors = execSql('SELECT id, product_id, name FROM colors')[0].results;
const sizes = execSql('SELECT id, label FROM sizes')[0].results;

const colorCodes = new Map([
  ['Чорний', 'BK'],
  ['Білий', 'WH'],
  ['Ніжно-рожевий', 'PK'],
  ['Бежевий', 'NU'],
  ['Олива', 'OG'],
  ['Сірий', 'GB'],
  ['Сірий Грі', 'GF'],
  ['Койот', 'KT'],
  ['Хакі', 'KH']
]);

const sizeMap = new Map(sizes.map(row => [row.label, row.id]));

const standardSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const relaxedSizes = ['XS/S', 'M/L', 'XL/XXL'];
const lightnessSizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];

const productConfigs = [
  { productId: 8, prefix: 'KUF001', sizes: standardSizes },
  { productId: 7, prefix: 'KUF002', sizes: standardSizes },
  { productId: 2, prefix: 'KUF004', sizes: standardSizes },
  { productId: 1, prefix: 'KUF005', sizes: standardSizes },
  { productId: 5, prefix: 'KUF006', sizes: standardSizes },
  { productId: 4, prefix: 'KUF007', sizes: relaxedSizes },
  { productId: 6, prefix: 'KUF008', sizes: relaxedSizes },
  { productId: 3, prefix: 'KUF009', sizes: lightnessSizes }
];

const sanitizeSize = (productId, label) => {
  let sanitized = label.replace(/\s+/g, '');
  if (productId === 6 && sanitized === 'XL/XXL') {
    sanitized = 'XL/2XL';
  }
  return sanitized;
};

let statements = [];

for (const config of productConfigs) {
  const colorRows = colors.filter(row => row.product_id === config.productId && colorCodes.has(row.name));
  if (colorRows.length === 0) continue;
  for (const colorRow of colorRows) {
    const colorCode = colorCodes.get(colorRow.name);
    for (const sizeLabel of config.sizes) {
      const sizeId = sizeMap.get(sizeLabel);
      if (!sizeId) continue;
      const sku = `${config.prefix}${colorCode}${sanitizeSize(config.productId, sizeLabel)}`;
      const sql = `INSERT INTO product_variants (product_id, color_id, size_id, sku)\n` +
        `VALUES (${config.productId}, ${colorRow.id}, ${sizeId}, '${sku}')\n` +
        `ON CONFLICT(product_id, color_id, size_id) DO UPDATE SET sku = excluded.sku;`;
      statements.push(sql);
    }
  }
}

if (statements.length === 0) {
  throw new Error('No statements generated (check color/size mappings).');
}

fs.writeFileSync('data/upsert-kuf-variants.sql', statements.join('\n'), 'utf8');
console.log(`Generated ${statements.length} statements in data/upsert-kuf-variants.sql`);
