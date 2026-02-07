# PRISM Master Implementation Plan: The Agentic Evolution (V26-V35)

This document serves as the production-ready roadmap for transforming PRISM from a reactive tax tool into an autonomous Agentic System with comprehensive risk management, observability, and deployment strategy.

---

## 1. System Vision Map (Monodraw)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PRISM AGENTIC ECOSYSTEM                            │
│                      (V35 Blueprint: The Proactive Era)                     │
└─────────────────────────────────────────────────────────────────────────────┘

       [ CHANNELS ]                 [ AGENTIC CORE ]             [ ENGINE LAYER ]
    Web / TG / WA / API           (Orchestrator Loop)            (Intelligence)
           │                             │                              │
           ▼                             ▼                              ▼
┌───────────────────┐        ┌───────────────────────┐        ┌───────────────────────┐
│ CHANNEL GATEWAY   │        │ PERCEPTION ENGINE     │        │ CONNECTED INTEL       │
│ (User Resolution) ◄───────►│ (YTD / Thresholds)    │◄───────►│ (Context Builder)     │
└─────────┬─────────┘        └───────────┬───────────┘        └───────────┬───────────┘
          │                              │                                │
          ▼                              ▼                                ▼
┌───────────────────┐        ┌───────────────────────┐        ┌───────────────────────┐
│ REASONING ENGINE  │        │ ACTION STATE MACHINE  │        │ LOCAL KNOWLEDGE BASE  │
│ (Claude Haiku AI) ├───────►│ (Confirm/Correct)     ├───────►│ (QMD / SQLite / RAG)  │
└─────────┬─────────┘        └───────────┬───────────┘        └───────────┬───────────┘
          │                              │                                │
          ▼                              ▼                                ▼
┌───────────────────┐        ┌───────────────────────┐        ┌───────────────────────┐
│ INTAKE GATEWAY    │        │ IDENTITY GATEWAY      │        │ STATEFUL TAX ENGINE   │
│ (MD Ghost / Purge)◄───────►│ (Verified Claims Only)│◄───────►│ (YTD / Optimization)   │
└─────────┬─────────┘        └───────────────────────┘        └───────────┬───────────┘
          │                                                               │
          ▼                          [ DATABASE ]                         ▼
┌───────────────────┐        ┌───────────────────────┐        ┌───────────────────────┐
│ DRAFT / NOTIF /   │◄──────►│ Supabase / PG_Cron /  │◄──────►│ GITHUB CHANGELOG      │
│ PERSISTENCE       │        │ Real-time Broadcast   │        │ (Self-Documentation)   │
└───────────────────┘        └───────────────────────┘        └───────────────────────┘

[ SKILL LAYER (The Muscles) ]
- Tax-Calculate (Logic Engine)
- Doc-Intelligence (OCR/Intake)
- Identity-Gateway (Mono/CAC)
- Calendar-Soul (Scheduling)
- Communication-Portal (WA/TG/Web)
```

---

## 2. Implementation Phases

### Phase 0: Azure Foundation (Infrastructure) [DONE]
*Priority: 🔴 CRITICAL | Objective: Establishing the Multi-Project Azure Environment*

| Task | Priority | Description |
|:---|:---|:---|
| **P0.1: Azure Provisioning** | 🔴 High | Spin up `Standard_D2s_v5` (Ubuntu 24.04.3 LTS) with managed SSD storage. |
| **P0.2: Namespaced Setup** | 🔴 High | Create `/var/www/` structure for `prism-ecosystem`, `school-ranker`, and `open-claw`. |
| **P0.3: OS Hardening** | 🔴 High | Create `deploy` user, setup SSH keys, disable root login, and configure UFW rules. |
| **P0.4: QMD & Runtime** | 🔴 High | Install **Bun**, **Ollama**, and **tobi/qmd**. Setup per-project vector collections. |
| **P0.5: Nginx & SSL** | 🔴 High | Configure Nginx virtual hosts + Certbot for separate `prism.sh` and `schoolranker.com` APIs. |
| **P0.6: Service Setup** | 🔴 High | Port local `agent-core` files to Azure. Setup **PM2** processes per ecosystem. |
| **P0.7: DB Connection** | 🔴 High | Establish secure SSL peering between Azure VPS and Supabase Prod DB. |
| **P0.8: Smoke Test** | 🔴 High | E2E connectivity test: **Lovable (Frontend) -> Azure (Agent) -> Supabase (Data)**. |

### Phase 6: The Nervous System (REVISED) - Monty-Powered Agentic Core
*Goal: Shift from custom TS orchestration to sandboxed Python execution for superior security and durability.*

| Task | Priority | Description |
|:---|:---|:---|
| **P6.1: OpenRouter Setup** | 🔴 High | [DONE] Centralized AI routing via `@openrouter/sdk` with Tiered fallback. |
| **P6.2: Ollama Embeddings** | 🔴 High | One-time index generation for QMD manager. |
| **P6.3: Model Strategy** | 🔴 High | [DONE] glm-4.7-flash (fast) → Claude 3.5 Sonnet (reasoning) transition. |
| **P6.4: Monty Installation** | 🔴 High | [DONE] Install `pydantic-monty` on Azure VPS. Verify <1ms startup. |
| **P6.5: External Functions** | 🔴 High | Define type-safe Registry for agent-callable functions with Tier-based gates. |
| **P6.6: Type Stub Definitions**| 🔴 High | Create Python stubs for tax laws and skills to validate code pre-execution. |
| ✅ P6.7: Snapshot Persistence| 🔴 High | [DONE] Save/Resume bytecode snapshots in `agent_snapshots` for durable Tier 3/4 workflows. |
| **P6.8: Claude Code Gen** | 🔴 High | Prompt Claude to generate Python logic instead of simple tool calls. |
| **P6.9: QMD Integration** | 🔴 High | Wire QMD queries as external functions for tax law retrieval (Augmented RAG). |
| **P6.10: Memory Structure** | 🔴 High | [DONE] Deploy **PARA** structure (Projects/Areas/Resources/Archives) for atomic facts. |
| **P6.11: Memory Decay** | 🟡 Medium | Implement **Hot/Warm/Cold** tiers for context optimization. |
| **P6.12: Heartbeat Extract** | 🟡 Medium | [DONE] Background task to autonomously extract durable tax facts from chat logs. |
| ✅ P6.13: Database Schema | 🔴 High | Implemented `agent_action_logs`, `agent_review_queue`, and `atomic_facts`. |
| ✅ P6.14: AI Security/RBAC | 🔴 High | Implemented 3-tier roles and 3-strike breach policy. |
| **P6.15: Soul Porting** | 🔴 High | Inject `PRISM_PERSONALITY.md` guidelines into the reasoning core. |
| ✅ P6.16: Gateway Porting | 🔴 High | [DONE] Refactor OCR/PDF Skills to use the consolidated AI wrapper. |
| **P6.17: Statement Hydration**| 🔴 High | [DONE] Bank Statement parser → YTD state mapping. |
| ✅ P6.18: Metadata Ghosting | 🟡 Medium | [DONE] SHA-256 ghosting for privacy compliance (purge-on-verify). |
| **P6.19: Performance Tests** | 🟡 Medium | Benchmark: 1000 users/cycle < 3s total. |
| ✅ P6.20: Full Deployment to Azure VPS | 🔴 High | [DONE] PM2/Nginx setup for agentic core. |

### Phase 7: UI Revamp (Proactive & Premium)
*Goal: Moving from Reactive clicks to Proactive Guidance*

| Task | Priority | Description |
|:---|:---|:---|
| **P7.1: Integration Checklist**| 🔴 High | New Dashboard widget driving users through mandatory TG/WA/KYC steps. |
| **P7.2: Glassmorphism Card** | 🟡 Medium | Implement unified HSL design tokens and premium card styles. |
| **P7.3: Bottom Nav (Mobile)** | 🟡 Medium | Optimize layouts for Nigerian mobile-first usage patterns. |
| **P7.4: Health Radial** | 🟢 Low | Visual PIT/VAT compliance score based on YTD data. |
| **P7.5: Dark Mode** | 🟡 Medium | System-wide dark theme with auto-detection based on user preference. |
| **P7.6: Accessibility Audit** | 🟡 Medium | WCAG 2.1 AA compliance for all new UI components. |
| **P7.8: Agent Proposal Hub** | 🔴 High | Multi-channel HQ for Admins to review and approve Tier 3/4 Agent actions. |
| **P7.9: Security Dashboard**| 🔴 High | Live interface for `is_flagged` users, breach logs, and manual strike resets. |
| **P7.10: Memory Inspector** | 🟡 Medium | UI to visualize a user's "Atomic Facts" (Projects/Areas/Archives). |

### Phase 8: Identity & Gating (The Trust Layer)
*Goal: Ensuring legal compliance before financial depth*

| Task | Priority | Description |
|:---|:---|:---|
| **P8.1: Mono Identity** | 🔴 High | Background NIN/BVN verification (verification status only). |
| **P8.2: CAC Lookup** | 🟡 Medium | Verify business registration numbers against real-time registry. |
| **P8.3: Project Locking** | 🔴 High | Prevent transaction mapping to "Verified Projects" unless Identity is green. |
| **P8.4: Mono Circuit Breaker** | 🔴 High | Fallback to manual verification if Mono API is down >5 minutes. |
| **P8.5: Privacy Impact** | 🔴 High | GDPR/NDPR compliance review for NIN/BVN storage. Legal sign-off required. |
| **P8.6: Verification Failure UX** | 🟡 Medium | Clear user messaging when identity verification fails, with retry flow. |

### Phase 9: Operational Intelligence
*Goal: Self-maintaining system*

| Task | Priority | Description |
|:---|:---|:---|
| **P9.1: GitHub Sync** | 🟡 Medium | `generate-changelog-md` creates commits for tax rule updates. |
| **P9.2: Multi-Year Engine** | 🔴 High | Add `year` context to `tax-calculate` for historical filings (2023/2024). |
| **P9.3: Global Trends** | 🟢 Low | Cross-tenant analytics for trending tax categories across SMEs. |
| **P9.4: Performance Benchmarks** | 🔴 High | Define targets: YTD calc <200ms, tax-calculate <500ms, agent cycle <3s. |
| **P9.5: Cost Alerts** | 🔴 High | Email alert if weekly Anthropic spend exceeds $30. Hard stop at $50/day. |
| **P9.6: Anomaly Detection** | 🟡 Medium | Flag unusual patterns (e.g., user suddenly has ₦100M revenue spike). |

### Phase 10: Testing & Quality Assurance
*Goal: Production-grade reliability*

| Task | Priority | Description |
|:---|:---|:---|
| **P10.1: Unit Test Coverage** | 🔴 High | 80%+ coverage for Orchestrator, Perception, Reasoning engines. |
| **P10.2: Integration Tests** | 🔴 High | End-to-end tests for Perception→Reasoning→Action flow. |
| **P10.3: Load Testing** | 🟡 Medium | Simulate 100+ concurrent users on Orchestrator loop. |
| **P10.4: Chaos Engineering** | 🟢 Low | Test agent behavior when Supabase/Claude API fails. |

### Phase 11: Deployment Strategy
*Goal: Zero-downtime rollout*

| Task | Priority | Description |
|:---|:---|:---|
| **P11.1: Blue-Green Deploy** | 🔴 High | Zero-downtime deployment for agentic core components. |
| **P11.2: Database Migrations** | 🔴 High | Automated schema changes with rollback capability. |
| **P11.3: Rollback Procedure** | 🔴 High | One-command rollback if Orchestrator causes production issues. |
| **P11.4: Monitoring Setup** | 🔴 High | Grafana dashboards for agent cycle time, confidence scores, action success rates. |

### Phase 12: Observability
*Goal: Full system transparency*

| Task | Priority | Description |
|:---|:---|:---|
| **P12.1: Agent Metrics** | 🔴 High | Track: cycles/day, actions/user, avg confidence, human review rate. |
| **P12.2: Cost Dashboard** | 🔴 High | Real-time tracking of Anthropic API spend (target: <$100/month). |
| **P12.3: Error Alerting** | 🔴 High | PagerDuty/Slack alerts if Orchestrator fails 3+ cycles in a row. |
| **P12.4: User Analytics** | 🟡 Medium | Track: proactive message open rate, action approval rate, churn correlation. |
| **P12.5: QMD Manager** | 🔴 High | Interface to upload, index, and health-check tax laws in the vector database. |
| **P12.6: Logic Auditor** | 🔴 High | "Step-through" reasoning viewer showing exactly which tax laws influenced a decision. |
| **P12.7: Proactivity Pulse**| 🟡 Medium | Analytics on "Undo" rates to tune the Agent's proactivity vs. user annoyance. |
| **P12.8: Orchestrator Ops** | 🔴 High | Real-time status board for background cycles, cycle durations, and loop success. |

### Phase 13: Production Consolidation (The Factory)
*Goal: Moving Production to Native Azure VPS (Staging remains Hybrid)*

| Task | Priority | Description |
|:---|:---|:---|
| **P13.1: Hono API Port** | 🔴 High | [DONE] Ported Supabase Edge Functions to VPS Hono server at `/var/www/prism-ecosystem/production/api`. |
| **P13.2: Static Hosting** | 🔴 High | Configure Nginx/Bun to serve the built React frontend on Azure. |
| **P13.3: Build Pipeline** | 🔴 High | Automate `Git -> Build -> PM2 Restart` flow for Zero-Downtime production. |
| **P13.4: SSL & Networking**| 🔴 High | Setup Let's Encrypt (Certbot) and hardware firewall rules on Azure. |
| **P13.5: DB Tunneling** | 🟡 Medium | Establish secure connection between Azure Production and Supabase Prod DB. |
| **P13.6: Migration Script** | 🔴 High | Develop `migrate-to-self-hosted.sh` to automate schema, RLS, and Function transfer to private Supabase. |

### Phase 14: Automation Infrastructure (Self-Hosted n8n)
*Goal: Composable automation and agentic glue with full data sovereignty.*

| Task | Priority | Description |
|:---|:---|:---|
| ✅ P14.1: Deploy n8n | 🔴 High | [DONE] Docker Compose setup with Port 5678. |
| ✅ P14.2: Redis Queue Setup | 🔴 High | [DONE] BullMQ shared state via Docker-provided Redis. |
| ✅ P14.3: Secure Proxy | 🔴 High | [DONE] Nginx `n8n.prism.sh` + SSL configuration. |
| **P14.4: Deadline Workflow** | 🔴 High | Port filing deadline alerts from TypeScript to visual n8n workflow. |
| **P14.5: Integration Port** | 🔴 High | Migrate WhatsApp/Telegram notification logic into n8n shared nodes. |
| **P14.6: GDrive Backup** | 🟡 Medium | Implement auto-sync to user Google Drive for processed tax documents. |
| **P14.7: Agentic n8n** | 🔴 High | Port core agentic loops (P6.x) to n8n AI Agent nodes for visual orchestration. |


---

## 3. Roadmap & Milestones

| **Target** | **Milestone** | **Date** |
|:---|:---|:---|
| **V25b** | **Infrastructure Live**: Azure VPS, QMD, and SSL operational. | T+2 Days |
| **V26** | Database migrations complete. Agent tables created. | T+5 Days |
| **V27** | Orchestrator MVP deployed. Manual trigger only (no cron yet). | T+10 Days |
| **V28** | QMD indexed. Perception engine live (YTD + Thresholds). | T+13 Days |
| **V29** | Reasoning engine + Action executor integrated. First proactive alerts sent. | T+18 Days |
| **V30** | PARA memory + Decay tiers operational. Heartbeat extraction running. | T+24 Days |
| **V31** | UI Revamp complete. Glassmorphism + Bottom Nav deployed. | T+30 Days |
| **V32** | Identity Gating enforced. Mono verification live. | T+35 Days |
| **V33** | **Production Consolidation**: Production moves to 100% Azure Native. | T+40 Days |
| **V34** | Observability complete. Agent metrics dashboard operational. | T+45 Days |
| **V35** | Full Agentic Maturity. Load tested for 500 concurrent users. | T+50 Days |

---

## 4. Environment Architectures

To balance speed of development with production control, we maintain two distinct stack configurations:

### A. Hybrid Staging (The Laboratory)
*Optimized for visual iteration and rapid experimentation.*
*   **Frontend**: Hosted on **Lovable Cloud** (instant UI deployments).
*   **Intelligence**: Hosted on **Azure Staging Instance** (Agent/QMD/Orchestrator).
*   **Persistence**: **Supabase Staging Project** (DB/Auth).
*   **Gateways**: Mix of Supabase Edge Functions and Azure local hooks.

### B. Consolidated Production (The Factory)
*Optimized for reliability, performance, and legal independence.*
*   **Frontend**: Hosted natively on **Azure Production** (Nginx/Bun/Built React).
*   **Intelligence**: Hosted on **Azure Production Instance** (Agentic Core).
*   **Persistence**: **Supabase Production Project** (High-availability DB).
*   **Gateways**: **Hono/Express Native Server** on Azure (zero cold-start latency).

---

## 5. Technical Constraints (Enhanced)

1.  **Anti-Hallucination**: No AI response without `context-builder` OR `qmd.query` grounding.
2.  **Privacy-First**: Ephemeral intake purges files after MD + Hash.
3.  **Human-in-Loop**: Database-mutating actions REQUIRE user confirmation.
4.  **Local Intelligence**: QMD + Ollama minimize Anthropic API usage.
5.  **Performance SLAs**: 
    - Context build: <200ms (p95)
    - Tax calculation: <500ms (p95)
    - Agent cycle: <3s (p95)
6.  **Data Retention**: 
    - `agent_action_logs`: 12 months
    - `atomic_facts`: Permanent (supersession chain)
    - `conversation_history`: 24 months
7.  **Graceful Degradation**: If Orchestrator fails, system reverts to reactive mode automatically.
8.  **Cost Guardrails**: Hard stop if daily Anthropic spend exceeds $50. Alert at $25.
9.  **Immutable History**: Strictly NO deletion of historical financial/tax records. Database RLS/Triggers must block `DELETE` ops unless an `ACCOUNT_PURGE` event is triggered.
10. **Hybrid Undo**: All Tier 2 autonomous actions must provide a 1-click "Undo" button (Inline on TG/WA) with a "Quick Revert" web fallback link.
11. **Skill Orchestration**: Skills (Tax-Calc, OCR, Identity) are the "Muscles" of the system. The Agent replaces the Human as the primary trigger for these tools. Specialized logic remains encapsulated within the Skill framework.
12. **Secure Handover (MFA)**: Tier 4 critical actions REQUIRE a secure handover to the PRISM Web Portal via a unique, time-bound link. Users must verify their intent using either their **Account Password** or a **One-Time Password (OTP)** sent to their registered **Email**.
13. **Proxied Requests (Azure Bridge)**: Lovable calls a Supabase Edge Function (`/api/agent`), which acts as a secure reverse proxy to the Azure VPS to maintain IP privacy and solve CORS.
14. **Signed Communication (HMAC)**: All requests to the Azure Agentic Core must be signed with a shared secret (`PRISM_AGENT_KEY`) to prevent unauthorized API execution.
15. **Real-Time Heartbeat**: Azure updates the "Agent thinking..." state via **Supabase Realtime Broadcasts**, allowing UI progress bars during complex operations.

---

## 6. Agentic Restraint & Safety (Escalation Ladder)

To ensure PRISM remains a tool for the user and not a "black box" actor, all agent actions are governed by this hierarchy:

| Tier | Name | Description | User Agency |
|:---|:---|:---|:---|
| **Tier 1** | **Observational** | Knowledge indexing, YTD calcs, threshold checks. | **Autonomous**: Runs in background. |
| **Tier 2** | **Advisory** | Auto-tagging, optimization hints, reminders. | **Passive**: Executed, but with a mandatory 24h "Undo" button. |
| **Tier 3** | **Active** | Transaction splits, reclassifications, project drafts. | **Proposal**: Created as a `Draft`. Requires explicit "Apply" signal. |
| **Tier 4** | **Critical** | Filing submissions, identity changes, payments. | **Hard Block**: Secure Handover (Link to Web) + Password/Email OTP. |

---

## 7. AI Security & Breach Policy (The 3-Strike Rule)

To protect the system from prompt injection and unauthorized data access, the following security logic is enforced:

### A. Role Hierarchy (Supabase Verified)
1.  **User** (Default): Access restricted strictly to own `user_id`. Cannot see logs or tax rules.
2.  **Admin**: Cross-user data access for support, compliance rule management, and log review.
3.  **Owner**: Full infrastructure control, encryption keys, and irreversible system triggers.

### B. The 3-Strike Breach Protocol
*   **Monitoring**: Every unauthorized access attempt (e.g., "Show me other users' data") is logged in `security_breach_logs`.
*   **Threshold**: 3 unauthorized attempts within a single month triggers an automatic **System Lock**.
*   **Consequence (is_flagged = true)**:
    *   **Agent Suspension**: All AI chat (Web/TG/WA) is disabled and returns a standardized security warning.
    *   **Proactive Stop**: Orchestrator stops monitoring the user.
    *   **Web Restriction**: User is moved to "Web-Only Manual Mode" (Read data, manual edits only; all AI "Smart" features disabled).
*   **Reporting**: Immediate broadcast to **Owner** and **Admins** via Dashboard and WhatsApp notification.
*   **Resolution**: Flags can ONLY be cleared manually by an **Admin** or **Owner** after review.

| Risk | Probability | Impact | Mitigation |
|:---|:---|:---|:---|
| **Orchestrator Loop Failure** | Medium | Critical | Comprehensive error handling + auto-restart via PM2. Circuit breaker after 5 failures. |
| **Claude API Rate Limits** | High | High | Exponential backoff. Queue low-priority requests. Budget alerts at $25/day. |
| **QMD Index Corruption** | Low | High | Daily automated backups to S3. Health check script runs hourly. |
| **Mono API Downtime** | Medium | Medium | 7-day grace period for verification. Manual upload fallback available. |
| **User Backlash (Too Proactive)** | Medium | Medium | Settings page: "Proactive Alert Frequency" (High/Medium/Low/Off). |
| **Memory Leak in Agent Loop** | Low | Critical | PM2 max_memory_restart set to 1GB. Weekly PM2 flush scheduled. |
| **FIRS Audit Challenge** | Low | Critical | Atomic Facts with supersession chains. SHA-256 hashes for all deleted docs. |
| **Database Migration Failure** | Low | Critical | Test migrations on staging. Maintain rollback SQL scripts. Backup before deploy. |

---

## 8. Success Criteria (V35)

**Operational:**
- Orchestrator uptime: >99.5%
- Agent cycle time: <3 seconds (95th percentile)
- Context build time: <200ms (95th percentile)

**User Impact:**
- Proactive alert open rate: >60%
- Human review approval rate: >80%
- YTD accuracy: 100% (verified against manual calculation)
- User churn reduction: -15% vs V25

**Cost Efficiency:**
- Anthropic API spend: <$0.10/user/month
- QMD eliminates 40%+ of retrieval API calls
- Total infrastructure cost: <$150/month for 1000 users

**Compliance:**
- Zero hallucinations on tax law citations (grounded by QMD)
- 100% auditability (every agent action logged with reasoning)
- FIRS audit defense readiness: All claims traceable to source documents

---

## 9. Migration from V25 to V28

**Step 1: Database Prep (T+0 to T+3)**
- Run schema migrations for agent tables
- Backfill historical YTD data for existing users
- Test rollback scripts on staging environment

**Step 2: Parallel Run (T+4 to T+7)**
- Deploy Orchestrator in "shadow mode" (logs only, no actions)
- Validate Perception accuracy against manual checks
- Tune confidence thresholds based on real user data

**Step 3: Gradual Rollout (T+8 to T+14)**
- Enable for 10% of users (beta testers with opt-in)
- Monitor error rates, user feedback via in-app surveys
- Adjust reasoning prompts based on real situations

**Step 4: Full Deployment (T+15+)**
- Roll out to 100% of users gradually (10% per day)
- Announce in WhatsApp/Telegram/Web with feature guide
- Provide "Turn Off Proactive Alerts" setting in user preferences

---

## 10. Documentation & Training

**Developer Documentation:**
- Update API docs with agent endpoints
- Create architecture diagrams for agentic flow
- Write runbook for troubleshooting Orchestrator failures

**User Documentation:**
- Feature guide: "Understanding Proactive Alerts"
- FAQ: "Why did PRISM send me this message?"
- Privacy guide: "How PRISM protects your data"

**Team Training:**
- Workshop: Understanding the Agentic Loop
- Code walkthrough: Perception→Reasoning→Action
- Incident response protocol for agent failures

---

## 11. Compliance & Legal

**NDPR/GDPR Compliance:**
- Data processing agreement for NIN/BVN verification
- User consent flow for proactive alerts
- Right to be forgotten: Delete all user data including atomic facts

**FIRS Audit Readiness:**
- Supersession chains maintain full history
- SHA-256 hashes prove document authenticity
- Agent reasoning logs provide decision trail

**Internationalization:**
- UI strings for Glassmorphism cards support Pidgin/Yoruba
- Tax calculations localized for Nigerian naira
- Date/time formats follow Nigerian conventions
