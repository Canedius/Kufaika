import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

async function checkKUF007() {
try {
  // Використовуємо той самий шлях як у db.js
  const dataDir = join(process.cwd(), "data");
  const dbPath = join(dataDir, "hoodie.db");
  console.log(`Підключаємося до бази: ${dbPath}`);
  const db = new DatabaseSync(dbPath);

  console.log("Перевіряємо продукти в базі...");
  
  // Спочатку подивимося всі продукти
  const products = db.prepare("SELECT id, name FROM products ORDER BY id").all();
  console.log(`Знайдено ${products.length} продуктів:`);
  products.forEach(p => console.log(`- ID ${p.id}: ${p.name}`));
  
  // Знайдемо KUF007 (Футболка OVERSIZE)
  const kuf007 = products.find(p => p.name.includes("OVERSIZE"));
  if (!kuf007) {
    console.log("❌ Продукт 'Футболка OVERSIZE Kufaika' не знайдено!");
    return;
  }
  
  console.log(`\n✅ Знайдено KUF007: ID ${kuf007.id} - ${kuf007.name}`);
  
  // Перевіримо періоди за 2025 рік
  const periods = db.prepare("SELECT id, month, year FROM periods WHERE year = 2025 ORDER BY id").all();
  console.log(`\nЗнайдено ${periods.length} періодів за 2025 рік:`);
  periods.forEach(p => console.log(`- ID ${p.id}: ${p.month} ${p.year}`));
  
  // Знайдемо період жовтня 2025 (місяць 10)
  const octPeriod = periods.find(p => p.month === 10);
  if (!octPeriod) {
    console.log("❌ Період 'Жовтень 2025' (місяць 10) не знайдено!");
    return;
  }
  
  console.log(`\n✅ Знайдено період жовтня 2025: ID ${octPeriod.id} (місяць ${octPeriod.month})`);
  
  // Перевіряємо продажі KUF007 за жовтень 2025
  const query = `
    SELECT 
      p.name as product_name,
      c.name as color,
      sz.label as size_label,
      s.quantity,
      per.month,
      per.year
    FROM sales s
    JOIN products p ON s.product_id = p.id
    JOIN colors c ON s.color_id = c.id
    JOIN sizes sz ON s.size_id = sz.id
    JOIN periods per ON s.period_id = per.id
    WHERE p.id = ? AND per.id = ?
    ORDER BY c.name, sz.label
  `;
  
  const results = db.prepare(query).all(kuf007.id, octPeriod.id);
  
  console.log(`\n📊 Знайдено ${results.length} записів продажів KUF007 за жовтень 2025:`);
  
  let totalQuantity = 0;
  results.forEach(row => {
    console.log(`- ${row.color} ${row.size_label}: ${row.quantity} шт.`);
    totalQuantity += row.quantity;
  });
  
  console.log(`\n🎯 Загальна кількість: ${totalQuantity} шт.`);
  
  if (results.length === 0) {
    console.log("❌ Дані KUF007 за жовтень 2025 відсутні у базі!");
  } else {
    console.log("✅ Дані KUF007 за жовтень 2025 успішно відновлено!");
  }
  
  db.close();
} catch (error) {
  console.error("Помилка:", error.message);
}
}

checkKUF007();