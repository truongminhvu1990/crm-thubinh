"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  FolderSearch,
  AlertTriangle,
  ImageOff,
  MessageCircle,
  Heart,
  Share2,
  ExternalLink,
  CheckSquare,
  Square,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import {
  FacebookPageSummary,
  FacebookPagePost,
  FacebookPagePostSyncResult,
  FacebookPageContentDiscoveryStatus,
} from "@/types/facebookTools";
import { CreateSeedingCampaignInput, SeedingCampaign } from "@/types/seeding";
import { BusinessTime } from "@/lib/businessTime";
import { SEEDING_CAMPAIGN_OBJECTIVE_OPTIONS } from "@/lib/seeding/seeding.constants";
import { cn } from "@/lib/utils";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import FacebookPagePostsPagination from "@/components/facebookTools/FacebookPagePostsPagination";

/** Facebook Tools → Content Repository (Phase 2B). Content management only
 * — no campaign, no seeding execution, no engagement automation. Browsing
 * this page never calls Facebook; only the explicit "Làm mới" button does
 * (a bounded sync, Phase 2A). Gated server-side by facebook_tools.manage on
 * every API call this page makes, same as Comment Shield/Semi Seeding. */

const CONTENT_TYPE_LABELS: Record<string, string> = {
  added_photos: "Ảnh",
  added_video: "Video",
  mobile_status_update: "Cập nhật trạng thái",
};

function contentTypeLabel(statusType: string): string {
  return CONTENT_TYPE_LABELS[statusType] ?? statusType;
}

function discoveryStatusBadge(status: FacebookPageContentDiscoveryStatus) {
  if (status === "Active") return <Badge variant="success">Còn truy cập</Badge>;
  if (status === "Unavailable") return <Badge variant="destructive">Không còn truy cập</Badge>;
  return <Badge variant="warning">Đồng bộ lỗi</Badge>;
}

function formatPublishedAt(value: string | null | undefined): string {
  return value ? BusinessTime.formatDateTime(value) : "—";
}

interface Filters {
  search: string;
  statusType: string;
  discoveryStatus: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: Filters = { search: "", statusType: "", discoveryStatus: "", dateFrom: "", dateTo: "" };

export default function ContentRepositoryPage() {
  const router = useRouter();
  const [pages, setPages] = useState<FacebookPageSummary[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  const [statusTypeOptions, setStatusTypeOptions] = useState<string[]>([]);

  const [rows, setRows] = useState<FacebookPagePost[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingList, setIsLoadingList] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<FacebookPagePostSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [detailPost, setDetailPost] = useState<FacebookPagePost | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Phase 2C — multi-select -> "Tạo Seeding Campaign" bulk action.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignObjective, setCampaignObjective] = useState<string>(SEEDING_CAMPAIGN_OBJECTIVE_OPTIONS[0].value);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [createCampaignError, setCreateCampaignError] = useState<string | null>(null);

  const loadPages = useCallback(async () => {
    try {
      const res = await fetch("/api/facebook-tools/pages");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const data: FacebookPageSummary[] = await res.json();
      setPages(data);
      if (!selectedPageId) {
        const active = data.find((p) => p.status !== "Disconnected");
        if (active) setSelectedPageId(active.id);
      }
    } catch (error) {
      console.error("Failed to load connected Facebook pages:", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  const loadStatusTypeOptions = useCallback(async (pageId: string) => {
    try {
      const res = await fetch(`/api/facebook-tools/page-posts/status-types?pageId=${pageId}`);
      if (!res.ok) return;
      setStatusTypeOptions(await res.json());
    } catch (error) {
      console.error("Failed to load content-type options:", error);
    }
  }, []);

  const loadPosts = useCallback(async (pageId: string, f: Filters, pageNum: number) => {
    setIsLoadingList(true);
    try {
      const params = new URLSearchParams({ pageId, page: String(pageNum) });
      if (f.search) params.set("search", f.search);
      if (f.statusType) params.set("statusType", f.statusType);
      if (f.discoveryStatus) params.set("discoveryStatus", f.discoveryStatus);
      if (f.dateFrom) params.set("dateFrom", f.dateFrom);
      if (f.dateTo) params.set("dateTo", f.dateTo);

      const res = await fetch(`/api/facebook-tools/page-posts?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      const data: { rows: FacebookPagePost[]; totalCount: number } = await res.json();
      setRows(data.rows);
      setTotalCount(data.totalCount);
    } catch (error) {
      console.error("Failed to load cached Facebook page posts:", error);
      setRows([]);
      setTotalCount(0);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  // Page selection changes: reset filters/page, reload content-type options.
  useEffect(() => {
    if (!selectedPageId) return;
    setFilters(EMPTY_FILTERS);
    setSearchInput("");
    setPage(1);
    setSyncResult(null);
    setSyncError(null);
    loadStatusTypeOptions(selectedPageId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPageId]);

  // Debounced search — 400ms after the user stops typing.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput }));
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (selectedPageId) loadPosts(selectedPageId, filters, page);
  }, [selectedPageId, filters, page, loadPosts]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  async function handleSync() {
    if (!selectedPageId) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/facebook-tools/page-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: selectedPageId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result: FacebookPagePostSyncResult = await res.json();
      setSyncResult(result);
      await loadStatusTypeOptions(selectedPageId);
      await loadPosts(selectedPageId, filters, page);
    } catch (error) {
      console.error("Failed to sync Facebook page posts:", error);
      setSyncError("Đồng bộ thất bại. Vui lòng thử lại sau.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleOpenDetail(post: FacebookPagePost) {
    setDetailPost(post);
    setIsLoadingDetail(true);
    try {
      const res = await fetch(`/api/facebook-tools/page-posts/${post.id}`);
      if (res.ok) setDetailPost(await res.json());
    } catch (error) {
      console.error("Failed to load post detail:", error);
    } finally {
      setIsLoadingDetail(false);
    }
  }

  function toggleSelectionMode() {
    setSelectionMode((prev) => !prev);
    setSelectedPostIds(new Set());
  }

  function toggleSelectPost(postId: string) {
    setSelectedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }

  function handleCardClick(post: FacebookPagePost) {
    if (selectionMode) toggleSelectPost(post.id);
    else handleOpenDetail(post);
  }

  function openCreateCampaign() {
    setCampaignName("");
    setCampaignObjective(SEEDING_CAMPAIGN_OBJECTIVE_OPTIONS[0].value);
    setCreateCampaignError(null);
    setShowCreateCampaign(true);
  }

  async function handleCreateCampaign() {
    const page = pages.find((p) => p.id === selectedPageId);
    if (!page) return;
    setIsCreatingCampaign(true);
    setCreateCampaignError(null);
    try {
      const input: CreateSeedingCampaignInput = {
        name: campaignName,
        facebook_page_id: page.facebook_page_id,
        objective: campaignObjective,
        targetFacebookPagePostIds: [...selectedPostIds],
      };
      const res = await fetch("/api/seeding/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (res.status === 403) {
        throw new Error("Bạn chưa được cấp quyền seeding.manage để tạo Seeding Campaign.");
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể tạo campaign");
      const campaign: SeedingCampaign = await res.json();
      setShowCreateCampaign(false);
      setSelectionMode(false);
      setSelectedPostIds(new Set());
      router.push(`/facebook-tools/semi-seeding/${campaign.id}`);
    } catch (error) {
      setCreateCampaignError(error instanceof Error ? error.message : "Không thể tạo campaign");
    } finally {
      setIsCreatingCampaign(false);
    }
  }

  if (forbidden) {
    return (
      <div className="p-6">
        <Card className="flex items-center gap-3 text-destructive">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm">
            Bạn chưa được cấp quyền <code>facebook_tools.manage</code>. Liên hệ Admin để được cấp quyền trong Cài đặt
            → Phân quyền.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <FolderSearch className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Content Repository</h1>
          <p className="text-sm text-muted-foreground">Quản lý và duyệt nội dung đã cache từ Facebook Page đã kết nối</p>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm text-muted-foreground">Facebook Page:</label>
            {pages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có Page nào được kết nối.</p>
            ) : (
              <select
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={selectedPageId ?? ""}
                onChange={(e) => setSelectedPageId(e.target.value)}
              >
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.page_name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant={selectionMode ? "primary" : "secondary"}
              size="sm"
              onClick={toggleSelectionMode}
              disabled={!selectedPageId}
            >
              {selectionMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />} Chọn nhiều bài
            </Button>
            <Button variant="secondary" size="sm" onClick={handleSync} isLoading={isSyncing} disabled={!selectedPageId}>
              <RefreshCw className="w-4 h-4" /> Làm mới
            </Button>
          </div>
        </div>

        {selectionMode && (
          <div className="mt-3 flex items-center justify-between flex-wrap gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm text-foreground">Đã chọn {selectedPostIds.size} bài</p>
            <Button size="sm" onClick={openCreateCampaign} disabled={selectedPostIds.size === 0}>
              <Sparkles className="w-4 h-4" /> Tạo Seeding Campaign ({selectedPostIds.size})
            </Button>
          </div>
        )}

        {syncError && <p className="text-sm text-destructive mt-3">{syncError}</p>}

        {syncResult && (
          <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground space-y-1">
            <p>
              Đã gọi {syncResult.requestCount} request · lấy {syncResult.fetchedCount} bài · tạo mới{" "}
              {syncResult.createdCount} · cập nhật {syncResult.updatedCount}
              {syncResult.unavailabilityCheckPerformed && syncResult.unavailableCount > 0
                ? ` · ${syncResult.unavailableCount} bài không còn truy cập`
                : ""}
            </p>
            {syncResult.hasMore && (
              <p className="text-amber-700 font-medium">
                Đồng bộ một phần — vẫn còn dữ liệu trên Facebook chưa tải.
              </p>
            )}
          </div>
        )}
      </Card>

      {selectedPageId && (
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input
              type="text"
              placeholder="Tìm theo nội dung..."
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm lg:col-span-2"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <select
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={filters.statusType}
              onChange={(e) => updateFilter("statusType", e.target.value)}
            >
              <option value="">Mọi loại nội dung</option>
              {statusTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {contentTypeLabel(t)}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={filters.discoveryStatus}
              onChange={(e) => updateFilter("discoveryStatus", e.target.value)}
            >
              <option value="">Mọi trạng thái</option>
              <option value="Active">Còn truy cập</option>
              <option value="Unavailable">Không còn truy cập</option>
              <option value="Refresh Failed">Đồng bộ lỗi</option>
            </select>
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="rounded-lg border border-border bg-background px-2 py-2 text-sm w-full"
                value={filters.dateFrom}
                onChange={(e) => updateFilter("dateFrom", e.target.value)}
              />
              <span className="text-muted-foreground text-xs">–</span>
              <input
                type="date"
                className="rounded-lg border border-border bg-background px-2 py-2 text-sm w-full"
                value={filters.dateTo}
                onChange={(e) => updateFilter("dateTo", e.target.value)}
              />
            </div>
          </div>
        </Card>
      )}

      {selectedPageId && (
        <Card>
          {isLoadingList ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin text-2xl">⟳</div>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Không có bài viết nào khớp với bộ lọc hiện tại.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {rows.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => handleCardClick(post)}
                    className={cn(
                      "relative text-left flex flex-col rounded-lg border transition-colors overflow-hidden touch-manipulation",
                      selectionMode && selectedPostIds.has(post.id)
                        ? "border-primary ring-2 ring-primary/40"
                        : "border-border hover:border-primary/40 hover:bg-primary/5"
                    )}
                  >
                    {selectionMode && selectedPostIds.has(post.id) && (
                      <CheckCircle2 className="absolute top-2 right-2 w-6 h-6 text-primary bg-white rounded-full z-10" />
                    )}
                    {post.full_picture_url ? (
                      <img
                        src={post.full_picture_url}
                        alt=""
                        loading="lazy"
                        className="w-full h-36 object-cover bg-muted"
                      />
                    ) : (
                      <div className="w-full h-36 bg-muted flex items-center justify-center">
                        <ImageOff className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="p-3 flex-1 flex flex-col gap-1.5">
                      <p className="text-sm text-foreground line-clamp-2 min-h-[2.5rem]">
                        {post.message || "(không có nội dung)"}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatPublishedAt(post.published_at)}</p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {post.status_type && <Badge variant="muted">{contentTypeLabel(post.status_type)}</Badge>}
                        {discoveryStatusBadge(post.discovery_status)}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <MessageCircle className="w-3.5 h-3.5" /> {post.comment_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="w-3.5 h-3.5" /> {post.reaction_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <Share2 className="w-3.5 h-3.5" /> {post.share_count}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <FacebookPagePostsPagination page={page} totalCount={totalCount} onPageChange={setPage} />
            </>
          )}
        </Card>
      )}

      {detailPost && (
        <Modal open={!!detailPost} title="Chi tiết bài viết" onClose={() => setDetailPost(null)} size="xl">
          {isLoadingDetail ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin text-2xl">⟳</div>
            </div>
          ) : (
            <div className="space-y-4">
              {detailPost.full_picture_url ? (
                <img src={detailPost.full_picture_url} alt="" className="w-full max-h-96 object-contain rounded-lg bg-muted" />
              ) : (
                <div className="w-full h-40 rounded-lg bg-muted flex items-center justify-center">
                  <ImageOff className="w-8 h-8 text-muted-foreground" />
                </div>
              )}

              <p className="text-sm text-foreground whitespace-pre-wrap">
                {detailPost.message || "(không có nội dung)"}
              </p>

              <div className="flex items-center gap-2 flex-wrap">
                {detailPost.status_type && <Badge variant="muted">{contentTypeLabel(detailPost.status_type)}</Badge>}
                {discoveryStatusBadge(detailPost.discovery_status)}
                <span className="text-xs text-muted-foreground">{formatPublishedAt(detailPost.published_at)}</span>
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4" /> {detailPost.comment_count} bình luận
                </span>
                <span className="flex items-center gap-1.5">
                  <Heart className="w-4 h-4" /> {detailPost.reaction_count} cảm xúc
                </span>
                <span className="flex items-center gap-1.5">
                  <Share2 className="w-4 h-4" /> {detailPost.share_count} chia sẻ
                </span>
              </div>

              {detailPost.permalink_url && (
                <a
                  href={detailPost.permalink_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="w-4 h-4" /> Mở trên Facebook
                </a>
              )}
            </div>
          )}
        </Modal>
      )}

      {showCreateCampaign && (
        <Modal open={showCreateCampaign} title="Tạo Seeding Campaign" onClose={() => setShowCreateCampaign(false)}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {selectedPostIds.size} bài viết đã chọn sẽ trở thành Target Posts của campaign này.
            </p>
            <Input label="Tên campaign" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="VD: Seeding livestream 20/08" />
            <Select label="Mục tiêu" options={SEEDING_CAMPAIGN_OBJECTIVE_OPTIONS} value={campaignObjective} onChange={(e) => setCampaignObjective(e.target.value)} />
            {createCampaignError && <p className="text-destructive text-sm">{createCampaignError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setShowCreateCampaign(false)}>
                Hủy
              </Button>
              <Button onClick={handleCreateCampaign} isLoading={isCreatingCampaign} disabled={!campaignName}>
                Tạo campaign
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
