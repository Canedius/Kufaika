import { readFileSync, writeFileSync } from 'fs';

console.log('🔧 Створюємо правильний порядок відновлення');

try {
  // 1. Спочатку створюємо основні довідкові дані
  const refDataSQL = `
-- ДОВІДКОВІ ДАНІ
INSERT OR REPLACE INTO products (id, name, slug) VALUES 
(1, 'Худі Kufaika', 'kuf'),
(2, 'Світшот Kufaika', 'sweatshirt');

INSERT OR REPLACE INTO sizes (id, label) VALUES 
(1, 'S'), (2, 'M'), (3, 'L'), (4, 'XL'), (5, 'XXL');

INSERT OR REPLACE INTO colors (id, product_id, name) VALUES 
(1, 1, 'Чорний'), (2, 1, 'Сірий'), (3, 1, 'Білий'),
(4, 2, 'Чорний'), (5, 2, 'Сірий'), (6, 2, 'Білий');

INSERT OR REPLACE INTO periods (id, year, month, label) VALUES 
(1, 2024, 10, 'жовтень 2024'),
(2, 2025, 10, 'жовтень 2025');
`;

  writeFileSync('restore-ref-data.sql', refDataSQL, 'utf8');
  console.log('✅ Створено restore-ref-data.sql (довідкові дані)');
  
  // 2. Тепер обробляємо CSV для product_variants та inventory_levels
  console.log('📖 Обробляю inventory_levels...');
  const inventoryContent = readFileSync('../../backups/inventory_levels-2025-10-04_13-26-50.csv', 'utf8');
  const inventoryLines = inventoryContent.trim().split('\n');
  const inventoryHeaders = inventoryLines[0].replace(/"/g, '').split(',');
  
  let inventorySQL = '-- ВІДНОВЛЕННЯ INVENTORY LEVELS\n';
  inventorySQL += '-- DELETE FROM inventory_levels; -- ⚠️ ЗАКОМЕНТОВАНО ДЛЯ БЕЗПЕКИ\n\n';
  
  for (let i = 1; i < inventoryLines.length; i++) {
    const values = inventoryLines[i].replace(/"/g, '').split(',');
    if (values.length === inventoryHeaders.length && values.every(v => v.trim())) {
      const insertValues = values.map(v => isNaN(v) ? `'${v}'` : v).join(', ');
      inventorySQL += `INSERT OR REPLACE INTO inventory_levels (${inventoryHeaders.join(', ')}) VALUES (${insertValues});\n`;
    }
  }
  
  writeFileSync('restore-inventory.sql', inventorySQL, 'utf8');
  console.log('✅ Створено restore-inventory.sql');
  
  console.log('🎉 Тепер виконайте по порядку:');
  console.log('1. restore-ref-data.sql - довідкові таблиці');
  console.log('2. restore-part-01.sql до restore-part-03.sql - продажі');
  console.log('3. restore-inventory.sql - залишки');
  
} catch (error) {
  console.error('❌ Помилка:', error.message);
}