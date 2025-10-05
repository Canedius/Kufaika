import fs from "node:fs/promises";
import { execSync } from "node:child_process";

console.log('🔄 Оновлення залишків в D1 базі...');

// Читаємо дані з файлу
const stocksData = JSON.parse(await fs.readFile('data/latest-stocks.json', 'utf8'));

console.log(`📦 Знайдено ${stocksData.length} записів для оновлення`);

let updated = 0;
let errors = 0;
let notFound = 0;

for (const stock of stocksData) {
  if (!stock.found) {
    console.log(`⚠️ ${stock.sku}: пропущено (не знайдено в KeyCRM)`);
    notFound++;
    continue;
  }

  try {
    // Оновлюємо залишки в D1
    const updateCommand = `UPDATE inventory_levels SET in_stock = ${stock.in_stock}, in_reserve = ${stock.in_reserve}, updated_at = '${new Date().toISOString()}' WHERE variant_id = (SELECT id FROM product_variants WHERE sku = '${stock.sku}');`;
    
    const result = execSync(`wrangler d1 execute hoodie-sales --remote --command "${updateCommand}"`, { encoding: 'utf8' });
    
    console.log(`✅ ${stock.sku}: ${stock.in_stock}/${stock.in_reserve} оновлено в D1`);
    updated++;
    
    // Пауза між запитами до D1
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (error) {
    console.error(`❌ Помилка оновлення ${stock.sku}:`, error.message);
    errors++;
  }
}

console.log(`\n📊 Підсумок оновлення D1:`);
console.log(`✅ Оновлено: ${updated} записів`);
console.log(`⚠️ Не знайдено в KeyCRM: ${notFound}`);
console.log(`❌ Помилок: ${errors}`);
console.log(`📦 Всього оброблено: ${stocksData.length}`);

if (updated > 0) {
  console.log('\n🎉 Залишки в D1 базі успішно оновлено!');
} else {
  console.log('\n⚠️ Жодного запису не було оновлено');
}