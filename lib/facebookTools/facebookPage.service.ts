import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { FacebookPage, FacebookPageSummary } from "@/types/facebookTools";
import { logActivity } from "@/lib/activityLog.service";
import { encryptToken, decryptToken } from "./tokenCrypto";
import {
  exchangeCodeForUserToken,
  getLongLivedUserToken,
  listPagesForUser,
  FacebookGraphError,
} from "./facebookGraphClient";

/** Page connection — the shared piece of the Facebook integration layer
 * (see facebookGraphClient.ts's own note): any future module that needs a
 * connected Page (e.g. a future Semi Seeding Assistant — not built here)
 * reuses getConnectedPages/getPageById/getDecryptedPageAccessToken as-is,
 * rather than each module reinventing its own OAuth+token-storage flow.
 * Nothing in this file knows what a "hide job" is. */

/** Meta App credentials — deliberately read lazily here (not in
 * lib/env.ts's REQUIRED_ENV_VARS) for the same reason as
 * tokenCrypto.ts's FACEBOOK_TOKEN_ENCRYPTION_KEY: this module is optional
 * and unconfigured until a Meta App exists (see the module's completion
 * report), so it must not fail the whole app's startup. */
function requireAppCredentials(): { appId: string; appSecret: string } {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error(
      "FACEBOOK_APP_ID / FACEBOOK_APP_SECRET are not set. See docs/FACEBOOK_COMMENT_SHIELD_META_APP_SETUP.md."
    );
  }
  return { appId, appSecret };
}

function toSummary(page: FacebookPage): FacebookPageSummary {
  const summary: Partial<FacebookPage> = { ...page };
  delete summary.access_token_encrypted;
  return summary as FacebookPageSummary;
}

export async function getConnectedPages(client: SupabaseClient = supabase): Promise<FacebookPageSummary[]> {
  const { data, error } = await client.from("facebook_pages").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching connected Facebook pages:", error);
    return [];
  }
  return (data as FacebookPage[]).map(toSummary);
}

export async function getPageById(id: string, client: SupabaseClient = supabase): Promise<FacebookPage | null> {
  const { data, error } = await client.from("facebook_pages").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching Facebook page:", error);
    return null;
  }
  return data as FacebookPage | null;
}

/** facebook_live_posts.facebook_page_id stores Facebook's own Page id
 * (string), not this table's uuid PK — this resolves the row so callers can
 * get to the encrypted token. */
export async function getPageByFacebookPageId(
  facebookPageId: string,
  client: SupabaseClient = supabase
): Promise<FacebookPage | null> {
  const { data, error } = await client.from("facebook_pages").select("*").eq("facebook_page_id", facebookPageId).maybeSingle();
  if (error) {
    console.error("Error fetching Facebook page by Facebook page id:", error);
    return null;
  }
  return data as FacebookPage | null;
}

/** Only ever called from server-side services in this module (never a route
 * handler directly) — the decrypted token must not leak past this
 * boundary. */
export async function getDecryptedPageAccessToken(id: string, client: SupabaseClient = supabase): Promise<string> {
  const page = await getPageById(id, client);
  if (!page) throw new Error("Facebook page not found");
  return decryptToken(page.access_token_encrypted);
}

/** Builds the URL the UI redirects the Admin's browser to, starting Facebook
 * Login for Business. `redirectUri` must exactly match one of the Meta
 * App's registered OAuth Redirect URIs. */
export function buildOAuthConnectUrl(redirectUri: string, state: string): string {
  const { appId } = requireAppCredentials();
  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "pages_show_list,pages_read_engagement,pages_manage_engagement");
  return url.toString();
}

/** Step 3+4 of the OAuth flow (called from the callback route): exchange the
 * `code` for a long-lived User token, list every Page the user administers,
 * then upsert one facebook_pages row per Page with its own encrypted
 * long-lived Page Access Token. Returns the connected pages so the callback
 * route can show a result. */
export async function connectPagesFromOAuthCode(
  code: string,
  redirectUri: string,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<FacebookPageSummary[]> {
  const { appId, appSecret } = requireAppCredentials();

  const shortLived = await exchangeCodeForUserToken(code, redirectUri, appId, appSecret);
  const longLived = await getLongLivedUserToken(shortLived.access_token, appId, appSecret);
  const pages = await listPagesForUser(longLived.access_token);

  const connected: FacebookPageSummary[] = [];
  for (const page of pages) {
    const { data, error } = await client
      .from("facebook_pages")
      .upsert(
        {
          facebook_page_id: page.id,
          page_name: page.name,
          access_token_encrypted: encryptToken(page.access_token),
          status: "Connected",
          connected_by_staff_id: actorStaffId,
        },
        { onConflict: "facebook_page_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("Error connecting Facebook page:", error);
      continue;
    }
    await logActivity(
      { staff_id: actorStaffId, action: "facebook_page_connected", entity: "facebook_page", entity_id: data.id },
      client
    );
    connected.push(toSummary(data as FacebookPage));
  }
  return connected;
}

export async function disconnectPage(
  id: string,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<void> {
  const { error } = await client.from("facebook_pages").update({ status: "Disconnected" }).eq("id", id);
  if (error) throw error;
  await logActivity({ staff_id: actorStaffId, action: "facebook_page_disconnected", entity: "facebook_page", entity_id: id }, client);
}

/** Called when a Graph API call for this Page fails with a token error
 * (FacebookGraphError.requiresReconnect) — flips status instead of failing
 * silently, so the UI can prompt the Admin to reconnect. */
export async function markPageReconnectRequired(id: string, client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client.from("facebook_pages").update({ status: "Reconnect Required" }).eq("id", id);
  if (error) console.error("Error marking Facebook page as needing reconnect:", error);
}

export function isReconnectRequiredError(error: unknown): boolean {
  return error instanceof FacebookGraphError && error.requiresReconnect;
}
