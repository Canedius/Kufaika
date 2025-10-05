
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
