import { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { supabase } from "@/lib/supabase";
import { SeedingCommentSuggestion, SeedingCommentCategory } from "@/types/seeding";
import { SEEDING_COMMENT_CATEGORIES } from "./seeding.constants";
import { getCampaignById } from "./seedingCampaign.service";

/** AI Comment Suggestion (module scope §2): a single structured-output
 * Claude API call per Generate/Regenerate click — not an agent, no tool
 * use. Input is the campaign's post content + product + objective; output
 * is a fixed-shape list of comment variants across the 4 required
 * categories. Never posts anything — this only ever returns text for a
 * human to review/edit/copy. */

const VARIANTS_PER_CATEGORY = 2;

/** Environment-based, not hard-coded (PO instruction, 2026-08-24) — swapping
 * models (e.g. a cheaper tier, or a future release) is an env change, not a
 * code change. `ANTHROPIC_MODEL` is read lazily inside the function that
 * uses it (not at module load) so tests never need it set, and falls back
 * to claude-opus-5 (this skill's own default model) when unset. */
function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-opus-5";
}

const SuggestionSchema = z.object({
  category: z.enum(SEEDING_COMMENT_CATEGORIES as [SeedingCommentCategory, ...SeedingCommentCategory[]]),
  content: z.string(),
});

const GenerationResultSchema = z.object({
  suggestions: z.array(SuggestionSchema),
});

let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

interface GenerateCommentsInput {
  postContent: string | null;
  productDescription: string | null;
  objective: string;
  /** Prior batches' content, so a Regenerate round is told not to repeat
   * itself — module requirement "Không trùng lặp." */
  avoid: string[];
}

export type SuggestionDraft = z.infer<typeof SuggestionSchema>;

/** Exported so tests can inject a fake in place of a real Claude API call
 * (the injectable-collaborator convention this codebase already uses for
 * SupabaseClient — see generateCommentSuggestions' `requestFn` param
 * below) rather than mocking the @anthropic-ai/sdk module. */
export async function requestSuggestionsFromClaude(input: GenerateCommentsInput): Promise<SuggestionDraft[]> {
  const avoidBlock =
    input.avoid.length > 0
      ? `\n\nNhững comment đã tạo trước đó, KHÔNG được lặp lại hoặc diễn đạt gần giống:\n${input.avoid.map((c) => `- ${c}`).join("\n")}`
      : "";

  const response = await getAnthropicClient().messages.parse({
    model: getAnthropicModel(),
    max_tokens: 4096,
    system:
      "Bạn là trợ lý hỗ trợ nhân viên chăm sóc khách hàng trên Facebook. " +
      "Nhiệm vụ: soạn các comment mẫu (KHÔNG phải để đăng tự động — nhân viên sẽ tự chọn, chỉnh sửa và đăng thủ công) " +
      `để seeding một bài viết Facebook, theo đúng ${VARIANTS_PER_CATEGORY} biến thể cho mỗi trong 4 loại: ` +
      "hoi_thong_tin (hỏi thông tin sản phẩm/giá/còn hàng...), tao_thao_luan (khơi gợi thảo luận, ý kiến), " +
      "kien_thuc (chia sẻ kiến thức liên quan tự nhiên), phan_hoi_tu_nhien (phản hồi như một khách hàng bình thường). " +
      "Giọng văn tự nhiên, ngắn gọn, đa dạng câu chữ giữa các biến thể, không seo từ khóa lộ liễu, không trùng lặp nội dung.",
    messages: [
      {
        role: "user",
        content:
          `Nội dung bài post: ${input.postContent ?? "(không có, hãy viết comment chung chung phù hợp mục tiêu)"}\n` +
          `Sản phẩm liên quan: ${input.productDescription ?? "(không chỉ định)"}\n` +
          `Mục tiêu: ${input.objective}` +
          avoidBlock,
      },
    ],
    output_config: { format: zodOutputFormat(GenerationResultSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Claude API did not return parseable comment suggestions");
  }
  return response.parsed_output.suggestions;
}

/** Dedup within a single batch — the model can still occasionally repeat
 * itself despite the prompt instruction; this is a hard guarantee, not a
 * suggestion. Normalizes whitespace/case for the comparison only, keeps
 * original casing in the stored content. */
export function dedupeSuggestions(suggestions: SuggestionDraft[]): SuggestionDraft[] {
  const seen = new Set<string>();
  const result: z.infer<typeof SuggestionSchema>[] = [];
  for (const s of suggestions) {
    const key = s.content.trim().toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(s);
  }
  return result;
}

export async function getSuggestionsForCampaign(
  campaignId: string,
  client: SupabaseClient = supabase
): Promise<SeedingCommentSuggestion[]> {
  const { data, error } = await client
    .from("seeding_comment_suggestions")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("generation_batch", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Error fetching seeding comment suggestions:", error);
    return [];
  }
  return data as SeedingCommentSuggestion[];
}

/** "Generate"/"Regenerate" — same function either way (module scope §2:
 * "Có thể regenerate"). Each call is its own generation_batch, and prior
 * batches' content is fed back as "avoid" so a regenerate round produces
 * genuinely new variants rather than rephrasing the same ones. */
export async function generateCommentSuggestions(
  campaignId: string,
  productDescription: string | null,
  client: SupabaseClient = supabase,
  requestFn: (input: GenerateCommentsInput) => Promise<SuggestionDraft[]> = requestSuggestionsFromClaude
): Promise<SeedingCommentSuggestion[]> {
  const campaign = await getCampaignById(campaignId, client);
  if (!campaign) throw new Error("Seeding campaign not found");

  const priorSuggestions = await getSuggestionsForCampaign(campaignId, client);
  const nextBatch = priorSuggestions.length > 0 ? Math.max(...priorSuggestions.map((s) => s.generation_batch)) + 1 : 1;

  const raw = await requestFn({
    postContent: campaign.post_content_snapshot ?? null,
    productDescription,
    objective: campaign.objective,
    avoid: priorSuggestions.map((s) => s.content),
  });
  const deduped = dedupeSuggestions(raw);

  if (deduped.length === 0) return [];

  const { data, error } = await client
    .from("seeding_comment_suggestions")
    .insert(
      deduped.map((s) => ({
        campaign_id: campaignId,
        category: s.category,
        content: s.content,
        generation_batch: nextBatch,
      }))
    )
    .select();
  if (error) throw error;

  return data as SeedingCommentSuggestion[];
}
