import { readFileSync, writeFileSync } from 'fs';

console.log('📦 Розділяємо precise-restore.sql на частини');

try {
  const sqlContent = readFileSync('./precise-restore.sql', 'utf8');
  const lines = sqlContent.split('\n');
  const insertLines = lines.filter(line => line.trim().startsWith('INSERT INTO'));
  
  console.log(`📊 Всього INSERT команд: ${insertLines.length}`);
  
  const BATCH_SIZE = 400; // Оптимальний розмір для wrangler
  let fileIndex = 1;
  
  for (let i = 0; i < insertLines.length; i += BATCH_SIZE) {
    const batch = insertLines.slice(i, i + BATCH_SIZE);
    const fileName = `precise-restore-part-${String(fileIndex).padStart(2, '0')}.sql`;
    
    let content = `-- ТОЧНЕ ВІДНОВЛЕННЯ частина ${fileIndex}\n`;
    content += `-- Команди ${i + 1} - ${i + batch.length} з ${insertLines.length}\n\n`;
    content += batch.join('\n');
    
    writeFileSync(fileName, content, 'utf8');
    console.log(`✅ ${fileName} (${batch.length} команд)`);
    
    fileIndex++;
  }
  
  console.log(`🎯 Створено ${fileIndex - 1} частин для точного відновлення`);
  
} catch (error) {
  console.error('❌ Помилка:', error.message);
}