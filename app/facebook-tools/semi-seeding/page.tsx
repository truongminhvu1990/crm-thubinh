"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, AlertTriangle } from "lucide-react";
import { SeedingCampaign, CreateSeedingCampaignInput } from "@/types/seeding";
import { FacebookPageSummary, FacebookPagePost, FacebookPagePostSyncResult } from "@/types/facebookTools";
import { SEEDING_CAMPAIGN_OBJECTIVE_OPTIONS, seedingCampaignStatusLabel } from "@/lib/seeding/seeding.constants";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import PostPicker from "@/components/seeding/PostPicker";

/** Facebook Tools → Semi Seeding (Phase 2C: multi-target Campaign
 * Management). Campaign list + Create Campaign — picking 1..N cached posts
 * via a Post Picker, never a manually-typed Facebook Post ID, never a
 * Graph API call at creation time. Reuses the connected Page list
 * (app/api/seeding/pages, gated by seeding.manage rather than
 * facebook_tools.manage) but touches none of Facebook Tools' own files. */

function statusBadge(status: SeedingCampaign["status"]) {
  if (status === "Active") return <Badge variant="success">{seedingCampaignStatusLabel(status)}</Badge>;
  if (status === "Completed") return <Badge variant="muted">{seedingCampaignStatusLabel(status)}</Badge>;
  return <Badge variant="warning">{seedingCampaignStatusLabel(status)}</Badge>;
}

export default function SemiSeedingPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<SeedingCampaign[]>([]);
  const [pages, setPages] = useState<FacebookPageSummary[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName] = useState("");
  const [pageId, setPageId] = useState("");
  const [objective, setObjective] = useState<string>(SEEDING_CAMPAIGN_OBJECTIVE_OPTIONS[0].value);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function loadCampaigns() {
    setIsLoading(true);
    setForbidden(false);
    try {
      const [campaignsRes, pagesRes] = await Promise.all([fetch("/api/seeding/campaigns"), fetch("/api/seeding/pages")]);
      if (campaignsRes.status === 403 || pagesRes.status === 403) {
        setForbidden(true);
        return;
      }
      if (!campaignsRes.ok) throw new Error(await campaignsRes.text());
      setCampaigns(await campaignsRes.json());
      if (pagesRes.ok) setPages(await pagesRes.json());
    } catch (error) {
      console.error("Failed to load seeding campaigns:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCampaigns();
  }, []);

  const fetchPickerPosts = useCallback(
    async ({ page, search }: { page: number; search: string }): Promise<{ rows: FacebookPagePost[]; totalCount: number }> => {
      if (!pageId) return { rows: [], totalCount: 0 };
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/seeding/pages/${pageId}/posts?${params.toString()}`);
      if (!res.ok) return { rows: [], totalCount: 0 };
      return res.json();
    },
    [pageId]
  );

  const syncPickerPosts = useCallback(async (): Promise<FacebookPagePostSyncResult> => {
    const res = await fetch(`/api/seeding/pages/${pageId}/posts`, { method: "POST" });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }, [pageId]);

  function togglePost(postId: string) {
    setSelectedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }

  function openCreate() {
    setName("");
    setPageId(pages[0]?.id ?? "");
    setObjective(SEEDING_CAMPAIGN_OBJECTIVE_OPTIONS[0].value);
    setSelectedPostIds(new Set());
    setSaveError(null);
    setShowCreate(true);
  }

  async function handleCreate() {
    setIsSaving(true);
    setSaveError(null);
    try {
      const input: CreateSeedingCampaignInput = {
        name,
        facebook_page_id: pages.find((p) => p.id === pageId)?.facebook_page_id ?? "",
        objective,
        targetFacebookPagePostIds: [...selectedPostIds],
      };
      const res = await fetch("/api/seeding/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể tạo campaign");
      const campaign: SeedingCampaign = await res.json();
      setShowCreate(false);
      router.push(`/facebook-tools/semi-seeding/${campaign.id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Không thể tạo campaign");
    } finally {
      setIsSaving(false);
    }
  }

  if (forbidden) {
    return (
      <div className="p-6">
        <Card className="flex items-center gap-3 text-destructive">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm">
            Bạn chưa được cấp quyền <code>seeding.manage</code>. Liên hệ Admin để được cấp quyền trong Cài đặt → Phân
            quyền.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">Semi Seeding</h1>
            <p className="text-sm text-muted-foreground">Campaign nhiều bài viết — nhân viên tự thực hiện, CRM theo dõi tiến độ</p>
          </div>
        </div>
        <Button onClick={openCreate} disabled={pages.length === 0}>
          <Plus className="w-4 h-4" /> Tạo campaign
        </Button>
      </div>

      {pages.length === 0 && !isLoading && (
        <Card className="text-sm text-muted-foreground">
          Chưa có Facebook Page nào được kết nối. Kết nối Page tại Facebook Tools → Comment Shield trước khi tạo
          campaign.
        </Card>
      )}

      <Card>
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có campaign nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">Tên campaign</th>
                  <th className="py-2 pr-4">Mục tiêu</th>
                  <th className="py-2 pr-4">Trạng thái</th>
                  <th className="py-2 pr-4">Ngày tạo</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40"
                    onClick={() => router.push(`/facebook-tools/semi-seeding/${c.id}`)}
                  >
                    <td className="py-3 pr-4 text-foreground">{c.name}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{c.objective}</td>
                    <td className="py-3 pr-4">{statusBadge(c.status)}</td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString("vi-VN") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={showCreate} title="Tạo Seeding Campaign" onClose={() => setShowCreate(false)} size="xl">
        <div className="space-y-4">
          <Input label="Tên campaign" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Seeding livestream 20/08" />
          <Select
            label="Facebook Page"
            placeholder="Chọn Page"
            options={pages.map((p) => ({ value: p.id, label: p.page_name }))}
            value={pageId}
            onChange={(e) => {
              setPageId(e.target.value);
              setSelectedPostIds(new Set());
            }}
          />
          <Select
            label="Mục tiêu"
            options={SEEDING_CAMPAIGN_OBJECTIVE_OPTIONS}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
          />

          {pageId && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Chọn bài viết (Target Posts)</label>
              <PostPicker fetchPosts={fetchPickerPosts} selected={selectedPostIds} onToggle={togglePost} syncPosts={syncPickerPosts} />
            </div>
          )}

          {saveError && <p className="text-destructive text-sm">{saveError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleCreate}
              isLoading={isSaving}
              disabled={!name || !pageId || !objective || selectedPostIds.size === 0}
            >
              Tạo campaign {selectedPostIds.size > 0 ? `(${selectedPostIds.size} bài)` : "(chưa chọn bài)"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
