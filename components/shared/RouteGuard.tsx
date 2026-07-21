"use client";

import { ReactNode, useEffect, useState } from "react";
import { Permission } from "@/types/permission";
import { getCurrentStaff, hasPermission } from "@/lib/permission";

interface Props {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}

/** Feature 7 - Permission Framework's route guard primitive. Not wired into
 * any page in this sprint (framework only, per spec) - future increments
 * can wrap a page/section body in this once real per-role page access
 * rules are approved. */
export default function RouteGuard({ permission, children, fallback = null }: Props) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getCurrentStaff().then((staff) => {
      if (active) setAllowed(hasPermission(staff?.role, permission));
    });
    return () => {
      active = false;
    };
  }, [permission]);

  if (allowed === null) return null;
  return allowed ? <>{children}</> : <>{fallback}</>;
}
