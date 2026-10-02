"use client";

import { useEffect, useState } from "react";

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface Settled<T> {
  url: string;
  data: T | null;
  error: string | null;
}

/** GET a canonical API URL (null = do not fetch). `loading` is derived: it is
 * true until a response for the CURRENT url has settled, and a response for
 * an older url (a slower earlier range) is ignored, so it can never overwrite
 * a newer one. Data of a previous url is never returned, so a detail can never be compared against an overview of a different range. */
export function useCanonicalFetch<T>(url: string | null): FetchState<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    if (url === null) return;
    let cancelled = false;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 403 ? "Bạn không có quyền xem báo cáo này" : `Không tải được dữ liệu (${res.status})`);
        return (await res.json()) as T;
      })
      .then((data) => {
        if (!cancelled) setSettled({ url, data, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) setSettled({ url, data: null, error: e instanceof Error ? e.message : "Lỗi không xác định" });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (url === null || settled === null) return { data: null, loading: url !== null, error: null };
  const current = settled.url === url;
  return { data: current ? settled.data : null, loading: !current, error: current ? settled.error : null };
}
