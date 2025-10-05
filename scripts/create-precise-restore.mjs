import { readFileSync, writeFileSync } from 'fs';

console.log('🎯 ТОЧНЕ ВІДНОВЛЕННЯ З CSV 4 ЖОВТНЯ 13:26');

function processCSVToSQL(csvFile, tableName) {
  console.log(`📖 Обробляю ${csvFile}...`);
  const csvContent = readFileSync(`../../backups/${csvFile}`, 'utf8');
  const lines = csvContent.trim().split('\n');
  
  if (lines.length === 0) {
    console.log(`⚠️ Файл ${csvFile} пустий`);
    return '';
  }
  
  const headers = lines[0].replace(/"/g, '').split(',');
  console.log(`📋 Заголовки: ${headers.join(', ')}`);
  
  let sql = `-- ВІДНОВЛЕННЯ ${tableName.toUpperCase()} з ${csvFile}\n`;
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
      
      sql += `INSERT INTO ${tableName} (${headers.join(', ')}) VALUES (${insertValues});\n`;
      validRecords++;
    } else {
      console.log(`⚠️ Рядок ${i}: неправильна кількість колонок (${values.length} замість ${headers.length})`);
    }
  }
  
  console.log(`✅ ${tableName}: оброблено ${validRecords} записів`);
  return sql;
}

try {
  let finalSQL = '-- 🎯 ТОЧНЕ ВІДНОВЛЕННЯ З РЕЗЕРВНИХ КОПІЙ 4 ЖОВТНЯ 13:26\n\n';
  
  // Відновлюємо sales
  finalSQL += processCSVToSQL('sales-2025-10-04_13-26-50.csv', 'sales');
  finalSQL += '\n\n';
  
  // Відновлюємо inventory_levels  
  finalSQL += processCSVToSQL('inventory_levels-2025-10-04_13-26-50.csv', 'inventory_levels');
  
  // Записуємо результат
  writeFileSync('precise-restore.sql', finalSQL, 'utf8');
  
  console.log('🎉 Створено precise-restore.sql');
  console.log('📊 Файл готовий для виконання!');
  
} catch (error) {
  console.error('❌ Помилка:', error.message);
}