import { useState, useEffect } from "react";
import {
  Plus,
  Save,
  Trash2,
  RefreshCw,
  Terminal,
  ToggleLeft,
  ToggleRight,
  GripVertical,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface BotCommand {
  id: string;
  platform: string;
  command: string;
  description: string;
  response_text: string | null;
  is_standard: boolean;
  is_enabled: boolean;
  sort_order: number;
}

interface BotCommandsManagerProps {
  platform: "telegram" | "whatsapp";
}

export function BotCommandsManager({ platform }: BotCommandsManagerProps) {
  const [commands, setCommands] = useState<BotCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCommand, setNewCommand] = useState({
    command: "",
    description: "",
    response_text: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchCommands();
  }, [platform]);

  async function fetchCommands() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("bot_commands")
        .select("*")
        .eq("platform", platform)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setCommands(data || []);
    } catch (error) {
      console.error("Error fetching commands:", error);
      toast({ title: "Error", description: "Failed to fetch commands", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function toggleCommand(id: string, currentEnabled: boolean) {
    try {
      const { error } = await supabase
        .from("bot_commands")
        .update({ is_enabled: !currentEnabled })
        .eq("id", id);

      if (error) throw error;
      
      setCommands((prev) =>
        prev.map((cmd) => (cmd.id === id ? { ...cmd, is_enabled: !currentEnabled } : cmd))
      );
      toast({ title: "Success", description: `Command ${!currentEnabled ? "enabled" : "disabled"}` });
    } catch (error) {
      console.error("Error toggling command:", error);
      toast({ title: "Error", description: "Failed to update command", variant: "destructive" });
    }
  }

  async function addCommand() {
    if (!newCommand.command.trim() || !newCommand.description.trim()) {
      toast({ title: "Error", description: "Command and description are required", variant: "destructive" });
      return;
    }

    const commandName = newCommand.command.startsWith("/") 
      ? newCommand.command.toLowerCase() 
      : `/${newCommand.command.toLowerCase()}`;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("bot_commands")
        .insert({
          platform,
          command: commandName,
          description: newCommand.description,
          response_text: newCommand.response_text || null,
          is_standard: false,
          is_enabled: true,
          sort_order: commands.length + 1,
        })
        .select()
        .single();

      if (error) throw error;
      
      setCommands((prev) => [...prev, data]);
      setNewCommand({ command: "", description: "", response_text: "" });
      setShowAddForm(false);
      toast({ title: "Success", description: "Command added" });
    } catch (error: any) {
      console.error("Error adding command:", error);
      toast({ 
        title: "Error", 
        description: error.code === "23505" ? "Command already exists" : "Failed to add command",
        variant: "destructive" 
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteCommand(id: string) {
    try {
      const { error } = await supabase
        .from("bot_commands")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      setCommands((prev) => prev.filter((cmd) => cmd.id !== id));
      toast({ title: "Success", description: "Command deleted" });
    } catch (error) {
      console.error("Error deleting command:", error);
      toast({ title: "Error", description: "Failed to delete command", variant: "destructive" });
    }
  }

  async function syncToBot() {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("admin-bot-messaging", {
        body: {
          action: "update-commands",
          platform,
        },
      });

      if (response.error) throw response.error;
      
      toast({ title: "Success", description: `Commands synced to ${platform} bot` });
    } catch (error) {
      console.error("Error syncing commands:", error);
      toast({ title: "Error", description: "Failed to sync commands to bot", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">Menu Commands</h4>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-accent hover:bg-accent/80 text-foreground rounded-lg transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Custom
          </button>
          <button
            onClick={syncToBot}
            disabled={syncing}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {syncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Sync to Bot
          </button>
        </div>
      </div>

      {/* Add Command Form */}
      {showAddForm && (
        <div className="bg-accent/30 border border-border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Command</label>
              <input
                type="text"
                value={newCommand.command}
                onChange={(e) => setNewCommand({ ...newCommand, command: e.target.value })}
                placeholder="/mycommand"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Description (menu text)</label>
              <input
                type="text"
                value={newCommand.description}
                onChange={(e) => setNewCommand({ ...newCommand, description: e.target.value })}
                placeholder="What this command does"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Response (optional)</label>
            <textarea
              value={newCommand.response_text}
              onChange={(e) => setNewCommand({ ...newCommand, response_text: e.target.value })}
              placeholder="Bot's response when user sends this command..."
              rows={2}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs bg-background border border-border text-foreground rounded-lg hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={addCommand}
              disabled={saving}
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add Command"}
            </button>
          </div>
        </div>
      )}

      {/* Commands List */}
      <div className="space-y-2">
        {commands.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No commands configured</p>
        ) : (
          commands.map((cmd) => (
            <div
              key={cmd.id}
              className={cn(
                "flex items-center gap-3 p-3 bg-background border border-border rounded-lg transition-colors",
                !cmd.is_enabled && "opacity-50"
              )}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
              <Terminal className="w-4 h-4 text-primary" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-foreground">{cmd.command}</span>
                  {cmd.is_standard && (
                    <span className="px-1.5 py-0.5 text-[10px] bg-accent text-muted-foreground rounded">
                      Standard
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{cmd.description}</p>
              </div>
              <button
                onClick={() => toggleCommand(cmd.id, cmd.is_enabled)}
                className="p-1 hover:bg-accent rounded transition-colors"
                title={cmd.is_enabled ? "Disable" : "Enable"}
              >
                {cmd.is_enabled ? (
                  <ToggleRight className="w-5 h-5 text-green-500" />
                ) : (
                  <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                )}
              </button>
              {!cmd.is_standard && (
                <button
                  onClick={() => deleteCommand(cmd.id)}
                  className="p-1 hover:bg-destructive/20 rounded transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
