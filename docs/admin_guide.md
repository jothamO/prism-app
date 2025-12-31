# PRISM Admin Guide - ML System Management

## Overview

This guide covers administration of PRISM's machine learning systems including:
- Feedback monitoring and quality control
- Model retraining management
- Insights generation oversight
- User profile management

## Dashboard Access

Access the admin dashboard at:
- Production: `https://app.prism.ng/admin`
- Staging: `https://staging.prism.ng/admin`

Login with your admin credentials. Contact engineering for access.

## Feedback Monitoring

### Understanding Feedback Types

PRISM collects three types of AI feedback:

| Type | Description | Source |
|------|-------------|--------|
| Classification Correction | User corrects expense/income category | WhatsApp chat |
| OCR Validation | User corrects extracted invoice data | Invoice review |
| Profile Correction | User corrects detected tax profile | Profile confirmation |

### Viewing Feedback

Navigate to **Admin → Feedback** to see:

1. **Recent Corrections** - Latest user corrections with:
   - Original AI prediction
   - User's correction
   - Confidence score
   - Business context

2. **Feedback Statistics**
   - Daily/weekly/monthly correction rates
   - Most common correction patterns
   - Per-business accuracy trends

### Feedback Quality Metrics

Monitor these key metrics:

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Classification Accuracy | >85% | <75% |
| OCR Confidence | >90% | <80% |
| Profile Detection | >80% | <70% |
| User Confirmation Rate | >70% | <50% |

### Investigating Low Accuracy

When accuracy drops:

1. **Check recent feedback patterns**
```sql
SELECT correction_type, COUNT(*), 
       AVG(CASE WHEN ai_prediction->>'confidence' IS NOT NULL 
           THEN (ai_prediction->>'confidence')::numeric ELSE 0 END) as avg_confidence
FROM ai_feedback
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY correction_type;
```

2. **Identify problematic categories**
```sql
SELECT ai_prediction->>'category' as predicted,
       user_correction->>'category' as corrected,
       COUNT(*) as count
FROM ai_feedback
WHERE correction_type = 'classification'
AND created_at > NOW() - INTERVAL '7 days'
GROUP BY ai_prediction->>'category', user_correction->>'category'
ORDER BY count DESC
LIMIT 20;
```

3. **Review business-specific issues**
```sql
SELECT b.name, COUNT(*) as corrections
FROM ai_feedback f
JOIN businesses b ON f.business_id = b.id
WHERE f.created_at > NOW() - INTERVAL '30 days'
GROUP BY b.name
ORDER BY corrections DESC
LIMIT 10;
```

## Model Retraining

### Automatic Retraining

The model training worker runs weekly (Sundays at 3 AM WAT) and:

1. Collects unused feedback (minimum 50 items)
2. Prepares training data with corrections
3. Fine-tunes the classification model
4. Validates on holdout set
5. Deploys if accuracy improves

### Manual Retraining

To trigger manual retraining:

1. Navigate to **Admin → Models**
2. Click **"Trigger Retraining"**
3. Monitor progress in the logs

Or via API:
```bash
curl -X POST https://api.prism.ng/admin/models/retrain \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Model Performance

View model metrics in **Admin → Models**:

| Metric | Description | Good Range |
|--------|-------------|------------|
| Accuracy | Overall correct predictions | >85% |
| Precision | True positives / predicted positives | >80% |
| Recall | True positives / actual positives | >80% |
| F1 Score | Harmonic mean of precision/recall | >80% |

### A/B Testing Models

To test a new model:

1. Deploy new model with `is_active = false`
2. Configure traffic split in admin
3. Monitor comparative metrics
4. Promote or rollback based on results

```sql
-- View active vs candidate models
SELECT model_name, version, is_active, accuracy, f1_score
FROM ml_models
WHERE model_type = 'classifier'
ORDER BY created_at DESC
LIMIT 5;
```

## Insights Management

### Insights Generation

Monthly insights are generated on the 1st of each month for all active users.

Types of insights generated:

| Type | Description | Priority |
|------|-------------|----------|
| Filing Reminder | Upcoming filing deadlines | High |
| Savings Opportunity | Potential tax savings found | Medium |
| Compliance Alert | Missing documentation/filings | High |
| Spending Pattern | Unusual expense patterns | Low |
| VAT Optimization | Input VAT recovery opportunities | Medium |

### Monitoring Insights

Navigate to **Admin → Insights** to see:

1. **Generation Status** - Current month's generation progress
2. **Engagement Metrics** - Read/acted rates per insight type
3. **User Response** - How users respond to insights

### Manual Insight Generation

To regenerate insights for a user:

```bash
curl -X POST https://api.prism.ng/admin/insights/generate \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"userId": "user-uuid-here"}'
```

### Insight Quality Control

Review insight quality by:

1. **Sampling random insights** - Weekly review of 20 random insights
2. **Checking user feedback** - Monitor "not helpful" responses
3. **Validating calculations** - Verify savings/cost estimates

```sql
-- Find insights marked as not helpful
SELECT i.title, i.description, i.potential_saving, u.business_name
FROM user_insights i
JOIN users u ON i.user_id = u.id
WHERE i.metadata->>'user_feedback' = 'not_helpful'
ORDER BY i.created_at DESC
LIMIT 20;
```

## Profile Management

### User Tax Profiles

Navigate to **Admin → Tax Profiles** to:

1. **View all profiles** with filtering by:
   - Confirmation status
   - User type (individual, business, etc.)
   - Special statuses (pensioner, diplomat, etc.)

2. **Manually confirm profiles** when user verification is available

3. **Correct profiles** based on documentation

### Profile Detection Accuracy

Monitor profile detection by:

```sql
-- Profile detection summary
SELECT 
    user_type,
    COUNT(*) as total,
    SUM(CASE WHEN user_confirmed THEN 1 ELSE 0 END) as confirmed,
    AVG(ai_confidence) as avg_confidence
FROM user_tax_profiles
GROUP BY user_type;
```

### Handling Profile Corrections

When a user disputes their profile:

1. Review the signals used for detection:
```sql
SELECT signals FROM profile_corrections
WHERE user_id = 'user-uuid'
ORDER BY created_at DESC
LIMIT 1;
```

2. Check transaction history for evidence
3. Update profile with correct information
4. Mark as user_confirmed = true

### Special Status Verification

For special statuses (pensioner, diplomat, disabled, senior):

1. **Request documentation** via WhatsApp
2. **Verify authenticity** of provided documents
3. **Update profile** with verification date
4. **Enable exemptions** in tax calculations

## Review Queue Management

### Priority Scoring

Items enter the review queue based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| Low Confidence | High | AI confidence < 70% |
| High Amount | Medium | Transaction > ₦1M |
| Pattern Anomaly | Medium | Unusual for business |
| First Transaction | Low | New business type |

### Working the Queue

1. Navigate to **Admin → Reviews**
2. Sort by priority (high → low)
3. Review flagged items
4. Approve, correct, or escalate

### Queue Metrics

Target metrics:
- Average resolution time: < 2 hours
- Queue depth: < 50 items
- Escalation rate: < 5%

## Reporting

### Standard Reports

Available in **Admin → Reports**:

1. **Weekly Accuracy Report** - Classification accuracy trends
2. **Monthly Insights Report** - User engagement with insights
3. **Quarterly Model Report** - ML model performance over time

### Custom Queries

For custom analysis, use the SQL console:

```sql
-- Monthly active users with feedback
SELECT 
    DATE_TRUNC('month', created_at) as month,
    COUNT(DISTINCT user_id) as users_with_feedback,
    COUNT(*) as total_feedback
FROM ai_feedback
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;
```

## Troubleshooting

### Common Issues

#### 1. Insights Not Generating

Check worker status:
```bash
pm2 status prism-monthly-insights
pm2 logs prism-monthly-insights --lines 100
```

Manually trigger:
```bash
curl -X POST https://api.prism.ng/admin/insights/generate-all \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

#### 2. Model Training Failing

Check training logs:
```bash
pm2 logs prism-model-training --lines 200
```

Common causes:
- Insufficient feedback data (< 50 items)
- OpenAI API rate limits
- Database connection issues

#### 3. Profile Detection Issues

Verify signals are being collected:
```sql
SELECT user_id, created_at, signals
FROM profile_corrections
ORDER BY created_at DESC
LIMIT 10;
```

Check for missing transaction data:
```sql
SELECT u.id, u.business_name, COUNT(e.id) as expense_count
FROM users u
LEFT JOIN expenses e ON u.id = e.user_id
GROUP BY u.id, u.business_name
HAVING COUNT(e.id) < 5;
```

## Security Considerations

### Access Control

- Admin access requires `admin` role in `user_roles` table
- All admin actions are logged to `audit_log`
- Sensitive data (TINs, etc.) is masked in logs

### Data Privacy

- User corrections are anonymized after training
- Personal data is excluded from ML training
- Insights are user-specific and protected by RLS

### Audit Trail

View admin actions:
```sql
SELECT action, entity_type, entity_id, created_at
FROM audit_log
WHERE admin_id = 'admin-uuid'
ORDER BY created_at DESC
LIMIT 50;
```

## Contact & Escalation

| Issue | Contact |
|-------|---------|
| Technical issues | engineering@prism.ng |
| Data concerns | privacy@prism.ng |
| Model accuracy | ml-team@prism.ng |
| Urgent/on-call | +234-XXX-XXXX |
