-- Customers
CREATE TABLE public.customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(100),
  phone VARCHAR(20),
  city VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Products
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  category VARCHAR(50),
  price DECIMAL(10,2),
  stock INT
);

-- Orders
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id),
  order_date TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20),
  total DECIMAL(10,2)
);

-- Transactions
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  order_id INT REFERENCES orders(id),
  amount DECIMAL(10,2),
  payment_method VARCHAR(30),
  transaction_date TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20)
);