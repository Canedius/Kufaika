PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS sizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS colors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  UNIQUE(product_id, name),
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER,
  label TEXT NOT NULL,
  UNIQUE(year, label)
);

CREATE TABLE IF NOT EXISTS sales (
  product_id INTEGER NOT NULL,
  color_id INTEGER NOT NULL,
  size_id INTEGER NOT NULL,
  period_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  PRIMARY KEY (product_id, color_id, size_id, period_id),
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY(color_id) REFERENCES colors(id) ON DELETE CASCADE,
  FOREIGN KEY(size_id) REFERENCES sizes(id) ON DELETE CASCADE,
  FOREIGN KEY(period_id) REFERENCES periods(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  color_id INTEGER NOT NULL,
  size_id INTEGER NOT NULL,
  sku TEXT UNIQUE,
  offer_id INTEGER UNIQUE,
  UNIQUE(product_id, color_id, size_id),
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY(color_id) REFERENCES colors(id) ON DELETE CASCADE,
  FOREIGN KEY(size_id) REFERENCES sizes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_levels (
  variant_id INTEGER PRIMARY KEY,
  in_stock INTEGER NOT NULL,
  in_reserve INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_id INTEGER NOT NULL,
  in_stock INTEGER NOT NULL,
  in_reserve INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  source_uuid TEXT,
  global_source_uuid TEXT,
  last_status_id INTEGER,
  last_status_group_id INTEGER,
  last_status_changed_at TEXT,
  last_payload TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  status_id INTEGER NOT NULL,
  status_group_id INTEGER,
  status_label TEXT,
  event_type TEXT,
  occurred_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  is_negative INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);

CREATE TABLE IF NOT EXISTS order_event_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  variant_id INTEGER,
  sku TEXT,
  quantity INTEGER NOT NULL,
  price REAL,
  payload TEXT,
  FOREIGN KEY(event_id) REFERENCES order_events(id) ON DELETE CASCADE,
  FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_event_items_event ON order_event_items(event_id);
