

# Apply 3 Pending Migrations

## Overview

I'll apply the 3 pending migrations to your Lovable Cloud database. These migrations add agent security, action tracking, and structured memory capabilities.

## Migrations to Apply

### Migration 1: Agent Security & RBAC
**File**: `20260203000000_agent_security_rbac.sql`

| Component | Description |
|-----------|-------------|
| `app_role` enum | Adds 'owner' role |
| `users` table | Adds `is_flagged`, `breach_count` columns |
| `security_breach_logs` table | Tracks security breaches for 3-Strike Rule |
| RLS policies | Admins/owners can view all logs, users see their own |

### Migration 2: Agent Action History
**File**: `20260203000001_agent_action_history.sql`

| Component | Description |
|-----------|-------------|
| `agent_action_logs` table | Perception-Reasoning-Action audit trail |
| `agent_review_queue` table | Tier 3/4 proposals requiring user approval |
| Indexes | User-based and cycle-based lookups |
| Triggers | Auto-update `updated_at` column |

### Migration 3: Structured Memory (PARA)
**File**: `20260203000002_agent_structured_memory.sql`

| Component | Description |
|-----------|-------------|
| `para_layer` enum | project, area, resource, archive |
| `atomic_facts` table | Durable agent knowledge base |
| `active_user_knowledge` view | Non-superseded facts for context building |
| RLS policies | Users see their own, service role manages all |

## Execution Plan

1. **Apply Migration 1** - Add owner role, security breach tracking
2. **Apply Migration 2** - Add agent action logs and review queue
3. **Apply Migration 3** - Add atomic facts and PARA memory structure

## Technical Notes

- All tables include RLS enabled with appropriate policies
- Foreign keys reference `public.users(id)` with CASCADE delete
- Indexes optimized for user-based queries
- Existing `has_role()` function will automatically support 'owner' role

