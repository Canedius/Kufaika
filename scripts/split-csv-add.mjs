import { readFileSync, writeFileSync } from 'fs';

console.log('📦 Розділяємо add-csv-data.sql на частини');

try {
  const sqlContent = readFileSync('./add-csv-data.sql', 'utf8');
  const lines = sqlContent.split('\n');
  const insertLines = lines.filter(line => line.trim().startsWith('INSERT OR IGNORE'));
  
  console.log(`📊 Всього INSERT OR IGNORE команд: ${insertLines.length}`);
  
  const BATCH_SIZE = 300; // Менший розмір для надійності
  let fileIndex = 1;
  
  for (let i = 0; i < insertLines.length; i += BATCH_SIZE) {
    const batch = insertLines.slice(i, i + BATCH_SIZE);
    const fileName = `add-csv-part-${String(fileIndex).padStart(2, '0')}.sql`;
    
    let content = `-- ДОДАВАННЯ CSV частина ${fileIndex}\n`;
    content += `-- Команди ${i + 1} - ${i + batch.length} з ${insertLines.length}\n\n`;
    content += batch.join('\n');
    
    writeFileSync(fileName, content, 'utf8');
    console.log(`✅ ${fileName} (${batch.length} команд)`);
    
    fileIndex++;
  }
  
  console.log(`🎯 Створено ${fileIndex - 1} частин для додавання CSV`);
  
} catch (error) {
  console.error('❌ Помилка:', error.message);
}