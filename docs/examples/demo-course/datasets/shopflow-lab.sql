-- Jeu de données FICTIF du cours de démonstration (villes et noms fictifs, montants en DH).
-- Chargé dans la base de laboratoire à l'import du cours.
CREATE TABLE customers (
  customer_id text PRIMARY KEY,
  name text NOT NULL,
  city text NOT NULL,
  signup_date date NOT NULL
);
CREATE TABLE orders (
  order_id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers (customer_id),
  order_date date NOT NULL,
  total numeric(10, 2) NOT NULL,
  shipping_fee numeric(10, 2) NOT NULL
);
CREATE TABLE order_items (
  item_id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders (order_id),
  product text NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric(10, 2) NOT NULL
);
INSERT INTO customers VALUES
  ('K-01', 'Salma', 'Tanzar', '2026-01-12'), ('K-02', 'Youssef', 'Oued Lmal', '2026-02-03'),
  ('K-03', 'Nadia', 'Tanzar', '2026-02-20'), ('K-04', 'Hamza', 'Bir Nour', '2026-03-05'),
  ('K-05', 'Inès', 'Oued Lmal', '2026-03-18'), ('K-06', 'Karim', 'Bir Nour', '2026-04-01');
INSERT INTO orders VALUES
  ('C-101', 'K-01', '2026-10-20', 250.00, 30.00), ('C-102', 'K-02', '2026-10-20', 180.00, 40.00),
  ('C-103', 'K-03', '2026-10-21', 320.00, 30.00), ('C-104', 'K-04', '2026-10-21', 95.50, 25.00),
  ('C-105', 'K-05', '2026-10-22', 410.00, 40.00), ('C-106', 'K-06', '2026-10-23', 150.00, 25.00),
  ('C-107', 'K-01', '2026-10-24', 75.00, 30.00), ('C-108', 'K-03', '2026-10-24', 600.00, 0.00);
INSERT INTO order_items VALUES
  ('I-1', 'C-101', 'Tapis berbère', 1, 200.00), ('I-2', 'C-101', 'Théière', 1, 50.00),
  ('I-3', 'C-102', 'Lanterne', 2, 90.00), ('I-4', 'C-103', 'Pouf en cuir', 2, 160.00),
  ('I-5', 'C-104', 'Verres à thé', 6, 15.92), ('I-6', 'C-105', 'Plateau en cuivre', 1, 410.00),
  ('I-7', 'C-106', 'Coussin', 3, 50.00), ('I-8', 'C-107', 'Savon noir', 5, 15.00),
  ('I-9', 'C-108', 'Table basse', 1, 450.00), ('I-10', 'C-108', 'Miroir', 1, 150.00);
