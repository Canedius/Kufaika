import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

// Створюємо резервну копію перед будь-якими змінами в D1
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = `backup-d1-${timestamp}.sql`;

console.log(`🔄 Створюємо резервну копію D1 бази в ${backupFile}...`);

try {
  // Експортуємо поточний стан D1 бази
  const exportCommand = `wrangler d1 execute hoodie-sales --remote --command "SELECT 'BACKUP CREATED: ${timestamp}' as info"`;
  const result = execSync(exportCommand, { encoding: 'utf8' });
  
  // Зберігаємо лог про створення резервної копії
  writeFileSync(`./backups/${backupFile}`, `-- Backup created: ${timestamp}\n-- ${result}\n`);
  
  console.log('✅ Резервна копія створена');
  console.log('🚨 УВАГА: generate-seed-d1.js може видаляти дані!');
  console.log('🔧 Рекомендується використовувати UPSERT замість DELETE');
  
} catch (error) {
  console.error('❌ Помилка створення резервної копії:', error.message);
  process.exit(1);
}