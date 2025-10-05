import fs from "node:fs/promises";
import { execSync } from "node:child_process";
import axios from "axios";
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Читаємо .env файл якщо він є
try {
  const envPath = path.join(rootDir, '.env');
  const envContent = await fs.readFile(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0 && key.trim() && !key.startsWith('#')) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  }
} catch (error) {
  // .env файл необов'язковий
}

const token = process.env.KEYCRM_API_TOKEN;
if (!token) {
  console.error('❌ KEYCRM_API_TOKEN не встановлено!');
  console.error('📝 Створіть файл .env з вашим KeyCRM API токеном:');
  console.error('   echo "KEYCRM_API_TOKEN=your_token_here" > .env');
  process.exit(1);
}

// Отримуємо всі KUF артикули з бази
function getKufSkus() {
  const output = execSync('wrangler d1 execute hoodie-sales --remote --command "SELECT sku FROM product_variants WHERE sku LIKE \'KUF%\'" --json', { encoding: 'utf8' });
  const json = JSON.parse(output);
  return (json[0]?.results ?? []).map(row => row.sku).filter(Boolean);
}

const TARGET_SKUS = getKufSkus();

async function fetchStock(sku) {
  try {
    const params = new URLSearchParams({ limit: '1', page: '1', 'filter[offers_sku]': sku });
    const url = `https://openapi.keycrm.app/v1/offers/stocks?${params.toString()}`;
    
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });
    
    const json = response.data;
    const record = (json.data ?? json.items ?? [])[0];
    if (!record) {
      return { sku, in_stock: 0, in_reserve: 0, found: false };
    }
    
    const balance = record.balance ?? record.stocks ?? record;
    const inStock = Number(balance?.in_stock ?? balance?.available ?? balance?.stock ?? balance?.quantity ?? 0);
    const inReserve = Number(balance?.in_reserve ?? balance?.reserve ?? 0);
    return { sku: record?.sku ?? sku, in_stock: inStock, in_reserve: inReserve, found: true };
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      throw new Error(`KeyCRM ${status} ${error.response.statusText}: ${JSON.stringify(data)}`);
    }
    throw error;
  }
}

console.log(`🔍 Знайдено ${TARGET_SKUS.length} KUF артикулів для оновлення...`);

const stocksPath = 'data/latest-stocks.json';
let data = [];
try {
  data = JSON.parse(await fs.readFile(stocksPath, 'utf8'));
} catch (error) {
  console.log('📁 Створюємо новий файл stocks...');
  await fs.mkdir('data', { recursive: true });
}

const bySku = new Map(data.map(item => [item.sku, item]));
let updated = 0;
let errors = 0;

for (const sku of TARGET_SKUS) {
  try {
    const stock = await fetchStock(sku);
    bySku.set(stock.sku, stock);
    
    if (stock.found) {
      console.log(`✅ ${stock.sku}: ${stock.in_stock} в наявності, ${stock.in_reserve} в резерві`);
      updated++;
    } else {
      console.log(`⚠️  ${stock.sku}: не знайдено в KeyCRM`);
    }
    
    // Пауза між запитами
    await new Promise(resolve => setTimeout(resolve, 200));
  } catch (error) {
    console.error(`❌ Помилка для ${sku}:`, error.message);
    errors++;
  }
}

await fs.writeFile(stocksPath, JSON.stringify(Array.from(bySku.values()), null, 2), 'utf8');

// Оновлюємо залишки в базі D1
console.log(`\n🔄 Оновлюємо залишки в базі D1...`);
let dbUpdated = 0;
let dbErrors = 0;

for (const [sku, stock] of bySku) {
  if (!sku.startsWith('KUF')) continue;
  
  try {
    const updateCommand = `
      UPDATE inventory_levels 
      SET in_stock = ${stock.in_stock}, 
          in_reserve = ${stock.in_reserve}, 
          updated_at = '${new Date().toISOString()}'
      WHERE variant_id = (
        SELECT id FROM product_variants WHERE sku = '${sku}'
      );
    `;
    
    const result = execSync(`wrangler d1 execute hoodie-sales --remote --command "${updateCommand}"`, { encoding: 'utf8' });
    console.log(`✅ D1 оновлено ${sku}: ${stock.in_stock}/${stock.in_reserve}`);
    dbUpdated++;
  } catch (error) {
    console.error(`❌ D1 помилка для ${sku}:`, error.message);
    dbErrors++;
  }
}

console.log(`\n📊 Підсумок:`);
console.log(`✅ KeyCRM оновлено: ${updated} артикулів`);
console.log(`✅ D1 оновлено: ${dbUpdated} записів`);
console.log(`❌ Помилок: ${errors + dbErrors}`);
console.log(`💾 Збережено в: ${stocksPath}`);
