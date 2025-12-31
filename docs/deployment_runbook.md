# PRISM Phase 5 Deployment Runbook

## Overview

This runbook covers the deployment of Phase 5 features including:
- AI Feedback Collection System
- Model Retraining Pipeline
- Monthly Insights Engine
- User Tax Profile Detection

## Pre-Deployment Checklist

### Environment Requirements

- [ ] Node.js 18+ installed
- [ ] PostgreSQL 14+ with existing PRISM schema
- [ ] Redis 6+ for BullMQ workers
- [ ] OpenAI API key configured
- [ ] Supabase project with service role key

### Configuration Variables

```bash
# Required Environment Variables
DATABASE_URL=postgresql://user:pass@host:5432/prism
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Optional Configuration
FEEDBACK_BATCH_SIZE=100        # Number of feedback items per training batch
RETRAINING_THRESHOLD=50        # Minimum feedback count to trigger retraining
INSIGHTS_BATCH_SIZE=50         # Users to process per insights run
MODEL_CONFIDENCE_THRESHOLD=0.7 # Minimum confidence for auto-classification
```

## Database Migrations

### Migration Order

Execute migrations in this exact order:

1. **AI Feedback Table**
```sql
-- Creates ai_feedback table for storing user corrections
-- Includes indexes for efficient querying by business, user, and training status
```

2. **Invoice Validations Table**
```sql
-- Tracks OCR validation corrections
-- Links to invoices table for learning from user edits
```

3. **Business Classification Patterns**
```sql
-- Stores learned patterns per business
-- Includes confidence scoring based on occurrence count
```

4. **ML Models Registry**
```sql
-- Tracks model versions and performance metrics
-- Supports A/B testing with is_active flag
```

5. **User Insights Table**
```sql
-- Stores generated insights per user per month
-- Tracks read/acted status for engagement metrics
```

6. **User Tax Profiles**
```sql
-- Stores detected tax profile information
-- Links to profile_corrections for learning
```

### Running Migrations

```bash
# Using Supabase CLI
supabase db push

# Or manually via psql
psql $DATABASE_URL -f migrations/001_ai_feedback.sql
psql $DATABASE_URL -f migrations/002_invoice_validations.sql
# ... continue for all migrations
```

### Verification Queries

```sql
-- Verify all tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
    'ai_feedback', 
    'invoice_validations', 
    'business_classification_patterns',
    'ml_models',
    'user_insights',
    'user_tax_profiles',
    'profile_corrections'
);

-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('ai_feedback', 'user_insights', 'user_tax_profiles');

-- Verify indexes exist
SELECT indexname FROM pg_indexes 
WHERE tablename = 'ai_feedback';
```

## Service Deployment

### API Server Updates

1. **Pull latest code**
```bash
cd prism-api
git pull origin main
npm install
```

2. **Build TypeScript**
```bash
npm run build
```

3. **Run tests**
```bash
npm test
```

4. **Restart API server**
```bash
pm2 restart prism-api
```

### BullMQ Workers

Deploy the following workers:

#### Model Training Worker
```bash
# Start worker
pm2 start dist/workers/model-training.worker.js --name "prism-model-training"

# Verify it's running
pm2 logs prism-model-training --lines 20
```

#### Monthly Insights Worker
```bash
# Start worker
pm2 start dist/workers/monthly-insights.worker.js --name "prism-monthly-insights"

# Verify scheduling
pm2 logs prism-monthly-insights --lines 20
```

### Worker Configuration

```javascript
// PM2 ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'prism-api',
      script: 'dist/server.js',
      instances: 2,
      exec_mode: 'cluster'
    },
    {
      name: 'prism-model-training',
      script: 'dist/workers/model-training.worker.js',
      instances: 1,
      cron_restart: '0 3 * * 0' // Restart weekly
    },
    {
      name: 'prism-monthly-insights',
      script: 'dist/workers/monthly-insights.worker.js',
      instances: 1,
      cron_restart: '0 0 1 * *' // Restart monthly
    }
  ]
};
```

## Edge Functions Deployment

### Deploy via Supabase CLI

```bash
# Deploy all edge functions
supabase functions deploy income-tax-calculator
supabase functions deploy vat-calculator
supabase functions deploy business-classifier
supabase functions deploy anti-avoidance-check
```

### Verify Deployments

```bash
# Test income tax calculator
curl -X POST https://xxx.supabase.co/functions/v1/income-tax-calculator \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"monthlyIncome": 500000}'

# Test business classifier
curl -X POST https://xxx.supabase.co/functions/v1/business-classifier \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"businessId": "uuid-here", "annualTurnover": 50000000}'
```

## Post-Deployment Verification

### Health Checks

```bash
# API health
curl http://localhost:3000/health

# Redis connection
redis-cli ping

# Database connection
psql $DATABASE_URL -c "SELECT 1"
```

### Functional Tests

```bash
# Run integration tests
cd prism-api
npm run test:integration

# Run specific Phase 5 tests
npm test -- --grep "feedback"
npm test -- --grep "insights"
npm test -- --grep "profile"
```

### Monitoring Setup

1. **Add Sentry DSN to environment**
```bash
SENTRY_DSN=https://xxx@sentry.io/xxx
```

2. **Verify error tracking**
```javascript
// Test Sentry integration
Sentry.captureMessage('Phase 5 deployment verification');
```

3. **Set up alerts**
- Model training failures
- Insights generation errors
- High feedback correction rates

## Rollback Procedures

### Database Rollback

```sql
-- If needed, rollback in reverse order
DROP TABLE IF EXISTS profile_corrections;
DROP TABLE IF EXISTS user_tax_profiles;
DROP TABLE IF EXISTS user_insights;
DROP TABLE IF EXISTS ml_models;
DROP TABLE IF EXISTS business_classification_patterns;
DROP TABLE IF EXISTS invoice_validations;
-- Note: ai_feedback should be kept for data preservation
```

### Service Rollback

```bash
# Rollback to previous version
cd prism-api
git checkout v4.x.x
npm install
npm run build
pm2 restart all
```

### Worker Rollback

```bash
# Stop new workers
pm2 stop prism-model-training
pm2 stop prism-monthly-insights

# Remove from PM2
pm2 delete prism-model-training
pm2 delete prism-monthly-insights
```

## Troubleshooting

### Common Issues

#### 1. Model Training Not Running

```bash
# Check worker status
pm2 status prism-model-training

# Check Redis queue
redis-cli LLEN bull:model-training:wait

# Check for errors
pm2 logs prism-model-training --err --lines 50
```

#### 2. Insights Not Generating

```bash
# Check worker logs
pm2 logs prism-monthly-insights --lines 100

# Manually trigger insights
curl -X POST http://localhost:3000/api/admin/trigger-insights \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

#### 3. Profile Detection Failing

```sql
-- Check for profiles without signals
SELECT user_id, ai_confidence 
FROM user_tax_profiles 
WHERE ai_confidence < 0.5;

-- Check correction patterns
SELECT user_id, COUNT(*) 
FROM profile_corrections 
GROUP BY user_id 
ORDER BY COUNT(*) DESC;
```

### Performance Tuning

```sql
-- Analyze slow queries
EXPLAIN ANALYZE 
SELECT * FROM ai_feedback 
WHERE used_in_training = false 
ORDER BY created_at 
LIMIT 100;

-- Add missing indexes if needed
CREATE INDEX CONCURRENTLY idx_feedback_training 
ON ai_feedback(used_in_training, created_at);
```

## Maintenance

### Weekly Tasks

- [ ] Review model training logs
- [ ] Check feedback accumulation rates
- [ ] Monitor classification accuracy metrics

### Monthly Tasks

- [ ] Review insights engagement metrics
- [ ] Analyze profile detection accuracy
- [ ] Clean up old training batches
- [ ] Update model performance baseline

### Quarterly Tasks

- [ ] Full model performance review
- [ ] Database maintenance (VACUUM, REINDEX)
- [ ] Update tax rules for regulatory changes

## Contact

For deployment issues, contact:
- Engineering Lead: engineering@prism.ng
- DevOps: devops@prism.ng
- On-call: +234-XXX-XXXX
