-- Run this script as a superuser (e.g. postgres)

-- Create database
CREATE DATABASE retaildb;

-- Create user 'tarun' with password
CREATE USER tarun WITH PASSWORD '12345';

-- Grant connection access to retaildb
GRANT CONNECT ON DATABASE retaildb TO tarun;

-- Allow creating databases and roles
ALTER USER tarun CREATEDB CREATEROLE;

-- !! Connect to retaildb before running the lines below !!
-- \c retaildb

-- Grant schema access on retaildb (required in PostgreSQL 15+)
GRANT USAGE, CREATE ON SCHEMA public TO tarun;

-- Grant all privileges on retaildb objects
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tarun;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tarun;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO tarun;

-- Grant privileges on future objects too
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO tarun;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO tarun;
