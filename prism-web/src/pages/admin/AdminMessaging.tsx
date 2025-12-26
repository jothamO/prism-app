import { MessageSquare } from "lucide-react";

export default function AdminMessaging() {
    return (
        <div className="h-[calc(100vh-12rem)] flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800">
                <h2 className="font-semibold text-slate-200">Messages</h2>
            </div>
            <div className="flex-1 flex items-center justify-center bg-slate-950/50">
                <div className="text-center">
                    <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-200">Select a conversation</h3>
                    <p className="text-slate-400 mt-2">Choose a user from the left to start chatting</p>
                </div>
            </div>
        </div>
    );
}
