# PRISM Tax Assistant - Complete Implementation Prompt for Antigravity

## Project Overview

Build a **Nigerian tax compliance assistant** called PRISM that helps individuals and small businesses track tax obligations from their bank transactions. The system uses a **web form onboarding → Telegram bot → Mono API** flow for seamless user experience.

---

## Core User Flow

```
User visits website
    ↓
Fills registration form (personal info, work status, income type)
    ↓
Submits form → Backend generates secure one-time token
    ↓
User clicks Telegram deep link with token
    ↓
Telegram bot verifies token & links account
    ↓
Bot prompts user to connect bank via Mono API
    ↓
User authorizes bank connection through Mono widget
    ↓
System syncs transactions automatically
    ↓
AI analyzes transactions for tax compliance
    ↓
User receives insights via Telegram notifications
```

---

## Tech Stack Requirements

### Frontend
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS
- **Form Validation**: React Hook Form + Zod
- **State Management**: React Context or Zustand

### Backend
- **Platform**: Supabase (PostgreSQL + Auth + Edge Functions)
- **Bot Framework**: node-telegram-bot-api or Telegraf
- **Bank Integration**: Mono API (https://mono.co)
- **AI Analysis**: Anthropic Claude API (Sonnet 4.5)
- **Hosting**: Vercel (frontend) + Supabase Edge Functions (backend)

### Security
- **Encryption**: AES-256-GCM for sensitive data
- **Token Management**: UUID v4 with 15-minute expiry
- **Row Level Security**: Supabase RLS policies
- **Webhook Verification**: HMAC signatures

---

## Database Schema

### Table: `users`
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  work_status TEXT NOT NULL, -- 'business' | 'employed' | 'freelancer' | 'student' | 'retired'
  income_type TEXT NOT NULL, -- 'salary' | 'rental' | 'investment' | 'consulting' | 'multiple'
  bank_setup TEXT NOT NULL, -- 'mixed' | 'separate' | 'multiple'
  telegram_id BIGINT UNIQUE,
  telegram_username TEXT,
  consent_given BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policy: Users can only read their own data
CREATE POLICY "Users can view own profile"
ON users FOR SELECT
USING (auth.uid() = id);
```

### Table: `telegram_auth_tokens`
```sql
CREATE TABLE telegram_auth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast token lookup
CREATE INDEX idx_token ON telegram_auth_tokens(token) WHERE used = false;
```

### Table: `connected_accounts`
```sql
CREATE TABLE connected_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  mono_account_id TEXT UNIQUE NOT NULL,
  mono_code TEXT, -- Encrypted
  account_name TEXT,
  account_number TEXT,
  bank_name TEXT,
  status TEXT DEFAULT 'active', -- 'active' | 'disconnected' | 'error'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policy: Users can only see their own accounts
CREATE POLICY "Users can view own accounts"
ON connected_accounts FOR SELECT
USING (
  user_id IN (
    SELECT id FROM users WHERE telegram_id = current_setting('app.telegram_id')::bigint
  )
);
```

### Table: `transactions`
```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES connected_accounts(id) ON DELETE CASCADE,
  mono_transaction_id TEXT UNIQUE,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  type TEXT NOT NULL, -- 'debit' | 'credit'
  balance DECIMAL(15,2),
  category TEXT, -- 'transfer' | 'airtime' | 'data' | 'levy' | 'other'
  tax_relevant BOOLEAN DEFAULT false,
  tax_type TEXT, -- 'emtl' | 'vat' | 'income' | null
  analyzed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_user_transactions ON transactions(user_id, date DESC);
CREATE INDEX idx_tax_relevant ON transactions(user_id) WHERE tax_relevant = true;
```

### Table: `tax_reports`
```sql
CREATE TABLE tax_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_credits DECIMAL(15,2) NOT NULL,
  total_debits DECIMAL(15,2) NOT NULL,
  emtl_charges DECIMAL(15,2) DEFAULT 0,
  vat_paid DECIMAL(15,2) DEFAULT 0,
  taxable_income DECIMAL(15,2) DEFAULT 0,
  analysis JSONB, -- AI-generated insights
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `audit_logs`
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for audit queries
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
```

---

## Feature Requirements

### 1. Landing Page & Registration Form

**Path**: `/` (homepage)

**Components**:
- Hero section with value proposition
- Benefits showcase (auto-tracking, secure, smart alerts)
- Registration form with 3 steps:
  1. Personal info (name, email, phone)
  2. Work & income details (dropdowns with emojis)
  3. Bank setup & consent checkbox

**Form Validation Rules**:
- Email: Valid format, not already registered
- Phone: Nigerian format (+234...)
- All fields required
- Consent must be checked

**On Submit**:
1. POST to `/api/register` endpoint
2. Backend generates secure token (UUID v4)
3. Store token in `telegram_auth_tokens` table with 15-min expiry
4. Return Telegram deep link: `https://t.me/prism_tax_bot?start={token}`
5. Show success screen with "Open Telegram Bot" button
6. Log action in `audit_logs`

### 2. Telegram Bot Setup

**Bot Commands**:
- `/start {token}` - Verify token and link account
- `/connect` - Connect bank via Mono
- `/status` - View connection status
- `/report` - Generate tax report
- `/help` - Show available commands

**Bot Behavior**:

**On `/start {token}`**:
```
1. Extract token from command
2. Query telegram_auth_tokens table:
   - Check if token exists
   - Check if not used (used = false)
   - Check if not expired (expires_at > NOW())
3. If valid:
   - Update users table: set telegram_id = message.from.id
   - Mark token as used
   - Send welcome message with user's profile summary
   - Show inline button "🔗 Connect Bank Account"
4. If invalid:
   - Send error message
   - Provide link to register again
```

**Welcome Message Template**:
```
👋 Welcome to PRISM, {full_name}!

📋 Your Profile:
• Status: {work_status_label}
• Income: {income_type_label}
• Accounts: {bank_setup_label}

Now let's connect your bank account for automatic tax tracking!

🏦 Click below to securely connect via Mono (takes 2 minutes):
[🔗 Connect Bank Account] (inline button)
```

**On "Connect Bank Account" button click**:
```
1. Generate Mono Connect session via API
2. Send user a secure link to Mono widget
3. User authorizes bank connection in browser
4. Mono sends webhook to your backend
5. Bot notifies user of successful connection
6. Start syncing transactions
```

### 3. Mono API Integration

**Initialization Endpoint**: `POST /api/mono/init`

**Request**:
```typescript
{
  userId: string;
  telegramId: number;
}
```

**Process**:
1. Call Mono API to create Connect session:
   ```typescript
   POST https://api.withmono.com/v1/connect/init
   Headers: {
     'mono-sec-key': process.env.MONO_SECRET_KEY
   }
   Body: {
     customer: { id: userId },
     scope: 'transactions',
     redirect_url: 'https://yourapp.com/mono-callback'
   }
   ```
2. Return Connect widget URL to user
3. User completes authorization in browser
4. Store encrypted Mono code in `connected_accounts`

**Webhook Endpoint**: `POST /api/mono/webhook`

**Handle Events**:
- `mono.events.account_linked` - New account connected
- `mono.events.transactions` - New transactions available
- `mono.events.account_reauthorization` - Connection needs renewal

**On Account Linked**:
```typescript
1. Verify webhook signature (HMAC)
2. Extract account_id and customer.id
3. Fetch account details from Mono API
4. Store in connected_accounts table
5. Send Telegram notification to user
6. Start initial transaction sync (last 6 months)
7. Schedule daily sync cron job
```

**Transaction Sync Logic**:
```typescript
1. Call Mono API: GET /accounts/{id}/transactions
2. For each transaction:
   - Insert into transactions table (if not exists)
   - Categorize transaction type
   - Flag if tax-relevant (amount > 10000, EMTL keyword, etc.)
3. After sync complete:
   - Analyze new transactions with Claude API
   - Generate tax insights
   - Send summary to user via Telegram
```

### 4. AI Tax Analysis Engine

**Trigger**: After transaction sync or on-demand via `/report` command

**Input**: Array of transactions for analysis period

**Claude API Call**:
```typescript
const prompt = `
You are a Nigerian tax compliance expert. Analyze these bank transactions.

User Profile:
- Work Status: ${user.work_status}
- Income Type: ${user.income_type}
- Account Setup: ${user.bank_setup}

Transactions (${transactions.length} items):
${JSON.stringify(transactions, null, 2)}

Task:
1. Identify all EMTL charges (₦50 on transfers ≥₦10,000)
2. Calculate VAT paid (embedded in airtime, data, merchant payments at 7.5%)
3. Identify potentially taxable income (large credits from businesses)
4. Classify transactions as business vs personal
5. Flag any tax compliance issues
6. Provide money-saving recommendations

Return JSON:
{
  "summary": {
    "totalCredits": number,
    "totalDebits": number,
    "emtlCharges": number,
    "vatPaid": number,
    "taxableIncome": number
  },
  "insights": string[],
  "recommendations": string[],
  "warnings": string[]
}
`;

const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4000,
  messages: [{ role: 'user', content: prompt }]
});

const analysis = JSON.parse(response.content[0].text);
```

**Store Results**:
- Save to `tax_reports` table
- Update `transactions` table: set `analyzed = true`
- Send formatted report to user via Telegram

### 5. Telegram Notifications

**Notification Types**:

**Daily Summary** (sent at 9 AM):
```
📊 Yesterday's Activity

💰 Income: ₦{total_credits}
💸 Expenses: ₦{total_debits}

🏦 Tax Items:
• EMTL: ₦{emtl}
• VAT: ₦{vat}

{insights if any}
```

**Large Transaction Alert** (real-time):
```
⚠️ Large Transaction Detected

₦{amount} {type} - {description}

Tax Impact: {analysis}
```

**Monthly Report** (1st of each month):
```
📅 Monthly Tax Report - {month}

💼 Total Income: ₦{income}
📊 Tax Summary:
• EMTL Charges: ₦{emtl}
• VAT Paid: ₦{vat}
• Taxable Income: ₦{taxable}

📈 Compared to last month: {comparison}

[View Full Report] (button)
```

### 6. User Dashboard (Web)

**Path**: `/dashboard`

**Authentication**: Supabase Auth (email/password or magic link)

**Sections**:

1. **Overview Card**
   - Total income/expenses this month
   - Tax summary (EMTL, VAT)
   - Connection status

2. **Connected Accounts**
   - List of linked banks
   - Last sync time
   - "Add Account" button

3. **Recent Transactions**
   - Table with date, description, amount, tax impact
   - Filter by date range, type, category
   - Export to CSV

4. **Tax Reports**
   - Monthly/quarterly reports
   - Download as PDF
   - Tax calendar with deadlines

5. **Settings**
   - Notification preferences
   - Telegram connection status
   - Data export/deletion (NDPR compliance)

---

## API Endpoints

### Registration & Auth

**POST /api/register**
```typescript
Body: {
  fullName: string;
  email: string;
  phone: string;
  workStatus: string;
  incomeType: string;
  bankSetup: string;
  consent: boolean;
}

Response: {
  success: boolean;
  userId: string;
  telegramLink: string;
  expiresIn: number; // seconds
}
```

**POST /api/telegram/verify**
```typescript
Body: {
  token: string;
  telegramId: number;
  telegramUsername: string;
}

Response: {
  success: boolean;
  user: User;
}
```

### Mono Integration

**POST /api/mono/init**
```typescript
Body: {
  userId: string;
}

Response: {
  connectUrl: string;
  sessionId: string;
}
```

**POST /api/mono/webhook**
```typescript
Body: MonoWebhookEvent

Headers: {
  'mono-webhook-signature': string;
}

Response: {
  status: 'ok';
}
```

**GET /api/accounts/{userId}/sync**
```typescript
Response: {
  success: boolean;
  transactionsSynced: number;
  lastSync: string;
}
```

### Tax Analysis

**POST /api/analyze**
```typescript
Body: {
  userId: string;
  periodStart: string; // ISO date
  periodEnd: string;
}

Response: {
  success: boolean;
  report: TaxReport;
}
```

**GET /api/reports/{userId}**
```typescript
Query: {
  limit?: number;
  offset?: number;
}

Response: {
  reports: TaxReport[];
  total: number;
}
```

### Telegram Bot

**POST /api/telegram/webhook**
```typescript
Body: TelegramUpdate

Response: {
  ok: boolean;
}
```

---

## Security Implementation

### Token Generation
```typescript
import crypto from 'crypto';

function generateSecureToken(): string {
  return crypto.randomUUID();
}

async function createAuthToken(userId: string) {
  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
  
  await supabase.from('telegram_auth_tokens').insert({
    user_id: userId,
    token,
    expires_at: expiresAt.toISOString()
  });
  
  return token;
}
```

### Data Encryption
```typescript
function encryptSensitiveData(data: string): string {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

function decryptSensitiveData(encryptedData: string): string {
  const [ivHex, encrypted, authTagHex] = encryptedData.split(':');
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
  
  const decipher = crypto.createDecipheriv(
    algorithm,
    key,
    Buffer.from(ivHex, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

### Webhook Verification
```typescript
function verifyMonoWebhook(signature: string, payload: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET!)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

---

## Environment Variables

Create `.env.local` file:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_BOT_USERNAME=prism_tax_bot

# Mono API
MONO_SECRET_KEY=your_mono_secret_key
MONO_PUBLIC_KEY=your_mono_public_key
WEBHOOK_SECRET=your_webhook_secret

# Anthropic
ANTHROPIC_API_KEY=your_anthropic_key

# Security
ENCRYPTION_KEY=64_character_hex_string
JWT_SECRET=your_jwt_secret

# App
NEXT_PUBLIC_APP_URL=https://yourapp.com
```

---

## Deployment Checklist

### Pre-launch
- [ ] Set up Supabase project with all tables
- [ ] Configure RLS policies
- [ ] Create Telegram bot via @BotFather
- [ ] Register Mono API account
- [ ] Set up Anthropic API key
- [ ] Generate encryption key (32 bytes, hex-encoded)
- [ ] Configure environment variables
- [ ] Set up webhook endpoints (HTTPS required)
- [ ] Test registration flow end-to-end
- [ ] Test Mono connection & transaction sync
- [ ] Test tax analysis with sample data
- [ ] Verify Telegram notifications work

### Security Audit
- [ ] All secrets in environment variables (not hardcoded)
- [ ] RLS policies tested and working
- [ ] Webhook signatures verified
- [ ] Sensitive data encrypted at rest
- [ ] HTTPS enforced everywhere
- [ ] Rate limiting implemented
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitize outputs)

### Compliance (NDPR)
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] Consent checkbox on registration
- [ ] Data export functionality
- [ ] Account deletion functionality
- [ ] Audit logging enabled
- [ ] Data retention policy documented

### Monitoring
- [ ] Error tracking (Sentry or similar)
- [ ] Application monitoring (Vercel Analytics)
- [ ] Database monitoring (Supabase dashboard)
- [ ] Uptime monitoring (UptimeRobot)
- [ ] Log aggregation (for debugging)

---

## Success Metrics

### Technical KPIs
- Registration completion rate > 80%
- Telegram link success rate > 95%
- Mono connection success rate > 90%
- Average transaction sync time < 30 seconds
- API uptime > 99.5%
- Average page load time < 2 seconds

### User Engagement
- Daily active users (DAU)
- Monthly active users (MAU)
- Retention rate (Day 7, Day 30)
- Average transactions analyzed per user
- Tax reports generated
- Telegram command usage

### Business Metrics
- User acquisition cost
- Conversion rate (visitor → registered user)
- Churn rate
- Customer lifetime value
- Support tickets per 100 users

---

## Future Enhancements (Phase 2)

1. **Multi-bank support** - Connect multiple accounts
2. **Tax filing assistance** - Generate FIRS tax forms
3. **Receipt scanning** - OCR for expense receipts
4. **Accountant collaboration** - Share reports with tax professionals
5. **SMS notifications** - For users without Telegram
6. **WhatsApp integration** - Alternative to Telegram
7. **Mobile apps** - iOS & Android native apps
8. **Business features** - Invoicing, expense tracking
9. **Tax payment integration** - Pay taxes directly from dashboard
10. **AI tax advisor** - Chat interface for tax questions

---

## Support & Documentation

### User Guide Topics
- How to register and connect your bank
- Understanding your tax report
- What is EMTL and when is it charged?
- How to categorize transactions
- Privacy and data security
- Troubleshooting connection issues

### API Documentation
- Generate with Swagger/OpenAPI
- Include authentication examples
- Provide Postman collection
- Document webhook payload schemas
- Add code examples in TypeScript

### Developer Setup Guide
- Clone repository
- Install dependencies
- Configure environment variables
- Run database migrations
- Start development server
- Run tests
- Deploy to staging

---

## Implementation Checklist

Copy this prompt and work through each section systematically:

1. ✅ Set up project structure
2. ✅ Create database schema
3. ✅ Build registration form UI
4. ✅ Implement backend API endpoints
5. ✅ Set up Telegram bot
6. ✅ Integrate Mono API
7. ✅ Build AI analysis engine
8. ✅ Implement notification system
9. ✅ Create user dashboard
10. ✅ Add security measures
11. ✅ Test end-to-end flow
12. ✅ Deploy to production
13. ✅ Monitor and iterate

---

## Questions to Ask During Development

1. How should we handle users with multiple income sources?
2. What happens if a user's bank connection expires?
3. How do we handle transaction disputes or corrections?
4. Should we support manual transaction uploads?
5. What reports does FIRS require for tax filing?
6. How do we handle refunds and chargebacks?
7. What's the backup plan if Mono API is down?
8. How do we communicate app updates to users?
9. What's the data retention policy (how long do we store transactions)?
10. How do we handle users who close their accounts?

---

**This prompt provides everything needed to build PRISM on Antigravity (or any similar platform). Start with the MVP (registration → Telegram → Mono → basic analysis) and iterate based on user feedback.**