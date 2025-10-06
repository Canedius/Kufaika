// Моніторинг прогресу обробки вебхуків
import { execSync } from "node:child_process";

async function checkWebhookStatus() {
  console.log('📊 Перевіряємо статус вебхуків за сьогодні...\n');
  
  try {
    // Загальна статистика
    const totalSql = `
      SELECT 
        status,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM webhook_events WHERE date(received_at) >= date('now')), 2) as percentage
      FROM webhook_events 
      WHERE date(received_at) >= date('now')
      GROUP BY status
      ORDER BY count DESC
    `;
    
    const totalOutput = execSync(`wrangler d1 execute hoodie-sales --remote --command "${totalSql}" --json`, { encoding: 'utf8' });
    const totalResult = JSON.parse(totalOutput);
    const totalStats = totalResult[0]?.results || [];
    
    console.log('📈 Загальна статистика вебхуків за сьогодні:');
    totalStats.forEach(stat => {
      const emoji = stat.status === 'processed' ? '✅' : 
                    stat.status === 'pending' ? '⏳' : 
                    stat.status === 'failed' ? '❌' : '❓';
      console.log(`  ${emoji} ${stat.status}: ${stat.count} (${stat.percentage}%)`);
    });
    
    console.log();
    
    // Статистика KUF вебхуків
    const kufSql = `
      SELECT 
        status,
        COUNT(*) as count
      FROM webhook_events 
      WHERE date(received_at) >= date('now')
      AND payload LIKE '%KUF%'
      GROUP BY status
      ORDER BY count DESC
    `;
    
    const kufOutput = execSync(`wrangler d1 execute hoodie-sales --remote --command "${kufSql}" --json`, { encoding: 'utf8' });
    const kufResult = JSON.parse(kufOutput);
    const kufStats = kufResult[0]?.results || [];
    
    console.log('🏷️ Статистика KUF вебхуків:');
    kufStats.forEach(stat => {
      const emoji = stat.status === 'processed' ? '✅' : 
                    stat.status === 'pending' ? '⏳' : 
                    stat.status === 'failed' ? '❌' : '❓';
      console.log(`  ${emoji} ${stat.status}: ${stat.count}`);
    });
    
    console.log();
    
    // Останні помилки
    const errorsSql = `
      SELECT error, COUNT(*) as count
      FROM webhook_events 
      WHERE date(received_at) >= date('now')
      AND status = 'failed'
      AND error IS NOT NULL
      GROUP BY error
      ORDER BY count DESC
      LIMIT 5
    `;
    
    const errorsOutput = execSync(`wrangler d1 execute hoodie-sales --remote --command "${errorsSql}" --json`, { encoding: 'utf8' });
    const errorsResult = JSON.parse(errorsOutput);
    const errors = errorsResult[0]?.results || [];
    
    if (errors.length > 0) {
      console.log('🚨 Топ помилок:');
      errors.forEach(error => {
        console.log(`  ❌ ${error.error}: ${error.count} разів`);
      });
    }
    
  } catch (error) {
    console.error('❌ Помилка перевірки статусу:', error.message);
  }
}

// Запускаємо
checkWebhookStatus();