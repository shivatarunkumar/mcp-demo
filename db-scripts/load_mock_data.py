import psycopg2
import csv
import os

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "retaildb",
    "user": "tarun",
    "password": "12345"
}

MOCK_DATA_DIR = os.path.join(os.path.dirname(__file__), "mock-data")

FILES = [
    ("customers.csv",    "customers",    ["id", "name", "email", "phone", "city", "created_at"]),
    ("products.csv",     "products",     ["id", "name", "category", "price", "stock"]),
    ("orders.csv",       "orders",       ["id", "customer_id", "order_date", "status", "total"]),
    ("transactions.csv", "transactions", ["id", "order_id", "amount", "payment_method", "transaction_date", "status"]),
    ("reviews.csv",      "reviews",      ["id", "customer_id", "product_id", "rating", "comment", "created_at"]),
]

def load_csv(cursor, filename, table, columns):
    filepath = os.path.join(MOCK_DATA_DIR, filename)
    cols = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))

    with open(filepath, newline="") as f:
        reader = csv.DictReader(f)
        rows = [[row[col] for col in columns] for row in reader]

    cursor.executemany(
        f"INSERT INTO {table} ({cols}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING",
        rows
    )
    print(f"Loaded {len(rows)} rows into '{table}'")

def main():
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False

    try:
        with conn.cursor() as cur:
            for filename, table, columns in FILES:
                load_csv(cur, filename, table, columns)
        conn.commit()
        print("\nAll data loaded successfully.")
    except Exception as e:
        conn.rollback()
        print(f"\nError: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    main()
