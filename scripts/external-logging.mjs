import fs from "node:fs/promises";
import { execSync } from "node:child_process";

// Функція для створення безпечного бекапу стану бази
export async function createDatabaseSnapshot(description = 'Manual snapshot') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `db-snapshot-${timestamp}.json`;
  
  console.log(`📸 Створюємо знімок бази: ${filename}`);
  
  try {
    // Отримуємо всі ключові таблиці
    const tables = ['sales', 'inventory_levels', 'product_variants', 'products', 'colors', 'sizes', 'periods'];
    const snapshot = {
      timestamp: new Date().toISOString(),
      description,
      tables: {}
    };
    
    for (const table of tables) {
      console.log(`  📋 Експорт ${table}...`);
      
      const sql = `SELECT * FROM ${table}`;
      const result = execSync(`wrangler d1 execute hoodie-sales --remote --command "${sql}" --json`, { encoding: 'utf8' });
      const json = JSON.parse(result);
      
      snapshot.tables[table] = {
        count: json[0]?.results?.length || 0,
        data: json[0]?.results || []
      };
      
      console.log(`    ✅ ${snapshot.tables[table].count} записів`);
    }
    
    // Зберігаємо в файл
    await fs.mkdir('snapshots', { recursive: true });
    await fs.writeFile(`snapshots/${filename}`, JSON.stringify(snapshot, null, 2), 'utf8');
    
    // Додаємо запис в зовнішній лог
    await addExternalLog('DATABASE_SNAPSHOT', {
      filename,
      description,
      total_records: Object.values(snapshot.tables).reduce((sum, t) => sum + t.count, 0),
      tables: Object.keys(snapshot.tables).length
    });
    
    console.log(`✅ Знімок збережено: snapshots/${filename}`);
    return filename;
    
  } catch (error) {
    console.error('❌ Помилка створення знімку:', error.message);
    throw error;
  }
}

// Функція для зовнішнього логування (у файл, не в базу)
export async function addExternalLog(event_type, details = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event_type,
    details
  };
  
  try {
    await fs.mkdir('logs', { recursive: true });
    
    // Додаємо до щоденного лог файлу
    const date = timestamp.split('T')[0];
    const logFile = `logs/database-events-${date}.json`;
    
    let logs = [];
    try {
      const existing = await fs.readFile(logFile, 'utf8');
      logs = JSON.parse(existing);
    } catch {
      // Файл не існує, створюємо новий
    }
    
    logs.push(logEntry);
    await fs.writeFile(logFile, JSON.stringify(logs, null, 2), 'utf8');
    
    console.log(`📝 Зовнішній лог: ${event_type}`);
  } catch (error) {
    console.error('❌ Помилка зовнішнього логування:', error.message);
  }
}

// Функція для перевірки цілісності бази
export async function checkDatabaseIntegrity() {
  console.log('🔍 Перевірка цілісності бази...');
  
  try {
    // Перевіряємо основні таблиці
    const checks = [
      { table: 'sales', expected_min: 1000 },
      { table: 'inventory_levels', expected_min: 100 },
      { table: 'product_variants', expected_min: 100 },
      { table: 'change_logs', expected_min: 1 }
    ];
    
    const results = [];
    
    for (const check of checks) {
      const sql = `SELECT COUNT(*) as count FROM ${check.table}`;
      const result = execSync(`wrangler d1 execute hoodie-sales --remote --command "${sql}" --json`, { encoding: 'utf8' });
      const json = JSON.parse(result);
      const count = json[0]?.results?.[0]?.count || 0;
      
      const status = count >= check.expected_min ? 'OK' : 'WARNING';
      
      results.push({
        table: check.table,
        count,
        expected_min: check.expected_min,
        status
      });
      
      if (status === 'OK') {
        console.log(`  ✅ ${check.table}: ${count} записів`);
      } else {
        console.log(`  ⚠️  ${check.table}: ${count} записів (очікувалося мін. ${check.expected_min})`);
      }
    }
    
    // Логуємо результат перевірки
    await addExternalLog('INTEGRITY_CHECK', { results });
    
    const hasWarnings = results.some(r => r.status === 'WARNING');
    if (hasWarnings) {
      console.log('⚠️  Виявлено підозрілі зміни в кількості записів!');
      
      // Автоматично створюємо знімок якщо все ОК
      if (!hasWarnings) {
        await createDatabaseSnapshot('Auto snapshot after integrity check');
      }
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ Помилка перевірки цілісності:', error.message);
    await addExternalLog('INTEGRITY_CHECK_ERROR', { error: error.message });
    throw error;
  }
}