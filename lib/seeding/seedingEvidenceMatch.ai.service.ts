import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

/** Phase 2F — AI semantic-match fallback for evidence reconciliation.
 * Reuses the exact plumbing already established in
 * seedingComment.ai.service.ts (lazy singleton, ANTHROPIC_MODEL env,
 * messages.parse + zodOutputFormat, injectable requestFn for tests) — new
 * prompt/schema only, no new infrastructure.
 *
 * Hard boundary (PO-locked, architecture review): this call is NEVER asked
 * "who wrote this comment" — only "which candidate, if any, best matches
 * this assigned text based on textual evidence." No Facebook token, no
 * from.id, no staff/customer identifiers, and no real Facebook comment ids
 * are ever sent — candidates are referenced by a synthetic 0-based index
 * only, mapped back to the real comment server-side after the response. */

export const EVIDENCE_PROMPT_VERSION = "2026-08-26.v1";

/** Exported so the reconciliation service can record the exact model
 * version a result was produced with (idempotency/audit, §7) without
 * duplicating this env-fallback logic. */
export function getEvidenceModelVersion(): string {
  return process.env.ANTHROPIC_MODEL || "claude-opus-5";
}

let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

const MatchResultSchema = z.object({
  bestMatchIndex: z.number().int().min(0).nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string().max(300),
});

export type AiEvidenceMatchResult = z.infer<typeof MatchResultSchema>;

export interface AiEvidenceMatchInput {
  assignedCommentText: string;
  /** Plain candidate message text only — already bounded to
   * AI_CANDIDATE_LIMIT by the caller (seedingEvidenceMatch.deterministic.ts
   * rankAiCandidates), indexed positionally. */
  candidates: string[];
}

/** Exported so the reconciliation service can inject a fake in tests (same
 * injectable-collaborator convention as requestSuggestionsFromClaude in
 * seedingComment.ai.service.ts) rather than mocking the @anthropic-ai/sdk
 * module. */
export async function requestEvidenceMatchFromClaude(input: AiEvidenceMatchInput): Promise<AiEvidenceMatchResult> {
  const candidateBlock = input.candidates.map((c, i) => `[${i}] ${c}`).join("\n");

  const response = await getAnthropicClient().messages.parse({
    model: getEvidenceModelVersion(),
    max_tokens: 512,
    system:
      "Bạn CHỈ so sánh nội dung văn bản giữa một đoạn text được giao và danh sách các candidate comment thực tế. " +
      "Nhiệm vụ DUY NHẤT: xác định candidate nào (nếu có) trùng khớp về ý nghĩa/nội dung với đoạn text được giao. " +
      "TUYỆT ĐỐI KHÔNG được suy luận, đoán, hoặc kết luận ai đã viết comment này — bạn không có và không được sử " +
      "dụng bất kỳ thông tin danh tính nào. Chỉ trả lời dựa trên bằng chứng văn bản (text evidence) duy nhất.",
    messages: [
      {
        role: "user",
        content:
          `Đoạn text được giao (assigned comment_text):\n"${input.assignedCommentText}"\n\n` +
          `Danh sách candidate comment thực tế trên bài viết (đánh số từ 0):\n${candidateBlock || "(không có candidate nào)"}\n\n` +
          "Candidate nào (nếu có) khớp nội dung với đoạn text được giao? Nếu không có candidate nào khớp, trả bestMatchIndex = null.",
      },
    ],
    output_config: { format: zodOutputFormat(MatchResultSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Claude API did not return a parseable evidence match result");
  }
  return response.parsed_output;
}
