-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  whatsapp_number VARCHAR(15) UNIQUE NOT NULL,
  email VARCHAR(255),
  business_name VARCHAR(255) NOT NULL,
  tin VARCHAR(20) UNIQUE NOT NULL,
  business_type VARCHAR(50),
  
  subscription_tier VARCHAR(20) DEFAULT 'basic',
  subscription_status VARCHAR(20) DEFAULT 'trial',
  subscription_expires_at TIMESTAMPTZ,
  
  has_active_vat BOOLEAN DEFAULT true,
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_step INT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bank Accounts (Mono connections)
CREATE TABLE user_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  mono_account_id VARCHAR(255) UNIQUE NOT NULL,
  bank_name VARCHAR(100),
  account_number VARCHAR(20),
  account_type VARCHAR(50), -- 'primary', 'secondary', 'payroll'
  
  purpose VARCHAR(50), -- 'main_business', 'large_transactions', 'payroll'
  track_sales BOOLEAN DEFAULT true,
  track_expenses BOOLEAN DEFAULT false,
  
  last_synced_at TIMESTAMPTZ,
  sync_status VARCHAR(20),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Businesses (for multi-business owners)
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  name VARCHAR(255) NOT NULL,
  tin VARCHAR(20) UNIQUE NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  
  vat_enabled BOOLEAN DEFAULT true,
  next_filing_date DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices/Transactions
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES user_accounts(id),
  
  invoice_number VARCHAR(100),
  date DATE NOT NULL,
  customer_name VARCHAR(255),
  customer_tin VARCHAR(20),
  
  items JSONB NOT NULL, -- [{description, quantity, unitPrice, total, category, vatRate, vatAmount}]
  
  subtotal DECIMAL(15,2) NOT NULL,
  vat_amount DECIMAL(15,2) NOT NULL,
  total DECIMAL(15,2) NOT NULL,
  
  period VARCHAR(7) NOT NULL, -- "2025-11"
  status VARCHAR(20) DEFAULT 'pending_remittance',
  
  source VARCHAR(20), -- 'bank_sync', 'manual_upload', 'api'
  bank_reference VARCHAR(100),
  image_url TEXT,
  
  needs_review BOOLEAN DEFAULT false,
  review_reasons TEXT[],
  user_confirmed BOOLEAN DEFAULT false,
  confidence_score DECIMAL(3,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_user_period ON invoices(user_id, period);
CREATE INDEX idx_invoices_needs_review ON invoices(needs_review) WHERE needs_review = true;

-- Expenses (for input VAT)
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  description VARCHAR(255) NOT NULL,
  supplier_name VARCHAR(255),
  
  amount DECIMAL(15,2) NOT NULL,
  vat_amount DECIMAL(15,2) DEFAULT 0,
  vat_rate DECIMAL(4,3) DEFAULT 0.075,
  
  date DATE NOT NULL,
  period VARCHAR(7) NOT NULL,
  
  receipt_url TEXT,
  category VARCHAR(50),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- VAT Filings
CREATE TABLE filings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  tax_type VARCHAR(10) DEFAULT 'VAT',
  period VARCHAR(7) NOT NULL,
  
  output_vat DECIMAL(15,2),
  input_vat DECIMAL(15,2),
  net_amount DECIMAL(15,2) NOT NULL,
  
  status VARCHAR(20) DEFAULT 'draft',
  submission_method VARCHAR(20),
  submitted_at TIMESTAMPTZ,
  
  pdf_url TEXT,
  remita_rrr VARCHAR(20),
  payment_status VARCHAR(20) DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  
  invoice_count INT,
  expense_count INT,
  auto_filed BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages (WhatsApp history)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  direction VARCHAR(10) NOT NULL, -- 'inbound', 'outbound'
  message_type VARCHAR(20),
  content TEXT,
  media_url TEXT,
  
  whatsapp_message_id VARCHAR(100),
  whatsapp_status VARCHAR(20),
  
  context JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Review Queue (human intervention)
CREATE TABLE review_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id),
  
  reasons TEXT[] NOT NULL,
  priority VARCHAR(10) DEFAULT 'medium',
  status VARCHAR(20) DEFAULT 'pending',
  
  assigned_to UUID,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Reminders
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  reminder_type VARCHAR(20) NOT NULL,
  tax_type VARCHAR(10),
  due_date DATE NOT NULL,
  message TEXT NOT NULL,
  
  send_at TIMESTAMPTZ NOT NULL,
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Non-revenue transactions (loans, capital, etc)
CREATE TABLE non_revenue_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  transaction_type VARCHAR(50), -- 'loan', 'capital', 'refund', 'personal'
  amount DECIMAL(15,2) NOT NULL,
  source VARCHAR(255),
  date DATE NOT NULL,
  
  bank_reference VARCHAR(100),
  excluded_from_vat BOOLEAN DEFAULT true,
  
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Log
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  admin_id UUID REFERENCES users(id),
  
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  
  old_values JSONB,
  new_values JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
