# PRISM User Guide - AI Tax Assistant Features

## Overview

PRISM uses artificial intelligence to make tax management easier for Nigerian SMEs. This guide explains how the AI features work and how to get the most out of them.

## Getting Started

### WhatsApp Setup

1. Save the PRISM WhatsApp number: +234-XXX-XXXX
2. Send "Hi" to start
3. Complete onboarding by providing:
   - Business name
   - TIN (Tax Identification Number)
   - Business type

### Basic Commands

| Command | Description | Example |
|---------|-------------|---------|
| `help` | Show available commands | "help" |
| `vat` | Get VAT summary | "vat" or "vat November" |
| `tax [amount]` | Calculate income tax | "tax 500000" |
| `profile` | View your tax profile | "profile" |
| `invoice` | Log a sale | Send invoice photo |
| `expense` | Log an expense | Send receipt photo |

## Tax Insights

### What Are Tax Insights?

PRISM analyzes your business data to provide personalized recommendations. You'll receive insights at the start of each month.

### Types of Insights

#### 1. Filing Reminders (High Priority)
```
🔔 VAT Filing Due Soon

Your VAT return for November 2024 is due on December 21st.

Current summary:
- Output VAT: ₦125,000
- Input VAT: ₦45,000
- Net payable: ₦80,000

Action: Reply "file" to generate your filing
```

#### 2. Savings Opportunities (Medium Priority)
```
💰 Potential Tax Saving Found

We noticed you have ₦150,000 in business expenses 
without receipts this month.

Capturing these receipts could save you ₦11,250 in VAT.

Action: Send photos of your receipts to claim input VAT
```

#### 3. Compliance Alerts (High Priority)
```
⚠️ Missing Business Registration

Your annual turnover suggests you should be 
VAT registered, but we don't have your VAT number.

Action: Reply with your VAT registration number or 
"register" to learn about VAT registration
```

#### 4. Spending Patterns (Low Priority)
```
📊 Monthly Spending Summary

Your business spending this month:
- Supplies: ₦450,000 (45%)
- Transport: ₦200,000 (20%)
- Utilities: ₦150,000 (15%)
- Other: ₦200,000 (20%)

Tip: Transport expenses are up 30% from last month
```

### Responding to Insights

You can:
- **Read**: Insights are automatically marked as read
- **Act**: Follow the suggested action
- **Dismiss**: Reply "dismiss" to clear the insight
- **Ask**: Reply with questions about the insight

## Tax Profile Detection

### How It Works

PRISM automatically detects your tax situation by analyzing:
- Your business type and size
- Transaction patterns
- Income sources
- Previous corrections you've made

### Profile Categories

#### Individual vs Business
- **Individual**: Personal income, freelance work
- **Business**: Registered company, partnerships

#### Employment Status
- **Employed**: Salary income, PAYE handled by employer
- **Self-employed**: Business owner, freelancer
- **Mixed**: Both employment and business income

### Special Tax Statuses

PRISM detects special statuses that affect your taxes:

#### 1. Pensioner
```
We detected pension-related transactions in your account.

Pension income is exempt from tax under the Nigeria Tax Act.

Is this correct? Reply:
- "yes" to confirm
- "no, I'm not a pensioner" to correct
```

#### 2. Senior Citizen (65+)
```
Based on your profile, you may qualify for 
senior citizen tax benefits.

If you're 65 or older, you're entitled to an 
additional ₦200,000 annual allowance.

Reply with your date of birth to confirm
```

#### 3. Diplomatic Status
```
Your profile indicates possible diplomatic status.

Diplomatic income is exempt from Nigerian tax.

Please provide your diplomatic ID to confirm
```

#### 4. Disability Status
```
Persons with disabilities qualify for an 
additional ₦400,000 annual tax allowance.

If applicable, please provide documentation to confirm
```

### Correcting Your Profile

If PRISM gets something wrong:

1. Type "profile" to see your current profile
2. Reply with what needs correction
3. Provide documentation if required
4. PRISM learns from your correction

Example:
```
You: profile

PRISM: Your Tax Profile:
- Type: Individual
- Status: Self-employed
- Pensioner: No
- Senior Citizen: No

You: I am a pensioner

PRISM: Thanks for the correction! I'll update your 
profile and recalculate any applicable tax exemptions.

Please send a photo of your pension documentation 
to confirm this status.
```

## AI Classification

### How PRISM Categorizes Transactions

When you send an invoice or receipt, PRISM:

1. **Extracts information** using OCR (image reading)
2. **Classifies the transaction** (sale, expense, etc.)
3. **Determines VAT treatment** (taxable, exempt, etc.)
4. **Learns from your corrections**

### Making Corrections

If PRISM classifies something incorrectly:

```
PRISM: I classified this as "Office Supplies" 
at ₦15,000 with 7.5% VAT.

Is this correct? Reply "yes" or correct me.

You: This is actually Fuel

PRISM: Got it! I've recorded this as "Fuel - Transport"
and will remember this vendor for next time.
```

### Pattern Learning

PRISM learns from your corrections:
- **Vendor patterns**: "Purchases from GTBank are usually bank charges"
- **Amount patterns**: "Transactions around ₦5,000 on Fridays are staff lunches"
- **Description patterns**: "Items containing 'diesel' are fuel expenses"

## Income Tax Calculator

### Basic Calculation

Type "tax [amount]" to calculate income tax:

```
You: tax 500000

PRISM: Personal Income Tax Calculation

Monthly Gross Income: ₦500,000
Annual Gross Income: ₦6,000,000

Deductions:
- Pension (8%): ₦480,000
- Consolidated Relief: ₦200,000 + 20%
- Total Relief: ₦1,840,000

Taxable Income: ₦4,160,000

Tax Breakdown:
- First ₦300,000 @ 7%: ₦21,000
- Next ₦300,000 @ 11%: ₦33,000
- Next ₦500,000 @ 15%: ₦75,000
- Next ₦500,000 @ 19%: ₦95,000
- Next ₦1,600,000 @ 21%: ₦336,000
- Balance ₦960,000 @ 24%: ₦230,400

Annual Tax: ₦790,400
Monthly Tax: ₦65,867
Effective Rate: 13.2%

Net Monthly Pay: ₦434,133
```

### With Special Status

If you have a special status, it's applied automatically:

```
You: tax 300000

PRISM: Personal Income Tax Calculation
(Pensioner status applied)

Monthly Pension: ₦300,000
Annual Pension: ₦3,600,000

Note: Pension income is exempt from personal 
income tax under the Nigeria Tax Act 2025.

Annual Tax: ₦0
Monthly Tax: ₦0

Net Monthly: ₦300,000
```

## VAT Management

### Checking VAT Status

Type "vat" for your current VAT position:

```
You: vat

PRISM: VAT Summary - November 2024

Output VAT (on sales): ₦125,000
- From 45 invoices

Input VAT (on purchases): ₦45,000
- From 23 receipts

Net VAT Payable: ₦80,000

Filing deadline: December 21, 2024
Status: Not yet filed

Reply "file" to generate your VAT return
```

### VAT-Exempt Items

PRISM automatically detects VAT-exempt items:
- Basic food items
- Medical services
- Educational materials
- Exported goods

## Tips for Best Results

### 1. Send Clear Photos
- Good lighting
- Full document visible
- Text readable

### 2. Respond to Confirmations
- Confirm or correct classifications
- This helps PRISM learn your patterns

### 3. Keep Profiles Updated
- Notify PRISM of status changes
- Update business information promptly

### 4. Act on Insights
- Review monthly insights
- Take suggested actions for savings

## Getting Help

- Type "help" for command list
- Type "support" for human assistance
- Email: support@prism.ng
- WhatsApp: +234-XXX-XXXX

## Privacy & Security

- Your data is encrypted
- Only you can access your business information
- PRISM never shares personal data
- AI learning uses anonymized patterns only
