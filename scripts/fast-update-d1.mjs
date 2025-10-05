import fs from "node:fs/promises";
import { execSync } from "node:child_process";

console.log('🚀 Швидке оновлення залишків в D1 батчами...');

// Читаємо дані
const stocksData = JSON.parse(await fs.readFile('data/latest-stocks.json', 'utf8'));
const foundStocks = stocksData.filter(stock => stock.found);

console.log(`📦 Оновлюємо ${foundStocks.length} записів з ${stocksData.length}`);

// Створюємо SQL для всіх оновлень разом
const updates = foundStocks.map(stock => 
  `UPDATE inventory_levels SET in_stock = ${stock.in_stock}, in_reserve = ${stock.in_reserve}, updated_at = '${new Date().toISOString()}' WHERE variant_id = (SELECT id FROM product_variants WHERE sku = '${stock.sku}');`
).join(' ');

try {
  console.log('⏳ Виконуємо масове оновлення...');
  const result = execSync(`wrangler d1 execute hoodie-sales --remote --command "${updates}"`, { encoding: 'utf8' });
  
  console.log('✅ Результат:', result);
  console.log(`🎉 Успішно оновлено ${foundStocks.length} записів в D1!`);
  
} catch (error) {
  console.error('❌ Помилка масового оновлення:', error.message);
  
  // Fallback: оновлюємо по одному але швидше
  console.log('🔄 Пробуємо оновити по одному...');
  let updated = 0;
  
  for (const stock of foundStocks.slice(0, 10)) { // Тільки перші 10 для тесту
    try {
      const updateCommand = `UPDATE inventory_levels SET in_stock = ${stock.in_stock}, in_reserve = ${stock.in_reserve}, updated_at = '${new Date().toISOString()}' WHERE variant_id = (SELECT id FROM product_variants WHERE sku = '${stock.sku}');`;
      
      execSync(`wrangler d1 execute hoodie-sales --remote --command "${updateCommand}"`, { encoding: 'utf8' });
      console.log(`✅ ${stock.sku}: ${stock.in_stock}/${stock.in_reserve}`);
      updated++;
      
    } catch (err) {
      console.error(`❌ ${stock.sku}:`, err.message);
    }
  }
  
  console.log(`📊 Оновлено ${updated} з ${foundStocks.length} записів`);
}