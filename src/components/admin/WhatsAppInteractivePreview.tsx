import { useState } from "react";
import { ChevronDown, ChevronUp, Check, List } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReplyButton {
  id: string;
  title: string;
}

interface ListRow {
  id: string;
  title: string;
  description?: string;
}

interface ListSection {
  title: string;
  rows: ListRow[];
}

interface WhatsAppButtonsPreviewProps {
  buttons: ReplyButton[];
  onSelect: (buttonId: string) => void;
}

interface WhatsAppListMessageProps {
  header?: string;
  body: string;
  footer?: string;
  buttonText: string;
  sections: ListSection[];
  onSelect: (rowId: string) => void;
}

/**
 * WhatsApp Reply Buttons Preview
 * Simulates the appearance of WhatsApp Cloud API reply buttons (max 3)
 */
export function WhatsAppButtonsPreview({ buttons, onSelect }: WhatsAppButtonsPreviewProps) {
  if (buttons.length === 0 || buttons.length > 3) return null;

  return (
    <div className="flex flex-col gap-2 mt-3">
      {buttons.map((btn) => (
        <button
          key={btn.id}
          onClick={() => onSelect(btn.id)}
          className={cn(
            "w-full py-2.5 px-4 rounded-lg text-sm font-medium",
            "bg-[#DCF8C6] text-[#075E54] border border-[#25D366]/30",
            "hover:bg-[#25D366]/20 transition-colors",
            "active:scale-[0.98] transform"
          )}
        >
          {btn.title}
        </button>
      ))}
    </div>
  );
}

/**
 * WhatsApp List Message Preview
 * Simulates the appearance of WhatsApp Cloud API list messages (max 10 rows)
 */
export function WhatsAppListMessage({
  header,
  body,
  footer,
  buttonText,
  sections,
  onSelect
}: WhatsAppListMessageProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleRowSelect = (rowId: string) => {
    setSelectedId(rowId);
    setIsOpen(false);
    onSelect(rowId);
  };

  const totalRows = sections.reduce((sum, s) => sum + s.rows.length, 0);
  if (totalRows === 0 || totalRows > 10) return null;

  return (
    <div className="mt-3">
      {/* Message Content */}
      <div className="mb-3">
        {header && (
          <p className="text-sm font-semibold text-foreground mb-1">{header}</p>
        )}
        <p className="text-sm text-foreground/90 whitespace-pre-wrap">{body}</p>
        {footer && (
          <p className="text-xs text-muted-foreground mt-2">{footer}</p>
        )}
      </div>

      {/* List Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full py-2.5 px-4 rounded-lg text-sm font-medium",
          "bg-[#128C7E] text-white",
          "hover:bg-[#075E54] transition-colors",
          "flex items-center justify-center gap-2",
          "active:scale-[0.98] transform"
        )}
      >
        <List className="w-4 h-4" />
        {buttonText}
        {isOpen ? (
          <ChevronUp className="w-4 h-4 ml-auto" />
        ) : (
          <ChevronDown className="w-4 h-4 ml-auto" />
        )}
      </button>

      {/* Expandable List */}
      {isOpen && (
        <div className="mt-2 border border-border rounded-lg overflow-hidden bg-card shadow-lg">
          {sections.map((section, sIdx) => (
            <div key={sIdx}>
              {/* Section Header */}
              <div className="px-4 py-2 bg-muted/50 border-b border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {section.title}
                </p>
              </div>

              {/* Section Rows */}
              {section.rows.map((row, rIdx) => (
                <button
                  key={row.id}
                  onClick={() => handleRowSelect(row.id)}
                  className={cn(
                    "w-full px-4 py-3 text-left",
                    "hover:bg-accent/50 transition-colors",
                    "flex items-center gap-3",
                    rIdx < section.rows.length - 1 && "border-b border-border/50",
                    selectedId === row.id && "bg-primary/10"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {row.title}
                    </p>
                    {row.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {row.description}
                      </p>
                    )}
                  </div>
                  {selectedId === row.id && (
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Combined component for rendering WhatsApp interactive messages
 */
interface WhatsAppInteractiveMessageProps {
  type: 'button' | 'list';
  buttons?: ReplyButton[];
  listConfig?: {
    header?: string;
    body: string;
    footer?: string;
    buttonText: string;
    sections: ListSection[];
  };
  onSelect: (id: string) => void;
}

export function WhatsAppInteractiveMessage({
  type,
  buttons,
  listConfig,
  onSelect
}: WhatsAppInteractiveMessageProps) {
  if (type === 'button' && buttons) {
    return <WhatsAppButtonsPreview buttons={buttons} onSelect={onSelect} />;
  }

  if (type === 'list' && listConfig) {
    return (
      <WhatsAppListMessage
        header={listConfig.header}
        body={listConfig.body}
        footer={listConfig.footer}
        buttonText={listConfig.buttonText}
        sections={listConfig.sections}
        onSelect={onSelect}
      />
    );
  }

  return null;
}
