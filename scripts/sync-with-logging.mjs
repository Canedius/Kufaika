import fs from "node:fs/promises";
import { execSync } from "node:child_process";
import { addChangeLog, logOperation, logOperationComplete } from "./logging-utils.mjs";

console.log('⚡ Оновлення D1 з логуванням змін...');

// Логуємо початок операції
logOperation('KEYCRM_STOCK_SYNC', {
  source: 'keycrm',
  description: 'Синхронізація залишків з KeyCRM'
});

const stocksData = JSON.parse(await fs.readFile('data/latest-stocks.json', 'utf8'));
const foundStocks = stocksData.filter(stock => stock.found);

console.log(`📦 Оновлюємо ${foundStocks.length} записів з логуванням`);

// Спочатку отримаємо поточні значення для логування
function getCurrentStocks() {
  try {
    const sql = `
      SELECT 
        pv.sku,
        COALESCE(il.in_stock, 0) as current_in_stock,
        COALESCE(il.in_reserve, 0) as current_in_reserve
      FROM product_variants pv
      LEFT JOIN inventory_levels il ON il.variant_id = pv.id
      WHERE pv.sku LIKE 'KUF%'
    `;
    
    const result = execSync(`wrangler d1 execute hoodie-sales --remote --command "${sql}" --json`, { encoding: 'utf8' });
    const json = JSON.parse(result);
    const rows = json[0]?.results || [];
    
    return new Map(rows.map(row => [
      row.sku, 
      { 
        in_stock: row.current_in_stock, 
        in_reserve: row.current_in_reserve 
      }
    ]));
  } catch (error) {
    console.error('❌ Помилка отримання поточних залишків:', error.message);
    return new Map();
  }
}

console.log('🔍 Отримуємо поточні залишки для порівняння...');
const currentStocks = getCurrentStocks();

const BATCH_SIZE = 10;
let totalUpdated = 0;
let totalErrors = 0;
let changesLogged = 0;

for (let i = 0; i < foundStocks.length; i += BATCH_SIZE) {
  const batch = foundStocks.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(foundStocks.length / BATCH_SIZE);
  
  console.log(`🔄 Батч ${batchNum}/${totalBatches}`);
  
  // Логуємо зміни для кожного товару в батчі
  batch.forEach(stock => {
    const current = currentStocks.get(stock.sku);
    if (current) {
      const stockChanged = current.in_stock !== stock.in_stock;
      const reserveChanged = current.in_reserve !== stock.in_reserve;
      
      if (stockChanged || reserveChanged) {
        // Додаємо детальний лог зміни
        addChangeLog({
          operation_type: 'UPDATE',
          table_name: 'inventory_levels',
          sku: stock.sku,
          field_name: stockChanged ? 'in_stock' : 'in_reserve',
          old_value: stockChanged ? String(current.in_stock) : String(current.in_reserve),
          new_value: stockChanged ? String(stock.in_stock) : String(stock.in_reserve),
          source: 'keycrm_sync',
          additional_data: {
            old_in_stock: current.in_stock,
            new_in_stock: stock.in_stock,
            old_in_reserve: current.in_reserve,
            new_in_reserve: stock.in_reserve,
            keycrm_quantity: stock.in_stock,
            keycrm_reserve: stock.in_reserve
          }
        });
        
        changesLogged++;
        console.log(`  📝 ${stock.sku}: ${current.in_stock}→${stock.in_stock}, ${current.in_reserve}→${stock.in_reserve}`);
      }
    }
  });
  
  // Виконуємо оновлення батчу
  const batchSQL = batch.map(stock => 
    `UPDATE inventory_levels SET in_stock = ${stock.in_stock}, in_reserve = ${stock.in_reserve}, updated_at = '${new Date().toISOString()}' WHERE variant_id = (SELECT id FROM product_variants WHERE sku = '${stock.sku}');`
  ).join(' ');
  
  try {
    execSync(`wrangler d1 execute hoodie-sales --remote --command "${batchSQL}"`, { encoding: 'utf8' });
    totalUpdated += batch.length;
  } catch (error) {
    console.error(`  ❌ Помилка батчу ${batchNum}:`, error.message);
    totalErrors += batch.length;
  }
  
  // Пауза між батчами
  await new Promise(resolve => setTimeout(resolve, 500));
}

// Логуємо завершення операції
logOperationComplete('KEYCRM_STOCK_SYNC', {
  total_processed: foundStocks.length,
  total_updated: totalUpdated,
  total_errors: totalErrors,
  changes_logged: changesLogged,
  source: 'keycrm'
});

console.log(`\n🎉 Синхронізація завершена з логуванням!`);
console.log(`✅ Оновлено: ${totalUpdated} записів`);
console.log(`❌ Помилок: ${totalErrors} записів`);
console.log(`📝 Змін залогировано: ${changesLogged}`);
console.log(`📊 Всього: ${foundStocks.length} записів`);

console.log(`\n📋 Для перегляду логів використовуйте:`);
console.log(`   node scripts/view-logs.mjs`);
console.log(`   node scripts/view-logs.mjs product KUF001BKL`);
console.log(`   node scripts/view-logs.mjs stats 1`);