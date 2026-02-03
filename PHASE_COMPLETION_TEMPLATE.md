# Phase Completion Template

**Use this template when completing any implementation plan task.**

---

## Step 1: Update MASTER_IMPLEMENTATION_PLAN.md

Find your task and mark it complete:

```markdown
| ✅ P6.1: Orchestrator | 🔴 High | Implemented orchestrator.ts to run every 15 mins via PM2 cron. |
```

**Add completion notes if significant:**

```markdown
**P6.1 Completion Notes (2026-02-XX):**
- Deployed with PM2 cron job (every 15 min)
- Circuit breaker after 5 consecutive failures
- Average cycle time: 2.3 seconds (target: <3s) ✅
- Memory usage stable at ~180MB
```

---

## Step 2: Update PRISM_ARCHITECTURE_MAP.md

**Find the relevant section and update status:**

```markdown
## Current Implementation Status (Updated: 2026-02-XX)

### Phase 6: The Nervous System
**Status:** 🚧 In Progress (4/18 tasks complete)

**Completed:**
- ✅ P6.1: Orchestrator (deployed Feb XX)
- ✅ P6.2: Perception Engine (deployed Feb XX)
- ✅ P6.3: Reasoning Engine (deployed Feb XX)
- ✅ P6.4: Action Executor (deployed Feb XX)

**In Progress:**
- 🚧 P6.5: QMD Knowledge Base

**Pending:**
- ⏳ P6.6: Conversation Index
- ⏳ P6.7: Augmented RAG
...
```

**If architecture diagram changed, update it:**

```markdown
## System Architecture (Updated: 2026-02-XX)

[Update ASCII diagram or add note about what changed]

**Recent Changes:**
- Added: Agent Orchestrator (15-min loop)
- Added: Perception Engine (6 detectors)
- Modified: Context Builder now feeds Reasoning Engine
```

---

## Step 3: Add Lesson Learned to PRISM_AGENT_RULES.md

**Navigate to Section 11 and add:**

```markdown
### Lesson 2026-02-XX: [Descriptive Title]

**What was built:** [Brief description of the implementation]

**Key technical decisions:**
- Decision 1: [Why you chose X over Y]
- Decision 2: [Technology/pattern selected]

**Challenges encountered:**
- Challenge 1: [What didn't work initially]
- Solution: [How you fixed it]

**Performance/Metrics:**
- [Any measurable outcomes - speed, cost, accuracy]

**Code location:** `/path/to/file.ts`

**Takeaway:** [One-sentence guidance for future work]

**Example:**
```[language]
// Show a key code snippet if relevant
```
```

---

## Step 4: Commit with Structured Message

```bash
git add MASTER_IMPLEMENTATION_PLAN.md PRISM_ARCHITECTURE_MAP.md PRISM_AGENT_RULES.md

git commit -m "Complete P6.1: Agent Orchestrator deployment

Implemented:
- 15-minute perception loop via PM2 cron
- Circuit breaker after 5 consecutive failures
- Average cycle time: 2.3s (target: <3s achieved)

Technical decisions:
- Chose PM2 cron over pg_cron (simpler, more reliable)
- Batch processing: 10 users per cycle (prevents overload)
- Graceful degradation: falls back to reactive mode on failure

Performance:
- Cycle time: 2.3s average (95th percentile: 2.8s)
- Memory usage: ~180MB stable
- CPU usage: <5% during cycles

Updates:
- MASTER_IMPLEMENTATION_PLAN.md: Marked P6.1 complete
- PRISM_ARCHITECTURE_MAP.md: Updated Phase 6 status (4/18 tasks)
- PRISM_AGENT_RULES.md: Added Lesson 2026-02-XX

Closes #[issue-number]"

git push origin main
```

---

## Step 5: If Entire Phase Complete

**When all tasks in a phase are done:**

### Update MASTER_IMPLEMENTATION_PLAN.md

```markdown
### Phase 6: The Nervous System ✅ COMPLETE
*Source: C:\Users\Evelyn\Downloads\agentic upgrade*
**Completion Date:** 2026-02-XX
**Duration:** X days
**Status:** Production-ready

**Key Achievements:**
- Orchestrator running with 99.7% uptime
- All 6 perception detectors operational
- QMD indexed with 1,247 tax documents
- Memory architecture (PARA) deployed
- Average agent cycle time: 2.1 seconds

**Metrics:**
- Tasks completed: 18/18
- Tests passing: 156/156
- Code coverage: 84%
- Cost per cycle: $0.0023
```

### Update PRISM_ARCHITECTURE_MAP.md

```markdown
## Milestone: Phase 6 Complete (2026-02-XX)

The Agentic Core is now fully operational. PRISM can:
- Detect 6 types of tax situations autonomously
- Reason about actions with 87% average confidence
- Execute Tier 1-2 actions without human intervention
- Store knowledge in PARA structure with hot/warm/cold tiers

**Next Focus:** Phase 7 - UI Revamp for proactive guidance
```

### Update PRISM_AGENT_RULES.md Section 11.5

```markdown
**Phase Status:**
- ✅ **Phase 0:** Infrastructure (Complete - Jan 30)
- ✅ **Phase 6:** Agentic Core & Memory (Complete - Feb XX)
- 🚧 **Phase 7:** UI Revamp (Starting Feb XX)
- ⏳ **Phase 8:** Identity & Gating (Pending)
...
```

### Celebrate 🎉

```bash
# Take a moment to appreciate the progress
echo "Phase 6 complete! Moving to Phase 7."

# Optional: Tag the milestone
git tag v26-phase-6-complete
git push --tags
```

---

## Quick Checklist

When completing ANY task:

- [ ] Mark task complete in MASTER_IMPLEMENTATION_PLAN.md
- [ ] Update phase status in PRISM_ARCHITECTURE_MAP.md
- [ ] Add lesson learned to PRISM_AGENT_RULES.md Section 11
- [ ] Commit all three files with structured message
- [ ] Push to GitHub

**Time estimate:** 5-10 minutes per task completion

**Why it's worth it:**
- Future you will thank you
- Team members understand what was built
- Prevents duplicate work
- Creates searchable knowledge base
- Shows progress visually

---

## Example: Real Completion

**Task:** P6.1 - Orchestrator

**MASTER_IMPLEMENTATION_PLAN.md:**
```markdown
| ✅ P6.1: Orchestrator | 🔴 High | Implemented orchestrator.ts to run every 15 mins via PM2 cron. Circuit breaker after 5 failures. Avg cycle: 2.3s. |
```

**PRISM_ARCHITECTURE_MAP.md:**
```markdown
### Phase 6: The Nervous System
**Status:** 🚧 In Progress (1/18 tasks complete)
- ✅ P6.1: Orchestrator (Feb 3, 2026)
```

**PRISM_AGENT_RULES.md Section 11:**
```markdown
### Lesson 2026-02-03: Agent Orchestrator - PM2 Cron vs pg_cron

**What was built:** 15-minute agent loop using PM2 cron

**Decision:** PM2 cron instead of Supabase pg_cron
**Reasoning:** 
- PM2 already managing processes
- No database dependency for scheduling
- Easier debugging (PM2 logs)
- Can run even if database is down

**Performance:** 2.3s average cycle (target: <3s) ✅

**Gotcha:** PM2 cron syntax uses JavaScript cron, not Linux cron
```bash
cron_restart: '*/15 * * * *'  // Every 15 minutes
```

**Takeaway:** Keep scheduling local to service when possible
```

**Git commit:**
```bash
git commit -m "Complete P6.1: Agent Orchestrator

- PM2 cron every 15 min
- Circuit breaker after 5 failures
- 2.3s avg cycle time

Updates:
- MASTER_IMPLEMENTATION_PLAN.md
- PRISM_ARCHITECTURE_MAP.md
- PRISM_AGENT_RULES.md"
```

**Total time:** 7 minutes
**Long-term value:** Permanent institutional knowledge

---

**Save this template as:** `PHASE_COMPLETION_TEMPLATE.md` in your repo root.
