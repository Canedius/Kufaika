import { readFileSync, writeFileSync } from 'fs';

console.log('🔄 Створюємо SQL файл для відновлення з резервних копій');

function csvToSQL(csvFile, tableName) {
  console.log(`📖 Обробляю ${csvFile}...`);
  const csvContent = readFileSync(`../../backups/${csvFile}`, 'utf8');
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].replace(/"/g, '').split(',');
  
  let sql = `-- Відновлення таблиці ${tableName}\n-- DELETE FROM ${tableName}; -- ⚠️ ЗАКОМЕНТОВАНО ДЛЯ БЕЗПЕКИ\n\n`;
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].replace(/"/g, '').split(',');
    if (values.length === headers.length && values.every(v => v.trim())) {
      const insertValues = values.map(v => isNaN(v) ? `'${v}'` : v).join(', ');
      sql += `INSERT INTO ${tableName} (${headers.join(', ')}) VALUES (${insertValues});\n`;
    }
  }
  
  return sql;
}

try {
  // Генеруємо SQL для відновлення
  let fullSQL = '-- ПОВНЕ ВІДНОВЛЕННЯ БАЗИ З РЕЗЕРВНИХ КОПІЙ 4 ЖОВТНЯ 2025\n';
  fullSQL += '-- Станом на 13:26 (до втрати даних)\n\n';
  
  fullSQL += csvToSQL('sales-2025-10-04_13-26-50.csv', 'sales');
  fullSQL += '\n';
  fullSQL += csvToSQL('inventory_levels-2025-10-04_13-26-50.csv', 'inventory_levels');
  
  // Зберігаємо SQL файл
  writeFileSync('./restore-backup.sql', fullSQL, 'utf8');
  
  console.log('✅ SQL файл створено: restore-backup.sql');
  console.log('🚀 Тепер виконуємо відновлення через wrangler...');
  
} catch (error) {
  console.error('❌ Помилка:', error.message);
}