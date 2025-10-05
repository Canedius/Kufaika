import { readFileSync, writeFileSync } from 'fs';

console.log('📦 Розділяємо великий SQL файл на частини');

try {
  const sqlContent = readFileSync('./restore-backup.sql', 'utf8');
  const lines = sqlContent.split('\n');
  
  const BATCH_SIZE = 500; // По 500 рядків в кожному файлі
  let fileIndex = 1;
  let currentBatch = [];
  let sqlLines = [];
  
  console.log(`📊 Всього рядків: ${lines.length}`);
  
  // Знаходимо всі INSERT рядки
  for (const line of lines) {
    if (line.trim().startsWith('INSERT INTO')) {
      sqlLines.push(line);
    }
  }
  
  console.log(`📋 Всього INSERT команд: ${sqlLines.length}`);
  
  // Розділяємо на батчі
  for (let i = 0; i < sqlLines.length; i += BATCH_SIZE) {
    const batch = sqlLines.slice(i, i + BATCH_SIZE);
    const fileName = `restore-part-${String(fileIndex).padStart(2, '0')}.sql`;
    
    let content = `-- Частина ${fileIndex} відновлення бази\n`;
    content += `-- Рядки ${i + 1} - ${i + batch.length} з ${sqlLines.length}\n\n`;
    content += batch.join('\n');
    
    writeFileSync(fileName, content, 'utf8');
    console.log(`✅ Створено ${fileName} (${batch.length} команд)`);
    
    fileIndex++;
  }
  
  console.log(`🎉 Створено ${fileIndex - 1} частин. Тепер можна виконувати по черзі!`);
  
} catch (error) {
  console.error('❌ Помилка:', error.message);
}