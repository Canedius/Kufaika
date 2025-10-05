import { readFileSync, writeFileSync } from 'fs';

console.log('🔧 Виправляємо INSERT на INSERT OR REPLACE');

try {
  for (let i = 2; i <= 5; i++) {
    const fileName = `precise-restore-part-${String(i).padStart(2, '0')}.sql`;
    console.log(`🔧 Обробляю ${fileName}...`);
    
    let content = readFileSync(fileName, 'utf8');
    content = content.replace(/INSERT INTO/g, 'INSERT OR REPLACE INTO');
    
    writeFileSync(fileName, content, 'utf8');
    console.log(`✅ ${fileName} виправлено`);
  }
  
  console.log('🎯 Всі файли готові з INSERT OR REPLACE');
  
} catch (error) {
  console.error('❌ Помилка:', error.message);
}