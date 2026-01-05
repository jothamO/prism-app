import * as React from 'react';
import { cn } from '@/lib/utils';

interface RadioGroupContextType {
    value?: string;
    onValueChange?: (value: string) => void;
    name: string;
}

const RadioGroupContext = React.createContext<RadioGroupContextType | undefined>(undefined);

interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
    value?: string;
    onValueChange?: (value: string) => void;
    name?: string;
}

function RadioGroup({ value, onValueChange, name, className, children, ...props }: RadioGroupProps) {
    const contextName = name || `radio-group-${React.useId()}`;

    return (
        <RadioGroupContext.Provider value={{ value, onValueChange, name: contextName }}>
            <div role="radiogroup" className={cn('grid gap-2', className)} {...props}>
                {children}
            </div>
        </RadioGroupContext.Provider>
    );
}

interface RadioGroupItemProps extends React.InputHTMLAttributes<HTMLInputElement> {
    value: string;
}

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
    ({ className, value, id, ...props }, ref) => {
        const context = React.useContext(RadioGroupContext);
        if (!context) throw new Error('RadioGroupItem must be used within RadioGroup');

        const itemId = id || `${context.name}-${value}`;

        return (
            <input
                ref={ref}
                type="radio"
                id={itemId}
                name={context.name}
                value={value}
                checked={context.value === value}
                onChange={() => context.onValueChange?.(value)}
                className={cn(
                    'aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 accent-primary',
                    className
                )}
                {...props}
            />
        );
    }
);
RadioGroupItem.displayName = 'RadioGroupItem';

export { RadioGroup, RadioGroupItem };
