export type AuthResponse = {
  token: string;
  username: string;
  role: "admin" | "student";
};

export type Concept = {
  id: number;
  slug: string;
  name_cn: string;
  name_en: string;
  aliases: string[];
  chapter: string;
  description: string;
};

export type GraphEdge = {
  id: number;
  source_id: number;
  target_id: number;
  source_name: string;
  target_name: string;
  relation_type: string;
  evidence: string;
};

export type Graph = {
  nodes: Concept[];
  edges: GraphEdge[];
};

export type Source = {
  chunk_id: string;
  chapter: string;
  section: string;
  pdf_page: number;
  source_file: string;
  snippet: string;
  summary: string;
  score: number;
};

export type AskResponse = {
  conversation_id: number | null;
  message_id: number | null;
  question: string;
  answer: string;
  status: "answered" | "out_of_scope" | "insufficient_evidence" | "llm_error";
  confidence: number;
  retrieval_confidence: number;
  answer_mode: string;
  notice: string;
  sources: Source[];
  related_questions: string[];
  matched_concepts: Concept[];
  graph: Graph;
  performance: Performance;
};

export type Performance = {
  analysis_ms: number;
  retrieval_ms: number;
  graph_ms: number;
  llm_ms: number;
  total_ms: number;
  retrieval_cache: string;
};

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  status: AskResponse["status"] | "";
  confidence: number;
  retrieval_confidence: number;
  answer_mode: string;
  sources: Source[];
  related_questions: string[];
  matched_concepts: Concept[];
  graph: Graph;
  performance: Performance;
  created_at: string;
};

export type ChatConversation = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
};

export type ChatConversationDetail = ChatConversation & {
  messages: ChatMessage[];
};

export type QAPair = {
  id: number;
  question: string;
  answer: string;
  type: string;
  concept_ids: number[];
  source_refs: Record<string, unknown>[];
  quality_status: string;
  created_at: string;
  updated_at: string;
};

export type HistoryItem = {
  id: number;
  conversation_id: number | null;
  message_id: number | null;
  question: string;
  answer_summary: string;
  answer: string;
  sources: Record<string, unknown>[];
  created_at: string;
  favorited?: boolean;
};

export type SystemStats = {
  users: number;
  concepts: number;
  graph_edges: number;
  qa_pairs: number;
  text_chunks: number;
  llm_configured: boolean;
  pdf_available: boolean;
};

export type UserRecord = {
  id: number;
  username: string;
  role: "admin" | "student";
  created_at: string;
};

export type TextChunk = {
  id: number;
  chunk_id: string;
  chapter: string;
  section: string;
  pdf_page: number;
  source_file: string;
  preview: string;
  embedding_model: string;
};

export type LlmConfig = {
  base_url: string;
  model: string;
  has_api_key: boolean;
  api_key_preview: string;
  disabled: boolean;
};

export type LlmConfigTest = {
  configured: boolean;
  message: string;
};
