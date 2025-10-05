console.log('🛡️ Тест зовнішнього моніторингу D1 бази...\n');

import { execSync } from "node:child_process";
import fs from "node:fs/promises";

// Простий тест
try {
  console.log('📋 Перевіряємо кількість записів у основних таблицях:');
  
  const tables = ['sales', 'inventory_levels', 'product_variants'];
  const results = [];
  
  for (const table of tables) {
    try {
      const sql = `SELECT COUNT(*) as count FROM ${table}`;
      const output = execSync(`wrangler d1 execute hoodie-sales --remote --command "${sql}" --json`, { encoding: 'utf8' });
      const json = JSON.parse(output);
      const count = json[0]?.results?.[0]?.count || 0;
      
      results.push({ table, count });
      console.log(`  ✅ ${table}: ${count.toLocaleString()} записів`);
      
    } catch (error) {
      console.log(`  ❌ Помилка для ${table}: ${error.message}`);
    }
  }
  
  // Створюємо простий лог
  const logEntry = {
    timestamp: new Date().toISOString(),
    event_type: 'QUICK_CHECK',
    details: { tables: results }
  };
  
  await fs.mkdir('logs', { recursive: true });
  const date = new Date().toISOString().split('T')[0];
  const logFile = `logs/database-events-${date}.json`;
  
  let logs = [];
  try {
    const existing = await fs.readFile(logFile, 'utf8');
    logs = JSON.parse(existing);
  } catch {
    // Новий файл
  }
  
  logs.push(logEntry);
  await fs.writeFile(logFile, JSON.stringify(logs, null, 2), 'utf8');
  
  console.log(`\n✅ Лог збережено: ${logFile}`);
  
} catch (error) {
  console.error('❌ Помилка:', error.message);
}