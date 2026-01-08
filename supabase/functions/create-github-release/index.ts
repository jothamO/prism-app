import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReleaseRequest {
  release_id: string;
  owner?: string;
  repo?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const githubToken = Deno.env.get("GITHUB_TOKEN");
    if (!githubToken) {
      throw new Error("GITHUB_TOKEN not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { release_id, owner = "your-org", repo = "prism" }: ReleaseRequest = await req.json();

    // Fetch release details
    const { data: release, error: releaseError } = await supabase
      .from("app_releases")
      .select("*")
      .eq("id", release_id)
      .single();

    if (releaseError) throw releaseError;
    if (!release) throw new Error("Release not found");

    // Fetch entries
    const { data: entries } = await supabase
      .from("app_changelog_entries")
      .select("*")
      .eq("release_id", release_id)
      .order("display_order", { ascending: true });

    // Generate release body
    const entryTypeLabels: Record<string, string> = {
      added: "Added",
      changed: "Changed",
      deprecated: "Deprecated",
      removed: "Removed",
      fixed: "Fixed",
      security: "Security",
    };

    let body = release.summary ? `${release.summary}\n\n` : "";

    const entriesByType: Record<string, Array<{ entry_type: string; title: string; component: string | null; pull_request_url: string | null }>> = {};
    for (const entry of entries || []) {
      if (!entriesByType[entry.entry_type]) {
        entriesByType[entry.entry_type] = [];
      }
      entriesByType[entry.entry_type]!.push(entry);
    }

    for (const [type, typeEntries] of Object.entries(entriesByType)) {
      body += `## ${entryTypeLabels[type] || type}\n\n`;
      for (const entry of typeEntries || []) {
        let line = `- ${entry.title}`;
        if (entry.component) line += ` (${entry.component})`;
        if (entry.pull_request_url) line += ` [PR](${entry.pull_request_url})`;
        body += line + "\n";
      }
      body += "\n";
    }

    // Create GitHub release
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tag_name: `v${release.version}`,
          name: `v${release.version} - ${release.title}`,
          body,
          draft: false,
          prerelease: release.is_breaking || false,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`GitHub API error: ${JSON.stringify(error)}`);
    }

    const githubRelease = await response.json();

    // Update release with GitHub URL
    await supabase
      .from("app_releases")
      .update({
        github_release_url: githubRelease.html_url,
        github_release_id: githubRelease.id,
      })
      .eq("id", release_id);

    return new Response(
      JSON.stringify({
        success: true,
        github_url: githubRelease.html_url,
        github_id: githubRelease.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error creating GitHub release:", error);
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
