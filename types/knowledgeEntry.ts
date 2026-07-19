export type KnowledgeCategory =
  | "Product & Material Knowledge"
  | "Sales & Customer Knowledge"
  | "Business Process & Policy"
  | "Terminology / Glossary"
  | "Market & Industry Reference";

export type KnowledgeStatus = "Active" | "Archived";

export interface KnowledgeEntry {
  id: string;
  title: string;
  category: KnowledgeCategory;
  body: string;
  tags: string[];
  last_updated: string;
  status: KnowledgeStatus;
}
