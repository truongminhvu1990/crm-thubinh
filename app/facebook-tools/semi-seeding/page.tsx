"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, AlertTriangle, Settings } from "lucide-react";
import { SeedingCampaign, CreateSeedingCampaignInput } from "@/types/seeding";
import { FacebookPageSummary, FacebookPagePost, FacebookPagePostSyncResult } from "@/types/facebookTools";
import { SEEDING_CAMPAIGN_OBJECTIVE_OPTIONS, seedingCampaignStatusLabel, seedingCampaignStatusBadgeVariant } from "@/lib/seeding/seeding.constants";
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
  return <Badge variant={seedingCampaignStatusBadgeVariant(status)}>{seedingCampaignStatusLabel(status)}</Badge>;
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

  /** Phase 2K-CF (Issue 5, Decision B — LOCKED) — every post id matching
   * the current search, not just the currently-loaded picker page. Ids
   * only (GET .../posts?idsOnly=true), never full post payloads. Merges
   * additively into the existing selection — does not clear ids selected
   * under a previous, different search. */
  const selectAllMatchingPosts = useCallback(
    async (search: string) => {
      if (!pageId) return;
      const params = new URLSearchParams({ idsOnly: "true" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/seeding/pages/${pageId}/posts?${params.toString()}`);
      if (!res.ok) return;
      const { ids } = (await res.json()) as { ids: string[] };
      setSelectedPostIds((prev) => new Set([...prev, ...ids]));
    },
    [pageId]
  );

  function clearAllPosts() {
    setSelectedPostIds(new Set());
  }

  function openCreate() {
    setName("");
    // Phase 2K-BY (P1 #2) — deliberately NOT pre-selected to pages[0]
    // anymore: no Page is the default, requiring an explicit choice to
    // attach one. This is what makes a manual-only campaign (Personal/
    // Group content via Quick Capture, no Connected Page) reachable at
    // all — createCampaign/the API route already fully support
    // facebook_page_id being omitted, this was purely a UI gap.
    setPageId("");
    setObjective(SEEDING_CAMPAIGN_OBJECTIVE_OPTIONS[0].value);
    setSelectedPostIds(new Set());
    setSaveError(null);
    setShowCreate(true);
  }

  async function handleCreate() {
    setIsSaving(true);
    setSaveError(null);
    try {
      const selectedPage = pages.find((p) => p.id === pageId);
      const input: CreateSeedingCampaignInput = {
        name,
        // Omitted entirely (never an empty string) when no Page is
        // chosen — createCampaign's own `input.facebook_page_id ?? null`
        // only treats a genuinely missing/undefined value as "no Page";
        // an empty string would have been silently wrong.
        ...(selectedPage ? { facebook_page_id: selectedPage.facebook_page_id } : {}),
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
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => router.push("/facebook-tools/semi-seeding/execution-setup")}>
            <Settings className="w-4 h-4" /> Thiết lập thực hiện
          </Button>
          {/* Phase 2K-BY (P1 #2) — no longer gated on pages.length: a
             manual-only campaign (Personal/Group content via Quick
             Capture, no Connected Page) must be creatable even when zero
             Pages are connected. */}
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> Tạo campaign
          </Button>
        </div>
      </div>

      {pages.length === 0 && !isLoading && (
        <Card className="text-sm text-muted-foreground">
          Chưa có Facebook Page nào được kết nối. Bạn vẫn có thể tạo campaign không gắn Page (dùng Quick Capture cho
          nội dung Personal/Nhóm) — kết nối Page tại Facebook Tools → Comment Shield nếu cần seeding từ bài viết Page.
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
            label="Facebook Page (tùy chọn)"
            placeholder="Không chọn Page — có thể thêm bài viết sau"
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

          {pageId ? (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Chọn bài viết (Target Posts)</label>
              <PostPicker
                fetchPosts={fetchPickerPosts}
                selected={selectedPostIds}
                onToggle={togglePost}
                syncPosts={syncPickerPosts}
                onSelectAllMatching={selectAllMatchingPosts}
                onClearAll={clearAllPosts}
              />
            </div>
          ) : (
            // Phase 2K-BY (P1 #2) — the manual-only path: no Page, no
            // Page-post picker. The campaign is created empty (0
            // targets) — Quick Capture inside Campaign Detail is the
            // intended way to add content afterward, exactly like a
            // Page-backed campaign's own targets can be added after
            // creation.
            //
            // Phase 2K-CB (Issue 2) — Facebook Page is optional campaign
            // CONTEXT (used for Direct Comment capability/display), never
            // a restriction on which content types the campaign can hold.
            // A campaign — Page-backed or not — can contain Page,
            // Personal, and Group targets in any combination; wording
            // must not imply otherwise.
            <p className="text-xs text-muted-foreground">
              Campaign có thể chứa bài viết Page, Personal, hoặc Nhóm — ở bất kỳ tổ hợp nào. Facebook Page chỉ là ngữ
              cảnh tùy chọn (dùng để đăng comment trực tiếp khi khả dụng), không giới hạn loại nội dung. Sau khi tạo,
              dùng &quot;Thêm bài viết Facebook&quot; (Quick Capture) trong Campaign Detail để thêm nội dung.
            </p>
          )}

          {saveError && <p className="text-destructive text-sm">{saveError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleCreate}
              isLoading={isSaving}
              disabled={!name || !objective || (!!pageId && selectedPostIds.size === 0)}
            >
              {pageId
                ? `Tạo campaign ${selectedPostIds.size > 0 ? `(${selectedPostIds.size} bài)` : "(chưa chọn bài)"}`
                : "Tạo campaign (không gắn Page)"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
