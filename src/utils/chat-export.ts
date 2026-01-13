/**
 * Chat Export Utility
 * Exports chat conversations to various formats
 */

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: Date;
}

/**
 * Export chat to plain text
 */
export function exportToText(messages: ChatMessage[], userName?: string): string {
    const header = `PRISM Tax Assistant - Chat Export\n` +
        `Date: ${new Date().toLocaleDateString()}\n` +
        `User: ${userName || 'Anonymous'}\n` +
        `${'='.repeat(50)}\n\n`;

    const body = messages.map(msg => {
        const sender = msg.role === 'user' ? 'You' : 'PRISM';
        const time = msg.timestamp
            ? `[${msg.timestamp.toLocaleTimeString()}] `
            : '';
        return `${time}${sender}:\n${msg.content}\n`;
    }).join('\n---\n\n');

    return header + body;
}

/**
 * Export chat to Markdown
 */
export function exportToMarkdown(messages: ChatMessage[], userName?: string): string {
    const header = `# PRISM Tax Assistant - Chat Export\n\n` +
        `**Date:** ${new Date().toLocaleDateString()}\n` +
        `**User:** ${userName || 'Anonymous'}\n\n---\n\n`;

    const body = messages.map(msg => {
        const sender = msg.role === 'user' ? '👤 **You**' : '🤖 **PRISM**';
        return `${sender}\n\n${msg.content}\n`;
    }).join('\n---\n\n');

    return header + body;
}

/**
 * Export chat to HTML (for PDF generation)
 */
export function exportToHTML(messages: ChatMessage[], userName?: string): string {
    const styles = `
        <style>
            body { font-family: 'Inter', -apple-system, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            h1 { color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px; }
            .meta { color: #6b7280; margin-bottom: 30px; }
            .message { margin-bottom: 20px; padding: 15px; border-radius: 8px; }
            .user { background: #f3f4f6; margin-left: 40px; }
            .assistant { background: #ecfdf5; border-left: 4px solid #059669; }
            .sender { font-weight: bold; margin-bottom: 8px; }
            .user .sender { color: #374151; }
            .assistant .sender { color: #059669; }
            .content { white-space: pre-wrap; line-height: 1.6; }
            .divider { border-top: 1px solid #e5e7eb; margin: 20px 0; }
        </style>
    `;

    const header = `
        <h1>🤖 PRISM Tax Assistant</h1>
        <div class="meta">
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p><strong>User:</strong> ${userName || 'Anonymous'}</p>
        </div>
    `;

    const body = messages.map(msg => {
        const cssClass = msg.role === 'user' ? 'user' : 'assistant';
        const sender = msg.role === 'user' ? '👤 You' : '🤖 PRISM';
        // Escape HTML and convert markdown-like formatting
        const content = msg.content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');
        return `
            <div class="message ${cssClass}">
                <div class="sender">${sender}</div>
                <div class="content">${content}</div>
            </div>
        `;
    }).join('<div class="divider"></div>');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PRISM Chat Export</title>
    ${styles}
</head>
<body>
    ${header}
    ${body}
</body>
</html>`;
}

/**
 * Trigger download of exported content
 */
export function downloadExport(
    content: string,
    filename: string,
    mimeType: string
): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Export chat to text file and trigger download
 */
export function downloadChatAsText(messages: ChatMessage[], userName?: string): void {
    const content = exportToText(messages, userName);
    const date = new Date().toISOString().split('T')[0];
    downloadExport(content, `prism-chat-${date}.txt`, 'text/plain');
}

/**
 * Export chat to HTML and trigger print dialog (for PDF)
 */
export function printChatAsPDF(messages: ChatMessage[], userName?: string): void {
    const content = exportToHTML(messages, userName);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(content);
        printWindow.document.close();
        // Give it a moment to render, then print
        setTimeout(() => {
            printWindow.print();
        }, 250);
    }
}
