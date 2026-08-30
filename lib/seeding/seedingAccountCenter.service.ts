import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  SeedingDirectCommentCapability,
  SeedingTask,
  SeedingTaskCounts,
  SeedingExecutionAccountWithStats,
  SeedingExecutionAccountDetail,
  SeedingExecutionAccountTaskRow,
  SeedingPageAccountWithStats,
  SeedingAccountCenterOverview,
} from "@/types/seeding";
import { getExecutionAccounts, getExecutionAccountById } from "./seedingExecutionAccount.service";
import { getConnectedPages } from "@/lib/facebookTools/facebookPage.service";
import { derivePageCapability } from "./seedingDirectComment.service";

/** Phase 2K-BO — Seeding Account Center.
 *
 * AUDIT FINDING this module is built on: "Direct Comment capability" and
 * "Seeding Execution Account" are two genuinely different concepts that
 * must NOT be conflated:
 *
 * - A Seeding Execution Account (seeding_execution_accounts, Phase 2K-E)
 *   is a real Facebook identity a staff member manually operates. By
 *   explicit, locked design it holds NO credential of any kind (no
 *   access token, no password, no session/cookie) — the CRM coordinates
 *   its use, it never authenticates as it. It is used only for the
 *   existing manual Distribution/Share-to-Group workflow. It therefore
 *   can NEVER have Direct Comment (API) capability, structurally, by
 *   design — not a gap to close, a permanent architectural fact. This
 *   module reports that fact honestly (NOT_SUPPORTED, with a reason),
 *   rather than inventing a fake "maybe it's secretly a Page" mapping.
 *
 * - Direct Comment (API) capability is a property of a connected
 *   `facebook_pages` OAuth connection (Phase 2K-BK), unrelated to
 *   execution accounts entirely — a campaign's own connected Page is
 *   what Comment tasks actually publish through.
 *
 * No new schema was introduced: this audit concluded the existing
 * seeding_execution_accounts + facebook_pages + seeding_tasks tables are
 * already sufficient to answer every capability/task-count question the
 * Account Center needs — confirmed by direct inspection before writing
 * any code (per this phase's own "audit first, don't add schema the
 * existing model already covers" instruction). */

function emptyTaskCounts(): SeedingTaskCounts {
  return { pending: 0, inProgress: 0, done: 0, failed: 0, skipped: 0, cancelled: 0, total: 0 };
}

function tallyStatus(counts: SeedingTaskCounts, status: SeedingTask["status"]): void {
  counts.total++;
  if (status === "Pending") counts.pending++;
  else if (status === "In Progress") counts.inProgress++;
  else if (status === "Done") counts.done++;
  else if (status === "Failed") counts.failed++;
  else if (status === "Skipped") counts.skipped++;
  else if (status === "Cancelled") counts.cancelled++;
}

/** Every Seeding Execution Account is NOT_SUPPORTED for Direct Comment,
 * unconditionally — a single constant, not a per-account computation,
 * because the reason is architectural (no credential ever exists to
 * check), not data-dependent. Reusing the exact same
 * SeedingDirectCommentCapability shape the Page-side capability uses,
 * so the UI renders both through one shared code path. */
const EXECUTION_ACCOUNT_CAPABILITY: SeedingDirectCommentCapability = {
  availability: "NOT_SUPPORTED",
  reason:
    "Tài khoản thực hiện thủ công — không lưu access token hay bất kỳ thông tin đăng nhập nào, CRM không thay mặt tài khoản này gọi API. Dùng cho quy trình phân phối/thực hiện thủ công (đăng bài, thả tương tác trong Nhóm) do nhân viên tự thao tác.",
};

/** List view (Phase 4A). One query for accounts, one for every task that
 * has an execution_account_id set (Share-type distribution tasks only,
 * per Phase 2K-E's own convention — Comment/Like tasks never set this
 * field), aggregated in application code — same convention this codebase
 * already uses elsewhere (e.g. getCampaignProgress) rather than a new
 * SQL aggregate/RPC. */
export async function getExecutionAccountsWithStats(client: SupabaseClient = supabase): Promise<SeedingExecutionAccountWithStats[]> {
  const accounts = await getExecutionAccounts(client);
  if (accounts.length === 0) return [];

  const { data: taskRows, error } = await client
    .from("seeding_tasks")
    .select("execution_account_id, status")
    .not("execution_account_id", "is", null);
  if (error) throw error;

  const countsByAccountId = new Map<string, SeedingTaskCounts>();
  for (const row of (taskRows ?? []) as { execution_account_id: string; status: SeedingTask["status"] }[]) {
    const counts = countsByAccountId.get(row.execution_account_id) ?? emptyTaskCounts();
    tallyStatus(counts, row.status);
    countsByAccountId.set(row.execution_account_id, counts);
  }

  return accounts.map((account) => ({
    ...account,
    direct_comment_capability: EXECUTION_ACCOUNT_CAPABILITY,
    task_counts: countsByAccountId.get(account.id) ?? emptyTaskCounts(),
  }));
}

/** Detail view (Phase 4B) — the account itself plus every task ever
 * assigned to it (any status), most-recently-updated first, so "recent
 * execution status" is simply the top of this list. */
export async function getExecutionAccountDetail(
  accountId: string,
  client: SupabaseClient = supabase
): Promise<SeedingExecutionAccountDetail | null> {
  const account = await getExecutionAccountById(accountId, client);
  if (!account) return null;

  // Phase 2K-BZ (P2 #2) — one extra embed, not a follow-up query: the
  // campaign name for each task's drill-through link.
  const { data: taskRows, error } = await client
    .from("seeding_tasks")
    .select("*, seeding_campaigns(name)")
    .eq("execution_account_id", accountId)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const tasks = ((taskRows ?? []) as unknown as (SeedingTask & { seeding_campaigns: { name: string } | null })[]).map((row) => {
    const { seeding_campaigns, ...task } = row;
    return { ...task, campaign_name: seeding_campaigns?.name ?? null } as SeedingExecutionAccountTaskRow;
  });
  const counts = emptyTaskCounts();
  for (const task of tasks) tallyStatus(counts, task.status);

  return {
    ...account,
    direct_comment_capability: EXECUTION_ACCOUNT_CAPABILITY,
    task_counts: counts,
    tasks,
  };
}

/** The Page-account side of the list view. Task counts here mean
 * "Comment tasks across every campaign that uses this connected Page" —
 * there is no direct page_id column on seeding_tasks, so this resolves
 * campaigns -> tasks in two queries (same aggregation convention as
 * getExecutionAccountsWithStats above), scoped to exactly the campaigns
 * backed by each connected Page's own facebook_page_id. */
export async function getPageAccountsWithStats(client: SupabaseClient = supabase): Promise<SeedingPageAccountWithStats[]> {
  const pages = await getConnectedPages(client);
  if (pages.length === 0) return [];

  const { data: campaignRows, error: campaignError } = await client
    .from("seeding_campaigns")
    .select("id, facebook_page_id")
    .not("facebook_page_id", "is", null);
  if (campaignError) throw campaignError;

  const campaignIdsByFacebookPageId = new Map<string, string[]>();
  for (const row of (campaignRows ?? []) as { id: string; facebook_page_id: string }[]) {
    const list = campaignIdsByFacebookPageId.get(row.facebook_page_id) ?? [];
    list.push(row.id);
    campaignIdsByFacebookPageId.set(row.facebook_page_id, list);
  }

  const allCampaignIds = (campaignRows ?? []).map((r) => (r as { id: string }).id);
  const countsByCampaignId = new Map<string, SeedingTaskCounts>();
  if (allCampaignIds.length > 0) {
    const { data: taskRows, error: taskError } = await client.from("seeding_tasks").select("campaign_id, status").in("campaign_id", allCampaignIds);
    if (taskError) throw taskError;
    for (const row of (taskRows ?? []) as { campaign_id: string; status: SeedingTask["status"] }[]) {
      const counts = countsByCampaignId.get(row.campaign_id) ?? emptyTaskCounts();
      tallyStatus(counts, row.status);
      countsByCampaignId.set(row.campaign_id, counts);
    }
  }

  return pages.map((page) => {
    const counts = emptyTaskCounts();
    for (const campaignId of campaignIdsByFacebookPageId.get(page.facebook_page_id) ?? []) {
      const campaignCounts = countsByCampaignId.get(campaignId);
      if (!campaignCounts) continue;
      counts.pending += campaignCounts.pending;
      counts.inProgress += campaignCounts.inProgress;
      counts.done += campaignCounts.done;
      counts.failed += campaignCounts.failed;
      counts.skipped += campaignCounts.skipped;
      counts.cancelled += campaignCounts.cancelled;
      counts.total += campaignCounts.total;
    }
    return { page, direct_comment_capability: derivePageCapability(page), task_counts: counts };
  });
}

/** Single combined read for the Account Center's list view (Phase 4A) —
 * one round trip for the UI, both account "types" the business actually
 * has today. */
export async function getAccountCenterOverview(client: SupabaseClient = supabase): Promise<SeedingAccountCenterOverview> {
  const [executionAccounts, pages] = await Promise.all([getExecutionAccountsWithStats(client), getPageAccountsWithStats(client)]);
  return { executionAccounts, pages };
}
