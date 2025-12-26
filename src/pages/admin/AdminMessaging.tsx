import { MessageSquare } from "lucide-react";

export default function AdminMessaging() {
  return (
    <div className="h-[calc(100vh-12rem)] flex flex-col bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="font-semibold text-foreground">Messages</h2>
      </div>
      <div className="flex-1 flex items-center justify-center bg-accent/30">
        <div className="text-center">
          <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground">Select a conversation</h3>
          <p className="text-muted-foreground mt-2">Choose a user to start chatting</p>
        </div>
      </div>
    </div>
  );
}