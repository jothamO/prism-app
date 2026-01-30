---
name: prism-identity
description: NIN, TIN, CAC, BVN verification
triggers:
  - verify
  - NIN
  - TIN
  - CAC
  - BVN
  - RC\d+
---

# Identity Verification Skill

## When to Activate

- User mentions NIN, TIN, CAC, or BVN
- User asks to verify identity
- User provides ID number

## Supported ID Types

| ID Type | Format | Source |
|---------|--------|--------|
| NIN | 11 digits | NIMC |
| TIN | 10+ digits | FIRS |
| CAC/RC | RC + 6 digits | CAC |
| BVN | 11 digits | NIBSS |

## Verification Process

1. **Extract** ID type and number from message
2. **Validate** format
3. **Query** verification API (via Supabase function)
4. **Return** result with context

## Response Format

### NIN Verified
```
✅ *NIN Verified!*

Number: 123456*****
Name: Jotham O.
Status: Active

Your NIN is valid and ready for tax filing purposes.
```

### TIN Verified
```
✅ *TIN Verified!*

TIN: 1234567890
Entity: Jotham Ossai
Type: Individual
State: Lagos
Status: Active

You're good to go for FIRS filings!
```

### CAC Verified
```
✅ *Company Verified!*

RC: RC123456
Name: Acme Technologies Ltd
Type: Private Limited Company
Status: Active
Date Registered: 12 March 2020

Your company is in good standing with CAC.
```

### Verification Failed
```
❌ *Verification Failed*

I couldn't verify that [ID type].

Possible reasons:
- Number may be incorrect
- ID may not exist in the system
- Temporary service unavailable

Please double-check and try again.
```

## Privacy Notes

- Only show partial numbers in responses
- Don't store full ID numbers in chat history
- Log verification attempts for audit
