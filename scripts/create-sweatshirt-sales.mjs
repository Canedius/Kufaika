import { writeFileSync } from 'fs';

console.log('📊 Створюємо правильні INSERT команди для жовтня 2025');

// Маппінги з бази даних
const products = {
  "Світшот Утеплений Kufaika Unisex": 2,
  "Худі Утеплений Kufaika Unisex": 8,
  "Футболка Premium Kufaika": 5,
  "Футболка OVERSIZE Kufaika": 4,
  "Футболка Relaxed Kufaika": 6,
  "Худі Легкий Kufaika Unisex": 7
};

const sizes = {
  "S": 1, "M": 2, "L": 3, "XL": 4, "XXL": 5, "3XL": 6, "XS": 7, "Інший": 8,
  "XS/S": 10, "M/L": 11, "XL/XXL": 12, "38х40 см": 8
};

const colors = {
  // Світшот Утеплений (product_id=2)
  2: {"Чорний": 2, "Білий": 3, "Інший колір": 4},
  
  // Футболка OVERSIZE (product_id=4) 
  4: {"Білий": 7, "Чорний": 8},
  
  // Футболка Premium (product_id=5)
  5: {"Білий": 9, "Чорний": 10, "Бежевий": 11, "Ніжно-рожевий": 12, "Олива": 13, "Сірий": 14, "Койот": 15},
  
  // Футболка Relaxed (product_id=6)
  6: {"Білий": 16, "Чорний": 17},
  
  // Худі Легкий (product_id=7)
  7: {"Чорний": 18},
  
  // Худі Утеплений (product_id=8)
  8: {"Чорний": 19, "Бежевий": 20, "Білий": 21, "Ніжно-рожевий": 22, "Олива": 23, "Сірий Грі": 24, "Інший Колір": 25, "Хакі": 26}
};

const salesData = {
  "products": [
    {
      "name": "Світшот Утеплений Kufaika Unisex",
      "months": [
        {
          "month": "Жовтень",
          "year": 2025,
          "colors": {
            "Інший колір": [
              {"size": "Інший", "quantity": 80}
            ],
            "Чорний": [
              {"size": "XL", "quantity": 3},
              {"size": "M", "quantity": 3},
              {"size": "L", "quantity": 1},
              {"size": "XS", "quantity": 2},
              {"size": "XXL", "quantity": 1}
            ]
          }
        }
      ]
    },
    {
      "name": "Худі Утеплений Kufaika Unisex",
      "months": [
        {
          "month": "Жовтень",
          "year": 2025,
          "colors": {
            "Чорний": [
              {"size": "M", "quantity": 49},
              {"size": "L", "quantity": 29},
              {"size": "S", "quantity": 7},
              {"size": "XL", "quantity": 7},
              {"size": "XXL", "quantity": 6},
              {"size": "3XL", "quantity": 3},
              {"size": "XS", "quantity": 2}
            ],
            "Ніжно-рожевий": [
              {"size": "M", "quantity": 3},
              {"size": "L", "quantity": 2},
              {"size": "S", "quantity": 2},
              {"size": "XL", "quantity": 1}
            ],
            "Сірий Грі": [
              {"size": "L", "quantity": 5},
              {"size": "S", "quantity": 4},
              {"size": "M", "quantity": 2},
              {"size": "XXL", "quantity": 2}
            ],
            "Хакі": [
              {"size": "L", "quantity": 1}
            ],
            "Бежевий": [
              {"size": "L", "quantity": 1}
            ],
            "Білий": [
              {"size": "L", "quantity": 1}
            ]
          }
        }
      ]
    },
    {
      "name": "Футболка Premium Kufaika",
      "months": [
        {
          "month": "Жовтень",
          "year": 2025,
          "colors": {
            "Чорний": [
              {"size": "L", "quantity": 26},
              {"size": "M", "quantity": 23},
              {"size": "XL", "quantity": 10},
              {"size": "S", "quantity": 10},
              {"size": "XXL", "quantity": 10},
              {"size": "3XL", "quantity": 2},
              {"size": "XS", "quantity": 2}
            ],
            "Білий": [
              {"size": "L", "quantity": 6},
              {"size": "M", "quantity": 5},
              {"size": "XL", "quantity": 4},
              {"size": "S", "quantity": 2},
              {"size": "XXL", "quantity": 2},
              {"size": "XS", "quantity": 2}
            ],
            "Бежевий": [
              {"size": "L", "quantity": 4},
              {"size": "M", "quantity": 3},
              {"size": "S", "quantity": 2},
              {"size": "XL", "quantity": 1},
              {"size": "XXL", "quantity": 1},
              {"size": "XS", "quantity": 2}
            ],
            "Олива": [
              {"size": "L", "quantity": 4},
              {"size": "M", "quantity": 2},
              {"size": "S", "quantity": 1},
              {"size": "3XL", "quantity": 1}
            ],
            "Ніжно-рожевий": [
              {"size": "S", "quantity": 3},
              {"size": "M", "quantity": 2},
              {"size": "L", "quantity": 1}
            ],
            "Сірий": [
              {"size": "L", "quantity": 1},
              {"size": "S", "quantity": 1},
              {"size": "XS", "quantity": 1}
            ],
            "Койот": [
              {"size": "L", "quantity": 2}
            ]
          }
        }
      ]
    },
    {
      "name": "Футболка OVERSIZE Kufaika",
      "months": [
        {
          "month": "Жовтень",
          "year": 2025,
          "colors": {
            "Чорний": [
              {"size": "M/L", "quantity": 5},
              {"size": "XL/XXL", "quantity": 3},
              {"size": "XS/S", "quantity": 1}
            ],
            "Білий": [
              {"size": "XL/XXL", "quantity": 4},
              {"size": "M/L", "quantity": 4},
              {"size": "XS/S", "quantity": 1}
            ]
          }
        }
      ]
    },
    {
      "name": "Футболка Relaxed Kufaika",
      "months": [
        {
          "month": "Жовтень",
          "year": 2025,
          "colors": {
            "Білий": [
              {"size": "M/L", "quantity": 4},
              {"size": "XS/S", "quantity": 1},
              {"size": "XL/XXL", "quantity": 1}
            ],
            "Чорний": [
              {"size": "XS/S", "quantity": 2},
              {"size": "M/L", "quantity": 1},
              {"size": "XL/XXL", "quantity": 2}
            ]
          }
        }
      ]
    },
    {
      "name": "Худі Легкий Kufaika Unisex",
      "months": [
        {
          "month": "Жовтень",
          "year": 2025,
          "colors": {
            "Чорний": [
              {"size": "S", "quantity": 1}
            ]
          }
        }
      ]
    }
  ]
};

let sql = `-- 📊 ОНОВЛЕННЯ ПРОДАЖІВ ЗА ЖОВТЕНЬ 2025\n`;
sql += `-- Використовуємо INSERT OR REPLACE для безпечного оновлення\n`;
sql += `-- DELETE FROM sales WHERE period_id = 37; -- ⚠️ ЗАКОМЕНТОВАНО ДЛЯ БЕЗПЕКИ\n\n`;

let totalRecords = 0;
let successRecords = 0;

salesData.products.forEach(product => {
  const productId = products[product.name];
  if (!productId) {
    console.log(`⚠️ Продукт "${product.name}" не знайдено`);
    return;
  }

  sql += `-- ${product.name} (ID: ${productId})\n`;
  
  product.months.forEach(month => {
    if (month.year === 2025 && month.month === "Жовтень") {
      Object.entries(month.colors).forEach(([colorName, sizeArray]) => {
        const colorId = colors[productId]?.[colorName];
        
        if (!colorId) {
          console.log(`⚠️ Колір "${colorName}" для продукту ${product.name} не знайдено`);
          return;
        }
        
        sizeArray.forEach(sizeData => {
          const sizeId = sizes[sizeData.size];
          
          if (!sizeId) {
            console.log(`⚠️ Розмір "${sizeData.size}" не знайдено`);
            return;
          }
          
          sql += `INSERT OR REPLACE INTO sales (product_id, color_id, size_id, period_id, quantity) VALUES (${productId}, ${colorId}, ${sizeId}, 37, ${sizeData.quantity}); -- ${colorName} ${sizeData.size}: ${sizeData.quantity}\n`;
          successRecords++;
        });
        
        totalRecords += sizeArray.length;
      });
    }
  });
  
  sql += `\n`;
});

sql += `-- Успішно створено ${successRecords} з ${totalRecords} записів\n`;

console.log(`📊 Створено ${successRecords} з ${totalRecords} записів`);

writeFileSync('update-sweatshirt-sales.sql', sql, 'utf8');
console.log('✅ Створено update-sweatshirt-sales.sql');