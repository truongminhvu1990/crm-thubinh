import { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { supabase } from "@/lib/supabase";
import { SeedingCommentSuggestion, SeedingCommentCategory, SeedingCommentIntent } from "@/types/seeding";
import { Product } from "@/types/product";
import { SEEDING_COMMENT_CATEGORIES } from "./seeding.constants";
import { getCampaignById } from "./seedingCampaign.service";
import { loadTargetContext } from "./seedingDistribution.service";
import { getProductById } from "@/lib/product.service";

/** AI Comment Suggestion (module scope §2): a single structured-output
 * Claude API call per Generate/Regenerate click — not an agent, no tool
 * use. Input is the campaign's post content + product + objective; output
 * is a fixed-shape list of comment variants across the 4 required
 * categories. Never posts anything — this only ever returns text for a
 * human to review/edit/copy. */

const VARIANTS_PER_CATEGORY = 2;

/** Phase 2K-BC — total variant count is unchanged from before this phase
 * (2 × 4 categories = 8); only HOW that count is framed to the model
 * changes (no longer "exactly 2 per category, all 4 required" — see
 * buildIntentInstruction). Computed, not re-hardcoded, so it can never
 * silently drift from SEEDING_COMMENT_CATEGORIES.length. */
const TOTAL_VARIANTS = VARIANTS_PER_CATEGORY * SEEDING_COMMENT_CATEGORIES.length;

/** Phase 2K-BE — 1 initial attempt + 2 retries. Small and bounded
 * deliberately (smallest-robust-implementation principle): this path is
 * only reached when an ENTIRE attempt's output failed the deterministic
 * quality gate, an exceptional case the prompt hardening should already
 * make rare — not a general resilience/rate-limit retry mechanism. */
const MAX_GENERATION_ATTEMPTS = 3;

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
  /** Phase 2K-AU — the real, structured Product record linked via
   * campaign.product_id (reuses lib/product.service.ts's getProductById,
   * no new read path). Optional so every pre-existing caller/test that
   * never set this keeps its exact current behavior (treated identically
   * to null — "no real Product data available"). This is the primary
   * source of truth for product facts; productDescription remains only
   * optional supplementary manager context (see buildSystemPrompt's
   * explicit source-priority instruction). */
  product?: Product | null;
  /** Phase 2K-AW — request-time only, never persisted. Steers the ANGLE
   * of this one generation batch (see buildSystemPrompt); undefined
   * behaves exactly like "ALL" — the pre-2K-AW mixed-intent default. */
  intent?: SeedingCommentIntent;
  /** Phase 2K-BG — Source Context. Where the target post actually lives
   * (Page/Personal/Group), already resolved by loadTargetContext() and
   * previously discarded (2K-BB audit finding). Style/tone-only — never
   * a source of product/price facts, never overrides Intent, Product
   * grounding, or the Fixed Price rule (see buildSourceContextInstruction).
   * Undefined when no target is selected (campaign-level snapshot path,
   * where no target row — and so no real source_type — exists) or when
   * a legacy caller doesn't set it; both are the exact same safe
   * fallback as before this phase (generic Facebook-native tone only). */
  sourceType?: "Page" | "Personal" | "Group";
}

export type SuggestionDraft = z.infer<typeof SuggestionSchema>;

/** Phase 2K-AN — extracted as pure functions (no SDK involved) so the
 * exact final prompt text can be unit-tested deterministically. Mocking
 * @anthropic-ai/sdk itself via node:test's mock.module was tried and
 * found unreliable through this project's tsx-based TS loader (the SDK's
 * real client is still constructed despite the mock, a tooling
 * limitation confirmed by direct reproduction) — this sidesteps that
 * entirely rather than fighting it. */

/** Phase 2K-BC — Category & Comment Intent reconciliation.
 *
 * ROOT CONFLICT (2K-BB audit finding): the original category schema
 * unconditionally required "đúng 2 biến thể cho mỗi trong 4 loại" (exactly
 * 2 variants in EACH of the 4 fixed categories, all 4 required) at the top
 * of the prompt, while 2K-AW's buildIntentInstruction separately told the
 * model "TẤT CẢ biến thể phải xoay quanh {narrow angle}" for any specific
 * intent — two unconditional, structurally incompatible instructions in
 * the same prompt (e.g. PRICE_INQUIRY demanded all 8 variants be about
 * price WHILE the category rule demanded 2 of them be tagged 'kien_thuc'
 * — share unrelated knowledge — a direct contradiction with no stated
 * resolution).
 *
 * NEW MODEL (Product Owner decision): Comment Intent is now the PRIMARY,
 * dominant generation control. The 4 existing category values
 * (hoi_thong_tin/tao_thao_luan/kien_thuc/phan_hoi_tu_nhien) are NOT a
 * second independent taxonomy — SEEDING_COMMENT_INTENT_CATEGORY_MAP below
 * is the one authoritative, explicit relationship: each specific intent
 * has a natural-fit category (used as a hint, not a code-level override —
 * see generateCommentSuggestions, which still persists exactly whatever
 * category Claude tags each suggestion with, unchanged). The category enum
 * itself, the DB column, and SuggestionSchema are all untouched — no new
 * taxonomy, no migration, every historical row reads exactly as before. */
export const SEEDING_COMMENT_INTENT_CATEGORY_MAP: Record<Exclude<SeedingCommentIntent, "ALL">, SeedingCommentCategory> = {
  PRICE_INQUIRY: "hoi_thong_tin",
  SIZE_INQUIRY: "hoi_thong_tin",
  PRODUCT_INTEREST: "phan_hoi_tu_nhien",
  SOCIAL_PROOF: "tao_thao_luan",
};

/** The 4 category definitions, previously stated once, unconditionally,
 * at the very top of the prompt bundled with a rigid count requirement.
 * Now stated once here instead — still every generated variant must be
 * tagged with one of these 4 (SuggestionSchema still requires it,
 * unchanged), but WHICH one, and whether all 4 need to appear at all, is
 * now intent-dependent (see buildIntentInstruction). */
const CATEGORY_DEFINITIONS =
  "4 loại (category) hiện có, mỗi biến thể PHẢI được gắn đúng một loại trong số này (chọn loại phù hợp nhất với nội dung thực tế của biến thể đó): " +
  "hoi_thong_tin (hỏi thông tin sản phẩm/giá/còn hàng...), tao_thao_luan (khơi gợi thảo luận, ý kiến), " +
  "kien_thuc (chia sẻ kiến thức liên quan tự nhiên), phan_hoi_tu_nhien (phản hồi như một khách hàng bình thường).";

/** Phase 2K-AW / 2K-BC — per-intent instruction, appended after the base
 * prompt (never replacing it). Each specific-intent branch deliberately
 * re-states its own anti-fabrication reminder inline — the base prompt's
 * rule already covers it, but the whole point of Comment Intent is to
 * bias generation toward exactly the fact category (price/size/
 * experience) the base rule protects, so reinforcing it at the point of
 * highest risk is a strengthening, never a loophole. Unknown/unrecognized
 * values fall through to the same text as "ALL" — the same safe default
 * an undefined/omitted intent gets.
 *
 * Every specific-intent branch now explicitly states the intent is the
 * DOMINANT purpose, names its natural-fit category as a hint (not a
 * requirement), and explicitly says all 4 categories are NOT required in
 * one batch — removing the old unconditional "all 4 required" conflict
 * this phase was created to fix. ALL is the one case where category
 * diversity is still encouraged, but as a soft preference, not a rigid
 * per-category count (Product Owner decision — "avoid mechanical equal
 * distribution"). */
function buildIntentInstruction(intent: SeedingCommentIntent): string {
  switch (intent) {
    case "PRICE_INQUIRY":
      return (
        CATEGORY_DEFINITIONS + " " +
        `Mục đích bình luận cho lượt tạo này (mục đích CHÍNH, chi phối toàn bộ ${TOTAL_VARIANTS} biến thể, ưu tiên CAO HƠN việc trải đều category): TẤT CẢ biến thể phải xoay quanh việc hỏi về giá/giá trị/chi phí một cách tự nhiên — CHỈ được hỏi GIÁ HIỆN TẠI/giá bán (VD: 'giá bao nhiêu vậy shop', 'cho mình xin giá mẫu này với'). ` +
        `Loại phù hợp nhất cho các biến thể này thường là '${SEEDING_COMMENT_INTENT_CATEGORY_MAP.PRICE_INQUIRY}', nhưng nếu một biến thể tự nhiên hợp với loại khác trong 4 loại ở trên thì vẫn được dùng loại đó — KHÔNG bắt buộc phải có đủ cả 4 loại trong lượt tạo này. ` +
        "TUYỆT ĐỐI KHÔNG được hỏi/xin bớt giá, giảm giá, hay thương lượng giá dưới bất kỳ hình thức nào (xem QUY TẮC KINH DOANH BẮT BUỘC — GIÁ CỐ ĐỊNH ở cuối); PRICE_INQUIRY chỉ có nghĩa là hỏi giá, không phải xin giá tốt hơn. " +
        "KHÔNG được tự nêu ra một mức giá cụ thể nếu giá đó không có trong 'Dữ liệu sản phẩm THẬT' — nếu không có giá thật, hãy HỎI giá hiện tại thay vì tự bịa ra một con số, và không được ngụ ý rằng giá nên thấp hơn."
      );
    case "SIZE_INQUIRY":
      return (
        CATEGORY_DEFINITIONS + " " +
        `Mục đích bình luận cho lượt tạo này (mục đích CHÍNH, chi phối toàn bộ ${TOTAL_VARIANTS} biến thể, ưu tiên CAO HƠN việc trải đều category): TẤT CẢ biến thể phải xoay quanh việc hỏi về size/kích thước/độ vừa vặn một cách tự nhiên. ` +
        `Loại phù hợp nhất cho các biến thể này thường là '${SEEDING_COMMENT_INTENT_CATEGORY_MAP.SIZE_INQUIRY}', nhưng nếu một biến thể tự nhiên hợp với loại khác trong 4 loại ở trên thì vẫn được dùng loại đó — KHÔNG bắt buộc phải có đủ cả 4 loại trong lượt tạo này. ` +
        "KHÔNG được tự nêu ra một size cụ thể nếu size đó không có trong 'Dữ liệu sản phẩm THẬT' — nếu không có size thật, hãy HỎI size thay vì tự bịa ra một con số."
      );
    case "PRODUCT_INTEREST":
      return (
        CATEGORY_DEFINITIONS + " " +
        `Mục đích bình luận cho lượt tạo này (mục đích CHÍNH, chi phối toàn bộ ${TOTAL_VARIANTS} biến thể, ưu tiên CAO HƠN việc trải đều category): TẤT CẢ biến thể phải xoay quanh việc thể hiện sự quan tâm hoặc hỏi tự nhiên về sản phẩm nói chung ` +
        "(không nhất thiết chỉ về giá/size) — vẫn tuân thủ tuyệt đối quy tắc không tự bịa chi tiết cụ thể ở trên. " +
        `Loại phù hợp nhất cho các biến thể này thường là '${SEEDING_COMMENT_INTENT_CATEGORY_MAP.PRODUCT_INTEREST}', nhưng nếu một biến thể tự nhiên hợp với loại khác trong 4 loại ở trên thì vẫn được dùng loại đó — KHÔNG bắt buộc phải có đủ cả 4 loại trong lượt tạo này.`
      );
    case "SOCIAL_PROOF":
      return (
        CATEGORY_DEFINITIONS + " " +
        `Mục đích bình luận cho lượt tạo này (mục đích CHÍNH, chi phối toàn bộ ${TOTAL_VARIANTS} biến thể, ưu tiên CAO HƠN việc trải đều category): TẤT CẢ biến thể phải tạo cảm giác social proof/tò mò/khơi gợi tương tác tự nhiên. ` +
        "KHÔNG được tự nhận là đã sở hữu, đã mua, hoặc có trải nghiệm thực tế với sản phẩm như một sự thật có thật — đó là thông tin bịa đặt về chính người viết comment, tuyệt đối không được làm. " +
        `Loại phù hợp nhất cho các biến thể này thường là '${SEEDING_COMMENT_INTENT_CATEGORY_MAP.SOCIAL_PROOF}', nhưng nếu một biến thể tự nhiên hợp với loại khác trong 4 loại ở trên thì vẫn được dùng loại đó — KHÔNG bắt buộc phải có đủ cả 4 loại trong lượt tạo này.`
      );
    case "ALL":
    default:
      return (
        CATEGORY_DEFINITIONS + " " +
        "Mục đích bình luận cho lượt tạo này: đa dạng — tạo một tập hợp bình luận với nhiều góc độ tự nhiên khác nhau " +
        "(hỏi giá, hỏi size, quan tâm sản phẩm, tạo tương tác...), không thiên lệch về một loại duy nhất. " +
        `Khi hợp lý, hãy trải các biến thể qua nhiều loại khác nhau trong 4 loại ở trên để giữ sự đa dạng tự nhiên — nhưng KHÔNG bắt buộc phải chia đều chính xác ${VARIANTS_PER_CATEGORY} biến thể cho mỗi loại nếu điều đó khiến comment trở nên gượng ép; ưu tiên sự tự nhiên hơn một công thức phân bổ cơ học.`
      );
  }
}

/** Phase 2K-AY — naturalness/style hardening. A pure addition to the
 * system prompt, not a replacement for anything above it: every existing
 * rule (source-priority hierarchy, anti-fabrication, category
 * requirements) stays exactly as it was. Placed AFTER those rules and
 * BEFORE buildIntentInstruction() so the selected intent still has the
 * most prominent (last, most recent) position in the prompt — these are
 * style/quality guidance, never a license to override grounding or
 * intent, and the final paragraph says so explicitly rather than relying
 * only on ordering. Deliberately expresses each rule as a general
 * principle (e.g. "avoid AI-sounding phrasing") rather than a literal
 * blacklist of exact banned phrases — a hardcoded phrase list would be
 * trivially worked around and wouldn't generalize. */
const NATURALNESS_GUIDANCE =
  "Về độ dài: ưu tiên comment ngắn, tự nhiên như cách một người thật gõ trên Facebook — phần lớn nên chỉ khoảng 1-2 câu ngắn, tránh giải thích dài dòng không cần thiết; " +
  "độ dài nên khác nhau tự nhiên giữa các biến thể, không phải comment nào cũng dài bằng nhau. " +
  "Về emoji: emoji là TÙY CHỌN, không bắt buộc — một số biến thể nên hoàn toàn không có emoji nào; tuyệt đối không nhét emoji vào mọi comment hay lặp lại cùng một chuỗi/kiểu emoji giữa các biến thể. " +
  "Tránh lối viết nghe như do AI tạo ra: tránh văn phong quảng cáo trau chuốt/hoàn hảo quá mức, tránh lặp lại cùng một kiểu cấu trúc câu giữa các biến thể, tránh những mẫu câu sáo rỗng kiểu 'sản phẩm rất đẹp/quá đẹp...', " +
  "tránh câu tóm tắt không cần thiết, tránh mở đầu theo công thức máy móc, tránh lời kêu gọi hành động rập khuôn — đây là nguyên tắc chung về chất lượng viết, không phải một danh sách từ cấm cụ thể, hãy áp dụng tinh thần này một cách linh hoạt. " +
  "Về sự đa dạng thật sự trong cùng một lượt tạo: các biến thể phải khác nhau về cấu trúc câu, độ dài, cách dùng từ, mức độ hào hứng, hỏi trực tiếp hay chỉ nhận xét thoải mái, có/không emoji, giọng ngắn gọn hay hơi tám chuyện — như thể do nhiều người khác nhau viết ra, " +
  "TUYỆT ĐỐI không chỉ đổi một tính từ trong cùng một khung câu, không dùng chung một câu mở đầu hay một khung câu lặp lại giữa các biến thể, không viết gần giống nhau rồi coi là khác biệt. Không cần và không nên gán mỗi biến thể một 'nhân vật'/persona cứng nhắc hay một khuôn mẫu cố định — sự đa dạng phải đến từ cách viết tự nhiên. " +
  "Giọng văn phải đọc đúng như một comment Facebook thật của khách hàng — KHÔNG được đọc như mô tả sản phẩm, kịch bản chăm sóc khách hàng, nội dung quảng cáo, bài tóm tắt, hay câu trả lời của chatbot. " +
  "Những nguyên tắc tự nhiên ở trên KHÔNG được làm suy yếu mục đích comment đã chọn bên dưới, và tuyệt đối KHÔNG được dùng làm lý do để tự bịa thêm bất kỳ chi tiết cụ thể nào ngoài dữ liệu được cung cấp — nếu thông tin thật không đủ để viết cụ thể, hãy viết một câu hỏi/nhận xét tự nhiên chung chung, không bịa ra chi tiết chỉ để nghe chân thực hơn.";

/** Phase 2K-BA — Fixed Price / No Negotiation. A LOCKED Product Owner
 * business rule, not a style preference: CRM Vòng Cẩm Thạch sells at
 * fixed prices. Deliberately its own standalone paragraph (not folded
 * into the anti-fabrication rule above) so its "applies to every intent,
 * cannot be weakened" statement is unambiguous on its own — and
 * deliberately appended AFTER buildIntentInstruction(), making it the
 * true final segment of the prompt (the most prominent/recent position,
 * even ahead of the selected intent's own instruction), while its own
 * text ALSO explicitly asserts priority over intent/naturalness/
 * grounding sources — a two-layer guarantee (position + explicit
 * statement), not position alone. Asking for the actual/current price
 * remains explicitly permitted; only bargaining/negotiation/discount
 * requests and invented promotions are forbidden. */
const FIXED_PRICE_RULE =
  "QUY TẮC KINH DOANH BẮT BUỘC — GIÁ CỐ ĐỊNH, KHÔNG THƯƠNG LƯỢNG: CRM Vòng Cẩm Thạch bán theo giá cố định (fixed price), không thương lượng, không mặc cả, không giảm giá theo yêu cầu khách hàng. " +
  "ĐƯỢC PHÉP: hỏi giá hiện tại/giá bán của sản phẩm một cách tự nhiên (VD: 'giá bao nhiêu vậy shop', 'cho mình xin giá mẫu này với ạ'). " +
  "TUYỆT ĐỐI KHÔNG được viết bất kỳ biến thể nào hỏi/xin/gợi ý bớt giá, giảm giá, mặc cả, thương lượng giá, 'giá tốt hơn', 'giá mềm hơn', 'chốt giá mềm hơn', hay ngụ ý rằng khách hàng mong/được giảm giá — dù hỏi thẳng hay hỏi khéo, dù trực tiếp hay gián tiếp. " +
  "TUYỆT ĐỐI KHÔNG được tự bịa ra bất kỳ chương trình khuyến mãi, ưu đãi, giảm giá, hay 'sale' nào; chỉ được nhắc đến khuyến mãi/ưu đãi nếu nó thực sự xuất hiện rõ ràng trong 'Dữ liệu sản phẩm THẬT' hoặc 'Nội dung bài post' được cung cấp bên dưới — nếu không có, KHÔNG được hỏi kiểu 'có ưu đãi gì không' hay ngụ ý đang có khuyến mãi. " +
  "QUY TẮC NÀY BẮT BUỘC ÁP DỤNG CHO MỌI mục đích comment (ALL, PRICE_INQUIRY, SIZE_INQUIRY, PRODUCT_INTEREST, SOCIAL_PROOF), KHÔNG có ngoại lệ, và KHÔNG được làm suy yếu bởi hướng dẫn về sự tự nhiên (naturalness), bởi 'Dữ liệu sản phẩm THẬT', bởi 'Nội dung bài post', hay bởi 'Ghi chú bổ sung từ nhân viên' — kể cả khi mục đích PRICE_INQUIRY được chọn, mục đích đó CHỈ cho phép hỏi giá hiện tại, KHÔNG cho phép hỏi giảm/thương lượng giá dưới bất kỳ hình thức nào.";

/** Phase 2K-BG — Source Context. Style/tone-only guidance for WHERE the
 * target post lives (Page/Personal/Group), audited to be genuinely
 * stable, DB-backed data — not runtime-guessed — before being wired in
 * (see loadTargetContext/DistributionTargetContext.source_type in
 * seedingDistribution.service.ts; a real, validated column on
 * facebook_manual_content_references, or a fixed "Page" literal for a
 * Page-post-backed target). Deliberately excludes permalink_url: audited
 * separately (facebookUrlParser.ts) and found to carry zero semantic
 * value beyond a stable numeric object/group id used for dedup — a raw
 * navigation URL has nothing a comment's tone or content could
 * legitimately use, so it stays out of the prompt entirely, per this
 * phase's own instruction not to inject context "just to have more of
 * it". Each block explicitly disclaims override authority over every
 * factual/business rule — belt-and-suspenders alongside this block's
 * prompt position (before Intent/Fixed-Price, both of which still
 * appear later and so still win any conflict, unchanged from before this
 * phase). Returns "" (no-op) for an unknown/missing source type — the
 * exact same generic Facebook-native tone as before this phase, never a
 * guessed or invented source. */
function buildSourceContextInstruction(sourceType: "Page" | "Personal" | "Group" | undefined): string {
  if (!sourceType) return "";

  const toneBySource: Record<"Page" | "Personal" | "Group", string> = {
    Group:
      "Bối cảnh nguồn đăng: bài viết này nằm trong một GROUP Facebook — hãy viết giọng trao đổi cộng đồng, tự nhiên như một thành viên trong group đang phản hồi bài viết, không phải giọng người bán hay CSKH.",
    Page: "Bối cảnh nguồn đăng: bài viết này đăng trên một PAGE Facebook — hãy viết giọng của một người xem/follower tự nhiên đang phản hồi, KHÔNG được biến thành ngôn ngữ quảng cáo (ad copy).",
    Personal:
      "Bối cảnh nguồn đăng: bài viết này đăng trên một tài khoản CÁ NHÂN Facebook — hãy viết giọng hội thoại cá nhân, thân mật tự nhiên, tránh giọng chăm sóc khách hàng hoặc marketing.",
  };

  return (
    toneBySource[sourceType] +
    " Đây CHỈ là gợi ý về giọng điệu/phong cách, KHÔNG phải một nguồn thông tin thực tế mới — TUYỆT ĐỐI không được dùng để bịa thông tin về chủ bài viết, không được giả vờ biết người đăng bài, " +
    "và không được ghi đè lên mục đích comment đã chọn (Comment Intent), 'Dữ liệu sản phẩm THẬT', 'Nội dung bài post', hay quy tắc giá cố định/không thương lượng bên dưới. "
  );
}

/** Phase 2K-BI — Campaign Objective business-direction guidance.
 * objective was ALREADY reaching the model before this phase (relayed
 * verbatim as "Mục tiêu: {objective}" in buildUserMessage, unchanged) —
 * the actual gap (2K-BI audit) was that the SYSTEM prompt attached zero
 * behavioral guidance to that label, unlike every other dimension
 * (Intent/Product/Source Context all have one). `objective` is free text
 * at the DB layer (no CHECK constraint — seedingCampaign.service.ts
 * writes it unvalidated); only these 3 values are UI-offered
 * (SEEDING_CAMPAIGN_OBJECTIVE_OPTIONS), so this is a closed lookup, not
 * an exhaustive enum switch — anything else (missing, empty, or a custom
 * string a manager somehow set) safely falls through to "" (no
 * additional guidance), the exact same behavior as before this phase,
 * never inventing a guess at what an unrecognized objective might mean.
 * Same disclaimer pattern as Source Context: style/approach-only, never
 * a factual source, never license to fabricate social proof or force a
 * CTA. */
const CAMPAIGN_OBJECTIVE_GUIDANCE: Record<string, string> = {
  "Tăng tương tác":
    "Định hướng mục tiêu Campaign: 'Tăng tương tác' — trong phạm vi mục đích comment đã chọn ở trên, ưu tiên cách diễn đạt tự nhiên dễ khiến người khác muốn react/trả lời (cảm nhận thật, quan sát cụ thể, hoặc một câu hỏi mở nhẹ nhàng) — không bắt buộc câu hỏi trong mọi biến thể, không biến thành lời kêu gọi hành động.",
  "Tạo thảo luận":
    "Định hướng mục tiêu Campaign: 'Tạo thảo luận' — trong phạm vi mục đích comment đã chọn ở trên, ưu tiên cách diễn đạt tự nhiên mời gọi ý kiến/quan điểm (nêu một góc nhìn nhẹ nhàng, hỏi ý kiến người khác) — KHÔNG bịa ra một cuộc tranh luận hay ý kiến trái chiều giả tạo.",
  "Kéo inbox":
    "Định hướng mục tiêu Campaign: 'Kéo inbox' — trong phạm vi mục đích comment đã chọn ở trên, một vài biến thể (không phải tất cả) có thể tự nhiên gợi ý muốn hỏi thêm riêng tư (VD: 'cho mình hỏi thêm chi tiết với ạ') — TUYỆT ĐỐI KHÔNG viết thành lời kêu gọi hành động kiểu quảng cáo (VD 'inbox ngay để được tư vấn'), không ép mọi biến thể phải nhắc đến inbox.",
};

function buildObjectiveInstruction(objective: string | undefined): string {
  const guidance = objective ? CAMPAIGN_OBJECTIVE_GUIDANCE[objective] : undefined;
  if (!guidance) return "";
  return (
    guidance +
    " Đây CHỈ là định hướng góc tiếp cận — KHÔNG được dùng để bịa social proof hay bất kỳ chi tiết cụ thể nào, và KHÔNG được ghi đè lên mục đích comment đã chọn (Comment Intent), 'Nội dung bài post', 'Dữ liệu sản phẩm THẬT', hay quy tắc giá cố định/không thương lượng bên dưới. "
  );
}

/** Phase 2K-BC — explicit 5-tier priority order (Product Owner Section 7),
 * each tier now occupying exactly one place in this function, in order:
 * (0) neutral role/task framing (no category-count instruction baked in
 * here anymore — that moved into buildIntentInstruction, tier 4, so it
 * can be intent-aware instead of unconditional);
 * (1) grounding / source-of-truth hierarchy;
 * (2) anti-fabrication;
 * (3) naturalness (2K-AY);
 * (4) selected Comment Intent + category behavior, merged into one block
 *     (2K-AW + 2K-BC — buildIntentInstruction now owns both);
 * (5) fixed-price / no-negotiation (2K-BA) — stays last/most prominent,
 *     unchanged position and text.
 * Phase 2K-BG adds tier 3b — Source Context (Page/Personal/Group tone) —
 * between naturalness and intent: subordinate to grounding/anti-
 * fabrication (which appear earlier) and to intent/fixed-price (which
 * still appear later, i.e. still win on any conflict, unchanged from
 * before this phase). */
export function buildSystemPrompt(
  intent: SeedingCommentIntent = "ALL",
  sourceType?: "Page" | "Personal" | "Group",
  objective?: string
): string {
  return (
    // 0. Role/task framing.
    "Bạn là trợ lý hỗ trợ nhân viên chăm sóc khách hàng trên Facebook. " +
    "Nhiệm vụ: soạn các comment mẫu (KHÔNG phải để đăng tự động — nhân viên sẽ tự chọn, chỉnh sửa và đăng thủ công) " +
    `để seeding một bài viết Facebook — tạo tổng cộng ${TOTAL_VARIANTS} biến thể cho lượt tạo này. ` +
    "Giọng văn tự nhiên, ngắn gọn, đa dạng câu chữ giữa các biến thể, không seo từ khóa lộ liễu, không trùng lặp nội dung. " +
    // 1. Grounding / source-of-truth hierarchy.
    "Thứ tự ưu tiên nguồn thông tin: (1) 'Dữ liệu sản phẩm THẬT' — nguồn xác thực và có độ ưu tiên CAO NHẤT cho mọi chi tiết cụ thể về sản phẩm; " +
    "(2) 'Nội dung bài post' — xác thực cho những gì thực sự xuất hiện trong bài viết; " +
    "(3) 'Ghi chú bổ sung từ nhân viên' — chỉ là tham khảo bổ sung, KHÔNG BAO GIỜ được ưu tiên hơn 'Dữ liệu sản phẩm THẬT' nếu hai nguồn mâu thuẫn nhau (ví dụ giá hoặc size khác nhau). " +
    // 2. Anti-fabrication.
    "TUYỆT ĐỐI KHÔNG tự bịa ra các chi tiết cụ thể (giá tiền, kích thước/size, số lượng, chất liệu, mã sản phẩm, mức giảm giá...) " +
    "nếu những chi tiết đó không xuất hiện rõ ràng trong 'Nội dung bài post', 'Dữ liệu sản phẩm THẬT', hoặc 'Ghi chú bổ sung từ nhân viên' được cung cấp bên dưới. " +
    "Không bắt buộc phải nhắc đến thông tin sản phẩm trong mọi comment — chỉ dùng khi tự nhiên phù hợp với loại comment đang viết, không nhồi nhét hết mọi chi tiết vào một comment. " +
    "Nếu thông tin không đủ chi tiết để viết một comment cụ thể, hãy viết comment tự nhiên, chung chung, không nêu số liệu cụ thể nào. " +
    // 3. Naturalness.
    NATURALNESS_GUIDANCE + " " +
    // 3b. Source Context (Page/Personal/Group tone) — style only, empty string when unknown.
    buildSourceContextInstruction(sourceType) +
    // 3c. Campaign Objective (business-direction guidance) — style/approach only, empty
    // string when missing/unrecognized. Positioned before Intent so Intent still appears
    // later and so still wins any conflict (same convention as Source Context above).
    buildObjectiveInstruction(objective) +
    // 4. Selected Comment Intent + category behavior (merged, single source of truth).
    buildIntentInstruction(intent) + " " +
    // 5. Fixed-price / no-negotiation — final, most prominent position.
    FIXED_PRICE_RULE
  );
}

/** Phase 2K-AU — formats the real Product record as a labeled, structured
 * block. Only actually-populated fields are listed (never a padded
 * "(không có)" line per missing field, which would just be noise) — a
 * product linked but genuinely lacking detail still returns an honest
 * "no detail" line rather than fabricating structure. Reuses the exact
 * existing Product fields (types/product.ts) — no field is invented.
 * Deliberately excludes internal-only fields (cost_price, supplier,
 * location, certificate_no, salesperson, batch_id) — those are never
 * customer-facing and have no place in a Facebook comment. */
export function buildProductContextBlock(product: Product | null | undefined): string {
  if (!product) return "(không có dữ liệu sản phẩm thật cho campaign này)";

  const lines: string[] = [];
  if (product.product_code) lines.push(`Mã sản phẩm: ${product.product_code}`);
  if (product.product_name) lines.push(`Tên sản phẩm: ${product.product_name}`);
  if (product.category) lines.push(`Loại: ${product.category}`);
  if (product.jade_type) lines.push(`Loại ngọc: ${product.jade_type}`);
  if (product.color) lines.push(`Màu: ${product.color}`);
  if (product.size !== undefined && product.size !== null) lines.push(`Kích thước: ${product.size}`);
  if (product.wrist_size) lines.push(`Ni tay: ${product.wrist_size}`);
  if (product.ring_size) lines.push(`Ni nhẫn: ${product.ring_size}`);
  if (product.jade_grade) lines.push(`Chất lượng: ${product.jade_grade}`);
  if (product.sale_price !== undefined && product.sale_price !== null) lines.push(`Giá bán: ${product.sale_price.toLocaleString("vi-VN")}đ`);

  return lines.length > 0 ? lines.join("\n") : "(sản phẩm đã liên kết nhưng chưa có dữ liệu chi tiết)";
}

/** Phase 2K-BE — Comment Output Quality Gate.
 *
 * A deterministic, code-level BACKSTOP behind the already-hardened prompt
 * (2K-AY naturalness, 2K-BA fixed-price, 2K-BC intent/category) — not a
 * replacement for it. Deliberately scoped to checks that are structurally
 * airtight (can never false-positive on a legitimate, correctly-grounded
 * comment), per the Product Owner's own instruction: "deterministic
 * business violations may be checked structurally in code where
 * reliable; subjective naturalness should remain AI/prompt-evaluated."
 *
 * Explicitly OUT of scope for this deterministic layer (left to the
 * prompt, as instructed):
 * - "sounds like ad copy / a CS script / a chatbot" — inherently
 *   subjective, no reliable structural signal, would require exactly the
 *   brittle keyword blacklist the Product Owner told this phase not to
 *   build;
 * - per-intent semantic alignment ("does this comment really ask about
 *   price, vs. just mention the product") — same reason; the 2K-AW/BC
 *   prompt hardening is the enforcement mechanism, this phase only adds
 *   regression tests proving it still holds (see test file);
 * - fabricated quantity/material claims — no single canonical grounded
 *   value exists to structurally compare against (unlike price/size/
 *   product code, each of which has exactly one authoritative source),
 *   so a keyword-based detector here would be exactly as brittle as the
 *   ad-copy case above. */

/** Unconditionally forbidden (Product Owner's own VALID/INVALID examples,
 * 2K-BA) — bargaining/negotiation is never acceptable regardless of
 * whether a real discount exists, so this list is NOT grounding-gated. */
const BARGAINING_PHRASES = [
  "bớt giá",
  "bớt được không",
  "bớt xíu",
  "bớt chút",
  "mặc cả",
  "thương lượng",
  "giá tốt hơn",
  "giá mềm hơn",
  "giá mềm",
  "giá rẻ hơn",
  "hạ giá",
  "giảm giá",
];

/** Forbidden ONLY when no real promotion is grounded (Product Owner's own
 * "Có ưu đãi gì không?" example — invalid unless an actual promotion is
 * present in the source data). `product.discount` is the one existing,
 * authoritative field for this — reused as-is, no new field. */
const PROMOTION_PHRASES = ["ưu đãi", "khuyến mãi", "sale"];

/** Phase 2K-BE — deterministic fixed-price/no-negotiation backstop.
 * Returns a short, human-readable reason string on violation, or null.
 * Exported for direct unit testing (same convention as every other pure
 * prompt/validation function in this module). */
export function detectFixedPriceViolation(content: string, product: Product | null | undefined): string | null {
  const normalized = content.toLowerCase();
  for (const phrase of BARGAINING_PHRASES) {
    if (normalized.includes(phrase)) return `bargaining/negotiation phrase detected: "${phrase}"`;
  }
  const hasGroundedPromotion = typeof product?.discount === "number" && product.discount > 0;
  if (!hasGroundedPromotion) {
    for (const phrase of PROMOTION_PHRASES) {
      if (normalized.includes(phrase)) return `ungrounded promotion/discount phrase detected: "${phrase}" (no real product.discount present)`;
    }
  }
  return null;
}

const PRICE_PATTERN = /\d[\d.,]*\s*(đ|vnđ|vnd|k|nghìn|triệu)\b/i;
const SIZE_PATTERN = /\b(size|cỡ|kích\s*thước)\s*[:\s]*\d+/i;
/** A plausible product-code shape (letters + digits, optionally hyphenated,
 * e.g. "VCT-001") — deliberately narrow so it only ever matches things
 * that actually look like a product code, not any random alphanumeric
 * word. */
const PRODUCT_CODE_PATTERN = /\b[A-Z]{2,}-?\d{2,}\b/;

/** Phase 2K-BE — deterministic anti-fabrication backstop for the 3 fact
 * types that have exactly one authoritative grounded value to compare
 * against (price, size, product code). Deliberately conservative: a
 * price/size mention is flagged ONLY when NO real value exists at all
 * (so any specific number is provably invented, zero false-positive
 * risk) — this function never tries to fuzzy-match "is this restated
 * price/size correct", since that would require numeric-format parsing
 * fragile enough to reject legitimate output. A product code is flagged
 * when it's present AND does not match the real one exactly. Quantity
 * and material are deliberately NOT checked here — see the module
 * doc-comment above for why. */
export function detectUnsupportedFactFabrication(content: string, product: Product | null | undefined): string | null {
  if (PRICE_PATTERN.test(content) && !(typeof product?.sale_price === "number")) {
    return "specific price mentioned but no real product price is grounded";
  }
  if (SIZE_PATTERN.test(content) && !(typeof product?.size === "number")) {
    return "specific size mentioned but no real product size is grounded";
  }
  const codeMatch = content.match(PRODUCT_CODE_PATTERN);
  if (codeMatch && codeMatch[0].toUpperCase() !== (product?.product_code ?? "").toUpperCase()) {
    return `product-code-like value "${codeMatch[0]}" does not match the real product code`;
  }
  return null;
}

/** Phase 2K-BE — single entry point combining both deterministic checks.
 * Returns null when the suggestion is safe to persist. */
export function findQualityViolation(suggestion: SuggestionDraft, product: Product | null | undefined): string | null {
  return detectFixedPriceViolation(suggestion.content, product) ?? detectUnsupportedFactFabrication(suggestion.content, product);
}

function tokenize(content: string): Set<string> {
  return new Set(
    content
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** A batch is flagged as "same skeleton" when two variants share this
 * much of their vocabulary — high enough that only genuine near-clones
 * ("Mẫu này giá bao nhiêu vậy shop?" vs "Mẫu kia giá bao nhiêu vậy
 * shop?") are caught, not merely-related comments about the same
 * product. */
const SKELETON_SIMILARITY_THRESHOLD = 0.75;

/** Phase 2K-BE — batch-diversity backstop (requirement §5). Purely
 * structural (word-overlap ratio) — NOT a keyword blacklist, and
 * deliberately not a rigid persona system. Goes further than the
 * pre-existing dedupeSuggestions (which only catches exact/near-exact
 * whitespace-and-case duplicates): this catches "same sentence skeleton,
 * one or two words swapped" survivors that dedupeSuggestions cannot,
 * since their raw content genuinely differs. Same "keep first
 * occurrence" convention as dedupeSuggestions — never fabricates a
 * replacement, just drops the later near-clone. */
export function dropNearIdenticalSkeletons(suggestions: SuggestionDraft[]): SuggestionDraft[] {
  const kept: SuggestionDraft[] = [];
  const keptTokenSets: Set<string>[] = [];
  for (const suggestion of suggestions) {
    const tokens = tokenize(suggestion.content);
    const isNearIdentical = keptTokenSets.some((existing) => jaccardSimilarity(existing, tokens) >= SKELETON_SIMILARITY_THRESHOLD);
    if (isNearIdentical) continue;
    kept.push(suggestion);
    keptTokenSets.push(tokens);
  }
  return kept;
}

export function buildUserMessage(input: GenerateCommentsInput): string {
  const avoidBlock =
    input.avoid.length > 0
      ? `\n\nNhững comment đã tạo trước đó, KHÔNG được lặp lại hoặc diễn đạt gần giống:\n${input.avoid.map((c) => `- ${c}`).join("\n")}`
      : "";

  return (
    `Nội dung bài post: ${input.postContent ?? "(không có, hãy viết comment chung chung phù hợp mục tiêu)"}\n\n` +
    `Dữ liệu sản phẩm THẬT (nguồn xác thực, ưu tiên cao nhất cho mọi chi tiết cụ thể về sản phẩm):\n${buildProductContextBlock(input.product)}\n\n` +
    `Ghi chú bổ sung từ nhân viên (chỉ tham khảo thêm — KHÔNG được ưu tiên hơn 'Dữ liệu sản phẩm THẬT' ở trên nếu có mâu thuẫn): ${input.productDescription ?? "(không có)"}\n` +
    `Mục tiêu: ${input.objective}` +
    avoidBlock
  );
}

/** Exported so tests can inject a fake in place of a real Claude API call
 * (the injectable-collaborator convention this codebase already uses for
 * SupabaseClient — see generateCommentSuggestions' `requestFn` param
 * below). The actual prompt text is built by buildSystemPrompt/
 * buildUserMessage above, tested directly and independently of the SDK. */
export async function requestSuggestionsFromClaude(input: GenerateCommentsInput): Promise<SuggestionDraft[]> {
  const response = await getAnthropicClient().messages.parse({
    model: getAnthropicModel(),
    max_tokens: 4096,
    system: buildSystemPrompt(input.intent, input.sourceType, input.objective),
    messages: [{ role: "user", content: buildUserMessage(input) }],
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

/** Campaign-level view — every suggestion ever generated for this
 * campaign, regardless of which target (or none) it was generated for.
 * Unchanged by Phase 2K-AR: this is exactly the "no target selected"
 * fallback the UI falls back to, and remains the source for the
 * cross-target "avoid repeating" context fed back to the AI on
 * Regenerate — deliberately not narrowed to one target, since avoiding
 * duplicate wording campaign-wide was already the existing behavior and
 * changing it is out of this phase's scope (persistence/display
 * isolation only). */
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

/** Phase 2K-AR — target-scoped view for display. Only rows explicitly
 * tagged with this exact campaign_target_id — a legacy/untagged row
 * (campaign_target_id IS NULL) is never included here: SQL's `= value`
 * never matches NULL, so this is a guarantee of the query itself, not
 * application-layer filtering that could accidentally over-match. Never
 * silently attaches an untagged suggestion to a target. */
export async function getSuggestionsForCampaignTarget(
  campaignId: string,
  campaignTargetId: string,
  client: SupabaseClient = supabase
): Promise<SeedingCommentSuggestion[]> {
  const { data, error } = await client
    .from("seeding_comment_suggestions")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("campaign_target_id", campaignTargetId)
    .order("generation_batch", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Error fetching target-scoped seeding comment suggestions:", error);
    return [];
  }
  return data as SeedingCommentSuggestion[];
}

/** Phase 2K-AI — per-target AI context. When `campaignTargetId` is given,
 * that exact target's own content (resolved via the same dual-join/
 * ownership-checked primitive distribution already uses — never a
 * duplicate path) replaces the campaign-level snapshot as `postContent`,
 * so a multi-target campaign's targets no longer silently share whichever
 * target happened to be first at campaign creation. Campaign-level context
 * (objective, product description, avoid-list) is unchanged either way —
 * this only replaces WHICH post's content is used, never removes campaign
 * context. Omitting campaignTargetId preserves the exact prior behavior
 * (campaign.post_content_snapshot), so every existing caller/single-target
 * campaign keeps working unchanged. */
/** Phase 2K-BG — renamed from resolvePostContent (was post-content-only)
 * now that it also surfaces the target's real, DB-backed source_type
 * (Page/Personal/Group) instead of discarding it — the exact gap the
 * 2K-BB audit identified. No new query: loadTargetContext already
 * resolved source_type, this just stops throwing it away. The
 * no-campaignTargetId path returns sourceType: undefined — there is no
 * target row at all in that case, so no real source_type exists to
 * report; the prompt's buildSourceContextInstruction treats undefined as
 * "say nothing," never inventing a value. */
interface ResolvedTargetContext {
  postContent: string | null;
  sourceType: "Page" | "Personal" | "Group" | undefined;
}

async function resolveTargetContext(
  campaignId: string,
  campaignTargetId: string | undefined,
  campaign: { post_content_snapshot?: string | null },
  client: SupabaseClient
): Promise<ResolvedTargetContext> {
  if (!campaignTargetId) return { postContent: campaign.post_content_snapshot ?? null, sourceType: undefined };
  const target = await loadTargetContext(campaignId, campaignTargetId, client);
  return { postContent: target.message, sourceType: target.source_type };
}

/** "Generate"/"Regenerate" — same function either way (module scope §2:
 * "Có thể regenerate"). Each call is its own generation_batch, and prior
 * batches' content is fed back as "avoid" so a regenerate round produces
 * genuinely new variants rather than rephrasing the same ones. */
export async function generateCommentSuggestions(
  campaignId: string,
  productDescription: string | null,
  client: SupabaseClient = supabase,
  requestFn: (input: GenerateCommentsInput) => Promise<SuggestionDraft[]> = requestSuggestionsFromClaude,
  campaignTargetId?: string,
  intent?: SeedingCommentIntent
): Promise<SeedingCommentSuggestion[]> {
  const campaign = await getCampaignById(campaignId, client);
  if (!campaign) throw new Error("Seeding campaign not found");

  const { postContent, sourceType } = await resolveTargetContext(campaignId, campaignTargetId, campaign, client);

  // Phase 2K-AU — real Product grounding. campaign.product_id is existing,
  // already-populated data (createCampaign has stored it since before this
  // phase); getProductById already returns null on any resolution failure
  // (not found, DB error), so this never throws and never blocks
  // generation — a missing/unresolvable product silently falls back to
  // the exact prior behavior (no Product data offered to the model).
  const product = campaign.product_id ? await getProductById(campaign.product_id, client) : null;

  const priorSuggestions = await getSuggestionsForCampaign(campaignId, client);
  const nextBatch = priorSuggestions.length > 0 ? Math.max(...priorSuggestions.map((s) => s.generation_batch)) + 1 : 1;

  // Phase 2K-BE — Comment Output Quality Gate. Bounded retry, ONLY for
  // the case where EVERY variant in an attempt fails the deterministic
  // gate (a genuinely exceptional outcome) — a batch with even one
  // survivor is accepted immediately rather than re-requesting, so valid
  // output is never unnecessarily discarded or delayed. Violating
  // content is fed into the avoid-list for the next attempt (never
  // silently repeated) but never persisted and never replaced with a
  // fabricated substitute — exhausting all attempts with zero survivors
  // returns [] (the same empty-result contract dedup already had).
  let accepted: SuggestionDraft[] = [];
  let avoidForThisCall = priorSuggestions.map((s) => s.content);

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const raw = await requestFn({
      postContent,
      productDescription,
      objective: campaign.objective,
      avoid: avoidForThisCall,
      product,
      intent,
      sourceType,
    });
    if (raw.length === 0) break;

    const deduped = dedupeSuggestions(raw);
    const diverse = dropNearIdenticalSkeletons(deduped);
    const qualityChecked = diverse.filter((s) => findQualityViolation(s, product) === null);

    if (qualityChecked.length > 0) {
      accepted = qualityChecked;
      break;
    }
    avoidForThisCall = [...avoidForThisCall, ...raw.map((r) => r.content)];
  }

  if (accepted.length === 0) return [];

  const { data, error } = await client
    .from("seeding_comment_suggestions")
    .insert(
      accepted.map((s) => ({
        campaign_id: campaignId,
        // Phase 2K-AR — tags every newly persisted row with exactly the
        // target this generation was for (or null, the unchanged
        // campaign-level fallback, when no target was selected). Never
        // fabricated: this is the caller's own campaignTargetId, not
        // guessed from postContent.
        campaign_target_id: campaignTargetId ?? null,
        category: s.category,
        content: s.content,
        generation_batch: nextBatch,
      }))
    )
    .select();
  if (error) throw error;

  return data as SeedingCommentSuggestion[];
}
