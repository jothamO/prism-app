import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AppRelease {
  id: string;
  version: string;
  title: string;
  release_date: string;
  status: "draft" | "published" | "deprecated";
  is_major: boolean;
  is_breaking: boolean;
  summary: string | null;
  github_release_url: string | null;
  github_release_id: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface ChangelogEntry {
  id: string;
  release_id: string;
  entry_type: "added" | "changed" | "fixed" | "removed" | "security" | "deprecated";
  title: string;
  description: string | null;
  component: string | null;
  pull_request_url: string | null;
  commit_hash: string | null;
  contributor: string | null;
  display_order: number;
  created_at: string;
}

export interface ReleaseWithEntries extends AppRelease {
  entries: ChangelogEntry[];
}

export function useReleases(includeAll = false) {
  return useQuery({
    queryKey: ["app-releases", includeAll],
    queryFn: async () => {
      let query = supabase
        .from("app_releases")
        .select("*")
        .order("release_date", { ascending: false });

      if (!includeAll) {
        query = query.eq("status", "published");
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AppRelease[];
    },
  });
}

export function useRelease(id: string | null) {
  return useQuery({
    queryKey: ["app-release", id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data: release, error: releaseError } = await supabase
        .from("app_releases")
        .select("*")
        .eq("id", id)
        .single();

      if (releaseError) throw releaseError;

      const { data: entries, error: entriesError } = await supabase
        .from("app_changelog_entries")
        .select("*")
        .eq("release_id", id)
        .order("display_order", { ascending: true });

      if (entriesError) throw entriesError;

      return {
        ...release,
        entries: entries || [],
      } as ReleaseWithEntries;
    },
    enabled: !!id,
  });
}

export function useCreateRelease() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<AppRelease>) => {
      const { data: release, error } = await supabase
        .from("app_releases")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return release as AppRelease;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-releases"] });
    },
  });
}

export function useUpdateRelease() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<AppRelease> & { id: string }) => {
      const { data: release, error } = await supabase
        .from("app_releases")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return release as AppRelease;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["app-releases"] });
      queryClient.invalidateQueries({ queryKey: ["app-release", variables.id] });
    },
  });
}

export function useDeleteRelease() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("app_releases")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-releases"] });
    },
  });
}

export function useCreateEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<ChangelogEntry>) => {
      const { data: entry, error } = await supabase
        .from("app_changelog_entries")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return entry as ChangelogEntry;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["app-release", variables.release_id] });
    },
  });
}

export function useUpdateEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, release_id, ...data }: Partial<ChangelogEntry> & { id: string; release_id: string }) => {
      const { data: entry, error } = await supabase
        .from("app_changelog_entries")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return { entry: entry as ChangelogEntry, release_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["app-release", result.release_id] });
    },
  });
}

export function useDeleteEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, release_id }: { id: string; release_id: string }) => {
      const { error } = await supabase
        .from("app_changelog_entries")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return { release_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["app-release", result.release_id] });
    },
  });
}

export function usePublishRelease() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: release, error } = await supabase
        .from("app_releases")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return release as AppRelease;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["app-releases"] });
      queryClient.invalidateQueries({ queryKey: ["app-release", id] });
    },
  });
}

export function generateChangelogMarkdown(releases: ReleaseWithEntries[]): string {
  const header = `# Changelog

All notable changes to PRISM will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`;

  const entryTypeOrder = ["added", "changed", "deprecated", "removed", "fixed", "security"];
  const entryTypeLabels: Record<string, string> = {
    added: "Added",
    changed: "Changed",
    deprecated: "Deprecated",
    removed: "Removed",
    fixed: "Fixed",
    security: "Security",
  };

  const releaseSections = releases.map((release) => {
    const date = new Date(release.release_date).toISOString().split("T")[0];
    let section = `## [${release.version}] - ${date}\n`;

    if (release.summary) {
      section += `\n${release.summary}\n`;
    }

    const entriesByType = release.entries.reduce((acc, entry) => {
      if (!acc[entry.entry_type]) acc[entry.entry_type] = [];
      acc[entry.entry_type].push(entry);
      return acc;
    }, {} as Record<string, ChangelogEntry[]>);

    for (const type of entryTypeOrder) {
      const entries = entriesByType[type];
      if (entries?.length) {
        section += `\n### ${entryTypeLabels[type]}\n\n`;
        for (const entry of entries) {
          let line = `- ${entry.title}`;
          if (entry.component) line += ` (${entry.component})`;
          if (entry.description) line += `\n  ${entry.description}`;
          section += line + "\n";
        }
      }
    }

    return section;
  });

  return header + releaseSections.join("\n");
}
