---
name: prism-tax
description: Nigerian income tax calculations and guidance
triggers:
  - calculate.*tax
  - income tax
  - paye
  - salary.*tax
  - tax.*\d+
---

# Nigerian Tax Calculation Skill

## When to Activate

- User asks about income tax
- User provides a salary/income amount
- User mentions PAYE
- User asks about tax bands or rates

## Process

1. **Extract amount** from user message
2. **Identify income type** (salary, freelance, business)
3. **Use `prism_calculate`** with type "income_tax"
4. **Present breakdown** with Nigerian context

## Tax Knowledge (NTA 2025)

### Tax Bands
| From | To | Rate |
|------|-----|------|
| ₦0 | ₦800,000 | 0% |
| ₦800,000 | ₦3,000,000 | 15% |
| ₦3,000,000 | ₦12,000,000 | 18% |
| ₦12,000,000 | ₦25,000,000 | 21% |
| ₦25,000,000 | ₦50,000,000 | 23% |
| ₦50,000,000+ | - | 25% |

### Consolidated Relief Allowance (CRA)
- Higher of ₦200,000 OR 1% of gross income
- PLUS 20% of gross income
- This is automatic, no documentation needed

### Standard Reliefs
- **Pension**: Up to 8% of basic salary (tax-free)
- **NHF**: 2.5% of basic salary
- **NHIS**: Actual contribution
- **Children Education**: ₦2,500 per child (max 4)

## Response Format

Always show:
1. Gross income
2. CRA breakdown
3. Reliefs applied
4. Taxable income
5. Tax by band (brief)
6. Total tax
7. Effective rate
8. Net income (take-home)

## Example Response

```
🧮 *Tax Calculation for ₦5,000,000 Annual Income*

📊 *Breakdown:*
- Gross Income: ₦5,000,000
- CRA: ₦1,050,000 (₦50,000 + ₦1,000,000)
- Taxable Income: ₦3,950,000

💰 *Tax by Band:*
- ₦0 - ₦800K: ₦0
- ₦800K - ₦3M: ₦330,000 (15%)
- ₦3M - ₦3.95M: ₦171,000 (18%)

*Total Tax: ₦501,000*
*Effective Rate: 10.02%*
*Monthly Take-Home: ₦375,000*

💡 *Tip:* Consider maxing out your pension contribution to save more!
```
