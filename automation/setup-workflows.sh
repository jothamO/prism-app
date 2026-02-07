#!/bin/bash
#
# PRISM n8n Workflow Auto-Setup Script
# Imports all workflow JSON files into n8n and activates them.
#
# Usage: ./setup-workflows.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKFLOWS_DIR="$SCRIPT_DIR/workflows"

echo "🚀 PRISM n8n Workflow Setup"
echo "============================"

# Check if workflows directory exists
if [ ! -d "$WORKFLOWS_DIR" ]; then
    echo "❌ Workflows directory not found at: $WORKFLOWS_DIR"
    exit 1
fi

# Count workflow files
WORKFLOW_COUNT=$(find "$WORKFLOWS_DIR" -name "*.json" | wc -l)
echo "📂 Found $WORKFLOW_COUNT workflow(s) to import"

# Import each workflow
for workflow_file in "$WORKFLOWS_DIR"/*.json; do
    if [ -f "$workflow_file" ]; then
        WORKFLOW_NAME=$(basename "$workflow_file" .json)
        echo ""
        echo "📥 Importing: $WORKFLOW_NAME"
        
        # Import using docker exec into the n8n container
        docker exec -i n8n n8n import:workflow --input=/dev/stdin < "$workflow_file"
        
        echo "   ✅ Imported successfully"
    fi
done

echo ""
echo "============================"
echo "✅ All workflows imported!"
echo ""
echo "Next steps:"
echo "  1. Open n8n at https://prismtax.duckdns.org/n8n/"
echo "  2. Go to Workflows to see your imported workflows"
echo "  3. Create 'PrismAgentKey' credential with your API key"
echo "  4. Assign the credential to each workflow's HTTP Request node"
echo "  5. Activate the workflows"
echo ""
