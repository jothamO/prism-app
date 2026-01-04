import { cn } from "@/lib/utils";

interface ConfidenceGaugeProps {
  value: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  label?: string;
}

export function ConfidenceGauge({ 
  value, 
  size = "md", 
  showLabel = true,
  label = "AI Confidence"
}: ConfidenceGaugeProps) {
  const normalizedValue = Math.min(100, Math.max(0, value));
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (normalizedValue / 100) * circumference;
  
  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32"
  };
  
  const textSizeClasses = {
    sm: "text-sm",
    md: "text-xl",
    lg: "text-2xl"
  };
  
  const getColor = () => {
    if (normalizedValue >= 75) return "text-green-500";
    if (normalizedValue >= 50) return "text-yellow-500";
    return "text-red-500";
  };
  
  const getStrokeColor = () => {
    if (normalizedValue >= 75) return "stroke-green-500";
    if (normalizedValue >= 50) return "stroke-yellow-500";
    return "stroke-red-500";
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn("relative", sizeClasses[size])}>
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            strokeWidth="8"
            className="stroke-muted"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            className={cn("transition-all duration-500", getStrokeColor())}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("font-bold", textSizeClasses[size], getColor())}>
            {Math.round(normalizedValue)}%
          </span>
        </div>
      </div>
      {showLabel && (
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      )}
    </div>
  );
}
