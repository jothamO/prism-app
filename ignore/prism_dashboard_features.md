# PRISM Tax Assistant - User Dashboard Features

## 🎯 Core Dashboard Principles
- **Mobile-first design** - Most Nigerian users access via mobile
- **Glanceable insights** - Key metrics visible without scrolling
- **Action-oriented** - Clear CTAs for important tasks
- **Progressive disclosure** - Show basics first, details on demand
- **Contextual help** - Tooltips explaining tax terms in simple language

---

## 📊 Dashboard Sections

### 1. **Overview / Home Screen**

#### Financial Snapshot (Hero Section)
```
┌─────────────────────────────────────────┐
│  💰 This Month at a Glance              │
│                                         │
│  Income:        ₦258,000  (+12% ↑)     │
│  Expenses:      ₦252,558  (+8% ↑)      │
│  Net:           ₦5,442    (+45% ↑)     │
│                                         │
│  [View Breakdown →]                     │
└─────────────────────────────────────────┘
```

**Features:**
- Real-time balance from all connected accounts
- Month-over-month comparison with percentage change
- Quick filters: This Week | This Month | This Quarter | This Year
- Visual indicator: Green (profit) / Red (loss)

#### Tax Health Score (Gamification)
```
┌─────────────────────────────────────────┐
│  🎯 Tax Compliance Score                │
│                                         │
│      ██████████████░░░░░  85/100       │
│                                         │
│  ✅ All EMTL charges accounted          │
│  ✅ VAT tracking active                 │
│  ⚠️ 2 large receipts need review        │
│                                         │
│  [View Recommendations →]               │
└─────────────────────────────────────────┘
```

**Scoring Factors:**
- Connected accounts (20 points)
- Regular transaction syncs (15 points)
- Categorized transactions (20 points)
- Tax receipts organized (15 points)
- Filed previous returns (30 points)

#### Quick Actions (Buttons)
- 🔄 Sync Transactions
- 📊 Generate Report
- 💳 Add Bank Account
- 📤 Export Data
- 💬 Chat with AI Tax Assistant

#### Recent Alerts & Notifications
```
🔔 3 new tax-relevant transactions today
⚠️ Large deposit (₦200,000) needs categorization
✅ Monthly report ready for December
⏰ Tax filing deadline in 45 days
```

---

### 2. **Tax Dashboard**

#### Tax Summary Cards (4-grid layout)
```
┌──────────────┐ ┌──────────────┐
│ EMTL Paid    │ │ VAT Paid     │
│ ₦250         │ │ ₦336.50      │
│ 5 charges    │ │ 7 items      │
└──────────────┘ └──────────────┘

┌──────────────┐ ┌──────────────┐
│ Taxable Inc. │ │ Potential    │
│ ₦200,000     │ │ Deductions   │
│ +1 item      │ │ ₦15,450      │
└──────────────┘ └──────────────┘
```

#### Monthly Tax Breakdown (Chart)
- Bar chart showing EMTL, VAT, Income Tax by month
- Hover for detailed breakdown
- Toggle between: Last 6 months | Last 12 months | YTD

#### Tax Calendar
```
January 2026
─────────────────────────────
31 - Self-employed annual return due
    ⏰ Reminder set

February 2026
─────────────────────────────
15 - Quarterly PAYE filing
    📝 Draft ready

March 2026
─────────────────────────────
No deadlines this month
```

**Features:**
- Integration with FIRS filing calendar
- Reminders 30, 15, 7, 1 days before deadline
- Mark as complete
- Upload filed documents

#### Tax Optimization Suggestions (AI-Powered)
```
💡 Smart Recommendations

1. Claim Home Office Deduction
   You spent ₦45,000 on utilities this quarter.
   Potential savings: ₦11,250
   [Learn More]

2. Separate Business Expenses
   3 transactions (₦12,500) might be business expenses.
   [Review & Categorize]

3. Track Rental Income Properly
   Your rental receipts could qualify for tax relief.
   [Set Up Tracking]
```

---

### 3. **Transactions View**

#### Smart Search & Filters
```
┌─────────────────────────────────────────┐
│ 🔍 Search transactions...               │
└─────────────────────────────────────────┘

Filters:
[All Accounts ▼] [All Types ▼] [Date Range ▼]

Quick Filters:
[Large Transactions >₦10k] [Tax Relevant] 
[Uncategorized] [This Week]

Sort by: [Date ▼] [Amount ▼] [Category ▼]
```

#### Transaction Table (Enhanced)
```
Date       | Description                    | Amount      | Tax    | Category
─────────────────────────────────────────────────────────────────────────────
Jan 4      | Transfer from TNET TRADING    | +₦200,000   | 📊    | [Set Category ▼]
           | ⚠️ Large deposit - Review      |             |       | [Add Note]
─────────────────────────────────────────────────────────────────────────────
Jan 3      | Airtime Purchase - MTN        | -₦2,000     | VAT   | Utilities
           | VAT: ₦139.53                   |             |       | ✏️ Edit
─────────────────────────────────────────────────────────────────────────────
Jan 2      | Transfer to Lateef Segun      | -₦194,900   | EMTL  | Personal
           | EMTL: ₦50.00                   |             |       | 💬 AI Analysis
```

**Features:**
- Inline editing of categories
- Add notes to transactions
- Flag for accountant review
- Split transactions (if part business, part personal)
- Attach receipts/invoices (upload images)
- AI-suggested categories with confidence scores

#### Bulk Actions
- Select multiple → Categorize all
- Select multiple → Export selected
- Select multiple → Mark as reviewed
- Select multiple → Hide from reports

#### Transaction Details (Click to expand)
```
┌─────────────────────────────────────────┐
│ Transaction Details                     │
├─────────────────────────────────────────┤
│ Date:           Jan 4, 2026 7:48 PM    │
│ Account:        OPay (8126884383)      │
│ Type:           Credit (Received)       │
│ Amount:         ₦200,000.00            │
│ Balance After:  ₦200,042.40            │
│ Reference:      100033251230123...     │
│                                         │
│ Tax Impact:                             │
│ • EMTL Charged: ₦50.00                 │
│ • Category: Uncategorized               │
│                                         │
│ AI Analysis:                            │
│ "Large business payment from TNET       │
│ Trading. This may be taxable income.    │
│ Consider if this is:                    │
│ 1. Business revenue                     │
│ 2. Reimbursement                        │
│ 3. Loan                                 │
│ 4. Gift/Grant"                          │
│                                         │
│ [Categorize] [Add Note] [Ask AI]       │
└─────────────────────────────────────────┘
```

---

### 4. **Reports & Analytics**

#### Report Generator
```
┌─────────────────────────────────────────┐
│ 📊 Generate Custom Report               │
├─────────────────────────────────────────┤
│ Report Type:                            │
│ ○ Monthly Tax Summary                   │
│ ● Quarterly Business Report             │
│ ○ Annual Tax Statement                  │
│ ○ Expense Breakdown                     │
│ ○ Income Analysis                       │
│                                         │
│ Period:                                 │
│ [Jan 1, 2026] to [Mar 31, 2026]        │
│                                         │
│ Include:                                │
│ ☑ Transaction details                   │
│ ☑ Tax calculations                      │
│ ☑ Charts & graphs                       │
│ ☑ AI insights                           │
│ ☐ Receipts/attachments                  │
│                                         │
│ [Generate Report] [Schedule Automatic]  │
└─────────────────────────────────────────┘
```

#### Saved Reports Library
```
Recent Reports:
─────────────────────────────────────────
📄 December 2025 Tax Summary
   Generated: Jan 1, 2026
   [View] [Download PDF] [Share] [Delete]

📄 Q4 2025 Business Report
   Generated: Jan 1, 2026
   [View] [Download PDF] [Share] [Delete]

[+ Create New Report]
```

#### Interactive Analytics

**Income vs Expenses Trend (Line Chart)**
- Dual-axis chart showing income and expenses over time
- Hover for exact amounts
- Identify patterns (salary dates, recurring expenses)

**Expense Breakdown (Donut Chart)**
```
       Transfers: 45%
       Utilities: 15%
       EMTL/Fees: 10%
       Airtime:   8%
       Other:     22%
```

**Tax Burden Over Time (Stacked Bar Chart)**
- Shows EMTL + VAT + Income Tax by month
- Percentage of total income

**Cash Flow Forecast (AI-Powered)**
```
💡 Based on your patterns, we predict:

Next Month:
• Expected Income: ₦280,000 ± ₦30,000
• Expected Expenses: ₦245,000 ± ₦25,000
• Projected Tax: ₦1,200
• Net Position: ₦35,000 (Positive)

Confidence: 78%
[View Breakdown]
```

---

### 5. **Connected Accounts**

#### Account Cards
```
┌─────────────────────────────────────────┐
│ 🏦 OPay                                 │
│ Account: •••• 4383                      │
│ Balance: ₦5,445.65                      │
│ Last Sync: 2 minutes ago                │
│                                         │
│ Status: ✅ Active                        │
│                                         │
│ [Sync Now] [View Transactions] [•••]   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 🏦 Access Bank                          │
│ Account: •••• 0554                      │
│ Balance: ₦127,500.00                    │
│ Last Sync: 1 hour ago                   │
│                                         │
│ Status: ⚠️ Needs Reauthorization         │
│                                         │
│ [Reconnect] [View Transactions] [•••]  │
└─────────────────────────────────────────┘

[+ Add Another Bank Account]
```

**Features:**
- Manual sync button (cooldown: 5 minutes)
- Connection health indicator
- Transaction count from each account
- Set primary account
- Rename account (for users with multiple accounts at same bank)
- Disconnect account

#### Sync History
```
Sync Activity:
─────────────────────────────────────────
✅ Jan 4, 2026 2:30 PM - 15 new transactions
✅ Jan 4, 2026 9:00 AM - 3 new transactions
✅ Jan 3, 2026 8:45 PM - 8 new transactions
⚠️ Jan 3, 2026 2:00 PM - Failed (Retry)
✅ Jan 3, 2026 9:00 AM - 12 new transactions
```

---

### 6. **AI Tax Assistant (Chat Interface)**

#### Chat Widget (Bottom-right corner)
```
┌─────────────────────────────────────────┐
│ 💬 Ask PRISM AI                         │
├─────────────────────────────────────────┤
│                                         │
│ Bot: Hi! I'm your tax assistant. Ask   │
│      me anything about your taxes! 👋   │
│                                         │
│ Quick Questions:                        │
│ • What's my tax obligation this month?  │
│ • Can I deduct my airtime expenses?     │
│ • Explain this ₦200,000 transaction     │
│ • How much EMTL have I paid?           │
│                                         │
│ [Type your question...]                 │
└─────────────────────────────────────────┘
```

**AI Capabilities:**
- Answer tax questions specific to Nigeria
- Explain individual transactions
- Provide personalized tax-saving recommendations
- Help categorize ambiguous transactions
- Calculate what-if scenarios ("What if I earn ₦500k this month?")
- Explain tax terms in simple language
- Guide through tax filing process
- Remember conversation context

**Example Interaction:**
```
You: What is EMTL?

Bot: EMTL stands for Electronic Money Transfer Levy. 
     It's a ₦50 charge on bank transfers of ₦10,000 
     or more in Nigeria.

     This month, you were charged ₦250 in EMTL 
     (5 transfers ≥ ₦10,000).

     💡 Tip: You can minimize EMTL by consolidating 
     smaller transfers into one larger transfer 
     when possible.

     [View Your EMTL Charges]
```

---

### 7. **Settings & Preferences**

#### Profile Management
- Edit personal information
- Change email/phone
- Update work status (if changed jobs)
- Tax filing status (single, married, etc.)
- Number of dependents (affects tax calculations)

#### Notification Preferences
```
Email Notifications:
☑ Daily transaction summary (9:00 AM)
☑ Large transactions (>₦50,000)
☑ Tax filing reminders
☐ Weekly reports
☑ Monthly reports

Telegram Notifications:
☑ All transactions
☐ Only tax-relevant transactions
☑ EMTL charges
☑ Tax insights
☑ Connection issues

SMS Notifications: (₦50/month)
☐ Tax deadline reminders
☐ Large transactions

Notification Schedule:
Do Not Disturb: [10:00 PM] to [7:00 AM]
```

#### Tax Settings
```
Fiscal Year: Jan - Dec (FIRS standard)

Tax Filing Status:
● Self-employed
○ PAYE Employee
○ Both

TIN (Tax Identification Number):
[12345678-0001] ✅ Verified

Preferred Accountant:
[+ Add Accountant] (Collaborate on reports)

Tax Payment Reminders:
☑ Enable smart reminders
Frequency: [15 days before deadline ▼]
```

#### Privacy & Security
```
Connected Services:
• Telegram: @eunice_bayode ✅ Active
• Email: eunice@example.com ✅ Verified
• Phone: +234 814 496 0109 ✅ Verified

Data Management:
[Download My Data] (JSON/CSV export)
[Delete Account] (Permanently remove)

Security:
Last Login: Jan 4, 2026 7:45 PM (Lagos, NG)
[Change Password]
[Enable Two-Factor Authentication]

Audit Log:
[View Login History]
[View Data Access Log]
```

#### Banking Preferences
```
Auto-Sync Settings:
☑ Enable automatic daily sync
Sync Time: [9:00 AM ▼]

☑ Sync on demand (manual trigger)
Cooldown: 5 minutes between syncs

Transaction Categorization:
☑ Enable AI auto-categorization
Review Threshold: [Confidence < 80% ▼]

Alert Thresholds:
Large Transaction: [₦50,000 ▼]
Unusual Activity: [Deviation > 200% ▼]
```

---

### 8. **Education & Resources**

#### Tax Learning Center
```
📚 Understanding Nigerian Taxes

Beginner:
• What is Personal Income Tax?
• How EMTL Works (5 min read)
• VAT Basics for Individuals
• Filing Your First Return

Intermediate:
• Business Expense Deductions
• Self-Employment Tax Guide
• Rental Income Taxation
• Investment & Dividend Tax

Advanced:
• Tax Optimization Strategies
• Multiple Income Sources
• Corporate vs Personal Tax
• Working with Accountants

[Browse All Articles]
```

#### Video Tutorials
- "How to Connect Your Bank Account" (2 min)
- "Reading Your Tax Report" (3 min)
- "Categorizing Transactions" (4 min)
- "Filing with FIRS Online" (8 min)

#### Tax Glossary
```
Search terms...

EMTL - Electronic Money Transfer Levy
A ₦50 charge on electronic transfers ≥₦10,000

PAYE - Pay As You Earn
Tax deducted from salary by employers

TIN - Tax Identification Number
Your unique tax identification code

VAT - Value Added Tax
7.5% consumption tax on goods/services

[View Full Glossary (50+ terms)]
```

#### FAQ Section
- How often should I sync my account?
- Is my banking data secure?
- What transactions are tax-deductible?
- When do I need to file taxes?
- How accurate are the AI predictions?

---

### 9. **Collaboration Features**

#### Share with Accountant
```
┌─────────────────────────────────────────┐
│ 👔 Accountant Access                    │
├─────────────────────────────────────────┤
│ Grant your accountant view-only access  │
│ to your transactions and reports.       │
│                                         │
│ Accountant Email:                       │
│ [accountant@example.com]                │
│                                         │
│ Access Level:                           │
│ ● View transactions & reports           │
│ ○ View + Download reports               │
│ ○ View + Add notes                      │
│                                         │
│ Duration:                               │
│ [30 days ▼] or [Until revoked]         │
│                                         │
│ [Send Invitation]                       │
└─────────────────────────────────────────┘

Active Collaborators:
─────────────────────────────────────────
👔 John Okeke (Accountant)
   Access: View + Download
   Expires: Feb 3, 2026
   [Revoke Access] [Edit Permissions]
```

#### Export & Share Reports
```
Share Options:
• Generate shareable link (expires in 7 days)
• Email directly to recipient
• Download as PDF
• Export to Excel/CSV
• Print-friendly view

Privacy:
☑ Redact account numbers
☑ Remove personal identifiers
☐ Include transaction descriptions
```

---

### 10. **Mobile-Specific Features**

#### Widget for Home Screen (iOS/Android)
```
┌───────────────────┐
│ PRISM Tax         │
│                   │
│ This Month:       │
│ Income: ₦258k     │
│ Tax: ₦586         │
│                   │
│ Score: 85/100 ✅  │
└───────────────────┘
```

#### Quick Actions (3D Touch / Long Press)
- View balance
- Sync transactions
- Chat with AI
- View latest report

#### Biometric Authentication
- Face ID / Touch ID
- Fingerprint scanner
- PIN backup

#### Offline Mode
- View cached transactions
- Read reports
- Access educational content
- Sync when connection restored

---

## 🎨 UI/UX Best Practices

### Visual Design
- **Color coding**: Green (income), Red (expenses), Purple (tax items)
- **Icons**: Consistent iconography for transaction types
- **Empty states**: Helpful messages when no data
- **Loading states**: Skeleton screens, not spinners
- **Error states**: Clear, actionable error messages

### Accessibility
- **WCAG 2.1 AA compliant**
- Screen reader support
- Keyboard navigation
- High contrast mode
- Font size adjustments

### Performance
- **Lazy loading**: Load transactions as user scrolls
- **Caching**: Cache reports and analytics
- **Progressive Web App**: Installable on mobile
- **Optimistic UI**: Show actions immediately, sync in background

### Localization
- **Currency**: Always show ₦ symbol
- **Date format**: DD/MM/YYYY (Nigerian standard)
- **Number format**: 1,000.00 (comma separators)
- **Language**: English + Pidgin options

---

## 🚀 Priority Implementation Order

### Phase 1: MVP (Week 1-2)
1. Overview dashboard with financial snapshot
2. Transaction list with basic filtering
3. Connected accounts management
4. Basic tax summary

### Phase 2: Core Features (Week 3-4)
5. Tax dashboard with compliance score
6. Report generation (PDF/CSV export)
7. Transaction categorization
8. Notification preferences

### Phase 3: Advanced Features (Week 5-6)
9. AI chat assistant
10. Analytics & charts
11. Tax calendar
12. Education center

### Phase 4: Polish & Optimize (Week 7-8)
13. Mobile optimization
14. Performance improvements
15. Collaboration features
16. Advanced filtering & search

---

This dashboard design prioritizes **clarity, actionability, and user empowerment** while handling the complexity of Nigerian tax compliance.