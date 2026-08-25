"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, Link2, Unlink, ShieldOff, AlertTriangle, MessageSquareText, EyeOff } from "lucide-react";
import { FacebookPageSummary, FacebookLivePost, FacebookHideJob, FacebookLivePostComment } from "@/types/facebookTools";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import AlertDialog from "@/components/ui/AlertDialog";
import Modal from "@/components/ui/Modal";

/** Facebook Tools → Comment Shield (MVP). Standalone admin page — does not
 * touch any other CRM screen. Gated server-side by facebook_tools.manage on
 * every API call this page makes (app/api/facebook-tools/*); a 403 here
 * just means the calling staff member hasn't been granted that permission
 * yet via the Permission Matrix UI. */

const POLL_INTERVAL_MS = 1200;

function pageStatusBadge(status: FacebookPageSummary["status"]) {
  if (status === "Connected") return <Badge variant="success">Đã kết nối</Badge>;
  if (status === "Reconnect Required") return <Badge variant="destructive">Cần kết nối lại</Badge>;
  return <Badge variant="muted">Đã ngắt kết nối</Badge>;
}

function processingStatusBadge(status: FacebookLivePost["processing_status"]) {
  switch (status) {
    case "Completed":
      return <Badge variant="success">Đã ẩn xong</Badge>;
    case "Completed With Errors":
      return <Badge variant="warning">Xong (có lỗi)</Badge>;
    case "Failed":
      return <Badge variant="destructive">Thất bại</Badge>;
    case "In Progress":
      return <Badge variant="default">Đang xử lý</Badge>;
    default:
      return <Badge variant="muted">Chưa xử lý</Badge>;
  }
}

function jobIsTerminal(job: FacebookHideJob | null): boolean {
  return !!job && (job.status === "completed" || job.status === "completed_with_errors" || job.status === "failed");
}

/** Maps a raw backend/Graph error message to a friendly, non-technical
 * message — the raw message must never be rendered to the end user (Case
 * A UX fix, 2026-08-25). The object-not-found/permission signature (Graph
 * error code 100, subcode 33 — "Unsupported get request... does not
 * exist... missing permissions", confirmed on livestream 26/7) is the one
 * real-world case identified so far; anything else falls back to a
 * generic message rather than ever surfacing raw Graph/API text. */
function friendlyCommentsLoadError(rawMessage: string): string {
  if (/unsupported get request|does not exist|missing permissions/i.test(rawMessage)) {
    return "Không thể tải comment từ Facebook. Livestream này hiện không còn truy cập được qua Facebook hoặc tài khoản Facebook hiện tại không có quyền đọc comment của bài viết này.";
  }
  return "Không thể tải comment từ Facebook lúc này. Vui lòng thử lại sau.";
}

export default function CommentShieldPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      }
    >
      <CommentShieldPageInner />
    </Suspense>
  );
}

function CommentShieldPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pages, setPages] = useState<FacebookPageSummary[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [connectBanner, setConnectBanner] = useState<string | null>(null);

  const [livePosts, setLivePosts] = useState<FacebookLivePost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);

  const [jobs, setJobs] = useState<Record<string, FacebookHideJob>>({});
  const [confirmPostId, setConfirmPostId] = useState<string | null>(null);
  const pollTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Phase 3.1 — comment review (read-only, no hide action from here).
  const [viewingPost, setViewingPost] = useState<FacebookLivePost | null>(null);
  const [comments, setComments] = useState<FacebookLivePostComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  // UAT Case 26/7 (2026-08-25) — distinguishes "never refreshed yet" from
  // "refreshed successfully, Facebook genuinely has none" from "refresh
  // itself failed" (e.g. a real Graph error like object-not-found), which
  // previously all rendered as the same empty-cache message.
  const [commentsLoadError, setCommentsLoadError] = useState<string | null>(null);
  const [hasRefreshedComments, setHasRefreshedComments] = useState(false);

  // Phase 4 — manual hide of one reviewed comment. Deliberately its own
  // local state, keyed by facebook_comment_id, and never written into the
  // `jobs`/pollTimers state above — that state drives the bulk "Ẩn toàn bộ
  // comment" row per live post and must not be touched by this flow.
  const [commentHideState, setCommentHideState] = useState<Record<string, "hiding" | "success" | "error">>({});

  const activePage = pages.find((p) => p.status !== "Disconnected") ?? null;

  const loadPages = useCallback(async () => {
    setIsLoadingPages(true);
    setForbidden(false);
    try {
      const res = await fetch("/api/facebook-tools/pages");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      setPages(await res.json());
    } catch (error) {
      console.error("Failed to load connected Facebook pages:", error);
    } finally {
      setIsLoadingPages(false);
    }
  }, []);

  const loadLivePosts = useCallback(async (pageRowId: string, refresh: boolean) => {
    setIsLoadingPosts(true);
    try {
      const params = new URLSearchParams({ pageId: pageRowId });
      if (refresh) params.set("refresh", "true");
      const res = await fetch(`/api/facebook-tools/live-posts?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      const posts: FacebookLivePost[] = await res.json();
      setLivePosts(posts);

      const latestJobs = await Promise.all(
        posts.map(async (post) => {
          const jobRes = await fetch(`/api/facebook-tools/hide-jobs?livePostId=${post.id}`);
          if (!jobRes.ok) return null;
          const job: FacebookHideJob | null = await jobRes.json();
          return job ? ([post.id, job] as const) : null;
        })
      );
      setJobs(Object.fromEntries(latestJobs.filter((entry): entry is readonly [string, FacebookHideJob] => entry !== null)));
    } catch (error) {
      console.error("Failed to load Facebook live posts:", error);
    } finally {
      setIsLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  useEffect(() => {
    if (activePage) loadLivePosts(activePage.id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage?.id]);

  // OAuth callback redirect result (?fb_connect_success / ?fb_connect_error).
  useEffect(() => {
    const success = searchParams.get("fb_connect_success");
    const error = searchParams.get("fb_connect_error");
    if (success !== null) {
      setConnectBanner(`Đã kết nối ${success} Page.`);
      loadPages();
    } else if (error) {
      setConnectBanner(
        error === "invalid_state"
          ? "Kết nối thất bại: phiên xác thực không hợp lệ, vui lòng thử lại."
          : error === "forbidden"
            ? "Bạn không có quyền kết nối Facebook Page."
            : "Kết nối Facebook thất bại. Kiểm tra cấu hình Meta App."
      );
    }
    if (success !== null || error) {
      router.replace("/facebook-tools/comment-shield");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll every in-progress job while this page is open. No job runs — or is
  // ever started — when nobody has this page open.
  useEffect(() => {
    Object.values(jobs).forEach((job) => {
      const key = job.facebook_live_post_id;
      if (jobIsTerminal(job)) {
        if (pollTimers.current[key]) {
          clearTimeout(pollTimers.current[key]);
          delete pollTimers.current[key];
        }
        return;
      }
      if (pollTimers.current[key]) return;

      const poll = async () => {
        try {
          const res = await fetch(`/api/facebook-tools/hide-jobs/${job.id}/process`, { method: "POST" });
          if (res.ok) {
            const { job: updated } = await res.json();
            setJobs((prev) => ({ ...prev, [key]: updated }));
            if (!jobIsTerminal(updated)) {
              pollTimers.current[key] = setTimeout(poll, POLL_INTERVAL_MS);
              return;
            }
            // Job just reached a terminal state — reload livePosts once so
            // the processing_status badge reflects the value the server
            // already persisted (recomputeAndPersistCounts). This branch
            // only runs the one time poll() observes the transition, so it
            // can't fire repeatedly.
            if (activePage) loadLivePosts(activePage.id, false);
          }
        } catch (error) {
          console.error("Failed to process hide job batch:", error);
        }
        delete pollTimers.current[key];
      };
      pollTimers.current[key] = setTimeout(poll, POLL_INTERVAL_MS);
    });

    return () => {
      Object.values(pollTimers.current).forEach(clearTimeout);
      pollTimers.current = {};
    };
  }, [jobs]);

  async function handleConnect() {
    try {
      const res = await fetch("/api/facebook-tools/pages/connect-url");
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      window.location.href = url;
    } catch (error) {
      console.error("Failed to start Facebook connect flow:", error);
      setConnectBanner("Không thể bắt đầu kết nối Facebook. Kiểm tra cấu hình Meta App (FACEBOOK_APP_ID/SECRET).");
    }
  }

  async function handleDisconnect() {
    if (!activePage) return;
    await fetch(`/api/facebook-tools/pages/${activePage.id}`, { method: "DELETE" });
    setLivePosts([]);
    setJobs({});
    loadPages();
  }

  async function handleStartHideJob(livePostId: string) {
    setConfirmPostId(null);
    try {
      const res = await fetch("/api/facebook-tools/hide-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ livePostId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const job: FacebookHideJob = await res.json();
      setJobs((prev) => ({ ...prev, [livePostId]: job }));
    } catch (error) {
      console.error("Failed to start hide job:", error);
    }
  }

  // Phase 3.1 — comment review only. Never triggers a hide job or any
  // Facebook write; `refresh` re-fetches via a read-only Graph API call.
  async function loadComments(post: FacebookLivePost, refresh: boolean) {
    setIsLoadingComments(true);
    setCommentsLoadError(null);
    try {
      const params = new URLSearchParams();
      if (refresh) params.set("refresh", "true");
      const res = await fetch(`/api/facebook-tools/live-posts/${post.id}/comments?${params.toString()}`);
      if (!res.ok) {
        const bodyText = await res.text();
        let message = bodyText;
        try {
          message = (JSON.parse(bodyText).error as string | undefined) ?? bodyText;
        } catch {
          // not JSON — use the raw text as-is
        }
        throw new Error(message);
      }
      setComments(await res.json());
      if (refresh) setHasRefreshedComments(true);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to load Facebook live post comments:", rawMessage);
      setCommentsLoadError(friendlyCommentsLoadError(rawMessage));
    } finally {
      setIsLoadingComments(false);
    }
  }

  function handleViewComments(post: FacebookLivePost) {
    setViewingPost(post);
    setComments([]);
    setCommentHideState({});
    setCommentsLoadError(null);
    setHasRefreshedComments(false);
    loadComments(post, false);
  }

  // Phase 4 — manual hide of one selected comment. Reuses the same job
  // creation (with an explicit commentIds) and processing/poll endpoints
  // as the bulk flow above; own local poll loop so it never touches the
  // shared jobs/pollTimers state.
  async function handleHideComment(comment: FacebookLivePostComment) {
    if (!viewingPost) return;
    const commentId = comment.facebook_comment_id;
    setCommentHideState((prev) => ({ ...prev, [commentId]: "hiding" }));
    try {
      const res = await fetch("/api/facebook-tools/hide-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ livePostId: viewingPost.id, commentIds: [commentId] }),
      });
      if (!res.ok) throw new Error(await res.text());
      let job: FacebookHideJob = await res.json();

      let attempts = 0;
      while (!jobIsTerminal(job) && attempts < 30) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const processRes = await fetch(`/api/facebook-tools/hide-jobs/${job.id}/process`, { method: "POST" });
        if (!processRes.ok) throw new Error(await processRes.text());
        ({ job } = await processRes.json());
        attempts += 1;
      }

      setCommentHideState((prev) => ({ ...prev, [commentId]: job.status === "completed" ? "success" : "error" }));
    } catch (error) {
      console.error("Failed to hide comment:", error);
      setCommentHideState((prev) => ({ ...prev, [commentId]: "error" }));
    }
  }

  async function handleRetryFailed(job: FacebookHideJob) {
    try {
      const res = await fetch(`/api/facebook-tools/hide-jobs/${job.id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const updated: FacebookHideJob = await res.json();
      setJobs((prev) => ({ ...prev, [job.facebook_live_post_id]: updated }));
    } catch (error) {
      console.error("Failed to retry failed comments:", error);
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
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <ShieldOff className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Comment Shield</h1>
          <p className="text-sm text-muted-foreground">Ẩn toàn bộ comment livestream sau khi bán hàng</p>
        </div>
      </div>

      {connectBanner && (
        <Card className="text-sm text-foreground flex items-center justify-between">
          <span>{connectBanner}</span>
          <button className="text-muted-foreground hover:text-foreground" onClick={() => setConnectBanner(null)}>
            Đóng
          </button>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-medium text-foreground">Kết nối Facebook Page</h2>
            {activePage ? (
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <span>{activePage.page_name}</span>
                {pageStatusBadge(activePage.status)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">Chưa kết nối Page nào.</p>
            )}
          </div>
          <div className="flex gap-2">
            {activePage ? (
              <Button variant="secondary" onClick={handleDisconnect}>
                <Unlink className="w-4 h-4" /> Ngắt kết nối
              </Button>
            ) : (
              <Button onClick={handleConnect} disabled={isLoadingPages}>
                <Link2 className="w-4 h-4" /> Kết nối Facebook Page
              </Button>
            )}
          </div>
        </div>
      </Card>

      {activePage && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium text-foreground">Bài livestream gần đây</h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadLivePosts(activePage.id, true)}
              isLoading={isLoadingPosts}
            >
              <RefreshCw className="w-4 h-4" /> Làm mới
            </Button>
          </div>

          {livePosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có bài livestream nào gần đây.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 pr-4">Tên bài</th>
                    <th className="py-2 pr-4">Ngày giờ</th>
                    <th className="py-2 pr-4">Số lượng comment</th>
                    <th className="py-2 pr-4">Trạng thái xử lý</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {livePosts.map((post) => {
                    const job = jobs[post.id];
                    return (
                      <tr key={post.id} className="border-b border-border last:border-0 align-top">
                        <td className="py-3 pr-4 text-foreground">{post.title || post.message || post.facebook_post_id}</td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {post.live_at ? new Date(post.live_at).toLocaleString("vi-VN") : "—"}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">{post.comment_count}</td>
                        <td className="py-3 pr-4">
                          {processingStatusBadge(post.processing_status)}
                          {job && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {job.processed_count}/{job.total_comments} đã xử lý · {job.success_count} thành công ·{" "}
                              {job.error_count} lỗi
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="secondary" onClick={() => handleViewComments(post)}>
                              <MessageSquareText className="w-4 h-4" /> Xem comment
                            </Button>
                            {job && !jobIsTerminal(job) ? (
                              <span className="text-xs text-muted-foreground self-center">Đang xử lý…</span>
                            ) : job && job.error_count > 0 ? (
                              <Button size="sm" variant="secondary" onClick={() => handleRetryFailed(job)}>
                                Thử lại lỗi
                              </Button>
                            ) : (
                              <Button size="sm" onClick={() => setConfirmPostId(post.id)}>
                                Ẩn toàn bộ comment
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {viewingPost && (
        <Modal open={!!viewingPost} title="Comment (chỉ xem)" onClose={() => setViewingPost(null)} size="xl">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {viewingPost.title || viewingPost.message || viewingPost.facebook_post_id}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => loadComments(viewingPost, true)}
                isLoading={isLoadingComments}
              >
                <RefreshCw className="w-4 h-4" /> Làm mới
              </Button>
            </div>

            {comments.length === 0 ? (
              <div className={`text-sm text-center py-6 ${commentsLoadError ? "text-destructive" : "text-muted-foreground"}`}>
                <p>
                  {isLoadingComments
                    ? "Đang tải…"
                    : commentsLoadError
                      ? commentsLoadError
                      : hasRefreshedComments
                        ? "Facebook không có comment nào cho livestream này."
                        : "Chưa có comment nào trong cache — bấm Làm mới để tải từ Facebook."}
                </p>
                {commentsLoadError && !isLoadingComments && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Bạn có thể thử lại sau. Nếu lỗi vẫn tiếp tục, hãy kiểm tra lại kết nối và quyền truy cập Facebook Page.
                  </p>
                )}
              </div>
            ) : (
              <>
                {commentsLoadError && <p className="text-sm text-destructive">{commentsLoadError}</p>}
                <ul className="space-y-3 max-h-[60vh] overflow-y-auto">
                {comments.map((c) => {
                  const hideState = commentHideState[c.facebook_comment_id];
                  return (
                    <li key={c.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">{c.author_name || "Ẩn danh"}</span>
                        <span className="text-xs text-muted-foreground">
                          {c.comment_created_at ? new Date(c.comment_created_at).toLocaleString("vi-VN") : "—"}
                        </span>
                      </div>
                      <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{c.message || "(không có nội dung)"}</p>
                      <div className="flex items-center justify-end gap-2 mt-2">
                        {hideState === "success" ? (
                          <Badge variant="success">Đã ẩn</Badge>
                        ) : hideState === "error" ? (
                          <>
                            <Badge variant="destructive">Lỗi khi ẩn</Badge>
                            <Button size="sm" variant="secondary" onClick={() => handleHideComment(c)}>
                              <EyeOff className="w-4 h-4" /> Thử lại
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            isLoading={hideState === "hiding"}
                            onClick={() => handleHideComment(c)}
                          >
                            <EyeOff className="w-4 h-4" /> Ẩn comment này
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
                </ul>
              </>
            )}
          </div>
        </Modal>
      )}

      <AlertDialog
        open={confirmPostId !== null}
        title="Ẩn toàn bộ comment?"
        description="Toàn bộ comment của khách hàng trên bài livestream này sẽ bị ẩn khỏi Facebook. Có thể mất vài phút với bài có nhiều comment."
        confirmLabel="Ẩn toàn bộ"
        confirmVariant="primary"
        onOpenChange={(open) => !open && setConfirmPostId(null)}
        onCancel={() => setConfirmPostId(null)}
        onConfirm={() => confirmPostId && handleStartHideJob(confirmPostId)}
      />
    </div>
  );
}
