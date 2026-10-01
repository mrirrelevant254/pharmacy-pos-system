-- 1. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_no VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('cashier', 'lab_tech', 'pharmacist', 'admin', 'doctor')),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Staff Cards Table (for RFID/NFC tap login)
CREATE TABLE staff_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    card_uid VARCHAR(100) UNIQUE NOT NULL,
    issued_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    active BOOLEAN DEFAULT TRUE
);

-- 3. Sessions Table (for tracking active logins and JWTs)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    method VARCHAR(50) NOT NULL CHECK (method IN ('password', 'card_pin')),
    issued_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

-- 4. Patients Table (Shared entity for both Pharmacy and Lab)
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20),
    national_id VARCHAR(50) UNIQUE,
    dob DATE,
    sex CHAR(1) CHECK (sex IN ('M', 'F', 'O')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 1. Products Table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    sku VARCHAR(50) UNIQUE,
    barcode VARCHAR(100) UNIQUE,
    category VARCHAR(50),
    reorder_level INT DEFAULT 10,
    reorder_qty INT DEFAULT 50,
    unit_price DECIMAL(10, 2) NOT NULL,
    requires_prescription BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Batches Table (Tracks stock with expiry dates for FEFO)
CREATE TABLE batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    batch_no VARCHAR(100) NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expiry_date DATE NOT NULL,
    cost_price DECIMAL(10, 2) NOT NULL
);

-- 3. Stock Movements Table (Single source of truth for inventory)
CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    delta INT NOT NULL, -- Positive for receiving, negative for sales/wastage
    reason VARCHAR(50) NOT NULL CHECK (reason IN ('receiving', 'sale', 'stock_take_adjustment', 'wastage', 'return')),
    ref_type VARCHAR(50), -- e.g., 'sale_id' or 'stock_take_id'
    ref_id UUID,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 1. Sales Table (The header for the transaction)
CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cashier_id UUID REFERENCES users(id) ON DELETE SET NULL,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('cash', 'mpesa', 'insurance')),
    total_amount DECIMAL(10, 2) NOT NULL,
    mpesa_ref VARCHAR(100),
    etims_invoice_no VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Sale Items Table (The individual items in the cart)
CREATE TABLE sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES batches(id) ON DELETE RESTRICT,
    qty INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL
);

-- 1. Lab Tests Catalog
CREATE TABLE lab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    sample_type VARCHAR(50) NOT NULL, -- e.g., 'Blood', 'Urine', 'Stool'
    price DECIMAL(10, 2) NOT NULL,
    ref_range_low DECIMAL(10, 2),
    ref_range_high DECIMAL(10, 2),
    unit VARCHAR(50),
    turnaround_hours INT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Lab Orders (The header for the request)
CREATE TABLE lab_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id) ON DELETE RESTRICT,
    ordered_by UUID REFERENCES users(id) ON DELETE SET NULL, -- Doctor/Admin
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'collected', 'in_progress', 'resulted', 'verified', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'routine' CHECK (priority IN ('routine', 'stat')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Lab Order Items (The specific tests requested in an order)
CREATE TABLE lab_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES lab_orders(id) ON DELETE CASCADE,
    test_id UUID REFERENCES lab_tests(id) ON DELETE RESTRICT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'collected', 'in_progress', 'resulted', 'verified')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Lab Samples (Physical tubes/specimens tracked by barcode)
CREATE TABLE lab_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID REFERENCES lab_order_items(id) ON DELETE CASCADE,
    barcode VARCHAR(100) UNIQUE NOT NULL,
    collected_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ
);

-- 5. Lab Results (The actual values entered by the lab tech)
CREATE TABLE lab_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID UNIQUE REFERENCES lab_order_items(id) ON DELETE CASCADE,
    value DECIMAL(10, 2),
    flag VARCHAR(20) CHECK (flag IN ('normal', 'abnormal', 'critical')),
    entered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    entered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMPTZ
);

-- 1. First, let's see what is currently in the batches table for Paracetamol
SELECT p.name, b.id, b.batch_no, b.quantity, b.expiry_date 
FROM products p 
LEFT JOIN batches b ON p.id = b.product_id 
WHERE p.name LIKE '%Paracetamol%';

-- 2. If the above shows NULLs or is empty, run this to fix it:
INSERT INTO batches (product_id, batch_no, quantity, expiry_date, created_at)
SELECT id, 'BATCH-001', 453, '2026-12-31', NOW()
FROM products 
WHERE name = 'Paracetamol 500mg'
ON CONFLICT DO NOTHING; -- Prevents duplicate errors if it already exists

-- 3. Ensure the quantity is correct and expiry date is not NULL
UPDATE batches 
SET quantity = 453, expiry_date = '2026-12-31' 
WHERE product_id = (SELECT id FROM products WHERE name = 'Paracetamol 500mg');