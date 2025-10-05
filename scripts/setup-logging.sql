-- 📊 СИСТЕМА ЛОГУВАННЯ ЗМІН БАЗИ ДАНИХ

-- Таблиця для логування всіх змін
CREATE TABLE IF NOT EXISTS change_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  operation_type TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  table_name TEXT NOT NULL,
  record_id INTEGER,
  sku TEXT,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  source TEXT, -- 'webhook', 'manual', 'keycrm_sync', 'script'
  user_agent TEXT,
  ip_address TEXT,
  additional_data TEXT -- JSON для додаткової інформації
);

-- Індекси для швидкого пошуку
CREATE INDEX IF NOT EXISTS idx_change_logs_timestamp ON change_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_change_logs_sku ON change_logs(sku);
CREATE INDEX IF NOT EXISTS idx_change_logs_table ON change_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_change_logs_source ON change_logs(source);

-- Тригери для автоматичного логування змін в sales
CREATE TRIGGER IF NOT EXISTS log_sales_insert 
AFTER INSERT ON sales
BEGIN
  INSERT INTO change_logs (
    timestamp, operation_type, table_name, record_id, sku,
    field_name, new_value, source, additional_data
  )
  SELECT 
    datetime('now'),
    'INSERT',
    'sales',
    NEW.id,
    pv.sku,
    'quantity',
    CAST(NEW.quantity AS TEXT),
    'system',
    json_object(
      'product_id', NEW.product_id,
      'color_id', NEW.color_id, 
      'size_id', NEW.size_id,
      'period_id', NEW.period_id
    )
  FROM product_variants pv
  WHERE pv.product_id = NEW.product_id 
    AND pv.color_id = NEW.color_id 
    AND pv.size_id = NEW.size_id
  LIMIT 1;
END;

CREATE TRIGGER IF NOT EXISTS log_sales_update
AFTER UPDATE ON sales
BEGIN
  INSERT INTO change_logs (
    timestamp, operation_type, table_name, record_id, sku,
    field_name, old_value, new_value, source, additional_data
  )
  SELECT 
    datetime('now'),
    'UPDATE',
    'sales',
    NEW.id,
    pv.sku,
    'quantity',
    CAST(OLD.quantity AS TEXT),
    CAST(NEW.quantity AS TEXT),
    'system',
    json_object(
      'product_id', NEW.product_id,
      'color_id', NEW.color_id,
      'size_id', NEW.size_id, 
      'period_id', NEW.period_id
    )
  FROM product_variants pv
  WHERE pv.product_id = NEW.product_id
    AND pv.color_id = NEW.color_id
    AND pv.size_id = NEW.size_id
  LIMIT 1;
END;

CREATE TRIGGER IF NOT EXISTS log_sales_delete
AFTER DELETE ON sales  
BEGIN
  INSERT INTO change_logs (
    timestamp, operation_type, table_name, record_id, sku,
    field_name, old_value, source, additional_data
  )
  SELECT 
    datetime('now'),
    'DELETE', 
    'sales',
    OLD.id,
    pv.sku,
    'quantity',
    CAST(OLD.quantity AS TEXT),
    'system',
    json_object(
      'product_id', OLD.product_id,
      'color_id', OLD.color_id,
      'size_id', OLD.size_id,
      'period_id', OLD.period_id
    )
  FROM product_variants pv
  WHERE pv.product_id = OLD.product_id
    AND pv.color_id = OLD.color_id
    AND pv.size_id = OLD.size_id
  LIMIT 1;
END;

-- Тригери для логування змін inventory_levels
CREATE TRIGGER IF NOT EXISTS log_inventory_update
AFTER UPDATE ON inventory_levels
BEGIN
  INSERT INTO change_logs (
    timestamp, operation_type, table_name, record_id, sku,
    field_name, old_value, new_value, source, additional_data
  )
  SELECT 
    datetime('now'),
    'UPDATE',
    'inventory_levels',
    NEW.variant_id,
    pv.sku,
    CASE 
      WHEN OLD.in_stock != NEW.in_stock THEN 'in_stock'
      WHEN OLD.in_reserve != NEW.in_reserve THEN 'in_reserve'
      ELSE 'updated'
    END,
    CASE 
      WHEN OLD.in_stock != NEW.in_stock THEN CAST(OLD.in_stock AS TEXT)
      WHEN OLD.in_reserve != NEW.in_reserve THEN CAST(OLD.in_reserve AS TEXT)
      ELSE 'unknown'
    END,
    CASE 
      WHEN OLD.in_stock != NEW.in_stock THEN CAST(NEW.in_stock AS TEXT)
      WHEN OLD.in_reserve != NEW.in_reserve THEN CAST(NEW.in_reserve AS TEXT)  
      ELSE 'unknown'
    END,
    'system',
    json_object(
      'old_in_stock', OLD.in_stock,
      'new_in_stock', NEW.in_stock,
      'old_in_reserve', OLD.in_reserve,
      'new_in_reserve', NEW.in_reserve
    )
  FROM product_variants pv
  WHERE pv.id = NEW.variant_id;
END;