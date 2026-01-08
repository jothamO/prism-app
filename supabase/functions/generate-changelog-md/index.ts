import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChangelogEntry {
  entry_type: string;
  title: string;
  description: string | null;
  component: string | null;
}

interface Release {
  id: string;
  version: string;
  title: string;
  release_date: string;
  summary: string | null;
  entries: ChangelogEntry[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch published releases
    const { data: releases, error: releasesError } = await supabase
      .from("app_releases")
      .select("*")
      .eq("status", "published")
      .order("release_date", { ascending: false });

    if (releasesError) throw releasesError;

    // Fetch entries for each release
    const releasesWithEntries: Release[] = [];
    for (const release of releases || []) {
      const { data: entries } = await supabase
        .from("app_changelog_entries")
        .select("*")
        .eq("release_id", release.id)
        .order("display_order", { ascending: true });

      releasesWithEntries.push({
        ...release,
        entries: entries || [],
      });
    }

    // Generate Markdown
    const entryTypeOrder = ["added", "changed", "deprecated", "removed", "fixed", "security"];
    const entryTypeLabels: Record<string, string> = {
      added: "Added",
      changed: "Changed",
      deprecated: "Deprecated",
      removed: "Removed",
      fixed: "Fixed",
      security: "Security",
    };

    let markdown = `# Changelog

All notable changes to PRISM will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`;

    for (const release of releasesWithEntries) {
      const date = release.release_date.split("T")[0];
      markdown += `## [${release.version}] - ${date}\n`;

      if (release.summary) {
        markdown += `\n${release.summary}\n`;
      }

      const entriesByType: Record<string, ChangelogEntry[]> = {};
      for (const entry of release.entries) {
        if (!entriesByType[entry.entry_type]) {
          entriesByType[entry.entry_type] = [];
        }
        entriesByType[entry.entry_type].push(entry);
      }

      for (const type of entryTypeOrder) {
        const entries = entriesByType[type];
        if (entries?.length) {
          markdown += `\n### ${entryTypeLabels[type]}\n\n`;
          for (const entry of entries) {
            let line = `- ${entry.title}`;
            if (entry.component) line += ` (${entry.component})`;
            if (entry.description) line += `\n  ${entry.description}`;
            markdown += line + "\n";
          }
        }
      }

      markdown += "\n";
    }

    return new Response(
      JSON.stringify({ markdown, releases_count: releasesWithEntries.length }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error generating changelog:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
