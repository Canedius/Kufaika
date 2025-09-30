import { db } from "./db.js";
import { resolveVariant } from "./server.js";

const selectPendingEventsStmt = db.prepare(`
  SELECT id, payload
  FROM webhook_events
  WHERE event_type = 'stocks' AND status = 'pending'
  ORDER BY received_at
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
const updateWebhookStatusStmt = db.prepare(`
  UPDATE webhook_events SET status = ?, processed_at = ?, error = ? WHERE id = ?
`);

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

function processEvent(eventId, payload) {
  const stockItems = normalizeStockItems(payload);
  if (stockItems.length === 0) {
    updateWebhookStatusStmt.run('failed', null, 'Empty stock payload', eventId);
    return { status: 'failed', reason: 'empty payload' };
  }
  const invalidItems = stockItems.filter(item => Number.isNaN(item.inStock) || Number.isNaN(item.inReserve));
  if (invalidItems.length > 0) {
    updateWebhookStatusStmt.run('failed', null, 'Invalid stock numbers', eventId);
    return {
      status: 'failed',
      reason: 'invalid numbers',
      details: invalidItems.map(item => ({ index: item.index, payload: item.raw }))
    };
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
    return {
      status: 'skipped',
      reason: 'variant not resolved',
      unresolved: unresolvedItems.map(item => ({ index: item.index, payload: item.raw }))
    };
  }
  if (unresolvedItems.length > 0) {
    updateWebhookStatusStmt.run('pending', null, 'One or more variants not resolved', eventId);
    return {
      status: 'partial',
      reason: 'unresolved variants',
      unresolved: unresolvedItems.map(item => ({ index: item.index, payload: item.raw }))
    };
  }

  const timestamp = new Date().toISOString();
  try {
    db.exec('BEGIN IMMEDIATE');
    for (const item of resolvedItems) {
      const stockValue = Math.round(item.inStock);
      const reserveValue = Math.round(item.inReserve);
      if (item.sku || item.offerId != null) {
        updateVariantIdentifiersStmt.run(item.sku ?? null, item.offerId ?? null, item.variant.id);
      }
      insertInventoryLevelStmt.run(item.variant.id, stockValue, reserveValue, timestamp);
      insertInventoryHistoryStmt.run(item.variant.id, stockValue, reserveValue, timestamp);
    }
    updateWebhookStatusStmt.run('processed', timestamp, null, eventId);
    db.exec('COMMIT');
    return {
      status: 'processed',
      variants: resolvedItems.map(item => ({ index: item.index, variantId: item.variant.id }))
    };
  } catch (error) {
    db.exec('ROLLBACK');
    updateWebhookStatusStmt.run('failed', null, error.message, eventId);
    return { status: 'failed', reason: error.message };
  }
}

function main() {
  const events = selectPendingEventsStmt.all();
  if (events.length === 0) {
    console.log('No pending stock webhook events found.');
    return;
  }
  for (const event of events) {
    let payload;
    try {
      payload = JSON.parse(event.payload ?? 'null');
    } catch (error) {
      updateWebhookStatusStmt.run('failed', null, 'Invalid JSON payload', event.id);
      console.error(`Event ${event.id}: failed to parse payload`, error);
      continue;
    }
    const result = processEvent(event.id, payload);
    console.log(`Event ${event.id}:`, result);
  }
}

main();
