
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

interface ChangelogRequest {
  version: string;
  features: string[];
  type: 'feature' | 'fix' | 'chore';
  commit?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { version, features, type, commit = false } = await req.json() as ChangelogRequest;

    const date = new Date().toISOString().split('T')[0];
    const emoji = type === 'feature' ? '🚀' : type === 'fix' ? '🐛' : '🔧';

    // Markdown template for the new entry
    const entry = `## [${version}] - ${date}\n\n### ${emoji} ${type.toUpperCase()}\n${features.map(f => `- ${f}`).join('\n')}\n\n---\n`;

    let message = "Markdown generated successfully.";
    let githubResult = null;

    if (commit) {
      const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN');
      const GITHUB_REPO = Deno.env.get('GITHUB_REPO') || "jothamO/prism-app";
      const filePath = "CHANGELOG.md";

      if (!GITHUB_TOKEN) {
        throw new Error("GITHUB_TOKEN not configured in environment variables.");
      }

      // 1. Get current file content and SHA
      const getFileUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
      const getRes = await fetch(getFileUrl, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        }
      });

      if (!getRes.ok) {
        throw new Error(`Failed to fetch CHANGELOG.md: ${await getRes.text()}`);
      }

      const fileData = await getRes.json();
      const currentContent = atob(fileData.content.replace(/\n/g, ''));
      const sha = fileData.sha;

      // 2. Insert new entry after common header sections
      let updatedContent = currentContent;
      const insertPoint = currentContent.indexOf('## [Unreleased]');

      if (insertPoint !== -1) {
        // Insert after "## [Unreleased]\n\n"
        const afterUnreleased = insertPoint + '## [Unreleased]'.length;
        updatedContent = currentContent.slice(0, afterUnreleased) + "\n\n" + entry + currentContent.slice(afterUnreleased);
      } else {
        // Fallback: Insert after first # Title
        const firstHeaderEnd = currentContent.indexOf('\n', currentContent.indexOf('#'));
        updatedContent = currentContent.slice(0, firstHeaderEnd + 1) + "\n" + entry + currentContent.slice(firstHeaderEnd + 1);
      }

      // 3. Commit back to GitHub
      const putRes = await fetch(getFileUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          message: `chore: update changelog for ${version} [skip ci]`,
          content: btoa(unescape(encodeURIComponent(updatedContent))),
          sha: sha
        })
      });

      if (!putRes.ok) {
        throw new Error(`Failed to commit update: ${await putRes.text()}`);
      }

      githubResult = await putRes.json();
      message = "Changelog updated and committed to GitHub successfully.";
    }

    return new Response(JSON.stringify({
      success: true,
      markdown: entry,
      message,
      github: githubResult
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
