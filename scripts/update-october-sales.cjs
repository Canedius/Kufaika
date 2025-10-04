'use strict';

const fs = require('fs');
const path = require('path');

const TARGET_MONTH = 'Жовтень';
const TARGET_YEAR = 2025;

const MONTH_ORDER = new Map([
  ['Січень', 1],
  ['Лютий', 2],
  ['Березень', 3],
  ['Квітень', 4],
  ['Травень', 5],
  ['Червень', 6],
  ['Липень', 7],
  ['Серпень', 8],
  ['Вересень', 9],
  ['Жовтень', 10],
  ['Листопад', 11],
  ['Грудень', 12]
]);

const UPDATES = [
  {
    name: 'Світшот Утеплений Kufaika Unisex',
    colors: {
      'Чорний': [
        { size: 'XL', quantity: 3 },
        { size: 'M', quantity: 2 },
        { size: 'XS', quantity: 2 },
        { size: 'L', quantity: 1 }
      ],
      'Інший Колір': [
        { size: 'Інший розмір', quantity: 80 }
      ]
    }
  },
  {
    name: 'Худі Утеплений Kufaika Unisex',
    colors: {
      'Чорний': [
        { size: 'M', quantity: 41 },
        { size: 'L', quantity: 18 },
        { size: 'XXL', quantity: 5 },
        { size: 'S', quantity: 5 },
        { size: 'XL', quantity: 3 },
        { size: 'XS', quantity: 1 },
        { size: '3XL', quantity: 1 }
      ],
      'Ніжно-рожевий': [
        { size: 'M', quantity: 1 },
        { size: 'L', quantity: 1 },
        { size: 'XL', quantity: 1 }
      ],
      'Сірий Грі': [
        { size: 'L', quantity: 2 },
        { size: 'S', quantity: 1 },
        { size: 'M', quantity: 1 },
        { size: 'XXL', quantity: 1 }
      ]
    }
  },
  {
    name: 'Футболка Premium Kufaika',
    colors: {
      'Чорний': [
        { size: 'L', quantity: 23 },
        { size: 'M', quantity: 22 },
        { size: 'XXL', quantity: 10 },
        { size: 'XL', quantity: 10 },
        { size: 'S', quantity: 6 },
        { size: 'XS', quantity: 2 },
        { size: '3XL', quantity: 2 }
      ],
      'Білий': [
        { size: 'L', quantity: 6 },
        { size: 'M', quantity: 4 },
        { size: 'S', quantity: 2 },
        { size: 'XS', quantity: 2 },
        { size: 'XL', quantity: 2 },
        { size: 'XXL', quantity: 2 }
      ],
      'Олива': [
        { size: 'XL', quantity: 4 },
        { size: 'L', quantity: 4 },
        { size: 'M', quantity: 2 },
        { size: 'S', quantity: 1 },
        { size: '3XL', quantity: 1 }
      ],
      'Бежевий': [
        { size: 'L', quantity: 4 },
        { size: 'M', quantity: 3 },
        { size: 'XS', quantity: 2 },
        { size: 'S', quantity: 1 },
        { size: 'XL', quantity: 1 },
        { size: 'XXL', quantity: 1 }
      ],
      'Ніжно-рожевий': [
        { size: 'M', quantity: 2 },
        { size: 'L', quantity: 1 },
        { size: 'S', quantity: 1 }
      ],
      'Сірий': [
        { size: 'XS', quantity: 1 },
        { size: 'L', quantity: 1 }
      ],
      'Койот': [
        { size: 'L', quantity: 2 }
      ]
    }
  },
  {
    name: 'Еко сумка Kufaika',
    colors: {
      'Чорний': [
        { size: '38х40 см', quantity: 15 }
      ]
    }
  },
  {
    name: 'Футболка OVERSIZE Kufaika',
    colors: {
      'Чорний': [
        { size: 'M/L', quantity: 5 },
        { size: 'XL/XXL', quantity: 3 },
        { size: 'XS/S', quantity: 1 }
      ],
      'Білий': [
        { size: 'M/L', quantity: 4 },
        { size: 'XL/XXL', quantity: 4 }
      ]
    }
  },
  {
    name: 'Футболка Relaxed Kufaika',
    colors: {
      'Білий': [
        { size: 'M-L', quantity: 3 }
      ],
      'Чорний': [
        { size: 'XL-2XL', quantity: 1 },
        { size: 'M-L', quantity: 1 }
      ]
    }
  },
  {
    name: 'Худі Легкий Kufaika Unisex',
    colors: {
      'Чорний': [
        { size: 'S', quantity: 1 }
      ]
    }
  }
];

const filePath = path.join(__dirname, '..', 'sales.json');
const raw = fs.readFileSync(filePath, 'utf8');
const data = JSON.parse(raw);

function slugify(input) {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'item';
}

function ensureProduct(entry) {
  let product = data.products.find((p) => p.name === entry.name);
  if (product) {
    return product;
  }
  const nextId = data.products.reduce((max, current) => Math.max(max, Number(current.id) || 0), 0) + 1;
  const existingSlugs = new Set(data.products.map((p) => p.slug));
  const baseSlug = slugify(entry.name);
  let slugCandidate = baseSlug;
  let suffix = 1;
  while (existingSlugs.has(slugCandidate)) {
    slugCandidate = `${baseSlug}-${suffix++}`;
  }
  product = {
    id: nextId,
    name: entry.name,
    slug: slugCandidate,
    months: [],
    variants: [],
    inventory: {}
  };
  data.products.push(product);
  return product;
}

function buildMonth(entry) {
  const colors = {};
  for (const [colorName, rows] of Object.entries(entry.colors || {})) {
    colors[colorName] = rows.map((row) => ({
      size: row.size,
      quantity: Number(row.quantity) || 0
    }));
  }
  return {
    month: TARGET_MONTH,
    year: TARGET_YEAR,
    colors
  };
}

for (const entry of UPDATES) {
  const product = ensureProduct(entry);
  const newMonth = buildMonth(entry);
  const existingIndex = product.months.findIndex(
    (m) => Number(m.year) === TARGET_YEAR && m.month === TARGET_MONTH
  );
  if (existingIndex >= 0) {
    product.months[existingIndex] = newMonth;
  } else {
    product.months.push(newMonth);
  }
  product.months.sort((a, b) => {
    if (a.year !== b.year) {
      return Number(a.year) - Number(b.year);
    }
    const orderA = MONTH_ORDER.get(a.month) ?? 99;
    const orderB = MONTH_ORDER.get(b.month) ?? 99;
    return orderA - orderB;
  });
}

data.products.sort((a, b) => Number(a.id) - Number(b.id));

fs.writeFileSync(filePath, JSON.stringify(data));

console.log(`Updated October ${TARGET_YEAR} sales for ${UPDATES.length} products.`);
