"use client";

import { ReactNode } from "react";
import { DetailEntityType } from "@/types/reportDetail";
import { useEntityDrawerContext } from "./EntityDrawerProvider";

interface Props {
  type: DetailEntityType;
  /** Missing id (e.g. legacy rows with no order) renders the children as plain text. */
  id: string | null | undefined;
  children: ReactNode;
  className?: string;
  /** Runs just before the drawer opens (e.g. a host modal closing itself first, so two Radix dialogs never stack). */
  onOpen?: () => void;
}

/** Reporting link standard: an entity click opens the contextual drawer on the
 * current page - never a route change, never a new tab. */
export default function EntityLink({ type, id, children, className, onOpen }: Props) {
  const ctx = useEntityDrawerContext();
  if (!id || !ctx) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.();
        ctx.open({ type, id });
      }}
      className={className ?? "text-left text-primary underline-offset-2 hover:underline focus-visible:underline"}
      data-testid={`entity-link-${type}`}
    >
      {children}
    </button>
  );
}
