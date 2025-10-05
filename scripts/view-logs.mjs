import { execSync } from "node:child_process";

console.log('📊 Система перегляду логів змін бази даних\n');

// Функція для виконання SQL запитів
function queryD1(sql) {
  try {
    // Очищуємо SQL від переносів рядків і зайвих пробілів
    const cleanSql = sql.replace(/\s+/g, ' ').trim();
    const result = execSync(`wrangler d1 execute hoodie-sales --remote --command "${cleanSql}" --json`, { encoding: 'utf8' });
    const json = JSON.parse(result);
    return json[0]?.results || [];
  } catch (error) {
    console.error('❌ Помилка запиту:', error.message);
    return [];
  }
}

// Функція для показу останніх змін
function showRecentChanges(limit = 20) {
  console.log(`📈 Останні ${limit} змін в базі:\n`);
  
  const sql = `
    SELECT 
      timestamp,
      operation_type,
      table_name,
      sku,
      field_name,
      old_value,
      new_value,
      source,
      additional_data
    FROM change_logs 
    ORDER BY timestamp DESC 
    LIMIT ${limit}
  `;
  
  const logs = queryD1(sql);
  
  if (logs.length === 0) {
    console.log('⚠️ Логів не знайдено. Спочатку встановіть систему логування.');
    return;
  }
  
  logs.forEach((log, i) => {
    const time = new Date(log.timestamp + 'Z').toLocaleString('uk-UA');
    console.log(`${i + 1}. [${time}] ${log.operation_type} ${log.table_name}`);
    if (log.sku) console.log(`   SKU: ${log.sku}`);
    if (log.field_name !== 'unknown') console.log(`   Поле: ${log.field_name}`);
    if (log.old_value && log.new_value) {
      console.log(`   Зміна: ${log.old_value} → ${log.new_value}`);
    } else if (log.new_value) {
      console.log(`   Нове значення: ${log.new_value}`);
    }
    if (log.source) console.log(`   Джерело: ${log.source}`);
    console.log('');
  });
}

// Функція для показу змін конкретного товару
function showProductChanges(sku) {
  console.log(`🔍 Зміни для товару ${sku}:\n`);
  
  const sql = `
    SELECT 
      timestamp,
      operation_type,
      table_name,
      field_name,
      old_value,
      new_value,
      source,
      additional_data
    FROM change_logs 
    WHERE sku = '${sku}'
    ORDER BY timestamp DESC
  `;
  
  const logs = queryD1(sql);
  
  if (logs.length === 0) {
    console.log(`⚠️ Змін для товару ${sku} не знайдено.`);
    return;
  }
  
  logs.forEach((log, i) => {
    const time = new Date(log.timestamp + 'Z').toLocaleString('uk-UA');
    console.log(`${i + 1}. [${time}] ${log.operation_type} ${log.table_name}.${log.field_name}`);
    if (log.old_value && log.new_value) {
      console.log(`   ${log.old_value} → ${log.new_value} (${log.source})`);
    } else if (log.new_value) {
      console.log(`   Встановлено: ${log.new_value} (${log.source})`);
    } else if (log.old_value) {
      console.log(`   Видалено: ${log.old_value} (${log.source})`);
    }
    console.log('');
  });
}

// Функція для статистики змін за період
function showChangeStats(hours = 24) {
  console.log(`📊 Статистика змін за останні ${hours} годин:\n`);
  
  const sql = `
    SELECT 
      table_name,
      operation_type,
      source,
      COUNT(*) as count
    FROM change_logs 
    WHERE datetime(timestamp) >= datetime('now', '-${hours} hours')
    GROUP BY table_name, operation_type, source
    ORDER BY count DESC
  `;
  
  const stats = queryD1(sql);
  
  if (stats.length === 0) {
    console.log(`⚠️ Змін за останні ${hours} годин не знайдено.`);
    return;
  }
  
  stats.forEach(stat => {
    console.log(`📈 ${stat.table_name}.${stat.operation_type} (${stat.source}): ${stat.count} змін`);
  });
  console.log('');
}

// Головна функція
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Використання:');
    console.log('  node view-logs.mjs                    - показати останні 20 змін');
    console.log('  node view-logs.mjs recent 50          - показати останні 50 змін'); 
    console.log('  node view-logs.mjs product KUF001BKL  - показати зміни товару');
    console.log('  node view-logs.mjs stats 12           - статистика за 12 годин');
    console.log('');
    
    showRecentChanges(20);
    return;
  }
  
  const command = args[0];
  
  switch (command) {
    case 'recent':
      const limit = parseInt(args[1]) || 20;
      showRecentChanges(limit);
      break;
      
    case 'product':
      const sku = args[1];
      if (!sku) {
        console.log('❌ Вкажіть SKU товару');
        return;
      }
      showProductChanges(sku);
      break;
      
    case 'stats':
      const hours = parseInt(args[1]) || 24;
      showChangeStats(hours);
      break;
      
    default:
      console.log('❌ Невідома команда:', command);
  }
}

main().catch(console.error);