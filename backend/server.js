import { createServer } from "node:http";
import { db } from "./db.js";
import { URL } from "node:url";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const sizeOrder = ["XS", "XS/S", "S", "M", "M/L", "L", "XL", "XL/XXL", "2XL", "XXL", "3XL"];

const PUBLIC_ROOT = normalize(process.cwd());
const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8']
]);

function resolveStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname ?? '/');
  const relative = decoded.startsWith('/') ? decoded.slice(1) : decoded;
  const candidate = normalize(join(PUBLIC_ROOT, relative));
  if (!candidate.toLowerCase().startsWith(PUBLIC_ROOT.toLowerCase())) {
    return null;
  }
  return candidate;
}

function tryServeStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }
  let pathname = url.pathname || '/';
  if (pathname === '/') {
    pathname = '/index.html';
  } else if (pathname.endsWith('/')) {
    pathname = `${pathname}index.html`;
  }
  const filePath = resolveStaticPath(pathname);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return false;
  }
  const ext = extname(filePath).toLowerCase();
  const type = MIME_TYPES.get(ext) ?? 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
  });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  createReadStream(filePath).pipe(res);
  return true;
}

const listProductsStmt = db.prepare(`
  SELECT id, name, slug FROM products ORDER BY name
`);
const getProductByIdStmt = db.prepare(`
  SELECT id, name, slug FROM products WHERE id = ?
`);
const getProductBySlugStmt = db.prepare(`
  SELECT id, name, slug FROM products WHERE slug = ?
`);
const getProductByNameStmt = db.prepare(`
  SELECT id, name, slug FROM products WHERE name = ?
`);
const fetchSalesStmt = db.prepare(`
  SELECT
    sales.product_id as product_id,
    periods.year as year,
    periods.label as month_label,
    periods.month as month_number,
    colors.name as color_name,
    sizes.label as size_label,
    sales.quantity as quantity
  FROM sales
  JOIN periods ON periods.id = sales.period_id
  JOIN colors ON colors.id = sales.color_id
  JOIN sizes ON sizes.id = sales.size_id
  WHERE sales.product_id = ?
  ORDER BY periods.year, periods.month, periods.label, colors.name, sizes.label
`);
const fetchInventoryStmt = db.prepare(`
  SELECT pv.product_id, c.name as color_name, s.label as size_label, il.in_stock, il.in_reserve, il.updated_at
  FROM inventory_levels il
  JOIN product_variants pv ON pv.id = il.variant_id
  JOIN colors c ON c.id = pv.color_id
  JOIN sizes s ON s.id = pv.size_id
  WHERE pv.product_id = ?
`);
const listVariantsStmt = db.prepare(`
  SELECT pv.id, pv.product_id, pv.color_id, pv.size_id, pv.sku, pv.offer_id,
         c.name as color_name, s.label as size_label
  FROM product_variants pv
  JOIN colors c ON c.id = pv.color_id
  JOIN sizes s ON s.id = pv.size_id
  WHERE pv.product_id = ?
  ORDER BY c.name, s.label
`);
const selectVariantBySkuStmt = db.prepare(`
  SELECT id, product_id, color_id, size_id, sku, offer_id FROM product_variants WHERE sku = ?
`);
const selectVariantByOfferStmt = db.prepare(`
  SELECT id, product_id, color_id, size_id, sku, offer_id FROM product_variants WHERE offer_id = ?
`);
const selectVariantByAttributesStmt = db.prepare(`
  SELECT id, product_id, color_id, size_id, sku, offer_id
  FROM product_variants
  WHERE product_id = ? AND color_id = ? AND size_id = ?
  LIMIT 1
`);
const upsertVariantStmt = db.prepare(`
  INSERT INTO product_variants (product_id, color_id, size_id, sku, offer_id)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(product_id, color_id, size_id)
  DO UPDATE SET
    sku = COALESCE(product_variants.sku, excluded.sku),
    offer_id = COALESCE(product_variants.offer_id, excluded.offer_id)
  RETURNING id
`);
const updateVariantIdentifiersStmt = db.prepare(`
  UPDATE product_variants
  SET sku = COALESCE(?, sku), offer_id = COALESCE(?, offer_id)
  WHERE id = ?
`);
const insertInventoryLevelStmt = db.prepare(`
  INSERT INTO inventory_levels (variant_id, in_stock, in_reserve, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(variant_id) DO UPDATE SET
    in_stock = excluded.in_stock,
    in_reserve = excluded.in_reserve,
    updated_at = excluded.updated_at
`);
const insertInventoryHistoryStmt = db.prepare(`
  INSERT INTO inventory_history (variant_id, in_stock, in_reserve, recorded_at)
  VALUES (?, ?, ?, ?)
`);
const selectInventoryLevelStmt = db.prepare(`
  SELECT in_stock, in_reserve FROM inventory_levels WHERE variant_id = ?
`);
const upsertPeriodStmt = db.prepare(`
  INSERT INTO periods (year, month, label)
  VALUES (?, ?, ?)
  ON CONFLICT(year, label) DO UPDATE SET month = excluded.month
  RETURNING id
`);
const upsertSalesStmt = db.prepare(`
  INSERT INTO sales (product_id, color_id, size_id, period_id, quantity)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(product_id, color_id, size_id, period_id)
  DO UPDATE SET quantity = MAX(sales.quantity + excluded.quantity, 0)
  RETURNING quantity
`);
const selectSalesQuantityStmt = db.prepare(`
  SELECT quantity FROM sales WHERE product_id = ? AND color_id = ? AND size_id = ? AND period_id = ?
`);
const selectVariantByIdStmt = db.prepare(`
  SELECT id, product_id, color_id, size_id FROM product_variants WHERE id = ?
`);
const insertWebhookEventStmt = db.prepare(`
  INSERT INTO webhook_events (event_type, payload, status, received_at)
  VALUES (?, ?, ?, ?)
  RETURNING id
`);
const updateWebhookStatusStmt = db.prepare(`
  UPDATE webhook_events SET status = ?, processed_at = ?, error = ? WHERE id = ?
`);
const findSizeStmt = db.prepare(`SELECT id FROM sizes WHERE label = ?`);
const findColorStmt = db.prepare(`SELECT id FROM colors WHERE product_id = ? AND name = ?`);
const upsertOrderStmt = db.prepare(`
  INSERT INTO orders (id, source_uuid, global_source_uuid, last_status_id, last_status_group_id, last_status_changed_at, last_payload, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    source_uuid = excluded.source_uuid,
    global_source_uuid = excluded.global_source_uuid,
    last_status_id = excluded.last_status_id,
    last_status_group_id = excluded.last_status_group_id,
    last_status_changed_at = excluded.last_status_changed_at,
    last_payload = excluded.last_payload,
    updated_at = excluded.updated_at
  RETURNING id
`);
const insertOrderEventStmt = db.prepare(`
  INSERT INTO order_events (order_id, status_id, status_group_id, status_label, event_type, occurred_at, payload, is_negative, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  RETURNING id
`);
const insertOrderEventItemStmt = db.prepare(`
  INSERT INTO order_event_items (event_id, variant_id, sku, quantity, price, payload)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const productCodeMap = new Map([
  ['001', '\u0425\u0443\u0434\u0456 \u0423\u0442\u0435\u043f\u043b\u0435\u043d\u0438\u0439 Kufaika Unisex'],
  ['002', '\u0425\u0443\u0434\u0456 \u041b\u0435\u0433\u043a\u0438\u0439 Kufaika Unisex'],
  ['004', '\u0421\u0432\u0456\u0442\u0448\u043e\u0442 \u0423\u0442\u0435\u043f\u043b\u0435\u043d\u0438\u0439 Kufaika Unisex'],
  ['005', '\u0421\u0432\u0456\u0442\u0448\u043e\u0442 \u041b\u0435\u0433\u043a\u0438\u0439 Kufaika Unisex'],
  ['006', '\u0424\u0443\u0442\u0431\u043e\u043b\u043a\u0430 Premium Kufaika'],
  ['007', '\u0424\u0443\u0442\u0431\u043e\u043b\u043a\u0430 OVERSIZE Kufaika'],
  ['008', '\u0424\u0443\u0442\u0431\u043e\u043b\u043a\u0430 Relaxed Kufaika'],
  ['009', '\u0424\u0443\u0442\u0431\u043e\u043b\u043a\u0430 Lightness Kufaika']
]);
const colorCodeMap = new Map([
  ['BK', '\u0427\u043e\u0440\u043d\u0438\u0439'],
  ['WH', '\u0411\u0456\u043b\u0438\u0439'],
  ['OG', '\u041e\u043b\u0438\u0432\u0430'],
  ['GY', '\u0421\u0456\u0440\u0438\u0439'],
  ['GR', '\u0421\u0456\u0440\u0438\u0439 \u0413\u0440\u0456'],
  ['BE', '\u0411\u0435\u0436\u0435\u0432\u0438\u0439'],
  ['PK', '\u041d\u0456\u0436\u043d\u043e-\u0440\u043e\u0436\u0435\u0432\u0438\u0439'],
  ['HA', '\u0425\u0430\u043a\u0456'],
  ['CY', '\u041a\u043e\u0439\u043e\u0442'],
  ['OT', '\u0406\u043d\u0448\u0438\u0439 \u041a\u043e\u043b\u0456\u0440']
]);
const ORDER_NEGATIVE_STATUS_IDS = new Set([13, 14, 15, 16, 17, 18, 19, 29, 30, 34, 35, 36, 37, 54]);

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, keycrm-webhook',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(body);
}

function notFound(res) {
  sendJson(res, 404, { error: 'Not found' });
}

function methodNotAllowed(res) {
  sendJson(res, 405, { error: 'Method not allowed' });
}

function sortSizes(items) {
  const order = new Map(sizeOrder.map((value, index) => [value, index]));
  return items.slice().sort((a, b) => {
    const indexA = order.has(a.size) ? order.get(a.size) : Number.MAX_SAFE_INTEGER;
    const indexB = order.has(b.size) ? order.get(b.size) : Number.MAX_SAFE_INTEGER;
    if (indexA === indexB) {
      return a.size.localeCompare(b.size, 'uk');
    }
    return indexA - indexB;
  });
}

function groupSalesRows(rows) {
  const months = new Map();
  for (const row of rows) {
    const key = `${row.year}-${row.month_label}`;
    if (!months.has(key)) {
      months.set(key, {
        month: row.month_label,
        year: row.year,
        _monthNumber: row.month_number ?? 0,
        colors: {}
      });
    }
    const entry = months.get(key);
    if (!entry.colors[row.color_name]) {
      entry.colors[row.color_name] = [];
    }
    entry.colors[row.color_name].push({ size: row.size_label, quantity: row.quantity });
  }
  const result = [];
  for (const entry of months.values()) {
    const colors = {};
    for (const [colorName, items] of Object.entries(entry.colors)) {
      colors[colorName] = sortSizes(items);
    }
    result.push({
      month: entry.month,
      year: entry.year,
      colors,
      _monthNumber: entry._monthNumber
    });
  }
  result.sort((a, b) => {
    if (a.year === b.year) {
      return (a._monthNumber ?? 0) - (b._monthNumber ?? 0);
    }
    return a.year - b.year;
  });
  for (const entry of result) {
    delete entry._monthNumber;
  }
  return result;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function decodeSku(sku) {
  if (!sku) return null;
  const normalized = String(sku).trim().toUpperCase();
  const compact = normalized.replace(/[^A-Z0-9]/g, '');
  const sizeAlias = [...sizeOrder]
    .sort((a, b) => {
      const lengthA = a.replace(/[^A-Z0-9]/gi, '').length;
      const lengthB = b.replace(/[^A-Z0-9]/gi, '').length;
      return lengthB - lengthA;
    })
    .find(size => {
      const alias = size.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      return compact.endsWith(alias);
    });
  if (!sizeAlias) return null;
  const aliasString = sizeAlias.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const rest = compact.slice(0, compact.length - aliasString.length);
  const match = rest.match(/^([A-Z]+)(\d+)([A-Z]+)$/);
  if (!match) return null;
  const [, prefix, numeric, colorCode] = match;
  const colorName = colorCodeMap.get(colorCode) ?? null;
  const productName = productCodeMap.get(numeric) ?? null;
  return {
    prefix,
    numeric,
    productName,
    colorCode,
    colorName,
    sizeLabel: sizeAlias
  };
}

export function resolveVariant({ offerId = null, sku = null, decoded = null }) {
  let variant = null;
  if (offerId != null) {
    variant = selectVariantByOfferStmt.get(offerId);
  }
  if (!variant && sku) {
    variant = selectVariantBySkuStmt.get(sku);
  }
  let usedDecoded = decoded;
  if (!variant && sku) {
    usedDecoded = usedDecoded ?? decodeSku(sku);
    if (usedDecoded && usedDecoded.colorName && usedDecoded.sizeLabel) {
      const sizeRow = findSizeStmt.get(usedDecoded.sizeLabel);
      if (sizeRow) {
        const products = [];
        if (usedDecoded.productName) {
          const productRow = getProductByNameStmt.get(usedDecoded.productName);
          if (productRow) {
            products.push(productRow);
          }
        }
        if (products.length === 0) {
          products.push(...listProductsStmt.all());
        }
        for (const product of products) {
          const colorRow = findColorStmt.get(product.id, usedDecoded.colorName);
          if (!colorRow) {
            continue;
          }
          const candidate = selectVariantByAttributesStmt.get(product.id, colorRow.id, sizeRow.id);
          if (candidate) {
            variant = candidate;
            break;
          }
        }
      }
    }
  }
  return { variant, decoded: usedDecoded };
}
const monthFormatter = new Intl.DateTimeFormat('uk-UA', { month: 'long' });

function normalizeMonthLabel(date) {
  const raw = monthFormatter.format(date);
  const value = raw?.trim() ?? '';
  if (!value) {
    return '';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function ensurePeriodForTimestamp(isoString) {
  const parsed = isoString ? new Date(isoString) : new Date();
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const year = parsed.getUTCFullYear();
  const monthNumber = parsed.getUTCMonth() + 1;
  const label = normalizeMonthLabel(parsed);
  if (!label) {
    return null;
  }
  const row = upsertPeriodStmt.get(year, monthNumber, label);
  return row?.id ?? null;
}

export function recordSalesDelta(variant, delta, occurredAt) {
  if (!variant || !variant.id || !Number.isFinite(delta) || delta === 0) {
    return;
  }
  let { product_id: productId, color_id: colorId, size_id: sizeId } = variant;
  if (!productId || !colorId || !sizeId) {
    const fallback = selectVariantByIdStmt.get(variant.id);
    if (!fallback) {
      return;
    }
    productId = fallback.product_id;
    colorId = fallback.color_id;
    sizeId = fallback.size_id;
  }
  if (!productId || !colorId || !sizeId) {
    return;
  }
  const periodId = ensurePeriodForTimestamp(occurredAt);
  if (!periodId) {
    return;
  }
  const rounded = Math.round(delta);
  if (rounded === 0) {
    return;
  }
  if (rounded > 0) {
    upsertSalesStmt.get(productId, colorId, sizeId, periodId, rounded);
    return;
  }
  const existing = selectSalesQuantityStmt.get(productId, colorId, sizeId, periodId);
  if (!existing || !Number.isFinite(existing.quantity) || existing.quantity <= 0) {
    return;
  }
  const toSubtract = Math.min(existing.quantity, Math.abs(rounded));
  if (toSubtract <= 0) {
    return;
  }
  upsertSalesStmt.get(productId, colorId, sizeId, periodId, -toSubtract);
}


async function fetchOrderDetails(orderId) {
  const token = process.env.KEYCRM_API_TOKEN;
  if (!token) {
    return null;
  }
  const url = `https://openapi.keycrm.app/v1/order/${orderId}?include=products.offer`;
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    if (!response.ok) {
      throw new Error(`KeyCRM API request failed: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch order ${orderId} details from KeyCRM`, error);
    return null;
  }
}

function extractOrderItems(context = {}, body = {}) {
  const lists = [context.items, context.products, context.positions, context.lines, body.items];
  const result = [];
  for (const list of lists) {
    if (Array.isArray(list)) {
      result.push(...list);
    }
  }
  return result;
}

function normalizeOrderItem(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const sku = raw.sku ?? raw.offer_sku ?? raw.offerSku ?? raw.offer?.sku ?? raw.product?.sku ?? raw.variant?.sku ?? null;
  const offerId = raw.offer_id ?? raw.offerId ?? raw.offer?.id ?? raw.variant_id ?? raw.variant?.id ?? null;
  const quantityValue = raw.quantity ?? raw.qty ?? raw.count ?? raw.amount ?? raw.number;
  const priceValue = raw.price ?? raw.sum ?? raw.total ?? raw.amount_total ?? raw.cost ?? null;
  const quantity = quantityValue == null ? NaN : Number(quantityValue);
  const price = priceValue == null ? null : Number(priceValue);
  return {
    sku: sku ? String(sku).trim() : null,
    offerId: offerId != null && !Number.isNaN(Number(offerId)) ? Number(offerId) : null,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    price: price != null && !Number.isNaN(price) ? price : null,
    raw
  };
}

function getOrCreateVariant({ productId, colorId, sizeId, sku, offerId }) {
  const row = upsertVariantStmt.get(productId, colorId, sizeId, sku ?? null, offerId ?? null);
  return row.id;
}

function attachInventory(product) {
  const rows = fetchInventoryStmt.all(product.id);
  if (rows.length === 0) {
    return;
  }
  product.inventory = {};
  for (const row of rows) {
    if (!product.inventory[row.color_name]) {
      product.inventory[row.color_name] = {};
    }
    product.inventory[row.color_name][row.size_label] = {
      in_stock: row.in_stock,
      in_reserve: row.in_reserve,
      updated_at: row.updated_at
    };
  }
}

function makeProductsResponse(filter) {
  let productRows;
  if (filter?.id) {
    const row = getProductByIdStmt.get(filter.id);
    productRows = row ? [row] : [];
  } else if (filter?.slug) {
    const row = getProductBySlugStmt.get(filter.slug);
    productRows = row ? [row] : [];
  } else {
    productRows = listProductsStmt.all();
  }
  const result = [];
  for (const product of productRows) {
    const salesRows = fetchSalesStmt.all(product.id);
    const months = groupSalesRows(salesRows);
    const variants = listVariantsStmt.all(product.id).map(row => ({
      id: row.id,
      color: row.color_name,
      size: row.size_label,
      sku: row.sku,
      offer_id: row.offer_id
    }));
    const entry = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      months,
      variants
    };
    attachInventory(entry);
    result.push(entry);
  }
  return { products: result };
}

function handleListSales(req, res, url) {
  const productIdParam = url.searchParams.get('productId');
  const slugParam = url.searchParams.get('slug');
  const filter = {};
  if (productIdParam) {
    const id = Number.parseInt(productIdParam, 10);
    if (Number.isNaN(id)) {
      sendJson(res, 400, { error: 'Invalid productId' });
      return;
    }
    filter.id = id;
  }
  if (slugParam) {
    filter.slug = slugParam;
  }
  const payload = makeProductsResponse(filter);
  sendJson(res, 200, payload);
}

function handleListProducts(res) {
  const payload = listProductsStmt.all();
  sendJson(res, 200, { products: payload });
}

function handleListVariants(res, url) {
  const productIdParam = url.searchParams.get('productId');
  if (!productIdParam) {
    sendJson(res, 400, { error: 'Missing productId' });
    return;
  }
  const id = Number.parseInt(productIdParam, 10);
  if (Number.isNaN(id)) {
    sendJson(res, 400, { error: 'Invalid productId' });
    return;
  }
  const product = getProductByIdStmt.get(id);
  if (!product) {
    sendJson(res, 404, { error: 'Product not found' });
    return;
  }
  const variants = listVariantsStmt.all(id).map(row => ({
    id: row.id,
    color: row.color_name,
    size: row.size_label,
    sku: row.sku,
    offer_id: row.offer_id
  }));
  sendJson(res, 200, { product, variants });
}

function handleUpsertVariant(req, res) {
  if (req.method !== 'POST') {
    methodNotAllowed(res);
    return;
  }
  readJsonBody(req)
    .then(body => {
      const { productId, colorName, sizeLabel, sku, offerId } = body ?? {};
      const numericProductId = Number.parseInt(productId, 10);
      const normalizedColorName = typeof colorName === 'string' ? colorName.trim() : '';
      const normalizedSizeLabel = typeof sizeLabel === 'string' ? sizeLabel.trim() : '';
      if (!Number.isInteger(numericProductId) || !normalizedColorName || !normalizedSizeLabel) {
        sendJson(res, 400, { error: 'Valid productId, colorName, sizeLabel are required' });
        return;
      }
      const product = getProductByIdStmt.get(numericProductId);
      if (!product) {
        sendJson(res, 404, { error: 'Product not found' });
        return;
      }
      const colorRow = findColorStmt.get(numericProductId, normalizedColorName);
      if (!colorRow) {
        sendJson(res, 404, { error: 'Color not found for product' });
        return;
      }
      const sizeRow = findSizeStmt.get(normalizedSizeLabel);
      if (!sizeRow) {
        sendJson(res, 404, { error: 'Size not found' });
        return;
      }
      const normalizedSku = typeof sku === 'string' ? sku.trim() : sku == null ? null : String(sku).trim();
      const normalizedOfferId = offerId == null ? null : Number(offerId);
      if (normalizedOfferId != null && Number.isNaN(normalizedOfferId)) {
        sendJson(res, 400, { error: 'offerId must be a number' });
        return;
      }
      const variantId = getOrCreateVariant({
        productId: numericProductId,
        colorId: colorRow.id,
        sizeId: sizeRow.id,
        sku: normalizedSku,
        offerId: normalizedOfferId
      });
      sendJson(res, 200, { variantId });
    })
    .catch(error => {
      sendJson(res, 400, { error: error.message });
    });
}

function handleWebhook(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 200, {});
    return;
  }
  if (req.method !== 'POST') {
    methodNotAllowed(res);
    return;
  }
  readJsonBody(req)
    .then(body => processStockWebhook(req, res, body))
    .catch(error => {
      sendJson(res, 400, { error: error.message });
    });
}

function normalizeStockItems(payload) {
  if (!payload && payload !== 0) {
    return [];
  }
  const items = Array.isArray(payload) ? payload : [payload];
  return items.map((entry, index) => {
    const raw = entry ?? {};
    const rawOfferId = raw?.offer_id ?? raw?.offerId ?? null;
    const coercedOfferId = rawOfferId === '' || rawOfferId == null ? null : Number(rawOfferId);
    const sku = raw?.sku == null ? null : String(raw.sku).trim() || null;
    const inStockValue = Number(raw?.in_stock ?? raw?.inStock ?? 0);
    const inReserveValue = Number(raw?.in_reserve ?? raw?.inReserve ?? 0);
    return {
      index,
      raw,
      offerId: Number.isFinite(coercedOfferId) ? coercedOfferId : null,
      offerIdRaw: rawOfferId,
      sku,
      inStock: inStockValue,
      inReserve: inReserveValue
    };
  });
}

function processStockWebhook(req, res, body) {
  const eventType = String(req.headers['keycrm-webhook'] ?? 'stocks');
  const receivedAt = new Date().toISOString();
  const eventRow = insertWebhookEventStmt.get(eventType, JSON.stringify(body ?? {}), 'received', receivedAt);
  const eventId = eventRow.id;

  try {
    const stockItems = normalizeStockItems(body);
    if (stockItems.length === 0) {
      updateWebhookStatusStmt.run('failed', null, 'Empty stock payload', eventId);
      sendJson(res, 400, { error: 'Empty stock payload', eventId });
      return;
    }

    const invalidItems = stockItems.filter(item => Number.isNaN(item.inStock) || Number.isNaN(item.inReserve));
    if (invalidItems.length > 0) {
      updateWebhookStatusStmt.run('failed', null, 'Invalid stock numbers', eventId);
      sendJson(res, 400, {
        error: 'Invalid stock numbers',
        eventId,
        invalid: invalidItems.map(item => ({ index: item.index, payload: item.raw }))
      });
      return;
    }

    const resolvedItems = [];
    const unresolvedItems = [];
    for (const item of stockItems) {
      const { variant } = resolveVariant({ offerId: item.offerId, sku: item.sku });
      if (variant) {
        resolvedItems.push({ ...item, variant });
      } else {
        unresolvedItems.push({ ...item });
      }
    }

    if (resolvedItems.length === 0) {
      updateWebhookStatusStmt.run('pending', null, 'Variant not resolved', eventId);
      sendJson(res, 202, {
        status: 'accepted',
        message: 'Variant not resolved yet',
        eventId,
        unresolved: unresolvedItems.map(item => ({ index: item.index, payload: item.raw }))
      });
      return;
    }

    const hasUnresolved = unresolvedItems.length > 0;
    const timestamp = new Date().toISOString();
    try {
      db.exec('BEGIN IMMEDIATE');
      for (const item of resolvedItems) {
        const stockValue = Math.round(item.inStock);
        const reserveValue = Math.round(item.inReserve);
        const previousLevel = selectInventoryLevelStmt.get(item.variant.id);
        let stockDelta = 0;
        if (previousLevel && previousLevel.in_stock != null) {
          const previousStock = Number(previousLevel.in_stock);
          if (Number.isFinite(previousStock)) {
            const diff = previousStock - stockValue;
            if (Number.isFinite(diff) && diff !== 0) {
              stockDelta = Math.round(diff);
            }
          }
        }
        if (item.sku || item.offerId != null) {
          updateVariantIdentifiersStmt.run(item.sku ?? null, item.offerId ?? null, item.variant.id);
        }
        insertInventoryLevelStmt.run(item.variant.id, stockValue, reserveValue, timestamp);
        insertInventoryHistoryStmt.run(item.variant.id, stockValue, reserveValue, timestamp);
        if (stockDelta > 0) {
          recordSalesDelta(item.variant, stockDelta, timestamp);
        }
      }
      const statusLabel = hasUnresolved ? 'processed_with_warnings' : 'processed';
      updateWebhookStatusStmt.run(statusLabel, timestamp, null, eventId);
      db.exec('COMMIT');
      const payload = {
        status: statusLabel,
        eventId,
        variants: resolvedItems.map(item => ({ index: item.index, variantId: item.variant.id }))
      };
      if (hasUnresolved) {
        payload.message = 'Processed with unresolved variants';
        payload.unresolved = unresolvedItems.map(item => ({ index: item.index, payload: item.raw }));
        console.warn('Stock webhook processed with unresolved variants', { eventId, unresolved: payload.unresolved.length });
      }
      sendJson(res, 200, payload);
      return;
    } catch (error) {
      db.exec('ROLLBACK');
      updateWebhookStatusStmt.run('failed', null, error?.message ?? 'Failed to persist webhook', eventId);
      sendJson(res, 500, { error: 'Failed to persist webhook' });
      return;
    }
  } catch (error) {
    updateWebhookStatusStmt.run('failed', null, error?.message ?? 'Unexpected error', eventId);
    console.error('Failed to process stock webhook', error);
    sendJson(res, 500, { error: 'Failed to process stock webhook' });
  }
}


async function handleOrderWebhook(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 200, {});
    return;
  }
  if (req.method !== 'POST') {
    methodNotAllowed(res);
    return;
  }
  try {
    const body = await readJsonBody(req);
    await processOrderWebhook(req, res, body);
  } catch (error) {
    console.error('Failed to handle order webhook', error);
    sendJson(res, 400, { error: error?.message ?? 'Invalid webhook payload' });
  }
}

async function processOrderWebhook(req, res, body) {
  const eventType = String(body?.event ?? 'order.status');
  const receivedAt = new Date().toISOString();
  const eventRow = insertWebhookEventStmt.get(eventType, JSON.stringify(body ?? {}), 'received', receivedAt);
  const webhookEventId = eventRow.id;

  const context = body?.context ?? {};
  const rawOrderId = context.id ?? body?.order_id ?? body?.id;
  const orderId = rawOrderId != null ? Number(rawOrderId) : NaN;
  if (!Number.isInteger(orderId)) {
    updateWebhookStatusStmt.run('failed', null, 'Invalid order id', webhookEventId);
    sendJson(res, 400, { error: 'Invalid order id' });
    return;
  }

  const statusId = context.status_id != null ? Number(context.status_id) : null;
  const statusGroupId = context.status_group_id != null ? Number(context.status_group_id) : null;
  const statusLabel = context.status_name ?? context.status ?? null;
  const occurredAt = context.status_changed_at ?? context.updated_at ?? new Date().toISOString();
  const createdAt = new Date().toISOString();
  const isNegative = statusId != null && ORDER_NEGATIVE_STATUS_IDS.has(statusId);

  const rawItems = extractOrderItems(context, body);
  let normalizedItems = rawItems
    .map(normalizeOrderItem)
    .filter(item => item && item.quantity !== 0 && (item.sku || item.offerId != null));

  if (normalizedItems.length === 0 && isNegative) {
    const apiDetails = await fetchOrderDetails(orderId);
    if (apiDetails?.products) {
      normalizedItems = apiDetails.products
        .map(normalizeOrderItem)
        .filter(item => item && item.quantity !== 0 && (item.sku || item.offerId != null));
    }
  }

  try {
    db.exec('BEGIN IMMEDIATE');
    upsertOrderStmt.get(
      orderId,
      context.source_uuid ?? null,
      context.global_source_uuid ?? null,
      statusId ?? null,
      statusGroupId ?? null,
      occurredAt ?? null,
      JSON.stringify(context ?? {}),
      createdAt
    );
    const orderEventRow = insertOrderEventStmt.get(
      orderId,
      statusId ?? null,
      statusGroupId ?? null,
      statusLabel ?? null,
      eventType,
      occurredAt,
      JSON.stringify(body ?? {}),
      isNegative ? 1 : 0,
      createdAt
    );
    const orderEventId = orderEventRow.id;

    let recorded = 0;
    for (const item of normalizedItems) {
      recorded += 1;
      const { variant } = resolveVariant({ offerId: item.offerId, sku: item.sku });
      const variantId = variant?.id ?? null;
      if (variantId && (item.sku || item.offerId != null)) {
        updateVariantIdentifiersStmt.run(item.sku ?? null, item.offerId ?? null, variantId);
      }
      insertOrderEventItemStmt.run(
        orderEventId,
        variantId,
        item.sku ?? null,
        item.quantity,
        item.price ?? null,
        JSON.stringify(item.raw ?? {})
      );

      const resolvedForDelta = variant ?? (variantId ? { id: variantId } : null);
      const rawQuantity = Number(item.quantity);
      if (resolvedForDelta && Number.isFinite(rawQuantity) && rawQuantity !== 0) {
        const magnitude = Math.abs(rawQuantity);
        const signedDelta = isNegative ? -magnitude : magnitude;
        if (signedDelta !== 0) {
          recordSalesDelta(resolvedForDelta, signedDelta, occurredAt);
        }
      }
    }

    updateWebhookStatusStmt.run('processed', createdAt, null, webhookEventId);
    db.exec('COMMIT');
    sendJson(res, 200, {
      status: 'processed',
      orderId,
      statusId,
      itemsRecorded: recorded
    });
  } catch (error) {
    db.exec('ROLLBACK');
    updateWebhookStatusStmt.run('failed', null, error.message, webhookEventId);
    sendJson(res, 500, { error: 'Failed to process order webhook' });
  }
}

export const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, keycrm-webhook',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? '', 'http://localhost');

  if (tryServeStatic(req, res, url)) {
    return;
  }

  if (url.pathname === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (url.pathname === '/api/products') {
    if (req.method !== 'GET') {
      methodNotAllowed(res);
      return;
    }
    handleListProducts(res);
    return;
  }

  if (url.pathname === '/api/sales') {
    if (req.method !== 'GET') {
      methodNotAllowed(res);
      return;
    }
    handleListSales(req, res, url);
    return;
  }

  if (url.pathname === '/api/variants') {
    if (req.method === 'GET') {
      handleListVariants(res, url);
      return;
    }
    if (req.method === 'POST') {
      handleUpsertVariant(req, res);
      return;
    }
    methodNotAllowed(res);
    return;
  }

  if (url.pathname === '/webhooks/keycrm') {
    handleWebhook(req, res);
    return;
  }

  if (url.pathname === '/webhooks/keycrm/orders') {
    handleOrderWebhook(req, res);
    return;
  }

  notFound(res);
});

if (import.meta.main) {
  server.listen(PORT, () => {
    console.log(`API server listening on http://localhost:${PORT}`);
  });
}


