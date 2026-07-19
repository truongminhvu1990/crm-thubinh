"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Option } from "@/lib/customer.constants";

interface Props {
  label?: string;
  placeholder?: string;
  options: Option[];
  values: string[];
  onChange: (values: string[]) => void;
  onCreate: (value: string) => Option;
}

export default function CreatableMultiSelect({
  label,
  placeholder,
  options,
  values,
  onChange,
  onCreate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
  const available = options.filter((o) => !values.includes(o.value));
  const filtered = available.filter((o) =>
    o.label.toLowerCase().includes(trimmed.toLowerCase())
  );
  const exactMatch = available.find((o) => o.value.toLowerCase() === trimmed.toLowerCase());

  function addValue(v: string) {
    if (!values.includes(v)) onChange([...values, v]);
    setQuery("");
  }

  function createAndAdd() {
    if (!trimmed) return;
    const created = onCreate(trimmed);
    addValue(created.value);
  }

  function removeValue(v: string) {
    onChange(values.filter((x) => x !== v));
  }

  return (
    <div className="w-full" ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      )}
      <div
        className="flex flex-wrap items-center gap-1.5 w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-1 text-xs font-medium"
          >
            {v}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeValue(v);
              }}
              className="hover:text-destructive"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          placeholder={values.length === 0 ? placeholder : undefined}
          onFocus={() => setOpen(true)}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!trimmed) return;
              if (exactMatch) addValue(exactMatch.value);
              else createAndAdd();
            } else if (e.key === "Backspace" && !query && values.length > 0) {
              removeValue(values[values.length - 1]);
            } else if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
          className="flex-1 min-w-[80px] bg-transparent outline-none py-0.5"
        />
      </div>

      {open && (
        <div className="relative">
          <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-input bg-card shadow-lg">
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => addValue(o.value)}
                className="flex w-full items-center px-3 py-2 text-sm text-left hover:bg-muted"
              >
                {o.label}
              </button>
            ))}
            {trimmed && !exactMatch && (
              <button
                type="button"
                onClick={createAndAdd}
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
