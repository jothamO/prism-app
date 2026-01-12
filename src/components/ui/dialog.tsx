import * as React from 'react';
import { cn } from '@/lib/utils';

interface DialogContextType {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextType | undefined>(undefined);

interface DialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children: React.ReactNode;
}

const Dialog = React.forwardRef<HTMLDivElement, DialogProps>(
    function Dialog({ open = false, onOpenChange, children }, ref) {
        return (
            <DialogContext.Provider value={{ open, onOpenChange: onOpenChange || (() => { }) }}>
                <div ref={ref}>{children}</div>
            </DialogContext.Provider>
        );
    }
);

const DialogTrigger = React.forwardRef<HTMLButtonElement, { children: React.ReactNode; asChild?: boolean }>(
    function DialogTrigger({ children, asChild }, ref) {
        const context = React.useContext(DialogContext);
        if (!context) throw new Error('DialogTrigger must be used within Dialog');

        const handleClick = () => context.onOpenChange(true);

        if (asChild && React.isValidElement(children)) {
            return React.cloneElement(children as React.ReactElement<any>, { onClick: handleClick });
        }

        return <button ref={ref} onClick={handleClick}>{children}</button>;
    }
);

interface DialogContentProps {
    children: React.ReactNode;
    className?: string;
}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
    function DialogContent({ children, className }, ref) {
        const context = React.useContext(DialogContext);
        if (!context) throw new Error('DialogContent must be used within Dialog');

        if (!context.open) return null;

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                {/* Overlay */}
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={() => context.onOpenChange(false)}
                />
                {/* Content */}
                <div ref={ref} className={cn(
                    'relative z-50 w-full max-w-lg max-h-[85vh] overflow-auto rounded-lg bg-background p-6 shadow-lg border',
                    'animate-in fade-in-0 zoom-in-95',
                    className
                )}>
                    {/* Close button */}
                    <button
                        className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        onClick={() => context.onOpenChange(false)}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                        <span className="sr-only">Close</span>
                    </button>
                    {children}
                </div>
            </div>
        );
    }
);

const DialogHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    function DialogHeader({ className, ...props }, ref) {
        return <div ref={ref} className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />;
    }
);

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
    function DialogTitle({ className, ...props }, ref) {
        return <h2 ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />;
    }
);

const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
    function DialogDescription({ className, ...props }, ref) {
        return <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />;
    }
);

const DialogFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    function DialogFooter({ className, ...props }, ref) {
        return <div ref={ref} className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />;
    }
);

export {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
};
