#!/usr/bin/env python3
"""
Seed the first admin user into the datamanager database.

Usage (from repo root):
    cd backend
    poetry run python ../data-manager/seed_admin.py

The script reads DATAMANAGER_DATABASE_URL from backend/.env automatically.
"""

import asyncio
import os
import sys
from pathlib import Path

# Load backend .env
env_path = Path(__file__).resolve().parents[1] / "backend" / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())

import bcrypt
import asyncpg

DATAMANAGER_URL = os.environ.get("DATAMANAGER_DATABASE_URL", "")

if not DATAMANAGER_URL:
    sys.exit("ERROR: DATAMANAGER_DATABASE_URL is not set in backend/.env")

# Convert asyncpg URL format
dsn = DATAMANAGER_URL.replace("postgresql+asyncpg://", "postgresql://")

ADMIN_EMAIL = os.environ.get("SEED_ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.environ.get("SEED_ADMIN_PASSWORD", "Admin@123")


async def seed():
    conn = await asyncpg.connect(dsn)
    try:
        existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", ADMIN_EMAIL)
        if existing:
            print(f"Admin user '{ADMIN_EMAIL}' already exists — skipping.")
            return

        pw_hash = bcrypt.hashpw(ADMIN_PASSWORD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        await conn.execute(
            """
            INSERT INTO users (email, password_hash, password_algo, role, status)
            VALUES ($1, $2, 'bcrypt', 'admin', 'active')
            """,
            ADMIN_EMAIL,
            pw_hash,
        )
        print(f"Admin user created:")
        print(f"  Email:    {ADMIN_EMAIL}")
        print(f"  Password: {ADMIN_PASSWORD}")
        print("Change the password after first login!")
    finally:
        await conn.close()


asyncio.run(seed())
