# PRISM Tools

These tools allow PRISM to access user data from Supabase.

## prism_query

Query user data from Supabase database.

**Arguments:**
- `table` (required): Table name (transactions, invoices, projects, inventory, payables)
- `userId` (required): User's internal ID
- `filters` (optional): Additional filters as key-value pairs
- `limit` (optional): Max rows to return (default: 50)

**Example:**
```json
{
  "table": "transactions",
  "userId": "uuid-here",
  "filters": { "category": "expense" },
  "limit": 10
}
```

---

## prism_profile

Get user profile and preferences.

**Arguments:**
- `userId` (required): User's internal ID

**Returns:**
- preferred_name, entity_type, work_status, industry, state
- accounting_basis, fiscal_year_end
- onboarding status

---

## prism_save

Save user data to Supabase.

**Arguments:**
- `type` (required): What to save (project, invoice, memory, transaction)
- `userId` (required): User's internal ID
- `data` (required): Object with data to save

**Example:**
```json
{
  "type": "project",
  "userId": "uuid-here",
  "data": {
    "name": "Website Redesign",
    "budget": 500000,
    "client": "Acme Ltd"
  }
}
```

---

## prism_calculate

Perform tax/VAT calculations using Nigerian tax rules.

**Arguments:**
- `type` (required): Calculation type (income_tax, vat, withholding, emtl)
- `amount` (required): Base amount in Naira
- `options` (optional): Additional options (e.g., relief claims, expense deductions)

**Example:**
```json
{
  "type": "income_tax",
  "amount": 5000000,
  "options": {
    "pensionContribution": 400000,
    "nhfContribution": 100000
  }
}
```

---

## prism_memory

Store or retrieve remembered facts about the user.

**Arguments:**
- `action` (required): "get" or "save"
- `userId` (required): User's internal ID
- `fact` (optional, for save): The fact to remember

**Example (save):**
```json
{
  "action": "save",
  "userId": "uuid-here",
  "fact": "User's business is a fashion boutique in Lagos"
}
```

**Example (get):**
```json
{
  "action": "get",
  "userId": "uuid-here"
}
```
