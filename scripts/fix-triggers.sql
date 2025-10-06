-- ВИПРАВЛЕННЯ ТРИГЕРІВ ДЛЯ SALES (БЕЗ ID КОЛОНКИ)

-- Видаляємо старі тригери з помилками
DROP TRIGGER IF EXISTS log_sales_insert;
DROP TRIGGER IF EXISTS log_sales_update;  
DROP TRIGGER IF EXISTS log_sales_delete;

-- Створюємо ПРАВИЛЬНІ тригери для sales (без NEW.id)
CREATE TRIGGER IF NOT EXISTS log_sales_insert_fixed
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
    NULL, -- У sales немає id, тому NULL
    pv.sku,
    'quantity',
    CAST(NEW.quantity AS TEXT),
    'webhook',
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

CREATE TRIGGER IF NOT EXISTS log_sales_update_fixed
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
    NULL, -- У sales немає id, тому NULL
    pv.sku,
    'quantity',
    CAST(OLD.quantity AS TEXT),
    CAST(NEW.quantity AS TEXT),
    'webhook',
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

CREATE TRIGGER IF NOT EXISTS log_sales_delete_fixed
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
    NULL, -- У sales немає id, тому NULL
    pv.sku,
    'quantity',
    CAST(OLD.quantity AS TEXT),
    'webhook',
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