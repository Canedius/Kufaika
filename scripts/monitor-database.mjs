import { createDatabaseSnapshot, checkDatabaseIntegrity, addExternalLog } from './external-logging.mjs';

// Скрипт для моніторингу бази даних
async function monitorDatabase() {
  console.log('🛡️  Запускаємо моніторинг D1 бази...\n');
  
  try {
    // 1. Перевіряємо цілісність
    console.log('1️⃣ Перевірка цілісності:');
    const integrity = await checkDatabaseIntegrity();
    console.log();
    
    // 2. Створюємо знімок якщо все ОК
    const hasProblems = integrity.some(r => r.status === 'WARNING');
    
    if (!hasProblems) {
      console.log('2️⃣ Створення захисного знімку:');
      const snapshotFile = await createDatabaseSnapshot('Scheduled monitoring snapshot');
      console.log();
      
      // 3. Показуємо статистику
      console.log('3️⃣ Поточна статистика:');
      for (const check of integrity) {
        console.log(`  📊 ${check.table}: ${check.count.toLocaleString()} записів`);
      }
      
    } else {
      console.log('⚠️  Виявлено проблеми - знімок не створюємо');
      await addExternalLog('MONITORING_ALERT', { 
        alert: 'Integrity check failed',
        problems: integrity.filter(r => r.status === 'WARNING')
      });
    }
    
    console.log('\n✅ Моніторинг завершено успішно');
    
  } catch (error) {
    console.error('\n❌ Помилка моніторингу:', error.message);
    await addExternalLog('MONITORING_ERROR', { error: error.message });
  }
}

// Запускаємо якщо це головний модуль
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  monitorDatabase();
}