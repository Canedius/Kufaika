import { db } from "./db.js";
import { salesData } from "../sales-data.js";

const monthMap = new Map([
  ['січень', 1],
  ['лютий', 2],
  ['березень', 3],
  ['квітень', 4],
  ['травень', 5],
  ['червень', 6],
  ['липень', 7],
  ['серпень', 8],
  ['вересень', 9],
  ['жовтень', 10],
  ['листопад', 11],
  ['грудень', 12]
]);

const insertProduct = db.prepare(`
  INSERT INTO products (name, slug)
  VALUES (?, ?)
  RETURNING id
`);

const findProductBySlug = db.prepare(`
  SELECT id, name FROM products WHERE slug = ?
`);

const insertSize = db.prepare(`
  INSERT INTO sizes (label)
  VALUES (?)
  ON CONFLICT(label) DO UPDATE SET label = excluded.label
  RETURNING id
`);

const insertColor = db.prepare(`
  INSERT INTO colors (product_id, name)
  VALUES (?, ?)
  ON CONFLICT(product_id, name) DO UPDATE SET name = excluded.name
  RETURNING id
`);

const insertPeriod = db.prepare(`
  INSERT INTO periods (year, month, label)
  VALUES (?, ?, ?)
  ON CONFLICT(year, label) DO UPDATE SET month = excluded.month, label = excluded.label
  RETURNING id
`);

const upsertSale = db.prepare(`
  INSERT INTO sales (product_id, color_id, size_id, period_id, quantity)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(product_id, color_id, size_id, period_id) DO UPDATE SET quantity = excluded.quantity
`);

const insertVariant = db.prepare(`
  INSERT INTO product_variants (product_id, color_id, size_id, sku, offer_id)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(product_id, color_id, size_id)
  DO UPDATE SET
    sku = COALESCE(product_variants.sku, excluded.sku),
    offer_id = COALESCE(product_variants.offer_id, excluded.offer_id)
  RETURNING id
`);

function slugify(input) {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0400-\u04FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "item";
  return base;
}

function ensureProduct(name) {
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let counter = 1;
  while (true) {
    const existing = findProductBySlug.get(slug);
    if (!existing) {
      return insertProduct.get(name, slug).id;
    }
    if (existing.name === name) {
      return existing.id;
    }
    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }
}

function ensureSize(label) {
  return insertSize.get(label).id;
}

function ensureColor(productId, name) {
  return insertColor.get(productId, name).id;
}

function ensurePeriod(year, label) {
  const key = label.trim().toLowerCase();
  const month = monthMap.get(key) ?? null;
  return insertPeriod.get(year, month, label).id;
}

function ensureVariant(productId, colorId, sizeId, sku = null, offerId = null) {
  return insertVariant.get(productId, colorId, sizeId, sku, offerId).id;
}

function resetTables() {
  db.exec(`
    DELETE FROM inventory_levels;
    DELETE FROM inventory_history;
    DELETE FROM sales;
    DELETE FROM product_variants;
    DELETE FROM periods;
    DELETE FROM colors;
    DELETE FROM sizes;
    DELETE FROM products;
    DELETE FROM webhook_events;
  `);
}

function importData() {
  resetTables();
  const productIds = new Set();
  let salesCount = 0;

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const product of salesData.products) {
      const productId = ensureProduct(product.name.trim());
      productIds.add(productId);
      for (const monthEntry of product.months) {
        const periodId = ensurePeriod(monthEntry.year, monthEntry.month.trim());
        for (const [colorName, items] of Object.entries(monthEntry.colors)) {
          const colorId = ensureColor(productId, colorName.trim());
          for (const item of items) {
            const sizeId = ensureSize(item.size.trim());
            ensureVariant(productId, colorId, sizeId);
            upsertSale.run(productId, colorId, sizeId, periodId, item.quantity);
            salesCount += 1;
          }
        }
      }
    }
    db.exec("COMMIT");
    console.log(`Imported ${productIds.size} products and ${salesCount} sales facts.`);
  } catch (error) {
    db.exec("ROLLBACK");
    console.error("Import failed:", error);
    process.exitCode = 1;
  }
}

importData();
