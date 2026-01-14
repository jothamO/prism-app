---
description: Verify Lovable has deployed latest changes from pushed commits
---

# Verify Lovable Deployment

## Prerequisites
- Commit has been pushed to main branch
- Wait 2-3 minutes for Lovable to rebuild

## Verification Steps

// turbo-all

1. Open the Lovable preview URL:
   ```
   https://preview--prismtaxassistant.lovable.app/?__lovable_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoic2diQXJrUUc4V1I4azZqdnRET2d4SHNXeVlPMiIsInByb2plY3RfaWQiOiIyNTA3ZjFiZS0xNWMyLTRkZjctOTdhMi00YjE5ZTY4OGMzY2QiLCJub25jZSI6IjRlMzI1ODQ4MTU5ODFjNzllMmQ3MjI2MjU2NWQ5YmM1IiwiaXNzIjoibG92YWJsZS1hcGkiLCJzdWIiOiIyNTA3ZjFiZS0xNWMyLTRkZjctOTdhMi00YjE5ZTY4OGMzY2QiLCJhdWQiOlsibG92YWJsZS1hcHAiXSwiZXhwIjoxNzY4OTg2NDg0LCJuYmYiOjE3NjgzODE2ODQsImlhdCI6MTc2ODM4MTY4NH0.hewN8fCo_1I5d5LKeH-9_4VjTZPfPY4ddmbA1l7XAjw
   ```

2. Navigate to the new/changed route (e.g., `/developers`, `/admin/calculation-logs`)

3. Verify the expected UI elements are present:
   - Check page title matches
   - Check key components render
   - Check data loads without errors

4. Open browser DevTools (F12) and check Console tab for errors

5. Take a screenshot of the verified feature

6. Report verification status:
   - ✅ SUCCESS: Feature deployed and working
   - ⚠️ PARTIAL: Feature deployed but has issues
   - ❌ FAILED: Feature not present or broken

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| 404 on route | Route not added to App.tsx | Add Route component |
| Component not found | Import missing | Add import statement |
| Build error | TypeScript error | Check Lovable build logs |
| Stale content | Cache issue | Hard refresh (Ctrl+Shift+R) |

## Post-Verification

If verification fails:
1. Check git log to confirm commit was pushed
2. Check Lovable dashboard for build errors
3. Fix issues and push again
4. Re-run this workflow
