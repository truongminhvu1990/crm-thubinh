"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Option } from "@/lib/customer.constants";

interface Props extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Option[];
  placeholder?: string;
}

export default function Select({
  label,
  options,
  placeholder,
  className,
  ...props
}: Props) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-foreground mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          {...props}
          className={cn(
            "w-full appearance-none rounded-lg border border-input bg-card px-3 py-2 pr-9 text-sm outline-none transition-colors",
            "focus:border-primary focus:ring-2 focus:ring-primary/20",
            className
          )}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}
