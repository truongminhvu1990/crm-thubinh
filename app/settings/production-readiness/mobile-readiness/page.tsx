"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ActivityLog } from "@/types/activityLog";
import { opsApi } from "@/lib/opsConsole/opsConsoleApi";
import { MOBILE_READINESS_ITEMS } from "@/lib/opsConsole/opsConsole.constants";
import OpsConsoleTabs from "@/components/opsConsole/OpsConsoleTabs";
import EnvironmentBanner from "@/components/opsConsole/EnvironmentBanner";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

/** Mobile Readiness Status (PRODUCTION_READINESS_UI.md §16 / Spec §18.1) -
 * a status board, not an implementation of any of the 6 capabilities.
 * Literal rendering of the locked assessment; notes are editable (reused
 * activity_logs, entity="mobile_readiness_note") so status can be updated
 * if reality changes later. */
export default function MobileReadinessStatusPage() {
  const [notes, setNotes] = useState<Record<string, ActivityLog>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    const state = await opsApi.getMobileReadinessNotes();
    setNotes(state);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSaveNote(itemKey: string) {
    const value = drafts[itemKey];
    if (value === undefined) return;
    await opsApi.updateMobileReadinessNote(itemKey, value);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[itemKey];
      return next;
    });
    await load();
  }

  return (
    <div className="pb-8">
      <Link href="/settings/production-readiness" className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Quay lại Tổng quan
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-1.5">Sẵn sàng cho di động</h1>
      <p className="text-muted-foreground mb-6 text-sm">Bảng trạng thái — không xây dựng bất kỳ năng lực nào bên dưới</p>

      <EnvironmentBanner />
      <OpsConsoleTabs />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      ) : (
        <div className="space-y-3">
          {MOBILE_READINESS_ITEMS.map((item) => {
            const override = notes[item.key];
            const currentNote = drafts[item.key] ?? override?.action ?? item.note;
            return (
              <Card key={item.key}>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-foreground">{item.label}</p>
                  <Badge variant={item.status === "partial" ? "warning" : "destructive"}>
                    {item.status === "partial" ? "Một phần" : "Chưa có"}
                  </Badge>
                </div>
                <textarea
                  value={currentNote}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [item.key]: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                {drafts[item.key] !== undefined && (
                  <button
                    onClick={() => handleSaveNote(item.key)}
                    className="mt-2 text-xs text-primary hover:underline"
                  >
                    Lưu ghi chú
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
