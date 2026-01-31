
# Transaction Enhancements Implementation

## Overview
Apply database migration to add transaction splitting, receipt processing, recurring detection, and VAT breakdown capabilities to the `bank_transactions` table, then deploy the receipt processing edge function.

## Database Changes

### New Columns on `bank_transactions`

| Column | Type | Purpose |
|--------|------|---------|
| `parent_transaction_id` | UUID | Links split children to original transaction |
| `is_split` | BOOLEAN | Marks child transactions from splits |
| `split_note` | TEXT | Explains split reasoning |
| `receipt_markdown` | TEXT | Stores OCR-extracted receipt content |
| `receipt_source_hash` | TEXT | SHA-256 hash for verification (original not stored) |
| `is_recurring` | BOOLEAN | Flags recurring transactions |
| `recurring_pattern` | TEXT | Pattern name (e.g., "Netflix", "monthly") |
| `vat_gross` | NUMERIC(15,2) | VAT-inclusive amount |
| `vat_net` | NUMERIC(15,2) | Net amount excluding VAT |
| `vat_amount` | NUMERIC(15,2) | VAT portion |
| `vat_rate` | NUMERIC(5,2) | Rate applied (default 7.5%) |
| `user_note` | TEXT | User context for AI reclassification |

### New Indexes
- `idx_bank_transactions_parent` - Efficient split queries
- `idx_bank_transactions_has_receipt` - Find transactions with receipts
- `idx_bank_transactions_recurring` - Query recurring transactions

## Edge Function Deployment

The `process-receipt` function will be deployed. It:
- Accepts base64 image uploads
- Generates SHA-256 hash for verification
- Uses Claude Vision to extract receipt content to Markdown
- Stores in `receipt_markdown` column
- Does NOT store original images (privacy by design)

## Technical Details

### Dependencies
- `ANTHROPIC_API_KEY` secret (already configured)
- Authenticated user context for RLS

### Implementation Steps

1. **Apply migration** using Supabase migration tool
2. **Deploy edge function** - `process-receipt` will be deployed automatically

### Type Updates
After migration, the Supabase types will automatically update to include the new columns.

## Security Notes
- Receipt storage is privacy-first: only extracted text is stored, never original images
- RLS policies on `bank_transactions` already protect per-user access
- Edge function validates user authentication before processing
