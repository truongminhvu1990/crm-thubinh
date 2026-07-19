"use client";

import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export default function Input({
  label,
  error,
  icon,
  className,
  ...props
}: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-foreground mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </div>
        )}
        <input
          {...props}
          className={cn(
            "w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors",
            "placeholder:text-muted-foreground",
            "focus:border-primary focus:ring-2 focus:ring-primary/20",
            error ? "border-destructive" : "border-input",
            icon ? "pl-10" : "",
            className
          )}
        />
      </div>
      {error && <p className="text-destructive text-xs mt-1">{error}</p>}
    </div>
  );
}
