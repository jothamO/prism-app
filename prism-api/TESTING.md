# PRISM Testing Guide

This document outlines how to verify the functionality of the PRISM system, including the API and the Admin Dashboard.

## 1. API Testing (`prism-api`)

### Prerequisites
- Ensure the API server is running: `npm run dev` (Port 3000).
- Ensure PostgreSQL and Redis are running.

### Endpoints

#### Health Check
**Endpoint:** `GET http://localhost:3000/`
**Expected Response:** `200 OK` - "PRISM API is running"
**Command:**
```bash
curl http://localhost:3000/
```

#### WhatsApp Webhook (Mock)
**Endpoint:** `POST http://localhost:3000/api/webhook/whatsapp`
**Description:** Simulates an incoming message from WhatsApp.
**Payload:**
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "2348012345678",
          "text": { "body": "Hello PRISM" }
        }]
      }
    }]
  }]
}
```
**Command:**
```bash
curl -X POST http://localhost:3000/api/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"object":"whatsapp_business_account","entry":[{"changes":[{"value":{"messages":[{"from":"2348012345678","text":{"body":"Hello PRISM"}}]}}]}]}'
```

#### AI Classification Test
**Script:** `test-classification.ts`
**Description:** Tests the AI classification logic (Claude/OpenAI) directly.
**Command:**
```bash
npx ts-node test-classification.ts
```

---

## 2. Admin Dashboard Testing (`prism-web`)

### Prerequisites
- Ensure the frontend dev server is running: `npm run dev` (Port 5173).

### Access
- **URL:** `http://localhost:5173/admin/login`
- **Credentials:**
    - Email: `jothamossai@gmail.com`
    - Password: `PRISM568426#`

### Test Cases

#### Authentication
1.  Navigate to `/admin`. You should be redirected to `/admin/login`.
2.  Enter invalid credentials. Verify error message.
3.  Enter valid credentials. Verify redirection to Dashboard.

#### Dashboard Home
1.  Verify "Total Users", "Revenue", and "Filings" cards are displayed.
2.  Check that the "Recent Activity" feed is populated.

#### User Management
1.  Navigate to **Users** via the sidebar.
2.  Verify the table lists users (e.g., "Chidi Okeke").
3.  Test sorting by clicking the "Name" header.
4.  Test filtering by typing in the search bar.

#### Review Queue
1.  Navigate to **Review Queue**.
2.  Verify the list of transactions.
3.  Check the "Confidence" progress bars.
4.  Hover over the "Approve" (Check) and "Reject" (X) buttons.

#### Filings Management
1.  Navigate to **Filings**.
2.  Verify the list of tax filings (VAT, CIT).
3.  Check status colors (Green for Filed, Yellow for Pending).
