// Скрипт для перепроцесингу завислих вебхуків
console.log('🔄 Починаємо перепроцесинг завислих вебхуків...');

import { execSync } from "node:child_process";

// Функція для отримання завислих вебхуків
async function getFailedWebhooks() {
  const sql = `
    SELECT id, payload, error 
    FROM webhook_events 
    WHERE status = 'failed' 
    AND error LIKE '%NEW.id%' 
    AND date(received_at) >= date('now')
    ORDER BY id DESC 
    LIMIT 10
  `;
  
  try {
    const output = execSync(`wrangler d1 execute hoodie-sales --remote --command "${sql}" --json`, { encoding: 'utf8' });
    const result = JSON.parse(output);
    return result[0]?.results || [];
  } catch (error) {
    console.error('❌ Помилка отримання вебхуків:', error.message);
    return [];
  }
}

// Функція для позначення вебхуку як pending для повторної обробки
async function retryWebhook(webhookId) {
  const sql = `
    UPDATE webhook_events 
    SET status = 'pending', error = NULL, processed_at = NULL 
    WHERE id = ${webhookId}
  `;
  
  try {
    execSync(`wrangler d1 execute hoodie-sales --remote --command "${sql}"`, { encoding: 'utf8' });
    console.log(`✅ Вебхук ${webhookId} позначено для повторної обробки`);
    return true;
  } catch (error) {
    console.error(`❌ Помилка з вебхуком ${webhookId}:`, error.message);
    return false;
  }
}

// Основна функція
async function main() {
  console.log('📋 Шукаємо завислі вебхуки з помилкою NEW.id...');
  
  const failedWebhooks = await getFailedWebhooks();
  
  if (failedWebhooks.length === 0) {
    console.log('✅ Завислих вебхуків з помилкою NEW.id не знайдено');
    return;
  }
  
  console.log(`🔍 Знайдено ${failedWebhooks.length} завислих вебхуків:`);
  
  for (const webhook of failedWebhooks) {
    console.log(`📦 ID: ${webhook.id}, Payload: ${webhook.payload?.substring(0, 50)}...`);
    console.log(`❌ Error: ${webhook.error}`);
    
    const success = await retryWebhook(webhook.id);
    if (success) {
      console.log(`🔄 Вебхук ${webhook.id} готовий до повторної обробки`);
    }
    
    // Пауза між обробками
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n🎉 Перепроцесинг завершено!');
  console.log('💡 Вебхуки будуть автоматично перероблені worker-ом');
}

// Запускаємо якщо це головний модуль
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  main().catch(console.error);
}