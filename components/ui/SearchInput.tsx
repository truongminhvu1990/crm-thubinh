"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
  value?: string;
}

export default function SearchInput({
  onClear,
  value,
  className,
  ...props
}: SearchInputProps) {
  return (
    <div className="relative w-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
      <input
        {...props}
        value={value}
        className={cn(
          "w-full rounded-lg border border-input bg-card pl-10 pr-9 py-2 text-sm outline-none transition-colors",
          "placeholder:text-muted-foreground",
          "focus:border-primary focus:ring-2 focus:ring-primary/20",
          className
        )}
      />
      {value && onClear && (
        <button
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          type="button"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
