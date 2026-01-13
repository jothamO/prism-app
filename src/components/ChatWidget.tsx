import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import {
    MessageSquare,
    X,
    Send,
    Loader2,
    Bot,
    User,
    Minimize2,
    Maximize2,
    Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface ChatWidgetProps {
    userContext?: {
        totalIncome?: number;
        totalExpenses?: number;
        emtlPaid?: number;
        transactionCount?: number;
    };
}

const QUICK_QUESTIONS = [
    "What's my tax obligation?",
    "What is EMTL?",
    "How much VAT do I owe?",
    "Explain my deductions",
];

export default function ChatWidget({ userContext }: ChatWidgetProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState<Message[]>(() => {
        // Restore from sessionStorage if available
        const saved = sessionStorage.getItem('prism_chat_history');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch {
                // Invalid JSON, start fresh
            }
        }
        return [{
            role: 'assistant',
            content: "Hi! I'm PRISM, your Nigerian tax assistant. 👋 Ask me anything about your taxes, transactions, or financial obligations!",
        }];
    });
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Get authenticated user ID
    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            console.log('[ChatWidget] Auth user:', user?.id || 'NOT LOGGED IN');
            setUserId(user?.id || null);
        };
        getUser();
    }, []);

    // Save messages to sessionStorage when they change
    useEffect(() => {
        sessionStorage.setItem('prism_chat_history', JSON.stringify(messages));
    }, [messages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async (text: string) => {
        if (!text.trim() || loading) return;

        const userMessage: Message = { role: 'user', content: text };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            console.log('[ChatWidget] Sending to chat-assist:', { userId, userContext });
            const { data, error } = await supabase.functions.invoke('chat-assist', {
                body: {
                    message: text,
                    history: messages.slice(-6), // Last 6 messages for context
                    context: {
                        userId,  // Now passing userId!
                        ...userContext,
                    },
                },
            });

            if (error) throw error;

            const assistantMessage: Message = {
                role: 'assistant',
                content: data.response || "I'm sorry, I couldn't process that request.",
            };
            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [
                ...prev,
                {
                    role: 'assistant',
                    content: "I'm having trouble connecting right now. Please try again in a moment.",
                },
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleQuickQuestion = (question: string) => {
        sendMessage(question);
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 right-4 md:bottom-6 md:right-6 p-3 md:p-4 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-all hover:scale-105 z-[100]"
                style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
                aria-label="Open chat"
            >
                <MessageSquare className="h-5 w-5 md:h-6 md:w-6" />
            </button>
        );
    }

    return (
        <div
            className={`fixed bottom-4 right-4 md:bottom-6 md:right-6 bg-white dark:bg-card rounded-xl shadow-2xl z-[100] flex flex-col transition-all ${isMinimized ? 'w-72 h-14' : 'w-[calc(100vw-2rem)] md:w-96 max-w-96 h-[70vh] md:h-[500px]'
                }`}
            style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white rounded-t-xl">
                <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5" />
                    <span className="font-semibold">PRISM AI</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => {
                            // Clear chat history from sessionStorage
                            sessionStorage.removeItem('prism_chat_history');
                            setMessages([{
                                role: 'assistant',
                                content: "Hi! I'm PRISM, your Nigerian tax assistant. 👋 Ask me anything about your taxes, transactions, or financial obligations!",
                            }]);
                        }}
                        className="p-1 hover:bg-indigo-500 rounded"
                        title="Clear chat"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => setIsMinimized(!isMinimized)}
                        className="p-1 hover:bg-indigo-500 rounded"
                    >
                        {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                    </button>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-1 hover:bg-indigo-500 rounded"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <>
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {messages.map((msg, idx) => (
                            <div
                                key={idx}
                                className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                {msg.role === 'assistant' && (
                                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center">
                                        <Bot className="h-4 w-4 text-indigo-600" />
                                    </div>
                                )}
                                <div
                                    className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${msg.role === 'user'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-gray-100 text-gray-800'
                                        }`}
                                >
                                    {msg.role === 'assistant' ? (
                                        <div className="prose prose-sm max-w-none [&>p]:m-0 [&>ul]:mt-1 [&>ol]:mt-1">
                                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                                        </div>
                                    ) : (
                                        msg.content
                                    )}
                                </div>
                                {msg.role === 'user' && (
                                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center">
                                        <User className="h-4 w-4 text-gray-600" />
                                    </div>
                                )}
                            </div>
                        ))}
                        {loading && (
                            <div className="flex gap-2 justify-start">
                                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center">
                                    <Bot className="h-4 w-4 text-indigo-600" />
                                </div>
                                <div className="px-3 py-2 rounded-lg bg-gray-100 flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                                    <span className="text-sm text-gray-500">Thinking...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick Questions */}
                    {messages.length <= 2 && (
                        <div className="px-4 pb-2">
                            <p className="text-xs text-gray-500 mb-2">Quick questions:</p>
                            <div className="flex flex-wrap gap-2">
                                {QUICK_QUESTIONS.map((q, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleQuickQuestion(q)}
                                        className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 transition-colors"
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Input */}
                    <div className="p-3 border-t">
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                sendMessage(input);
                            }}
                            className="flex gap-2"
                        >
                            <Input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Ask about your taxes..."
                                className="flex-1 text-sm"
                                disabled={loading}
                            />
                            <Button type="submit" size="sm" disabled={loading || !input.trim()}>
                                <Send className="h-4 w-4" />
                            </Button>
                        </form>
                    </div>
                </>
            )}
        </div>
    );
}
