-- Run this script connected to 'retaildb' as tarun
-- Loads mock data from CSV files into all 4 tables

\copy customers(id, name, email, phone, city, created_at) FROM 'mock-data/customers.csv' CSV HEADER;

\copy products(id, name, category, price, stock) FROM 'mock-data/products.csv' CSV HEADER;

\copy orders(id, customer_id, order_date, status, total) FROM 'mock-data/orders.csv' CSV HEADER;

\copy transactions(id, order_id, amount, payment_method, transaction_date, status) FROM 'mock-data/transactions.csv' CSV HEADER;
