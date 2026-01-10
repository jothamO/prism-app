# PRISM Tax Assistant - Complete Architecture

## Project Structure Overview

```
prism-app/
├── src/                    # Frontend (React + Vite)
├── gateway/                # Message Gateway (Railway)
├── prism-api/              # API Server (unused/legacy)
├── supabase/               # Edge Functions + Migrations
├── prism-web/              # Alternative web project
└── docs/                   # Documentation
```

---

## 1. Frontend (`src/`)

### Entry Points
| File | Role |
|------|------|
| `main.tsx` | React app entry point |
| `App.tsx` | Router + layout configuration |
| `index.css` | Global styles |

### Pages (`src/pages/`)
| File | Description | Integrates With |
|------|-------------|-----------------|
| `LandingPage.tsx` | Public homepage with "Get Started" CTA | → `/auth` route |
| `Auth.tsx` | Login/signup with Supabase Auth | → `supabase/auth.users` |
| `Register.tsx` | Web registration form | → `register-user` edge function |
| `Dashboard.tsx` | User dashboard | → Supabase data tables |

### Admin Pages (`src/pages/admin/`)
| File | Description | Integrates With |
|------|-------------|-----------------|
| `AdminDashboard.tsx` | Admin overview stats | → `users`, `transactions`, `receipts` tables |
| `AdminSimulator.tsx` | Chat simulator for testing | → `gateway-server.ts` via WebSocket |
| `AdminChatbots.tsx` | Bot management (Telegram/WhatsApp) | → `admin-bot-messaging` edge function |
| `AdminUsers.tsx` | User management | → `users` + `profiles` tables |
| `AdminNLUTesting.tsx` | NLU intent testing | → `simulate-nlu` edge function |
| `AdminVATTesting.tsx` | VAT calculation testing | → `vat-calculator` edge function |
| `AdminPatterns.tsx` | Transaction pattern review | → `transaction_patterns` table |
| `AdminReviews.tsx` | Human review queue | → `review_queue` table |
| `AdminProfiles.tsx` | User profile management | → `onboarding_progress` table |
| `AdminProjects.tsx` | Project fund tracking | → `projects` table |
| `AdminAnalytics.tsx` | Analytics dashboard | → Various analytics tables |
| `AdminMLHealth.tsx` | ML model health | → Classification stats |
| `AdminFeedback.tsx` | User feedback | → `feedback` table |
| `AdminSettings.tsx` | System settings | → `system_settings` table |
| `AdminDocuments.tsx` | Document management | → `documents` table |
| `AdminRelatedParties.tsx` | Related party detection | → `related_parties` table |
| `AdminLogin.tsx` | Admin authentication | → Supabase Auth + `user_roles` |

### Components (`src/components/`)
| Directory | Purpose |
|-----------|---------|
| `admin/` | Admin-specific components (dialogs, menus, tables) |
| `registration/` | Multi-step registration form components |
| `ui/` | Reusable UI components (Button, Card, Dialog) |

### Hooks (`src/hooks/`)
| File | Purpose |
|------|---------|
| `use-toast.ts` | Toast notifications |
| `use-theme.ts` | Theme management |
| `use-admin-auth.ts` | Admin authentication |

---

## 2. Gateway (`gateway/`)

The **core message processing engine** deployed on Railway.

### Entry Points
| File | Role | Receives From |
|------|------|---------------|
| `src/index.ts` | HTTP server entry point | Railway |
| `src/gateway-server.ts` | Main gateway logic | Telegram/WhatsApp webhooks |

### Core Infrastructure
| File | Description | Used By |
|------|-------------|---------|
| `src/config.ts` | Environment config + Supabase client | All modules |
| `src/protocol.ts` | Message/response type definitions | All handlers |
| `src/session-manager.ts` | User session state management | Skill router |
| `src/idempotency.ts` | Prevent duplicate message processing | Gateway server |

### Skills (`gateway/src/skills/`)
| Directory | Description | Key Integration |
|-----------|-------------|-----------------|
| `skill-router.ts` | **Central router** - routes to appropriate skill | All skills, NLU service |
| `enhanced-onboarding/` | Adaptive AI onboarding | `profile-extractor.ts`, `adaptive-flow.ts` |
| `document-processing/` | Receipt/invoice OCR | `ocr-service.ts`, vision APIs |
| `receipt-processing/` | Receipt classification | Classifier service |
| `identity-verification/` | KYC verification flow | NIN/BVN validation |
| `tax-calculation/` | PIT calculation | PIT calculator service |
| `vat-calculation/` | VAT calculation | VAT calculator service |
| `pattern-review/` | Transaction pattern review | Pattern learning |
| `intent-handlers/` | NLU intent handling | Skill router |

### Services (`gateway/src/services/`)
| File | Description | Consumes | Produces |
|------|-------------|----------|----------|
| `profile-learner.ts` | Continuous profile learning | Transactions, corrections | Profile updates |
| `transaction-learning-hook.ts` | Transaction → profile learning | Transactions | Profile metrics |
| `nlu.service.ts` | Natural language understanding | User messages | Intents + entities |
| `ocr-service.ts` | Document OCR | Images | Extracted text |
| `pdf-converter.ts` | PDF → image conversion | PDF files | Images |
| `conversation-context.ts` | Conversation state | Messages | Context object |

### Utils (`gateway/src/utils/`)
| File | Purpose |
|------|---------|
| `logger.ts` | Structured logging |
| `personality.ts` | PRISM's Nigerian-aware personality formatting |

---

## 3. Supabase Edge Functions (`supabase/functions/`)

### Bot Gateways
| Function | Purpose | Flow |
|----------|---------|------|
| `telegram-bot-gateway/` | Telegram webhook handler | Telegram → Gateway → Response |
| `whatsapp-bot-gateway/` | WhatsApp webhook handler | WhatsApp → Gateway → Response |
| `telegram-bot/` | Legacy Telegram handler | Deprecated |

### User Management
| Function | Purpose | Used By |
|----------|---------|---------|
| `register-user/` | Web registration | Registration form |
| `admin-bot-messaging/` | Admin bot controls | AdminChatbots.tsx |

### Financial Processing
| Function | Purpose | Data Source |
|----------|---------|-------------|
| `mono-connect-init/` | Initialize Mono Connect | User request |
| `mono-webhook/` | Handle Mono events | Mono API |
| `mono-sync-transactions/` | Sync bank transactions | Mono API |
| `mono-lookup-test/` | Test Mono connection | Admin |

### Tax Calculations
| Function | Purpose | Data Flow |
|----------|---------|-----------|
| `vat-calculator/` | Calculate VAT | Transactions → VAT amounts |
| `vat-reconciliation/` | Reconcile VAT | Multiple sources |
| `income-tax-calculator/` | Calculate PIT | Income data |
| `anti-avoidance-check/` | Section 191 compliance | Transaction patterns |
| `cross-border-tax/` | International tax | Foreign transactions |

### Document Processing
| Function | Purpose |
|----------|---------|
| `document-ocr/` | OCR extraction |
| `invoice-processor/` | Invoice parsing |
| `generate-pdf-report/` | PDF report generation |

### AI & Classification
| Function | Purpose |
|----------|---------|
| `business-classifier/` | Business type classification |
| `simulate-nlu/` | Test NLU intents |
| `seed-ml-data/` | Seed ML training data |

### Utilities
| Function | Purpose |
|----------|---------|
| `cbn-rate-fetcher/` | Fetch CBN exchange rates |
| `weekly-savings-email/` | Send weekly reports |
| `project-funds/` | Manage project funds |
| `get-lovable-key/` | Debug: get API key |
| `get-service-key/` | Debug: get service key |

---

## 4. Prism-API (`prism-api/`)

Legacy API server (most functionality moved to Gateway + Edge Functions).

### Key Services (`prism-api/src/services/`)
| File | Description | Status |
|------|-------------|--------|
| `classifier.service.ts` | AI transaction classification | Active (fallback) |
| `nigerian-transaction.service.ts` | Nigerian banking context | Active |
| `message-handler.service.ts` | Message processing | Legacy |
| `intent-router.service.ts` | Intent routing | Migrated to Gateway |
| `anti-avoidance.service.ts` | Section 191 detection | Active |
| `vat-reconciliation.service.ts` | VAT reconciliation | Active |
| `pit-calculator.service.ts` | PIT calculation | Active |
| `mono.service.ts` | Mono API client | Active |

---

## 5. Database Schema (Supabase)

### Core Tables
| Table | Purpose | Key Relations |
|-------|---------|---------------|
| `users` | Bot users (Telegram/WhatsApp) | → `onboarding_progress`, `transactions` |
| `profiles` | Web-registered users | → `auth.users` |
| `user_roles` | Admin/user roles | → `profiles` |

### Onboarding
| Table | Purpose |
|-------|---------|
| `onboarding_progress` | Onboarding step tracking |
| `telegram_auth_tokens` | Web → Telegram linking tokens |

### Financial
| Table | Purpose |
|-------|---------|
| `connected_accounts` | Mono bank connections |
| `transactions` | Bank transactions |
| `receipts` | Scanned receipts |
| `vat_returns` | VAT filing records |

### AI/ML
| Table | Purpose |
|-------|---------|
| `review_queue` | Human review items |
| `transaction_patterns` | Learned patterns |
| `user_category_preferences` | User-specific categories |
| `profile_learning_history` | Profile change tracking |

### Messaging
| Table | Purpose |
|-------|---------|
| `messages` | Chat history |
| `conversation_state` | Current conversation state |
| `chatbot_sessions` | Active sessions |

---

## 6. Integration Flow Diagram

```
                                    ┌─────────────────────┐
                                    │   Web Frontend      │
                                    │   (src/)            │
                                    └─────────┬───────────┘
                                              │
                                              ▼
┌─────────────┐    ┌─────────────────────────────────────────────┐
│  Telegram   │───▶│     Supabase Edge Functions                 │
│  WhatsApp   │    │  telegram-bot-gateway, whatsapp-bot-gateway │
└─────────────┘    └─────────────────────┬───────────────────────┘
                                         │
                                         ▼
                   ┌─────────────────────────────────────────────┐
                   │          Gateway Server (Railway)            │
                   │  gateway-server.ts → skill-router.ts         │
                   │                                              │
                   │  ┌─────────────────────────────────────────┐ │
                   │  │ Skills:                                 │ │
                   │  │ • enhanced-onboarding/                  │ │
                   │  │ • document-processing/                  │ │
                   │  │ • tax-calculation/                      │ │
                   │  │ • vat-calculation/                      │ │
                   │  │ • identity-verification/                │ │
                   │  └─────────────────────────────────────────┘ │
                   │                                              │
                   │  ┌─────────────────────────────────────────┐ │
                   │  │ Services:                               │ │
                   │  │ • profile-learner.ts                    │ │
                   │  │ • nlu.service.ts                        │ │
                   │  │ • ocr-service.ts                        │ │
                   │  └─────────────────────────────────────────┘ │
                   └──────────────────┬──────────────────────────┘
                                      │
                                      ▼
                   ┌─────────────────────────────────────────────┐
                   │           Supabase Database                  │
                   │  users, transactions, onboarding_progress    │
                   │  messages, receipts, vat_returns             │
                   └──────────────────┬──────────────────────────┘
                                      │
                                      ▼
                   ┌─────────────────────────────────────────────┐
                   │        External APIs                         │
                   │  • Mono (Banking)   • Lovable (AI)          │
                   │  • Claude/OpenAI    • Google Vision (OCR)   │
                   └─────────────────────────────────────────────┘
```

---

## 7. Key Data Flows

### A. User Onboarding
1. User messages bot → `telegram-bot-gateway` / `whatsapp-bot-gateway`
2. Edge function → Gateway Server (`gateway-server.ts`)
3. Gateway → `skill-router.ts` → `enhanced-onboarding/`
4. `profile-extractor.ts` extracts profile from freeform message
5. `adaptive-flow.ts` determines next questions
6. Profile saved to `onboarding_progress` table
7. Response → User

### B. Transaction Learning
1. Transaction classified → `classifier.service.ts`
2. `transaction-learning-hook.ts` triggered
3. `profile-learner.ts` analyzes patterns
4. Profile updated, confidence increased
5. If significant change → Proactive notification

### C. Receipt Processing
1. User sends image → Gateway
2. `document-processing/` skill activated
3. `ocr-service.ts` extracts text
4. AI classifies receipt type
5. Stored in `receipts` table
6. VAT/tax implications calculated

### D. Admin Operations
1. Admin opens `AdminSimulator.tsx`
2. WebSocket → Gateway Server
3. Test messages processed like real user
4. Results shown in admin UI

---

## 8. File Count Summary

| Directory | Files | Purpose |
|-----------|-------|---------|
| `src/` | ~70 | Frontend React app |
| `gateway/src/` | ~40 | Message processing |
| `prism-api/src/` | ~60 | Legacy API (partial use) |
| `supabase/functions/` | ~27 | Edge functions |
| `supabase/migrations/` | ~50 | Database schema |

**Total: ~250 source files**

---

## 9. Environment Configuration

### Required Variables
| Variable | Used By | Purpose |
|----------|---------|---------|
| `SUPABASE_URL` | All | Database connection |
| `SUPABASE_ANON_KEY` | Frontend | Public API access |
| `SUPABASE_SERVICE_ROLE_KEY` | Gateway, Edge Functions | Admin access |
| `LOVABLE_API_KEY` | Gateway | AI classification |
| `TELEGRAM_BOT_TOKEN` | Edge Functions | Telegram API |
| `WHATSAPP_API_KEY` | Edge Functions | WhatsApp API |
| `MONO_SECRET_KEY` | Edge Functions | Bank integration |
| `GATEWAY_URL` | Edge Functions | Gateway endpoint |

---

*Last Updated: January 4, 2026*
