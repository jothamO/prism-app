

# Fix: Get `get-supabase-access-token` Working

## Current Status

The edge function code is correct, but it's returning a 404 because the required secret `SUPABASE_ACCESS_TOKEN` is not configured in your project.

## What's Needed

The `SUPABASE_ACCESS_TOKEN` is a **personal access token** you generate from your Supabase account. It's used for CLI authentication to deploy functions and push migrations.

## Implementation Steps

### Step 1: Generate a Personal Access Token

You need to create one at: https://supabase.com/dashboard/account/tokens

1. Log in to your Supabase dashboard
2. Go to Account → Access Tokens
3. Click "Generate new token"
4. Give it a name (e.g., "Lovable CLI Deployment")
5. Copy the token (starts with `sbp_...`)

### Step 2: Add the Secret to Lovable Cloud

I will use the secret management tool to prompt you to add the `SUPABASE_ACCESS_TOKEN` secret. You'll paste the token you generated in Step 1.

### Step 3: Test the Function

After the secret is added, calling the function should return:
```json
{
  "configured": true,
  "keyPreview": "sbp_xxxx...xxxx",
  "keyLength": 64,
  "fullKey": "sbp_your_full_token_here"
}
```

## Security Note

Once you've retrieved the token for your local CLI setup, consider removing the `fullKey` field from the response to prevent exposing the full token publicly. The function currently returns the full key to enable CLI deployment scripts.

