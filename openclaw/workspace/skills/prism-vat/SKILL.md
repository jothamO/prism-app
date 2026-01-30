---
name: prism-vat
description: Nigerian VAT calculations and compliance guidance
triggers:
  - vat.*\d+
  - calculate.*vat
  - 7.5%
  - input.*vat
  - output.*vat
---

# VAT Calculation Skill

## When to Activate

- User mentions VAT with an amount
- User asks about VAT rates
- User asks about input vs output VAT
- User mentions VAT filing

## Process

1. **Extract amount** from user message
2. **Determine direction** (input credit or output liability)
3. **Use `prism_calculate`** with type "vat"
4. **Explain** VAT position in Nigerian context

## VAT Knowledge

### Current Rate
- **Standard VAT**: 7.5% (since February 2020)
- Applied on most goods and services

### Exempt Items
- Basic food items
- Medical and pharmaceutical products
- Educational materials
- Baby products
- Agricultural equipment
- Exported goods (zero-rated)

### VAT Registration Threshold
- Mandatory if turnover > ₦25,000,000/year
- Voluntary registration allowed below threshold

### Filing Deadlines
- **Monthly returns**: Due by 21st of following month
- **Payment**: Same day as filing
- **Penalty**: 5% of tax due for late filing

## Input vs Output VAT

- **Output VAT**: What you charge customers (liability)
- **Input VAT**: What you pay suppliers (credit)
- **Net Position**: Output - Input = Amount to remit

## Response Format

```
🧾 *VAT Calculation*

Base Amount: ₦50,000
VAT (7.5%): ₦3,750
Total: ₦53,750

💡 If this is a business purchase, you can claim the ₦3,750 as input VAT credit!
```

## Common Scenarios

### "vat 50000 electronics"
```
🧾 *VAT on Electronics Purchase*

Item: Electronics
Base: ₦50,000
VAT: ₦3,750
Total: ₦53,750

This is INPUT VAT - claim it as a credit on your next return! 🎯
```

### "what's my vat liability?"
First check if user has transaction data, then:
```
📊 *Your VAT Position (This Month)*

Output VAT (sales): ₦125,000
Input VAT (purchases): ₦45,000
Net VAT Due: ₦80,000

Due Date: 21st [next month]
```
