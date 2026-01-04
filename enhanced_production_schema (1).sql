-- ============================================================================
-- PRODUCTION-GRADE DATABASE SCHEMA - PostgreSQL 16
-- Features: Partitioning, Advanced Indexing, RLS, Encryption, Optimization
-- Target: 10M+ transactions, 10K+ tenants, sub-100ms query latency
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";           -- Fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gist";        -- Advanced indexing
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- Query performance monitoring
CREATE EXTENSION IF NOT EXISTS "pgcrypto";          -- Encryption functions
CREATE EXTENSION IF NOT EXISTS "timescaledb";       -- Time-series optimization (optional but recommended)
CREATE EXTENSION IF NOT EXISTS "pg_partman";        -- Automatic partition management

-- ============================================================================
-- SECURITY: Row Level Security (RLS) Helper Functions
-- ============================================================================

-- Function to get current tenant from session
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if user is superadmin
CREATE OR REPLACE FUNCTION is_superadmin() RETURNS BOOLEAN AS $$
BEGIN
    RETURN COALESCE(current_setting('app.is_superadmin', TRUE)::BOOLEAN, FALSE);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- DOMAIN TYPES (Strong Typing)
-- ============================================================================

CREATE DOMAIN email AS TEXT 
    CHECK (VALUE ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$');

CREATE DOMAIN phone_dz AS TEXT 
    CHECK (VALUE ~ '^\+?213[0-9]{9}$' OR VALUE ~ '^0[5-7][0-9]{8}$');

CREATE DOMAIN money_amount AS NUMERIC(19,4) 
    CHECK (VALUE >= 0);

CREATE DOMAIN percentage AS NUMERIC(5,2) 
    CHECK (VALUE BETWEEN 0 AND 100);

CREATE DOMAIN currency_code AS CHAR(3) 
    CHECK (VALUE ~ '^[A-Z]{3}$');

-- ============================================================================
-- CORE ENTITIES WITH ENHANCED FEATURES
-- ============================================================================

-- Organizations (Multi-tenant Root)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    
    -- Business info
    business_type VARCHAR(50) NOT NULL,
    tax_id VARCHAR(50) UNIQUE,
    registration_number VARCHAR(50),
    
    -- Contact
    email email,
    phone phone_dz,
    address TEXT,
    city VARCHAR(100),
    country_code CHAR(2) DEFAULT 'DZ',
    
    -- Settings (JSONB for flexibility)
    settings JSONB DEFAULT '{
        "language": "ar",
        "currency": "DZD",
        "timezone": "Africa/Algiers",
        "tax_rate": 19.00,
        "low_stock_threshold": 10
    }'::jsonb,
    
    -- Subscription
    subscription_tier VARCHAR(20) DEFAULT 'trial',
    subscription_status VARCHAR(20) DEFAULT 'active',
    trial_ends_at TIMESTAMPTZ,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Full-text search (tsvector for performance)
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(slug, '')), 'B')
    ) STORED,
    
    -- Constraints
    CONSTRAINT valid_subscription_tier CHECK (subscription_tier IN ('trial','starter','professional','business','enterprise')),
    CONSTRAINT valid_subscription_status CHECK (subscription_status IN ('active','past_due','cancelled','suspended'))
) WITH (fillfactor = 90); -- Leave room for updates

-- Indexes
CREATE INDEX idx_organizations_slug ON organizations(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_subscription ON organizations(subscription_tier, subscription_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_search ON organizations USING gin(search_vector);
CREATE INDEX idx_organizations_created_at ON organizations(created_at DESC);

-- Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON organizations
    FOR ALL
    TO PUBLIC
    USING (id = current_tenant_id() OR is_superadmin());

-- ============================================================================
-- USERS & AUTHENTICATION (Separate from tenants)
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identifiers
    email email UNIQUE,
    phone phone_dz UNIQUE,
    
    -- Profile
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    
    -- Authentication
    password_hash VARCHAR(255) NOT NULL, -- Argon2id hash
    pin_code_hash VARCHAR(255), -- For quick POS login
    
    -- Security
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret TEXT, -- TOTP secret (encrypted)
    backup_codes TEXT[], -- Encrypted backup codes
    
    -- Session management
    last_login_at TIMESTAMPTZ,
    last_login_ip INET,
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ,
    
    -- Preferences
    preferred_language CHAR(2) DEFAULT 'ar',
    preferences JSONB DEFAULT '{}'::jsonb,
    
    -- Status
    email_verified_at TIMESTAMPTZ,
    phone_verified_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ,
    
    metadata JSONB DEFAULT '{}'::jsonb
) WITH (fillfactor = 85);

-- Indexes
CREATE UNIQUE INDEX idx_users_email ON users(LOWER(email)) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_phone ON users(phone) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_last_login ON users(last_login_at DESC);

-- ============================================================================
-- ORGANIZATION MEMBERS (User-to-Tenant Mapping)
-- ============================================================================

CREATE TABLE organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Role-based access
    role VARCHAR(20) DEFAULT 'staff' NOT NULL,
    
    -- Granular permissions (overrides role defaults)
    permissions JSONB DEFAULT '{}'::jsonb,
    
    -- Assignment
    assigned_location_id UUID, -- Will reference locations table
    
    -- Invitation tracking
    invited_by UUID REFERENCES users(id),
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    joined_at TIMESTAMPTZ,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    deactivated_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    UNIQUE(organization_id, user_id),
    
    CONSTRAINT valid_role CHECK (role IN ('owner','admin','manager','supervisor','staff','viewer'))
) WITH (fillfactor = 90);

-- Indexes
CREATE INDEX idx_org_members_org ON organization_members(organization_id) WHERE is_active = TRUE;
CREATE INDEX idx_org_members_user ON organization_members(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_org_members_role ON organization_members(organization_id, role);

-- RLS
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON organization_members
    FOR ALL TO PUBLIC
    USING (organization_id = current_tenant_id() OR is_superadmin());

-- ============================================================================
-- LOCATIONS (Multi-branch Support)
-- ============================================================================

CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,
    code VARCHAR(20), -- Short code for internal use
    
    -- Address
    address TEXT,
    city VARCHAR(100),
    wilaya VARCHAR(100),
    postal_code VARCHAR(20),
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    
    -- Contact
    phone phone_dz,
    email email,
    
    -- Settings
    settings JSONB DEFAULT '{}'::jsonb,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ,
    
    UNIQUE(organization_id, code)
) WITH (fillfactor = 90);

-- Indexes
CREATE INDEX idx_locations_org ON locations(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_locations_active ON locations(organization_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_locations_geo ON locations USING gist(ll_to_earth(latitude, longitude)) 
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL; -- Geospatial queries

-- RLS
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON locations FOR ALL TO PUBLIC
    USING (organization_id = current_tenant_id() OR is_superadmin());

-- ============================================================================
-- PRODUCTS (with Advanced Search)
-- ============================================================================

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    category_id UUID,
    
    -- Identification
    sku VARCHAR(100),
    barcode VARCHAR(50),
    
    -- Names (multi-language)
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    name_fr VARCHAR(255),
    description TEXT,
    
    -- Pricing
    cost_price money_amount DEFAULT 0,
    sell_price money_amount NOT NULL,
    compare_at_price money_amount, -- For showing discounts
    
    -- Computed margin
    markup_percentage percentage GENERATED ALWAYS AS (
        CASE WHEN cost_price > 0 
        THEN ((sell_price - cost_price) / cost_price * 100)::NUMERIC(5,2)
        ELSE 0 END
    ) STORED,
    
    -- Tax
    tax_rate percentage DEFAULT 19.00,
    tax_included BOOLEAN DEFAULT TRUE,
    
    -- Inventory
    track_inventory BOOLEAN DEFAULT TRUE,
    unit_of_measure VARCHAR(20) DEFAULT 'unit',
    
    -- Reordering
    reorder_level INT DEFAULT 10,
    reorder_quantity INT DEFAULT 50,
    
    -- Product attributes
    is_perishable BOOLEAN DEFAULT FALSE,
    shelf_life_days INT,
    
    -- Images
    image_url TEXT,
    images JSONB DEFAULT '[]'::jsonb, -- Array of image URLs
    
    -- Variants
    has_variants BOOLEAN DEFAULT FALSE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    published_at TIMESTAMPTZ,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ,
    
    -- Search optimization
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(name_ar, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(name_fr, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(sku, '')), 'B') ||
        setweight(to_tsvector('simple', COALESCE(barcode, '')), 'B') ||
        setweight(to_tsvector('simple', COALESCE(description, '')), 'C')
    ) STORED,
    
    metadata JSONB DEFAULT '{}'::jsonb,
    
    UNIQUE(organization_id, sku),
    UNIQUE(organization_id, barcode)
) WITH (fillfactor = 85); -- More updates expected

-- Advanced indexes
CREATE INDEX idx_products_org ON products(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_products_active ON products(organization_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_products_search ON products USING gin(search_vector);
CREATE INDEX idx_products_category ON products(category_id) WHERE category_id IS NOT NULL;

-- Partial index for low stock (highly selective)
CREATE INDEX idx_products_low_stock ON products(organization_id, reorder_level)
    WHERE track_inventory = TRUE AND is_active = TRUE;

-- Expression index for price sorting
CREATE INDEX idx_products_price ON products(organization_id, sell_price) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products FOR ALL TO PUBLIC
    USING (organization_id = current_tenant_id() OR is_superadmin());

-- ============================================================================
-- SALES (PARTITIONED by organization_id + date for massive scale)
-- ============================================================================

CREATE TABLE sales (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    location_id UUID NOT NULL,
    
    -- Sale identification
    sale_number VARCHAR(50) NOT NULL,
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE, -- For partitioning
    
    -- Amounts
    subtotal money_amount NOT NULL,
    tax_amount money_amount DEFAULT 0,
    discount_amount money_amount DEFAULT 0,
    total money_amount NOT NULL,
    
    -- Payment
    payment_method VARCHAR(20) NOT NULL,
    payment_status VARCHAR(20) DEFAULT 'completed',
    amount_paid money_amount NOT NULL,
    amount_change money_amount DEFAULT 0,
    
    -- Customer (denormalized for performance)
    customer_id UUID,
    customer_name VARCHAR(255),
    customer_phone phone_dz,
    
    -- Context
    completed_by UUID NOT NULL,
    completed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    shift_id UUID,
    
    -- Status
    status VARCHAR(20) DEFAULT 'completed',
    voided_at TIMESTAMPTZ,
    voided_by UUID,
    voided_reason TEXT,
    
    refunded_at TIMESTAMPTZ,
    refunded_by UUID,
    refunded_amount money_amount DEFAULT 0,
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Primary key includes partition key
    PRIMARY KEY (organization_id, sale_date, id),
    
    CONSTRAINT valid_payment_method CHECK (payment_method IN ('cash','card','bank_transfer','cheque','credit','multiple')),
    CONSTRAINT valid_status CHECK (status IN ('draft','completed','voided','refunded'))
    
) PARTITION BY RANGE (sale_date);

-- Create partitions (automated via pg_partman)
-- Example: Create monthly partitions
SELECT partman.create_parent(
    p_parent_table => 'public.sales',
    p_control => 'sale_date',
    p_type => 'native',
    p_interval => 'monthly',
    p_premake => 3, -- Create 3 months ahead
    p_start_partition => '2025-01-01'
);

-- Indexes on partitioned table
CREATE INDEX idx_sales_org_date ON sales(organization_id, sale_date DESC, id);
CREATE INDEX idx_sales_location ON sales(location_id, sale_date DESC);
CREATE INDEX idx_sales_completed_by ON sales(completed_by, sale_date DESC);
CREATE INDEX idx_sales_status ON sales(organization_id, status) WHERE status != 'completed';
CREATE INDEX idx_sales_shift ON sales(shift_id) WHERE shift_id IS NOT NULL;
CREATE INDEX idx_sales_customer ON sales(customer_id) WHERE customer_id IS NOT NULL;

-- BRIN index for time-series optimization (extremely efficient for chronological data)
CREATE INDEX idx_sales_date_brin ON sales USING brin(sale_date) WITH (pages_per_range = 128);

-- RLS
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sales FOR ALL TO PUBLIC
    USING (organization_id = current_tenant_id() OR is_superadmin());

-- ============================================================================
-- SALE ITEMS (Optimized for fast inserts)
-- ============================================================================

CREATE TABLE sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL,
    organization_id UUID NOT NULL, -- For RLS
    product_id UUID NOT NULL,
    variant_id UUID,
    
    -- Product snapshot
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100),
    
    -- Pricing
    quantity NUMERIC(12,4) NOT NULL CHECK (quantity > 0),
    unit_price money_amount NOT NULL,
    cost_price money_amount DEFAULT 0,
    
    discount_amount money_amount DEFAULT 0,
    tax_rate percentage DEFAULT 0,
    
    -- Calculated
    line_total money_amount NOT NULL,
    tax_amount money_amount DEFAULT 0,
    
    -- Profit calculation
    profit money_amount GENERATED ALWAYS AS (
        (unit_price * quantity) - (cost_price * quantity) - discount_amount
    ) STORED,
    
    -- Notes
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
) WITH (fillfactor = 100); -- No updates expected, optimize for inserts

-- Indexes
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id, created_at DESC);

-- Covering index for common query pattern
CREATE INDEX idx_sale_items_analytics ON sale_items(organization_id, created_at DESC)
    INCLUDE (product_id, quantity, line_total, profit);

-- RLS
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sale_items FOR ALL TO PUBLIC
    USING (organization_id = current_tenant_id() OR is_superadmin());

-- ============================================================================
-- STOCK LEVELS (Real-time inventory)
-- ============================================================================

CREATE TABLE stock_levels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    location_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    
    -- Quantities
    quantity_on_hand NUMERIC(12,4) DEFAULT 0 CHECK (quantity_on_hand >= 0),
    quantity_reserved NUMERIC(12,4) DEFAULT 0 CHECK (quantity_reserved >= 0),
    quantity_available NUMERIC(12,4) GENERATED ALWAYS AS (
        quantity_on_hand - quantity_reserved
    ) STORED,
    
    -- Valuation
    average_cost money_amount DEFAULT 0,
    total_value money_amount GENERATED ALWAYS AS (
        quantity_on_hand * average_cost
    ) STORED,
    
    -- Audit
    last_counted_at TIMESTAMPTZ,
    last_counted_by UUID,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    UNIQUE(location_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID))
) WITH (fillfactor = 70); -- Frequent updates

-- Indexes
CREATE INDEX idx_stock_levels_location ON stock_levels(location_id, product_id);
CREATE INDEX idx_stock_levels_product ON stock_levels(product_id);

-- Alert index (low stock)
CREATE INDEX idx_stock_levels_low_stock ON stock_levels(organization_id, quantity_available)
    WHERE quantity_available < 10;

-- RLS
ALTER TABLE stock_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stock_levels FOR ALL TO PUBLIC
    USING (organization_id = current_tenant_id() OR is_superadmin());

-- ============================================================================
-- STOCK MOVEMENTS (Immutable Audit Trail - Time-Series Optimized)
-- ============================================================================

CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    location_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    
    -- Movement details
    movement_type VARCHAR(20) NOT NULL,
    quantity NUMERIC(12,4) NOT NULL, -- Can be negative
    unit_cost money_amount DEFAULT 0,
    
    -- Reference
    reference_type VARCHAR(50),
    reference_id UUID,
    related_location_id UUID,
    
    -- Notes
    notes TEXT,
    
    -- Audit (immutable)
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    metadata JSONB DEFAULT '{}'::jsonb,
    
    CONSTRAINT valid_movement_type CHECK (movement_type IN (
        'sale','purchase','adjustment','transfer_out','transfer_in',
        'damage','return','sample','manufacturing','return_to_supplier'
    ))
) WITH (fillfactor = 100); -- Never updated

-- Time-series optimized indexes
CREATE INDEX idx_stock_movements_location ON stock_movements(location_id, created_at DESC);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id, created_at DESC);
CREATE INDEX idx_stock_movements_type ON stock_movements(organization_id, movement_type, created_at DESC);
CREATE INDEX idx_stock_movements_reference ON stock_movements(reference_type, reference_id);

-- BRIN for time-series
CREATE INDEX idx_stock_movements_time_brin ON stock_movements USING brin(created_at) 
    WITH (pages_per_range = 128);

-- RLS
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stock_movements FOR ALL TO PUBLIC
    USING (organization_id = current_tenant_id() OR is_superadmin());

-- ============================================================================
-- OPTIMIZED MATERIALIZED VIEWS FOR ANALYTICS
-- ============================================================================

-- Top Products (Refreshed daily)
CREATE MATERIALIZED VIEW mv_top_products AS
SELECT 
    p.organization_id,
    p.id as product_id,
    p.name as product_name,
    p.sell_price,
    COUNT(DISTINCT si.sale_id) as times_sold,
    SUM(si.quantity) as total_quantity_sold,
    SUM(si.line_total) as total_revenue,
    SUM(si.profit) as total_profit,
    AVG(si.unit_price) as avg_selling_price,
    DATE_TRUNC('day', si.created_at) as date
FROM products p
JOIN sale_items si ON p.id = si.product_id
WHERE si.created_at >= NOW() - INTERVAL '30 days'
GROUP BY p.organization_id, p.id, p.name, p.sell_price, DATE_TRUNC('day', si.created_at);

CREATE UNIQUE INDEX idx_mv_top_products ON mv_top_products(organization_id, product_id, date);
CREATE INDEX idx_mv_top_products_date ON mv_top_products(date DESC);

-- Auto-refresh (scheduled job)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_top_products;

-- ============================================================================
-- PERFORMANCE OPTIMIZATION FUNCTIONS
-- ============================================================================

-- Function to update search vectors (called by trigger)
CREATE OR REPLACE FUNCTION update_search_vector() RETURNS TRIGGER AS $$
BEGIN
    -- Already handled by GENERATED column, but kept for manual updates if needed
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_organizations_timestamp BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_timestamp BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_locations_timestamp BEFORE UPDATE ON locations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_timestamp BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_timestamp BEFORE UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PERFORMANCE TUNING & STATISTICS
-- ============================================================================

-- Increase statistics target for frequently queried columns
ALTER TABLE products ALTER COLUMN name SET STATISTICS 1000;
ALTER TABLE sales ALTER COLUMN completed_at SET STATISTICS 1000;
ALTER TABLE stock_movements ALTER COLUMN created_at SET STATISTICS 1000;

-- Analyze tables for query planner
ANALYZE organizations;
ANALYZE users;
ANALYZE products;
ANALYZE sales;
ANALYZE sale_items;
ANALYZE stock_levels;
ANALYZE stock_movements;

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE organizations IS 'Multi-tenant root - each business/merchant';
COMMENT ON TABLE users IS 'Global users table - not tenant-specific';
COMMENT ON TABLE sales IS 'Partitioned sales table for massive scale (millions of records)';
COMMENT ON TABLE stock_movements IS 'Immutable audit trail - never updated, optimized for time-series';
COMMENT ON COLUMN products.search_vector IS 'Full-text search index - updated automatically';
COMMENT ON COLUMN sales.sale_date IS 'Partition key - ensures efficient querying by date range';

-- ============================================================================
-- DATABASE MAINTENANCE POLICIES
-- ============================================================================

-- Auto-vacuum settings for high-write tables
ALTER TABLE sales SET (
    autovacuum_vacuum_scale_factor = 0.01,
    autovacuum_analyze_scale_factor = 0.005
);

ALTER TABLE stock_movements SET (
    autovacuum_vacuum_scale_factor = 0.02,
    autovacuum_analyze_scale_factor = 0.01
);

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
-- ============================================================================
-- WEBHOOKS (for integrations)
-- ============================================================================

CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    target_url TEXT NOT NULL,
    event_types TEXT[] NOT NULL,
    secret_encrypted BYTEA NOT NULL, -- Encrypted with pgcrypto
    is_active BOOLEAN DEFAULT TRUE,
    last_failure_at TIMESTAMPTZ,
    failure_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_webhooks_org ON webhooks(organization_id) WHERE is_active = TRUE;
CREATE INDEX idx_webhooks_events ON webhooks USING gin(event_types);

-- RLS
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhooks FOR ALL TO PUBLIC
    USING (organization_id = current_tenant_id() OR is_superadmin());

-- Trigger for updated_at
CREATE TRIGGER update_webhooks_timestamp BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
