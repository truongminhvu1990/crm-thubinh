"use client";

import { useEffect, useState } from "react";
import { ImageOff, ChevronLeft, ChevronRight, CheckCircle2, RefreshCw, MessageCircle, Heart, Share2 } from "lucide-react";
import { FacebookPagePost, FacebookPagePostSyncResult, FACEBOOK_PAGE_POSTS_PAGE_SIZE } from "@/types/facebookTools";
import { BusinessTime } from "@/lib/businessTime";
import { cn } from "@/lib/utils";
import Button from "@/components/ui/Button";

/** Seeding Campaign Management (Phase 2C/2E) — shared multi-select post
 * picker, backed by whatever cache-only, paginated/filtered endpoint the
 * caller supplies (Content Repository's own route under
 * facebook_tools.manage, or Semi Seeding's proxy under seeding.manage —
 * see app/api/seeding/pages/[pageId]/posts/route.ts). Never fetches all
 * posts client-side, never calls Facebook on its own — the optional
 * `syncPosts` prop is the ONLY thing that ever touches Graph API here, and
 * only when the user explicitly clicks "Làm mới dữ liệu". */

interface Props {
  fetchPosts: (params: { page: number; search: string }) => Promise<{ rows: FacebookPagePost[]; totalCount: number }>;
  selected: Set<string>;
  onToggle: (postId: string) => void;
  /** Optional — when provided, renders a "Làm mới dữ liệu" button that
   * calls the existing bounded sync (unchanged, Phase 2A) and re-fetches
   * the current page/search afterward. Omitted entirely (no button shown)
   * for callers that don't want sync available inline (none today, but
   * keeps this component reusable without forcing every caller to wire a
   * sync endpoint). */
  syncPosts?: () => Promise<FacebookPagePostSyncResult>;
}

export default function PostPicker({ fetchPosts, selected, onToggle, syncPosts }: Props) {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<FacebookPagePost[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<FacebookPagePostSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let ignore = false;
    setIsLoading(true);
    fetchPosts({ page, search })
      .then((res) => {
        if (ignore) return;
        setRows(res.rows);
        setTotalCount(res.totalCount);
      })
      .catch((error) => console.error("Failed to load posts for picker:", error))
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [page, search, fetchPosts]);

  async function handleSync() {
    if (!syncPosts) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const result = await syncPosts();
      setSyncResult(result);
      const res = await fetchPosts({ page, search });
      setRows(res.rows);
      setTotalCount(res.totalCount);
    } catch (error) {
      console.error("Failed to sync Facebook page posts from picker:", error);
      setSyncError("Đồng bộ thất bại. Vui lòng thử lại sau.");
    } finally {
      setIsSyncing(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / FACEBOOK_PAGE_POSTS_PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Tìm theo nội dung..."
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        {syncPosts && (
          <Button type="button" variant="secondary" size="sm" onClick={handleSync} isLoading={isSyncing}>
            <RefreshCw className="w-4 h-4" /> Làm mới dữ liệu
          </Button>
        )}
      </div>

      {syncError && <p className="text-xs text-destructive">{syncError}</p>}

      {syncResult && (
        <div className="rounded-lg border border-border bg-muted/40 p-2 text-xs text-foreground space-y-1">
          <p>
            Đã lấy {syncResult.fetchedCount} bài · tạo mới {syncResult.createdCount} · cập nhật {syncResult.updatedCount}
          </p>
          {syncResult.hasMore && (
            <p className="text-amber-700 font-medium">Dữ liệu Facebook còn bài viết chưa được tải.</p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin text-xl">⟳</div>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Không có bài viết nào.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-80 overflow-y-auto">
          {rows.map((post) => {
            const isSelected = selected.has(post.id);
            return (
              <button
                key={post.id}
                type="button"
                onClick={() => onToggle(post.id)}
                className={cn(
                  "relative text-left rounded-lg border overflow-hidden touch-manipulation transition-colors",
                  isSelected ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/40"
                )}
              >
                {isSelected && (
                  <CheckCircle2 className="absolute top-1.5 right-1.5 w-5 h-5 text-primary bg-white rounded-full z-10" />
                )}
                {post.full_picture_url ? (
                  <img src={post.full_picture_url} alt="" loading="lazy" className="w-full h-20 object-cover bg-muted" />
                ) : (
                  <div className="w-full h-20 bg-muted flex items-center justify-center">
                    <ImageOff className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="p-1.5 space-y-1">
                  <p className="text-xs text-foreground line-clamp-2 min-h-[2rem]">
                    {post.message || "(không có nội dung)"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {post.published_at ? BusinessTime.formatDate(post.published_at) : "—"}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <MessageCircle className="w-3 h-3" /> {post.comment_count}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Heart className="w-3 h-3" /> {post.reaction_count}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Share2 className="w-3 h-3" /> {post.share_count}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground">
          Đã chọn {selected.size} bài — {totalCount} bài trong cache
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="p-1.5 rounded border border-border disabled:opacity-40 touch-manipulation"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-muted-foreground">
            {page}/{totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="p-1.5 rounded border border-border disabled:opacity-40 touch-manipulation"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
