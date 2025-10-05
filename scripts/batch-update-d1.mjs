import fs from "node:fs/promises";
import { execSync } from "node:child_process";

console.log('⚡ Швидке оновлення D1 по батчах...');

const stocksData = JSON.parse(await fs.readFile('data/latest-stocks.json', 'utf8'));
const foundStocks = stocksData.filter(stock => stock.found);

console.log(`📦 Оновлюємо ${foundStocks.length} записів батчами по 10`);

const BATCH_SIZE = 10;
let totalUpdated = 0;
let totalErrors = 0;

for (let i = 0; i < foundStocks.length; i += BATCH_SIZE) {
  const batch = foundStocks.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(foundStocks.length / BATCH_SIZE);
  
  console.log(`🔄 Батч ${batchNum}/${totalBatches}: ${batch.map(s => s.sku).join(', ')}`);
  
  // Створюємо SQL для батчу
  const batchSQL = batch.map(stock => 
    `UPDATE inventory_levels SET in_stock = ${stock.in_stock}, in_reserve = ${stock.in_reserve}, updated_at = '${new Date().toISOString()}' WHERE variant_id = (SELECT id FROM product_variants WHERE sku = '${stock.sku}');`
  ).join(' ');
  
  try {
    execSync(`wrangler d1 execute hoodie-sales --remote --command "${batchSQL}"`, { encoding: 'utf8' });
    
    batch.forEach(stock => {
      console.log(`  ✅ ${stock.sku}: ${stock.in_stock}/${stock.in_reserve}`);
    });
    
    totalUpdated += batch.length;
  } catch (error) {
    console.error(`  ❌ Помилка батчу ${batchNum}:`, error.message);
    totalErrors += batch.length;
  }
  
  // Пауза між батчами
  await new Promise(resolve => setTimeout(resolve, 500));
}

console.log(`\n🎉 Завершено!`);
console.log(`✅ Оновлено: ${totalUpdated} записів`);
console.log(`❌ Помилок: ${totalErrors} записів`);
console.log(`📊 Всього: ${foundStocks.length} записів`);