import { execSync } from "node:child_process";

// Функція для додавання логу в базу
export function addChangeLog({
  operation_type,
  table_name, 
  record_id = null,
  sku = null,
  field_name = null,
  old_value = null,
  new_value = null,
  source = 'script',
  additional_data = null
}) {
  try {
    const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
    const additionalJson = additional_data ? JSON.stringify(additional_data) : null;
    
    const sql = `
      INSERT INTO change_logs (
        timestamp, operation_type, table_name, record_id, sku,
        field_name, old_value, new_value, source, additional_data
      ) VALUES (
        '${timestamp}',
        '${operation_type}',
        '${table_name}',
        ${record_id || 'NULL'},
        ${sku ? `'${sku}'` : 'NULL'},
        ${field_name ? `'${field_name}'` : 'NULL'},
        ${old_value ? `'${old_value}'` : 'NULL'},
        ${new_value ? `'${new_value}'` : 'NULL'},
        '${source}',
        ${additionalJson ? `'${additionalJson.replace(/'/g, "''")}'` : 'NULL'}
      )
    `;
    
    execSync(`wrangler d1 execute hoodie-sales --remote --command "${sql}"`, { encoding: 'utf8' });
    console.log(`📝 Лог додано: ${operation_type} ${table_name} ${sku || record_id}`);
  } catch (error) {
    console.error('❌ Помилка додавання логу:', error.message);
  }
}

// Функція для логування початку/кінця операцій
export function logOperation(operation, details = {}) {
  addChangeLog({
    operation_type: 'OPERATION',
    table_name: 'system',
    field_name: operation,
    new_value: 'START',
    source: 'script',
    additional_data: {
      operation,
      timestamp: new Date().toISOString(),
      ...details
    }
  });
}

export function logOperationComplete(operation, details = {}) {
  addChangeLog({
    operation_type: 'OPERATION',
    table_name: 'system', 
    field_name: operation,
    new_value: 'COMPLETE',
    source: 'script',
    additional_data: {
      operation,
      timestamp: new Date().toISOString(),
      ...details
    }
  });
}

// Функція для логування оновлення залишків
export function logStockUpdate(sku, oldStock, newStock, oldReserve, newReserve, source = 'keycrm_sync') {
  if (oldStock !== newStock) {
    addChangeLog({
      operation_type: 'UPDATE',
      table_name: 'inventory_levels',
      sku,
      field_name: 'in_stock',
      old_value: String(oldStock),
      new_value: String(newStock),
      source,
      additional_data: {
        old_reserve: oldReserve,
        new_reserve: newReserve
      }
    });
  }
  
  if (oldReserve !== newReserve) {
    addChangeLog({
      operation_type: 'UPDATE', 
      table_name: 'inventory_levels',
      sku,
      field_name: 'in_reserve',
      old_value: String(oldReserve),
      new_value: String(newReserve),
      source,
      additional_data: {
        old_stock: oldStock,
        new_stock: newStock
      }
    });
  }
}