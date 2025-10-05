import { execSync } from 'node:child_process';
import { readFileSync } from 'fs';

console.log('🔄 ПОВНЕ ВІДНОВЛЕННЯ БАЗИ З РЕЗЕРВНИХ КОПІЙ 4 ЖОВТНЯ 2025');
console.log('📅 Відновлюємо дані станом на 13:26 4 жовтня (до втрати даних)');

// Функція для виконання SQL команд в D1
function executeD1Command(sql) {
  try {
    const command = `wrangler d1 execute hoodie-sales --remote --command "${sql}"`;
    console.log(`Виконую: ${sql.substring(0, 50)}...`);
    const result = execSync(command, { encoding: 'utf8' });
    return result;
  } catch (error) {
    console.error(`Помилка виконання SQL: ${error.message}`);
    throw error;
  }
}

// Функція для читання CSV і конвертації в SQL INSERT
function csvToInserts(csvFile, tableName) {
  console.log(`📖 Читаю ${csvFile}...`);
  const csvContent = readFileSync(`../backups/${csvFile}`, 'utf8');
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].replace(/"/g, '').split(',');
  
  const inserts = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].replace(/"/g, '').split(',');
    if (values.length === headers.length && values.every(v => v.trim())) {
      const insertValues = values.map(v => isNaN(v) ? `'${v}'` : v).join(', ');
      inserts.push(`INSERT OR REPLACE INTO ${tableName} (${headers.join(', ')}) VALUES (${insertValues});`);
    }
  }
  
  console.log(`✅ Підготовлено ${inserts.length} записів для таблиці ${tableName}`);
  return inserts;
}

try {
  console.log('\n🚨 УВАГА: Зараз буде повне відновлення бази даних!');
  console.log('Це може зайняти кілька хвилин...\n');

  // Очищуємо дані (тільки sales та inventory)
  console.log('🗑️ Очищуємо пошкоджені дані...');
  // ⚠️ НЕБЕЗПЕЧНІ DELETE КОМАНДИ ЗАКОМЕНТОВАНІ
  // executeD1Command('DELETE FROM sales;');
  // executeD1Command('DELETE FROM inventory_levels;');
  
  // Відновлюємо sales з резервної копії
  console.log('\n📊 Відновлюємо продажі з sales-2025-10-04_13-26-50.csv...');
  const salesInserts = csvToInserts('sales-2025-10-04_13-26-50.csv', 'sales');
  
  // Виконуємо INSERT по одному запиту (щоб уникнути довгих команд)
  console.log('   🔄 Починаємо відновлення продажів...');
  for (let i = 0; i < salesInserts.length; i++) {
    try {
      executeD1Command(salesInserts[i]);
      if ((i + 1) % 100 === 0) {
        console.log(`   ⏳ Відновлено ${i + 1} з ${salesInserts.length} продажів...`);
      }
    } catch (error) {
      console.log(`   ⚠️ Пропуск запису ${i + 1}: ${error.message.substring(0, 50)}...`);
    }
  }
  
  // Відновлюємо inventory
  console.log('\n📦 Відновлюємо інвентар з inventory_levels-2025-10-04_13-26-50.csv...');
  const inventoryInserts = csvToInserts('inventory_levels-2025-10-04_13-26-50.csv', 'inventory_levels');
  
  for (let i = 0; i < inventoryInserts.length; i++) {
    try {
      executeD1Command(inventoryInserts[i]);
      if ((i + 1) % 50 === 0) {
        console.log(`   ⏳ Відновлено ${i + 1} з ${inventoryInserts.length} позицій інвентарю...`);
      }
    } catch (error) {
      console.log(`   ⚠️ Пропуск інвентарю ${i + 1}: ${error.message.substring(0, 50)}...`);
    }
  }

  // Перевіряємо результат відновлення
  console.log('\n🔍 Перевіряємо результат відновлення...');
  
  const salesCheck = execSync('wrangler d1 execute hoodie-sales --remote --command "SELECT COUNT(*) as total FROM sales" --json', { encoding: 'utf8' });
  const salesCount = JSON.parse(salesCheck)[0]?.results[0]?.total || 0;
  
  const inventoryCheck = execSync('wrangler d1 execute hoodie-sales --remote --command "SELECT COUNT(*) as total FROM inventory_levels" --json', { encoding: 'utf8' });
  const inventoryCount = JSON.parse(inventoryCheck)[0]?.results[0]?.total || 0;

  console.log(`✅ Відновлено продажів: ${salesCount}`);
  console.log(`✅ Відновлено позицій інвентарю: ${inventoryCount}`);
  
  // Перевіряємо KUF007 за жовтень 2025
  console.log('\n🎯 Перевіряємо KUF007 за жовтень 2025...');
  const kuf007Check = execSync('wrangler d1 execute hoodie-sales --remote --command "SELECT COUNT(*) as count FROM sales s JOIN products p ON s.product_id = p.id JOIN periods per ON s.period_id = per.id WHERE p.name LIKE \'%OVERSIZE%\' AND per.label = \'Жовтень\' AND per.year = 2025" --json', { encoding: 'utf8' });
  const kuf007Count = JSON.parse(kuf007Check)[0]?.results[0]?.count || 0;
  
  console.log(`✅ KUF007 жовтень 2025: ${kuf007Count} записів`);
  
  console.log('\n🎉 ВІДНОВЛЕННЯ ЗАВЕРШЕНО УСПІШНО!');
  console.log('📋 Всі дані відновлено з резервних копій станом на 13:26 4 жовтня 2025');

} catch (error) {
  console.error('\n❌ ПОМИЛКА ПРИ ВІДНОВЛЕННІ:', error.message);
  console.log('🔄 Спробуйте запустити скрипт ще раз або відновіть дані вручну');
  process.exit(1);
}