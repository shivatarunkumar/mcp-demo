-- Run this script as a superuser (e.g. postgres)

-- Create database
CREATE DATABASE datamanager;

-- Create user 'tarun' with password
CREATE USER tarun WITH PASSWORD '12345';

-- Grant connection access to datamanager
GRANT CONNECT ON DATABASE datamanager TO tarun;

-- Allow creating databases and roles
ALTER USER tarun CREATEDB CREATEROLE;

-- !! Connect to datamanager before running the lines below !!
-- \c datamanager

-- Grant schema access on datamanager (required in PostgreSQL 15+)
GRANT USAGE, CREATE ON SCHEMA public TO tarun;

-- Grant all privileges on datamanager objects
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tarun;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tarun;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO tarun;

-- Grant privileges on future objects too
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO tarun;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO tarun;

-- =========================================
-- 1. USERS & ROLES (admin / user)
-- =========================================
CREATE TABLE users (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                   VARCHAR(255) NOT NULL UNIQUE,
    email_verified_at       TIMESTAMPTZ,

    password_hash           VARCHAR(255) NOT NULL,
    password_algo           VARCHAR(20) NOT NULL DEFAULT 'bcrypt',
    password_updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    role                    VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending_approval'
                                CHECK (status IN ('active', 'pending_approval', 'rejected', 'suspended', 'deactivated')),
    failed_login_attempts   SMALLINT NOT NULL DEFAULT 0,
    locked_until            TIMESTAMPTZ,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role ON users (role);


-- =========================================
-- 2. BQ CATALOG — synced from BigQuery (via scheduled job / API)
-- =========================================
CREATE TABLE bq_datasets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      VARCHAR(100) NOT NULL,          -- GCP project
    dataset_id      VARCHAR(255) NOT NULL,          -- BQ dataset name
    description     TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,  -- soft-disable if dataset removed from BQ
    last_synced_at   TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (project_id, dataset_id)
);

CREATE TABLE bq_tables (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id      UUID NOT NULL REFERENCES bq_datasets(id) ON DELETE CASCADE,
    table_id        VARCHAR(255) NOT NULL,           -- BQ table name
    description     TEXT,
    schema_json     JSONB,                            -- column list/types, synced from BQ
    row_count       BIGINT,
    size_bytes      BIGINT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (dataset_id, table_id)
);

CREATE INDEX idx_bq_tables_dataset ON bq_tables (dataset_id);


-- =========================================
-- 3. ACCESS REQUESTS (tickets) — dataset OR table scope
-- =========================================
CREATE TABLE access_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requested_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    scope_type      VARCHAR(10) NOT NULL CHECK (scope_type IN ('dataset', 'table')),
    dataset_id      UUID REFERENCES bq_datasets(id) ON DELETE CASCADE,
    table_id        UUID REFERENCES bq_tables(id) ON DELETE CASCADE,

    permission_type VARCHAR(10) NOT NULL CHECK (permission_type IN ('view', 'query', 'edit')),
    justification   TEXT,

    status          VARCHAR(10) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    reviewed_by     UUID REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    review_note     TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_requested_at TIMESTAMPTZ,                 -- optional: user asks for time-boxed access

    -- exactly one of dataset_id / table_id must be set, matching scope_type
    CONSTRAINT chk_scope_consistency CHECK (
        (scope_type = 'dataset' AND dataset_id IS NOT NULL AND table_id IS NULL) OR
        (scope_type = 'table'   AND table_id IS NOT NULL   AND dataset_id IS NULL)
    )
);

CREATE INDEX idx_access_requests_status ON access_requests (status);
CREATE INDEX idx_access_requests_user ON access_requests (requested_by);
CREATE INDEX idx_access_requests_reviewer ON access_requests (reviewed_by);


-- =========================================
-- 4. ACCESS GRANTS — the actual live permissions (created on approval)
-- =========================================
CREATE TABLE access_grants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    scope_type      VARCHAR(10) NOT NULL CHECK (scope_type IN ('dataset', 'table')),
    dataset_id      UUID REFERENCES bq_datasets(id) ON DELETE CASCADE,
    table_id        UUID REFERENCES bq_tables(id) ON DELETE CASCADE,

    permission_type VARCHAR(10) NOT NULL CHECK (permission_type IN ('view', 'query', 'edit')),

    source_request_id UUID REFERENCES access_requests(id),  -- traceability back to the ticket
    granted_by      UUID NOT NULL REFERENCES users(id),
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ,                              -- NULL = no expiry
    revoked_at      TIMESTAMPTZ,
    revoked_by      UUID REFERENCES users(id),

    CONSTRAINT chk_grant_scope_consistency CHECK (
        (scope_type = 'dataset' AND dataset_id IS NOT NULL AND table_id IS NULL) OR
        (scope_type = 'table'   AND table_id IS NOT NULL   AND dataset_id IS NULL)
    )
);

-- prevents duplicate active grants for same user+scope+permission
CREATE UNIQUE INDEX uq_active_grant ON access_grants (user_id, scope_type, COALESCE(dataset_id, table_id), permission_type)
    WHERE revoked_at IS NULL;

CREATE INDEX idx_access_grants_user ON access_grants (user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_access_grants_dataset ON access_grants (dataset_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_access_grants_table ON access_grants (table_id) WHERE revoked_at IS NULL;


-- =========================================
-- 5. QUERY EXECUTION LOG — every BQ query run through the app
-- =========================================
CREATE TABLE query_execution_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,

    dataset_id          UUID REFERENCES bq_datasets(id),
    table_id            UUID REFERENCES bq_tables(id),        -- nullable: query might span multiple tables

    query_text          TEXT NOT NULL,
    bq_job_id           VARCHAR(255),                          -- BigQuery job ID for cross-referencing
    status               VARCHAR(15) NOT NULL CHECK (status IN ('success', 'failed', 'cancelled')),
    error_message        TEXT,

    bytes_processed      BIGINT,
    bytes_billed          BIGINT,
    estimated_cost_usd    NUMERIC(10,4),
    execution_time_ms     INTEGER,

    ip_address            INET,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_query_log_user ON query_execution_log (user_id, created_at DESC);
CREATE INDEX idx_query_log_dataset ON query_execution_log (dataset_id, created_at DESC);
CREATE INDEX idx_query_log_created ON query_execution_log (created_at DESC);


-- =========================================
-- 6. AUTH SESSION / REFRESH TOKENS (from earlier — still needed)
-- =========================================
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    device_info     VARCHAR(255),
    ip_address      INET,
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);


-- =========================================
-- 0. USER REGISTRATION REQUESTS — pre-approval holding table
-- =========================================
CREATE TABLE user_registration_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email               VARCHAR(255) NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,      -- hashed even here, never store plaintext
    password_algo       VARCHAR(20) NOT NULL DEFAULT 'argon2id',

    full_name           VARCHAR(255),
    justification        TEXT,                        -- why they need an account, optional

    status              VARCHAR(10) NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by         UUID REFERENCES users(id),
    reviewed_at         TIMESTAMPTZ,
    review_note         TEXT,

    -- once approved, points at the resulting live user row
    created_user_id     UUID REFERENCES users(id),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- prevents duplicate pending requests for the same email
CREATE UNIQUE INDEX uq_pending_registration_email ON user_registration_requests (email)
    WHERE status = 'pending';

CREATE INDEX idx_registration_status ON user_registration_requests (status);