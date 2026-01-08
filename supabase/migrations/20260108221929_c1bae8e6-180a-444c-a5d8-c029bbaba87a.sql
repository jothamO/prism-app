-- =============================================
-- Application Version Changelog System
-- =============================================

-- Table: app_releases
-- Stores version releases with metadata
CREATE TABLE public.app_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(20) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    release_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'deprecated')),
    is_major BOOLEAN DEFAULT false,
    is_breaking BOOLEAN DEFAULT false,
    summary TEXT,
    github_release_url TEXT,
    github_release_id BIGINT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

-- Table: app_changelog_entries
-- Individual changelog entries linked to releases
CREATE TABLE public.app_changelog_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id UUID REFERENCES public.app_releases(id) ON DELETE CASCADE,
    entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('added', 'changed', 'fixed', 'removed', 'security', 'deprecated')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    component VARCHAR(100),
    pull_request_url TEXT,
    commit_hash VARCHAR(40),
    contributor VARCHAR(100),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_changelog_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for app_releases
-- Public read access for published releases
CREATE POLICY "Published releases are viewable by everyone"
ON public.app_releases
FOR SELECT
USING (status = 'published');

-- Admin full access (using account_type = 'admin')
CREATE POLICY "Admins have full access to releases"
ON public.app_releases
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.auth_user_id = auth.uid() AND users.account_type = 'admin'
    )
);

-- RLS Policies for app_changelog_entries
-- Public read access for entries of published releases
CREATE POLICY "Entries of published releases are viewable by everyone"
ON public.app_changelog_entries
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.app_releases
        WHERE app_releases.id = app_changelog_entries.release_id
        AND app_releases.status = 'published'
    )
);

-- Admin full access to entries
CREATE POLICY "Admins have full access to changelog entries"
ON public.app_changelog_entries
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.auth_user_id = auth.uid() AND users.account_type = 'admin'
    )
);

-- Indexes
CREATE INDEX idx_app_releases_status ON public.app_releases(status);
CREATE INDEX idx_app_releases_version ON public.app_releases(version);
CREATE INDEX idx_app_releases_release_date ON public.app_releases(release_date DESC);
CREATE INDEX idx_changelog_entries_release ON public.app_changelog_entries(release_id);
CREATE INDEX idx_changelog_entries_type ON public.app_changelog_entries(entry_type);

-- Trigger for updated_at
CREATE TRIGGER update_app_releases_updated_at
BEFORE UPDATE ON public.app_releases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();