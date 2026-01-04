import { Check } from 'lucide-react';

interface ProgressBarProps {
  steps: string[];
  currentStep: number;
}

export default function ProgressBar({ steps, currentStep }: ProgressBarProps) {
  return (
    <div className="flex items-center justify-between mt-4">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center flex-1">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                index < currentStep
                  ? 'bg-primary text-primary-foreground'
                  : index === currentStep
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {index < currentStep ? (
                <Check className="h-4 w-4" />
              ) : (
                index + 1
              )}
            </div>
            <span 
              className={`text-xs mt-1 hidden sm:block ${
                index <= currentStep ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {step}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div 
              className={`flex-1 h-0.5 mx-2 ${
                index < currentStep ? 'bg-primary' : 'bg-muted'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
