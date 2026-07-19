import { Option } from "@/lib/customer.constants";

// The 5 categories locked by docs/KNOWLEDGE_VAULT_SPEC.md §1.3 (Decision 3) -
// no add/remove/rename without a new spec revision.
export const KNOWLEDGE_CATEGORIES: Option[] = [
  { value: "Product & Material Knowledge", label: "Kiến thức sản phẩm & chất liệu" },
  { value: "Sales & Customer Knowledge", label: "Kiến thức bán hàng & khách hàng" },
  { value: "Business Process & Policy", label: "Quy trình & chính sách" },
  { value: "Terminology / Glossary", label: "Thuật ngữ / Từ điển" },
  { value: "Market & Industry Reference", label: "Tham khảo thị trường & ngành" },
];

export { labelFor } from "@/lib/customer.constants";
