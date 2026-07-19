"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Option } from "@/lib/customer.constants";

interface Props {
  label?: string;
  placeholder?: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  onCreate: (value: string) => Option;
}

export default function CreatableSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
  onCreate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const trimmed = query.trim();
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(trimmed.toLowerCase())
  );
  const exactMatch = options.find((o) => o.value.toLowerCase() === trimmed.toLowerCase());

  function select(v: string) {
    onChange(v);
    setQuery("");
    setOpen(false);
  }

  function createAndSelect() {
    if (!trimmed) return;
    const created = onCreate(trimmed);
    select(created.value);
  }

  return (
    <div className="w-full" ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      )}
      <div className="relative">
        <input
          value={open ? query : value}
          placeholder={value ? undefined : placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!trimmed) return;
              if (exactMatch) select(exactMatch.value);
              else createAndSelect();
            } else if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
          className={cn(
            "w-full rounded-lg border border-input bg-card px-3 py-2 pr-16 text-sm outline-none transition-colors",
            "focus:border-primary focus:ring-2 focus:ring-primary/20"
          )}
        />
        {value && (
          <button
            type="button"
            onClick={() => select("")}
            className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      </div>

      {open && (
        <div className="relative">
          <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-input bg-card shadow-lg">
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => select(o.value)}
                className="flex w-full items-center justify-between px-3 py-2 text-sm text-left hover:bg-muted"
              >
                {o.label}
                {o.value === value && <Check className="w-4 h-4 text-primary" />}
              </button>
            ))}
            {trimmed && !exactMatch && (
              <button
                type="button"
                onClick={createAndSelect}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-sm text-left text-primary hover:bg-primary/10"
              >
                <Plus className="w-3.5 h-3.5" />+ Tạo &quot;{trimmed}&quot;
              </button>
            )}
            {filtered.length === 0 && !trimmed && (
              <p className="px-3 py-2 text-sm text-muted-foreground">Không có lựa chọn</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
