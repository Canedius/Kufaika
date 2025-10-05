import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { salesData as legacySalesData } from "../sales-data.js";

let salesData = legacySalesData;

try {
  const raw = readFileSync(new URL("../sales.json", import.meta.url), "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed?.products) && parsed.products.length > 0) {
    salesData = parsed;
  }
} catch {}

const monthMap = new Map([
  ["Січень", 1],
  ["Лютий", 2],
  ["Березень", 3],
  ["Квітень", 4],
  ["Травень", 5],
  ["Червень", 6],
  ["Липень", 7],
  ["Серпень", 8],
  ["Вересень", 9],
  ["Жовтень", 10],
  ["Листопад", 11],
  ["Грудень", 12]
]);

function normalizeKey(value) {
  return value.trim().toLowerCase();
}

function slugify(input) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0400-\u04FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "item";
}

function sqlString(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

const products = [];
const sizes = [];
const colors = [];
const periods = [];
const variants = [];
const sales = [];

const productIds = new Map();
const sizeIds = new Map();
const colorIds = new Map();
const periodIds = new Map();
const variantIds = new Map();
const usedSlugs = new Set();

let productCounter = 1;
let sizeCounter = 1;
let colorCounter = 1;
let periodCounter = 1;
let variantCounter = 1;

function ensureProduct(name) {
  const key = name.trim();
  if (productIds.has(key)) {
    return productIds.get(key);
  }
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let suffix = 1;
  while (usedSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix++}`;
  }
  usedSlugs.add(slug);
  const id = productCounter++;
  productIds.set(key, id);
  products.push({ id, name, slug });
  return id;
}

function ensureSize(label) {
  const key = label.trim();
  if (sizeIds.has(key)) {
    return sizeIds.get(key);
  }
  const id = sizeCounter++;
  sizeIds.set(key, id);
  sizes.push({ id, label });
  return id;
}

function ensureColor(productId, name) {
  const key = `${productId}|${name.trim()}`;
  if (colorIds.has(key)) {
    return colorIds.get(key);
  }
  const id = colorCounter++;
  colorIds.set(key, id);
  colors.push({ id, productId, name });
  return id;
}

function ensurePeriod(year, label) {
  const key = `${year}|${normalizeKey(label)}`;
  if (periodIds.has(key)) {
    return periodIds.get(key);
  }
  const month = monthMap.get(normalizeKey(label)) ?? null;
  const id = periodCounter++;
  periodIds.set(key, id);
  periods.push({ id, year, month, label });
  return id;
}

function ensureVariant(productId, colorId, sizeId) {
  const key = `${productId}|${colorId}|${sizeId}`;
  if (variantIds.has(key)) {
    return variantIds.get(key);
  }
  const id = variantCounter++;
  variantIds.set(key, id);
  variants.push({ id, productId, colorId, sizeId });
  return id;
}

for (const product of salesData.products) {
  const productId = ensureProduct(product.name);
  for (const monthEntry of product.months) {
    const periodId = ensurePeriod(Number(monthEntry.year), monthEntry.month);
    for (const [colorName, items] of Object.entries(monthEntry.colors ?? {})) {
      const colorId = ensureColor(productId, colorName);
      for (const item of items) {
        const sizeId = ensureSize(item.size);
        ensureVariant(productId, colorId, sizeId);
        sales.push({
          productId,
          colorId,
          sizeId,
          periodId,
          quantity: Number(item.quantity) || 0
        });
      }
    }
  }
}

const statements = [];

// ⚠️ НЕБЕЗПЕЧНІ DELETE КОМАНДИ ВИДАЛЕНО!
// Цей скрипт тепер тільки додає нові дані без видалення існуючих
// Для повного скидання бази використовуйте окремий скрипт

for (const size of sizes) {
  statements.push(`INSERT INTO sizes (id, label) VALUES (${size.id}, ${sqlString(size.label)}) ON CONFLICT(id) DO UPDATE SET label = excluded.label;`);
}

for (const product of products) {
  statements.push(`INSERT INTO products (id, name, slug) VALUES (${product.id}, ${sqlString(product.name)}, ${sqlString(product.slug)}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug;`);
}

for (const color of colors) {
  statements.push(`INSERT INTO colors (id, product_id, name) VALUES (${color.id}, ${color.productId}, ${sqlString(color.name)}) ON CONFLICT(id) DO UPDATE SET product_id = excluded.product_id, name = excluded.name;`);
}

for (const period of periods) {
  const monthValue = period.month == null ? "NULL" : period.month;
  statements.push(`INSERT INTO periods (id, year, month, label) VALUES (${period.id}, ${period.year}, ${monthValue}, ${sqlString(period.label)}) ON CONFLICT(id) DO UPDATE SET year = excluded.year, month = excluded.month, label = excluded.label;`);
}

for (const variant of variants) {
  statements.push(`INSERT INTO product_variants (id, product_id, color_id, size_id) VALUES (${variant.id}, ${variant.productId}, ${variant.colorId}, ${variant.sizeId}) ON CONFLICT(id) DO UPDATE SET product_id = excluded.product_id, color_id = excluded.color_id, size_id = excluded.size_id;`);
}

for (const row of sales) {
  statements.push(`INSERT INTO sales (product_id, color_id, size_id, period_id, quantity) VALUES (${row.productId}, ${row.colorId}, ${row.sizeId}, ${row.periodId}, ${row.quantity}) ON CONFLICT(product_id, color_id, size_id, period_id) DO UPDATE SET quantity = excluded.quantity;`);
}


const outputPath = join(process.cwd(), "seed-d1.sql");
writeFileSync(outputPath, statements.join("\n") + "\n", { encoding: "utf-8" });

console.log(`Generated ${statements.length} SQL statements to ${outputPath}`);
