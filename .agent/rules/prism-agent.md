---
trigger: always_on
---

# PRISM Agent Rules (Condensed)
**Version:** 2.5 | **Status:** Azure Production | **Max Len:** 12k Characters

## 0. Meta-Principles
1. **Fact-Grounded**: Tax logic must cite Nigerian law (Constitution > Acts > Finance Acts > Circulars).
2. **Centralized**: One source of truth. Zero duplication. Grep before building.
3. **Agentic**: Autonomous for <High Confidence + Non-Destructive>. Human-in-loop for <Low Confidence OR Critical>.
4. **Visibility**: Always ensure UI elements required for new system functions/roles are created to allow manual overrides and management.

## 1. System Vision (Azure VPS)
- **Namespaces**: `/var/www/prism-ecosystem`, `school-ranker`, `open-claw`
- **Runtimes**: Bun (API/Agent), Node/PM2 (Process Mgmt), Ollama (Vector/LLM)
- **Memory**: QMD (PARA Structure) local SQLite + Vector at `/var/lib/prism/qmd`
- **Security**: 3-Tier RBAC (Owner > Admin > User) + 3-Strike Breach Policy.

## 2. Fact-Grounded Tax Rules (CRITICAL)
- **Citation Required**: Every rule must cite source (e.g., *NTA 2025 Sec 18*).
- **No Hardcoding**: Rates must live in `compliance_rules` table. Use `rulesClient`.
- **Precedence**: Constitution > Parliament Acts > Finance Acts > FIRS Gazettes > Circulars.
- **Assumptions**: Mark as `⚠️ UNVERIFIED` and cite "Source Needed". Never guess tax math.

## 3. Centralization & Shared Utilities
**Grep before you build:** `grep -r "functionName" .`

| Utility | Location | Purpose |
|:---|:---|:---|
| `corsHeaders` | `_shared/cors.ts` | Edge Function CORS |
| `supabaseClient` | `_shared/supabase.ts` | DB Access (Pooling) |
| `rulesClient` | `_shared/rules-client.ts`| Tax Rule Fetching |
| `contextBuilder` | `agent-core/memory/` | AI Context Grounding |
| `tax-calculate` | Central Service | All tax math / NLT-to-Split |
| `doc-intelligence`| Central Service | OCR + MD Ghosting + Purge |

## 4. Agentic Safety: The Escalation Ladder
| Tier | Type | Action Example | Human Agency |
|:---|:---|:---|:---|
| **1** | **Obs** | Indexing, YTD calcs, logs | **Autonomous**: Background. |
| **2** | **Adv** | Reminders, hints, tagging | **Passive**: Exec + 24h Undo. |
| **3** | **Act** | Txn splits, draft projects | **Proposal**: Requires "Apply". |
| **4** | **Crit**| Filings, Payments, Identity | **MFA**: Handover + OTP/PWD. |

## 5. Privacy: Metadata Ghosting Workflow
1. **Intake**: Multi-modal files (PDF/Receipts) to temp storage.
2. **Extract**: `doc-intelligence` converts to Markdown Intelligence Layer.
3. **Ghosting**: Calculate SHA-256 Hash of original. Store hash + extraction metadata.
4. **Purge**: **Permanently delete binary** seconds after verified extraction.
*Audit Proof: Re-uploading the source must match the Metadata Ghost hash.*

## 6. Phase/Task Completion Protocol (MANDATORY)
1. **Mark ✅ in `MASTER_IMPLEMENTATION_PLAN.md`**: Date + key metrics.
2. **Update `PRISM_ARCHITECTURE_MAP.md`**: Status + diagrams.
3. **Record Lesson Learned**: Add structured entry to Section 11 of this doc.
4. **Update `task.md`**: Granular item check-off.
5. **Commit with Structure**: `Complete [Phase.Task]: [Short desc]`.

## 7. Development Standards
- **Strict Types**: `strict: true` always. Handle nulls explicitly. No `any` without double-cast.
- **Errors**: Try-catch every async call. Log structured data: `console.log('[Module] msg', { data })`.
- **Naming**: kebab-case (files), PascalCase (Classes/Interfaces), camelCase (functions).
- **UI Gaps**: Never implement a backend change (like a new role or status) without corresponding UI controls.

## 8. Security: The 3-Strike Rule
- **Monitoring**: Log unauthorized access probes in `security_breach_logs`.
- **Enforcement**: 3 strikes in 30 days = `is_flagged = true`. AI Disabled.
- **Grounding**: Inject verified `user.role` from DB into every AI system prompt.

## 9. Performance Targets
- **Context Build**: <200ms | **Tax Calc**: <500ms | **Agent Cycle**: <3s
- **AI Cost**: Target <$0.10/user/month. Alert at $25/day spend.

## 10. Memory Hierarchy (PARA + Decay)
1. **Projects**: Active filings. 2. **Areas**: Ongoing compliance. 3. **Resources**: Tax laws. 4. **Archives**: History.
**Hot/Warm/Cold**: Hot (7 days) context. Warm (30 days) on-demand. Cold (30+ days) search-only.

## 11. Lessons Learned
### Lesson 2026-02-03: Nginx Gateway (502 Bad Gateway)
**What was built:** Hono API Gateway behind Nginx on Azure.
**Decisions:** Explicitly use `Bun.serve()` instead of `export default`.
**Challenges:** PM2 ignores `export default` patterns; port 3000 wouldn't bind.
**Takeaway:** Explicit server binding is mandatory for process managers.

### Lesson 2026-02-03-B: Agentic Database Schema
**What was built:** Migrations for security logs, action history, and PARA atomic facts.
**Decisions:** Used a `para_layer` enum and supersession chains (`is_superseded`) for facts to ensure an audit trail without deleting history. Combined RBAC and security logging to support the 3-Strike Rule.
**Takeaway:** Never delete tax history; use supersession to maintain a queryable state of truth.

## 12. Success Criteria (V35)
- Orchestrator Uptime: >99.5% | Proactive Approval: >80%
- Zero Halucinations on Tax Citations.
- No Sensitive Binaries Stored (Purge-on-Verify).
- Grounded logic for 100% Audit Readiness.
