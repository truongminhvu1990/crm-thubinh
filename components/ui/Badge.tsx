"use client";

import { ComponentPropsWithoutRef, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary",
        secondary: "bg-secondary/10 text-secondary",
        vip: "bg-amber-100 text-amber-800",
        success: "bg-emerald-100 text-emerald-700",
        warning: "bg-amber-100 text-amber-700",
        destructive: "bg-red-100 text-red-700",
        muted: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

/** Forwards native <span> props (data-testid, id, onClick, aria-* and
 * friends) via `...rest` - previously silently dropped anything except
 * children/variant/className, which let a caller-supplied data-testid
 * (e.g. components/order/OrderPaymentsList.tsx's Overpaid badge)
 * type-check cleanly (TypeScript special-cases data- and aria- attributes
 * as valid on any JSX element regardless of its declared prop type) while
 * never actually reaching the DOM at runtime. `children` stays required
 * (Omit + re-declare), matching the prior contract exactly - every other
 * native span prop becomes optional, same as it already is on a plain
 * span element. */
interface Props extends VariantProps<typeof badgeVariants>, Omit<ComponentPropsWithoutRef<"span">, "children"> {
  children: ReactNode;
}

export default function Badge({ children, variant, className, ...rest }: Props) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...rest}>
      {children}
    </span>
  );
}
