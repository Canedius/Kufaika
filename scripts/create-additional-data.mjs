import { readFileSync, writeFileSync } from 'fs';

console.log('🎯 ДОДАЄМО CSV ДАНІ 4 ЖОВТНЯ ДО ІСНУЮЧОЇ БАЗИ');

function addCSVData(csvFile, tableName) {
  console.log(`📖 Обробляю ${csvFile}...`);
  const csvContent = readFileSync(`../../backups/${csvFile}`, 'utf8');
  const lines = csvContent.trim().split('\n');
  
  if (lines.length === 0) {
    console.log(`⚠️ Файл ${csvFile} пустий`);
    return '';
  }
  
  const headers = lines[0].replace(/"/g, '').split(',');
  console.log(`📋 Заголовки: ${headers.join(', ')}`);
  
  let sql = `-- ДОДАВАННЯ ${tableName.toUpperCase()} з ${csvFile}\n`;
  let validRecords = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.replace(/"/g, '').split(',');
    if (values.length === headers.length) {
      const insertValues = values.map(v => {
        const trimmed = v.trim();
        return isNaN(trimmed) || trimmed === '' ? `'${trimmed}'` : trimmed;
      }).join(', ');
      
      // Використовуємо INSERT OR IGNORE щоб не перезаписувати існуючі
      sql += `INSERT OR IGNORE INTO ${tableName} (${headers.join(', ')}) VALUES (${insertValues});\n`;
      validRecords++;
    }
  }
  
  console.log(`✅ ${tableName}: підготовлено ${validRecords} записів`);
  return sql;
}

try {
  let additionalSQL = '-- 🎯 ДОДАТКОВІ ДАНІ З CSV 4 ЖОВТНЯ 13:26\n';
  additionalSQL += '-- ДОДАЄМО ДО ІСНУЮЧИХ ДАНИХ БЕЗ ЗАМІНИ\n\n';
  
  // Додаємо sales
  additionalSQL += addCSVData('sales-2025-10-04_13-26-50.csv', 'sales');
  additionalSQL += '\n\n';
  
  // Додаємо inventory_levels  
  additionalSQL += addCSVData('inventory_levels-2025-10-04_13-26-50.csv', 'inventory_levels');
  
  // Записуємо результат
  writeFileSync('add-csv-data.sql', additionalSQL, 'utf8');
  
  console.log('🎉 Створено add-csv-data.sql');
  console.log('📊 Файл готовий для додавання!');
  
} catch (error) {
  console.error('❌ Помилка:', error.message);
}