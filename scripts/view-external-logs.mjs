import fs from "node:fs/promises";
import path from "node:path";

// Функція для перегляду зовнішніх логів
async function viewExternalLogs(days = 7) {
  console.log(`📋 Перегляд зовнішніх логів за останні ${days} днів:\n`);
  
  try {
    await fs.mkdir('logs', { recursive: true });
    
    const now = new Date();
    const events = [];
    
    // Збираємо логи за вказану кількість днів
    for (let i = 0; i < days; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const logFile = `logs/database-events-${dateStr}.json`;
      
      try {
        const content = await fs.readFile(logFile, 'utf8');
        const dailyEvents = JSON.parse(content);
        events.push(...dailyEvents);
      } catch {
        // Файл не існує для цього дня
      }
    }
    
    if (events.length === 0) {
      console.log('📭 Зовнішніх логів не знайдено');
      return;
    }
    
    // Сортуємо по часу
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    console.log(`📊 Знайдено ${events.length} подій:\n`);
    
    // Групуємо по типам
    const byType = {};
    events.forEach(event => {
      if (!byType[event.event_type]) {
        byType[event.event_type] = [];
      }
      byType[event.event_type].push(event);
    });
    
    // Показуємо статистику по типах
    console.log('📈 Статистика по типах подій:');
    Object.entries(byType).forEach(([type, events]) => {
      console.log(`  ${getEventIcon(type)} ${type}: ${events.length} разів`);
    });
    
    console.log('\n📋 Останні події:');
    
    // Показуємо останні 20 подій
    events.slice(0, 20).forEach(event => {
      const date = new Date(event.timestamp).toLocaleString('uk-UA');
      const icon = getEventIcon(event.event_type);
      
      console.log(`\n${icon} ${event.event_type}`);
      console.log(`   ⏰ ${date}`);
      
      if (event.details && Object.keys(event.details).length > 0) {
        console.log(`   📝 Деталі:`, JSON.stringify(event.details, null, 6));
      }
    });
    
  } catch (error) {
    console.error('❌ Помилка читання логів:', error.message);
  }
}

// Функція для отримання іконки для типу події
function getEventIcon(eventType) {
  const icons = {
    'DATABASE_SNAPSHOT': '📸',
    'INTEGRITY_CHECK': '🔍',
    'INTEGRITY_CHECK_ERROR': '⚠️',
    'MONITORING_ALERT': '🚨',
    'MONITORING_ERROR': '❌',
    'BULK_UPDATE': '📦',
    'SYNC_OPERATION': '🔄',
    'BACKUP_CREATED': '💾'
  };
  
  return icons[eventType] || '📝';
}

// Функція для очищення старих логів
async function cleanOldLogs(keepDays = 30) {
  console.log(`🧹 Очищення логів старіших за ${keepDays} днів...`);
  
  try {
    const logsDir = 'logs';
    const files = await fs.readdir(logsDir);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);
    
    let deletedCount = 0;
    
    for (const file of files) {
      if (!file.startsWith('database-events-')) continue;
      
      // Витягуємо дату з назви файлу
      const match = file.match(/database-events-(\d{4}-\d{2}-\d{2})\.json/);
      if (!match) continue;
      
      const fileDate = new Date(match[1]);
      
      if (fileDate < cutoffDate) {
        await fs.unlink(path.join(logsDir, file));
        deletedCount++;
        console.log(`  🗑️ Видалено: ${file}`);
      }
    }
    
    console.log(`✅ Видалено ${deletedCount} старих файлів логів`);
    
  } catch (error) {
    console.error('❌ Помилка очищення логів:', error.message);
  }
}

// Експортуємо функції
export { viewExternalLogs, cleanOldLogs };

// Запускаємо якщо це головний модуль
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const days = process.argv[2] ? parseInt(process.argv[2]) : 7;
  viewExternalLogs(days);
}