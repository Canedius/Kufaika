import { readFileSync, writeFileSync } from 'fs';

console.log('🚨 ЕКСТРЕНЕ ВІДНОВЛЕННЯ БЕЗ DELETE!');

function csvToInsertSQL(csvFile, tableName) {
  console.log(`📖 Обробляю ${csvFile}...`);
  const csvContent = readFileSync(`../../backups/${csvFile}`, 'utf8');
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].replace(/"/g, '').split(',');
  
  let sql = `-- Відновлення ${tableName} БЕЗ видалення існуючих даних\n\n`;
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].replace(/"/g, '').split(',');
    if (values.length === headers.length && values.every(v => v.trim())) {
      const insertValues = values.map(v => isNaN(v) ? `'${v}'` : v).join(', ');
      sql += `INSERT OR REPLACE INTO ${tableName} (${headers.join(', ')}) VALUES (${insertValues});\n`;
    }
  }
  
  return sql;
}

try {
  // Створюємо повне відновлення БЕЗ DELETE
  let emergencySQL = '-- 🚨 ЕКСТРЕНЕ ПОВНЕ ВІДНОВЛЕННЯ 4 ЖОВТНЯ 2025\n';
  emergencySQL += '-- БЕЗ ВИДАЛЕННЯ ІСНУЮЧИХ ДАНИХ!\n\n';
  
  emergencySQL += csvToInsertSQL('sales-2025-10-04_13-26-50.csv', 'sales');
  emergencySQL += '\n-- Розділювач для inventory\n\n';
  emergencySQL += csvToInsertSQL('inventory_levels-2025-10-04_13-26-50.csv', 'inventory_levels');
  
  // Розділяємо на частини по 300 команд (менше для надійності)
  const lines = emergencySQL.split('\n');
  const insertLines = lines.filter(line => line.trim().startsWith('INSERT OR REPLACE'));
  
  console.log(`📊 Всього INSERT команд для відновлення: ${insertLines.length}`);
  
  const BATCH_SIZE = 300;
  let fileIndex = 1;
  
  for (let i = 0; i < insertLines.length; i += BATCH_SIZE) {
    const batch = insertLines.slice(i, i + BATCH_SIZE);
    const fileName = `emergency-restore-${String(fileIndex).padStart(2, '0')}.sql`;
    
    let content = `-- 🚨 ЕКСТРЕНЕ ВІДНОВЛЕННЯ частина ${fileIndex}\n`;
    content += `-- Команди ${i + 1} - ${i + batch.length} з ${insertLines.length}\n\n`;
    content += batch.join('\n');
    
    writeFileSync(fileName, content, 'utf8');
    console.log(`✅ Створено ${fileName} (${batch.length} команд)`);
    
    fileIndex++;
  }
  
  console.log('🎯 Тепер виконуйте emergency-restore файли по черзі!');
  console.log('⚠️ Використовуємо INSERT OR REPLACE - дані додадуться без видалення!');
  
} catch (error) {
  console.error('❌ Помилка:', error.message);
}