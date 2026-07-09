-- =========================================
-- DATA ACCESS CONTROL TABLES
-- Run against: datamanager database
-- =========================================

-- Catalog of available PostgreSQL databases users can request access to
CREATE TABLE pg_databases (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catalog of tables within each registered database
CREATE TABLE pg_tables_catalog (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    database_id UUID NOT NULL REFERENCES pg_databases(id) ON DELETE CASCADE,
    table_name  VARCHAR(255) NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (database_id, table_name)
);

CREATE INDEX idx_pg_tables_catalog_db ON pg_tables_catalog (database_id);

-- Access requests: users request DB-level or table-level access
CREATE TABLE db_access_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope_type    VARCHAR(10) NOT NULL CHECK (scope_type IN ('database', 'table')),
    database_id   UUID REFERENCES pg_databases(id),
    table_id      UUID REFERENCES pg_tables_catalog(id),
    justification TEXT,
    status        VARCHAR(10) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by   UUID REFERENCES users(id),
    reviewed_at   TIMESTAMPTZ,
    review_note   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_db_access_requests_user   ON db_access_requests (user_id, status);
CREATE INDEX idx_db_access_requests_status ON db_access_requests (status);

-- Active access grants: created when admin approves a request
CREATE TABLE db_access_grants (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope_type        VARCHAR(10) NOT NULL CHECK (scope_type IN ('database', 'table')),
    database_id       UUID REFERENCES pg_databases(id),
    table_id          UUID REFERENCES pg_tables_catalog(id),
    source_request_id UUID REFERENCES db_access_requests(id),
    granted_by        UUID NOT NULL REFERENCES users(id),
    granted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at        TIMESTAMPTZ,
    revoked_by        UUID REFERENCES users(id)
);

CREATE INDEX idx_db_access_grants_user ON db_access_grants (user_id) WHERE revoked_at IS NULL;

-- =========================================
-- SEED: register available data sources
-- =========================================

INSERT INTO pg_databases (name, description) VALUES
    ('retaildb', 'Retail operations database — customers, orders, products, transactions, reviews');

WITH db AS (SELECT id FROM pg_databases WHERE name = 'retaildb')
INSERT INTO pg_tables_catalog (database_id, table_name, description)
SELECT db.id, t.tname, t.tdesc FROM db,
(VALUES
    ('customers',    'Customer profiles and contact info'),
    ('products',     'Product catalog with pricing and stock levels'),
    ('orders',       'Customer orders with status and totals'),
    ('transactions', 'Payment transactions linked to orders'),
    ('reviews',      'Customer product reviews and ratings')
) AS t(tname, tdesc);
