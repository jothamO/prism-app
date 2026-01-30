

## Fix Automatic CHANGELOG.md Sync

### Problem Summary

The CHANGELOG.md file is not updating automatically because:
1. The database tables (`app_releases`, `app_changelog_entries`) are empty - no releases have been created
2. When releases ARE published from the Admin Changelog page, there's no automatic call to update the CHANGELOG.md file
3. The GitHub sync is completely disconnected from the publish action

---

### Solution: Auto-Sync on Publish

Create a seamless flow where publishing a release in the Admin Changelog automatically:
1. Updates CHANGELOG.md in GitHub
2. Creates a GitHub Release

---

### Implementation Steps

#### 1. Create `sync-changelog-to-github` Edge Function

A new backend function that:
- Fetches ALL published releases from the database
- Generates complete CHANGELOG.md content in Keep a Changelog format
- Commits it to GitHub, replacing the entire file
- Called automatically when a release is published

| Input | Description |
|-------|-------------|
| `trigger` | "publish" or "manual" |
| `release_id` | Optional - the release that triggered this |

#### 2. Update `usePublishRelease` Hook

Modify the publish mutation to call the sync function after setting status to "published":

```typescript
const handlePublish = async (id: string) => {
  // 1. Update status to published
  await supabase.from('app_releases').update({ 
    status: 'published', 
    published_at: new Date().toISOString() 
  }).eq('id', id);
  
  // 2. Call sync function to update CHANGELOG.md
  await supabase.functions.invoke('sync-changelog-to-github', {
    body: { trigger: 'publish', release_id: id }
  });
  
  // 3. Optionally create GitHub Release
  await supabase.functions.invoke('create-github-release', {
    body: { release_id: id }
  });
};
```

#### 3. Add "Sync to GitHub" Button

Add a manual sync button in Admin Changelog for forcing updates:

```text
[Download MD] [Copy MD] [Sync to GitHub] [New Release]
```

#### 4. Seed Initial Release Data

Create a migration to seed the database with existing CHANGELOG.md content:

| Version | Title | Release Date | Status |
|---------|-------|--------------|--------|
| 1.1.0 | Fact-Grounded AI & Code Proposals | 2026-01-17 | published |
| 1.0.0 | Initial Release | 2026-01-08 | published |

---

### New Files

| File | Purpose |
|------|---------|
| `supabase/functions/sync-changelog-to-github/index.ts` | Syncs full changelog to GitHub |
| Migration for seed data | Populates existing release history |

### Modified Files

| File | Change |
|------|--------|
| `src/hooks/useChangelog.ts` | Add auto-sync after publish |
| `src/pages/admin/AdminChangelog.tsx` | Add "Sync to GitHub" button |

---

### Edge Function: sync-changelog-to-github

```typescript
// Key logic
const generateFullChangelog = (releases: Release[]) => {
  let md = `# Changelog\n\nAll notable changes...`;
  
  // Add [Unreleased] section for draft releases
  const drafts = releases.filter(r => r.status === 'draft');
  if (drafts.length) {
    md += `\n\n## [Unreleased]\n`;
    // ... draft entries
  }
  
  // Add published releases in descending order
  for (const release of releases.filter(r => r.status === 'published')) {
    md += `\n\n## [${release.version}] - ${release.date}\n`;
    // Group entries by type (Added, Changed, Fixed, etc.)
  }
  
  return md;
};

// Commit to GitHub
const result = await fetch(`https://api.github.com/repos/${repo}/contents/CHANGELOG.md`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    message: `docs: update CHANGELOG for v${latestVersion}`,
    content: btoa(markdown),
    sha: currentSha
  })
});
```

---

### Benefits After Fix

1. **One-click publish** - Admin clicks "Publish" and CHANGELOG.md updates automatically
2. **Full history sync** - The entire release history is maintained in proper format
3. **Manual override** - "Sync to GitHub" button for forcing updates
4. **GitHub Releases** - Optionally creates GitHub releases for discoverability
5. **Single source of truth** - Database drives the changelog, not manual file edits

---

### Technical Notes

- Uses existing `GITHUB_TOKEN` secret (already configured)
- Recommend adding `GITHUB_REPO` secret for consistency (currently hardcoded)
- The sync function replaces the entire CHANGELOG.md to ensure consistency
- Drafts appear under [Unreleased], published releases under versioned headers

