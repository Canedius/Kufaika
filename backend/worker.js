const sizeOrder = ["XS", "XS/S", "S", "M", "M/L", "L", "XL", "XL/XXL", "2XL", "XXL", "3XL"];

const productCodeMap = new Map([
  ["001", "\u0425\u0443\u0434\u0456 \u0423\u0442\u0435\u043f\u043b\u0435\u043d\u0438\u0439 Kufaika Unisex"],
  ["002", "\u0425\u0443\u0434\u0456 \u041b\u0435\u0433\u043a\u0438\u0439 Kufaika Unisex"],
  ["004", "\u0421\u0432\u0456\u0442\u0448\u043e\u0442 \u0423\u0442\u0435\u043f\u043b\u0435\u043d\u0438\u0439 Kufaika Unisex"],
  ["005", "\u0421\u0432\u0456\u0442\u0448\u043e\u0442 \u041b\u0435\u0433\u043a\u0438\u0439 Kufaika Unisex"],
  ["006", "\u0424\u0443\u0442\u0431\u043e\u043b\u043a\u0430 Premium Kufaika"],
  ["007", "\u0424\u0443\u0442\u0431\u043e\u043b\u043a\u0430 OVERSIZE Kufaika"],
  ["008", "\u0424\u0443\u0442\u0431\u043e\u043b\u043a\u0430 Relaxed Kufaika"],
  ["009", "\u0424\u0443\u0442\u0431\u043e\u043b\u043a\u0430 Lightness Kufaika"]
]);

const colorCodeMap = new Map([
  ["BK", "\u0427\u043e\u0440\u043d\u0438\u0439"],
  ["WH", "\u0411\u0456\u043b\u0438\u0439"],
  ["OG", "\u041e\u043b\u0438\u0432\u0430"],
  ["GY", "\u0421\u0456\u0440\u0438\u0439"],
  ["GR", "\u0421\u0456\u0440\u0438\u0439 \u0413\u0440\u0456"],
  ["BE", "\u0411\u0435\u0436\u0435\u0432\u0438\u0439"],
  ["PK", "\u041d\u0456\u0436\u043d\u043e-\u0440\u043e\u0436\u0435\u0432\u0438\u0439"],
  ["HA", "\u0425\u0430\u043a\u0456"],
  ["CY", "\u041a\u043e\u0439\u043e\u0442"],
  ["OT", "\u0406\u043d\u0448\u0438\u0439 \u041a\u043e\u043b\u0456\u0440"]
]);

const ORDER_NEGATIVE_STATUS_IDS = new Set([13, 14, 15, 16, 17, 18, 19, 29, 30, 34, 35, 36, 37, 54, 52]);

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, keycrm-webhook',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      ...headers
    }
  });
}

function decodeSku(sku) {
  if (!sku) return null;
  const normalized = String(sku).trim().toUpperCase();
  const compact = normalized.replace(/[^A-Z0-9]/g, '');
  const sizeAlias = [...sizeOrder]
    .sort((a, b) => {
      const lenA = a.replace(/[^A-Z0-9]/gi, '').length;
      const lenB = b.replace(/[^A-Z0-9]/gi, '').length;
      return lenB - lenA;
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

async function runQuery(stmt) {
  return stmt.run ? stmt.run() : stmt.all();
}

async function fetchOrderDetails(orderId, env) {
  if (!env.KEYCRM_API_TOKEN) {
    return null;
  }
  const url = `https://openapi.keycrm.app/v1/order/${orderId}?include=products.offer`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${env.KEYCRM_API_TOKEN}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) {
    throw new Error(`KeyCRM API request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function resolveVariantFactory(env) {
  return async ({ offerId = null, sku = null, decoded = null }) => {
    if (!offerId && !sku) {
      return { variant: null, decoded };
    }
    let variant = null;
    if (offerId != null) {
      const stmt = env.DB.prepare('SELECT id, product_id, color_id, size_id, sku, offer_id FROM product_variants WHERE offer_id = ?');
      variant = await stmt.bind(offerId).first();
    }
    if (!variant && sku) {
      const stmt = env.DB.prepare('SELECT id, product_id, color_id, size_id, sku, offer_id FROM product_variants WHERE sku = ?');
      variant = await stmt.bind(sku).first();
    }
    let usedDecoded = decoded;
    if (!variant && sku) {
      usedDecoded = usedDecoded ?? decodeSku(sku);
      if (usedDecoded && usedDecoded.colorName && usedDecoded.sizeLabel) {
        const sizeRow = await env.DB.prepare('SELECT id FROM sizes WHERE label = ?').bind(usedDecoded.sizeLabel).first();
        if (sizeRow) {
          const candidates = [];
          if (usedDecoded.productName) {
            const productRow = await env.DB.prepare('SELECT id FROM products WHERE name = ?').bind(usedDecoded.productName).first();
            if (productRow) {
              candidates.push(productRow);
            }
          }
          if (candidates.length === 0) {
            const stmt = env.DB.prepare('SELECT id FROM products ORDER BY name');
            const all = await stmt.all();
            candidates.push(...all.results);
          }
          for (const product of candidates) {
            const colorRow = await env.DB.prepare('SELECT id FROM colors WHERE product_id = ? AND name = ?').bind(product.id, usedDecoded.colorName).first();
            if (!colorRow) {
              continue;
            }
            const upsert = env.DB.prepare(`
              INSERT INTO product_variants (product_id, color_id, size_id, sku, offer_id)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(product_id, color_id, size_id)
              DO UPDATE SET
                sku = COALESCE(product_variants.sku, excluded.sku),
                offer_id = COALESCE(product_variants.offer_id, excluded.offer_id)
              RETURNING id, product_id, color_id, size_id, sku, offer_id
            `);
            const candidate = await upsert.bind(product.id, colorRow.id, sizeRow.id, sku ?? null, offerId ?? null).first();
            if (candidate) {
              variant = candidate;
              break;
            }
          }
        }
      }
    }
    return { variant, decoded: usedDecoded };
  };
}

async function updateVariantIdentifiers(env, variantId, sku, offerId) {
  if (!variantId) return;
  await env.DB.prepare('UPDATE product_variants SET sku = COALESCE(?, sku), offer_id = COALESCE(?, offer_id) WHERE id = ?')
    .bind(sku ?? null, offerId ?? null, variantId)
    .run();
}

async function upsertOrder(env, orderId, context, timestamp) {
  const stmt = env.DB.prepare(`
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
  const row = await stmt
    .bind(
      orderId,
      context?.source_uuid ?? null,
      context?.global_source_uuid ?? null,
      context?.status_id ?? null,
      context?.status_group_id ?? null,
      context?.status_changed_at ?? null,
      JSON.stringify(context ?? {}),
      timestamp
    )
    .first();
  return row?.id ?? orderId;
}

async function insertWebhookEvent(env, type, payload, status, receivedAt) {
  const stmt = env.DB.prepare(`
    INSERT INTO webhook_events (event_type, payload, status, received_at)
    VALUES (?, ?, ?, ?)
    RETURNING id
  `);
  const row = await stmt.bind(type, JSON.stringify(payload ?? {}), status, receivedAt).first();
  return row?.id ?? null;
}

async function updateWebhookStatus(env, id, status, processedAt = null, error = null) {
  if (!id) return;
  await env.DB.prepare('UPDATE webhook_events SET status = ?, processed_at = ?, error = ? WHERE id = ?')
    .bind(status, processedAt, error, id)
    .run();
}

async function fetchProducts(env, filter = {}) {
  let rows;
  if (filter.id) {
    const stmt = env.DB.prepare('SELECT id, name, slug FROM products WHERE id = ?');
    const row = await stmt.bind(filter.id).first();
    rows = row ? [row] : [];
  } else if (filter.slug) {
    const stmt = env.DB.prepare('SELECT id, name, slug FROM products WHERE slug = ?');
    const row = await stmt.bind(filter.slug).first();
    rows = row ? [row] : [];
  } else {
    const stmt = env.DB.prepare('SELECT id, name, slug FROM products ORDER BY name');
    const result = await stmt.all();
    rows = result.results ?? [];
  }
  return rows;
}

async function fetchSales(env, productId) {
  const stmt = env.DB.prepare(`
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
  const result = await stmt.bind(productId).all();
  return result.results ?? [];
}

async function fetchVariants(env, productId) {
  const stmt = env.DB.prepare(`
    SELECT pv.id, pv.product_id, pv.color_id, pv.size_id, pv.sku, pv.offer_id,
           c.name as color_name, s.label as size_label
    FROM product_variants pv
    JOIN colors c ON c.id = pv.color_id
    JOIN sizes s ON s.id = pv.size_id
    WHERE pv.product_id = ?
    ORDER BY c.name, s.label
  `);
  const result = await stmt.bind(productId).all();
  return (result.results ?? []).map(row => ({
    id: row.id,
    color: row.color_name,
    size: row.size_label,
    sku: row.sku,
    offer_id: row.offer_id
  }));
}

async function attachInventory(env, product) {
  const stmt = env.DB.prepare(`
    SELECT pv.product_id, c.name as color_name, s.label as size_label, il.in_stock, il.in_reserve, il.updated_at
    FROM inventory_levels il
    JOIN product_variants pv ON pv.id = il.variant_id
    JOIN colors c ON c.id = pv.color_id
    JOIN sizes s ON s.id = pv.size_id
    WHERE pv.product_id = ?
  `);
  const result = await stmt.bind(product.id).all();
  const rows = result.results ?? [];
  if (rows.length === 0) return;
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

async function handleListProducts(env) {
  const rows = await fetchProducts(env);
  return jsonResponse({ products: rows });
}

async function handleListSales(env, url) {
  const productIdParam = url.searchParams.get('productId');
  const slugParam = url.searchParams.get('slug');
  const filter = {};
  if (productIdParam) {
    const id = Number.parseInt(productIdParam, 10);
    if (Number.isNaN(id)) {
      return jsonResponse({ error: 'Invalid productId' }, 400);
    }
    filter.id = id;
  }
  if (slugParam) {
    filter.slug = slugParam;
  }
  const products = await fetchProducts(env, filter);
  const result = [];
  for (const product of products) {
    const salesRows = await fetchSales(env, product.id);
    const months = groupSalesRows(salesRows);
    const variants = await fetchVariants(env, product.id);
    const entry = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      months,
      variants
    };
    await attachInventory(env, entry);
    result.push(entry);
  }
  return jsonResponse({ products: result });
}

async function handleListVariants(env, url) {
  const productIdParam = url.searchParams.get('productId');
  if (!productIdParam) {
    return jsonResponse({ error: 'Missing productId' }, 400);
  }
  const id = Number.parseInt(productIdParam, 10);
  if (Number.isNaN(id)) {
    return jsonResponse({ error: 'Invalid productId' }, 400);
  }
  const product = await env.DB.prepare('SELECT id, name, slug FROM products WHERE id = ?').bind(id).first();
  if (!product) {
    return jsonResponse({ error: 'Product not found' }, 404);
  }
  const variants = await fetchVariants(env, id);
  return jsonResponse({ product, variants });
}

async function handleUpsertVariant(env, request) {
  const body = await request.json().catch(() => null);
  const { productId, colorName, sizeLabel, sku, offerId } = body ?? {};
  const numericProductId = Number.parseInt(productId, 10);
  const normalizedColorName = typeof colorName === 'string' ? colorName.trim() : '';
  const normalizedSizeLabel = typeof sizeLabel === 'string' ? sizeLabel.trim() : '';
  if (!Number.isInteger(numericProductId) || !normalizedColorName || !normalizedSizeLabel) {
    return jsonResponse({ error: 'Valid productId, colorName, sizeLabel are required' }, 400);
  }
  const product = await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(numericProductId).first();
  if (!product) {
    return jsonResponse({ error: 'Product not found' }, 404);
  }
  const colorRow = await env.DB.prepare('SELECT id FROM colors WHERE product_id = ? AND name = ?')
    .bind(numericProductId, normalizedColorName)
    .first();
  if (!colorRow) {
    return jsonResponse({ error: 'Color not found for product' }, 404);
  }
  const sizeRow = await env.DB.prepare('SELECT id FROM sizes WHERE label = ?').bind(normalizedSizeLabel).first();
  if (!sizeRow) {
    return jsonResponse({ error: 'Size not found' }, 404);
  }
  const normalizedSku = typeof sku === 'string' ? sku.trim() : sku == null ? null : String(sku).trim();
  const normalizedOfferId = offerId == null ? null : Number(offerId);
  if (normalizedOfferId != null && Number.isNaN(normalizedOfferId)) {
    return jsonResponse({ error: 'offerId must be a number' }, 400);
  }
  const stmt = env.DB.prepare(`
    INSERT INTO product_variants (product_id, color_id, size_id, sku, offer_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(product_id, color_id, size_id)
    DO UPDATE SET
      sku = COALESCE(product_variants.sku, excluded.sku),
      offer_id = COALESCE(product_variants.offer_id, excluded.offer_id)
    RETURNING id
  `);
  const row = await stmt.bind(numericProductId, colorRow.id, sizeRow.id, normalizedSku ?? null, normalizedOfferId ?? null).first();
  return jsonResponse({ variantId: row?.id ?? null });
}

async function processStockWebhook(env, request, body) {
  const eventType = String(request.headers.get('keycrm-webhook') ?? 'stocks');
  const receivedAt = new Date().toISOString();
  const eventId = await insertWebhookEvent(env, eventType, body, 'received', receivedAt);

  const offerId = body?.offer_id ?? null;
  const sku = body?.sku ?? null;
  const inStock = Number(body?.in_stock ?? 0);
  const inReserve = Number(body?.in_reserve ?? 0);

  if (Number.isNaN(inStock) || Number.isNaN(inReserve)) {
    await updateWebhookStatus(env, eventId, 'failed', null, 'Invalid stock numbers');
    return jsonResponse({ error: 'Invalid stock numbers' }, 400);
  }

  const resolveVariant = resolveVariantFactory(env);
  const { variant } = await resolveVariant({ offerId, sku });

  if (!variant) {
    await updateWebhookStatus(env, eventId, 'pending', null, 'Variant not resolved');
    return jsonResponse({ status: 'accepted', message: 'Variant not resolved yet', eventId }, 202);
  }

  if (sku || offerId != null) {
    await updateVariantIdentifiers(env, variant.id, sku ?? null, offerId ?? null);
  }

  const timestamp = new Date().toISOString();
  try {
    await env.DB.prepare('BEGIN TRANSACTION').run();
    await env.DB.prepare(`
      INSERT INTO inventory_levels (variant_id, in_stock, in_reserve, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(variant_id) DO UPDATE SET
        in_stock = excluded.in_stock,
        in_reserve = excluded.in_reserve,
        updated_at = excluded.updated_at
    `).bind(variant.id, inStock, inReserve, timestamp).run();
    await env.DB.prepare(`
      INSERT INTO inventory_history (variant_id, in_stock, in_reserve, recorded_at)
      VALUES (?, ?, ?, ?)
    `).bind(variant.id, inStock, inReserve, timestamp).run();
    await updateWebhookStatus(env, eventId, 'processed', timestamp, null);
    await env.DB.prepare('COMMIT').run();
    return jsonResponse({ status: 'processed', variantId: variant.id });
  } catch (error) {
    await env.DB.prepare('ROLLBACK').run();
    await updateWebhookStatus(env, eventId, 'failed', null, error.message);
    return jsonResponse({ error: 'Failed to persist webhook' }, 500);
  }
}

async function processOrderWebhook(env, request, body) {
  const receivedAt = new Date().toISOString();
  const eventType = String(body?.event ?? 'order.status');
  const eventId = await insertWebhookEvent(env, eventType, body, 'received', receivedAt);

  const context = body?.context ?? {};
  const rawOrderId = context.id ?? body?.order_id ?? body?.id;
  const orderId = rawOrderId != null ? Number(rawOrderId) : NaN;
  if (!Number.isInteger(orderId)) {
    await updateWebhookStatus(env, eventId, 'failed', null, 'Invalid order id');
    return jsonResponse({ error: 'Invalid order id' }, 400);
  }

  const statusId = context.status_id != null ? Number(context.status_id) : null;
  const statusGroupId = context.status_group_id != null ? Number(context.status_group_id) : null;
  const statusLabel = context.status_name ?? context.status ?? null;
  const occurredAt = context.status_changed_at ?? context.updated_at ?? new Date().toISOString();
  const createdAt = new Date().toISOString();
  const isNegative = statusId != null && ORDER_NEGATIVE_STATUS_IDS.has(statusId);

  let items = extractOrderItems(context, body).map(normalizeOrderItem).filter(item => item && item.quantity !== 0 && (item.sku || item.offerId != null));

  if (items.length === 0) {
    const apiDetails = await fetchOrderDetails(orderId, env).catch(() => null);
    if (apiDetails?.products) {
      items = apiDetails.products.map(normalizeOrderItem).filter(item => item && item.quantity !== 0 && (item.sku || item.offerId != null));
    }
  }

  const resolveVariant = resolveVariantFactory(env);

  try {
    await env.DB.prepare('BEGIN TRANSACTION').run();
    await upsertOrder(env, orderId, context, createdAt);
    const orderEventRow = await env.DB.prepare(`
      INSERT INTO order_events (order_id, status_id, status_group_id, status_label, event_type, occurred_at, payload, is_negative, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).bind(
      orderId,
      statusId ?? null,
      statusGroupId ?? null,
      statusLabel ?? null,
      eventType,
      occurredAt,
      JSON.stringify(body ?? {}),
      isNegative ? 1 : 0,
      createdAt
    ).first();
    const orderEventId = orderEventRow?.id;

    let recorded = 0;
    for (const item of items) {
      const { variant } = await resolveVariant({ sku: item.sku, offerId: item.offerId });
      const variantId = variant?.id ?? null;
      if (variantId) {
        await updateVariantIdentifiers(env, variantId, item.sku ?? null, item.offerId ?? null);
      }
      await env.DB.prepare(`
        INSERT INTO order_event_items (event_id, variant_id, sku, quantity, price, payload)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        orderEventId,
        variantId,
        item.sku ?? null,
        item.quantity,
        item.price ?? null,
        JSON.stringify(item.raw ?? {})
      ).run();
      recorded += 1;
    }

    await updateWebhookStatus(env, eventId, 'processed', createdAt, null);
    await env.DB.prepare('COMMIT').run();
    return jsonResponse({ status: 'processed', orderId, statusId, itemsRecorded: recorded });
  } catch (error) {
    await env.DB.prepare('ROLLBACK').run();
    await updateWebhookStatus(env, eventId, 'failed', null, error.message);
    return jsonResponse({ error: 'Failed to process order webhook' }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, keycrm-webhook',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
        }
      });
    }

    if (url.pathname === '/health') {
      return jsonResponse({ status: 'ok' });
    }

    if (url.pathname === '/api/products') {
      if (request.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
      }
      return handleListProducts(env);
    }

    if (url.pathname === '/api/sales') {
      if (request.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
      }
      return handleListSales(env, url);
    }

    if (url.pathname === '/api/variants') {
      if (request.method === 'GET') {
        return handleListVariants(env, url);
      }
      if (request.method === 'POST') {
        return handleUpsertVariant(env, request);
      }
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    if (url.pathname === '/webhooks/keycrm') {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
      }
      const body = await request.json().catch(() => null);
      return processStockWebhook(env, request, body ?? {});
    }

    if (url.pathname === '/webhooks/keycrm/orders') {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
      }
      const body = await request.json().catch(() => null);
      return processOrderWebhook(env, request, body ?? {});
    }
    return jsonResponse({ error: 'Not found' }, 404);
  }
};


