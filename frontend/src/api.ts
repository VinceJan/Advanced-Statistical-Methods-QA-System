import type { AskResponse, AuthResponse, ChatConversation, ChatConversationDetail, Concept, Graph, GraphEdge, HistoryItem, LlmConfig, LlmConfigTest, QAPair, SystemStats, TextChunk, UserRecord } from "./types";

const API_BASE = "";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.detail || message;
    } catch {
      // ignore json parse errors
    }
    throw new ApiError(response.status, message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  register: (username: string, password: string) =>
    request<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) =>
    request<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  stats: () => request<SystemStats>("/api/system/stats"),
  ask: (question: string, token: string, conversation_id?: number | null) =>
    request<AskResponse>("/api/chat/ask", { method: "POST", body: JSON.stringify({ question, conversation_id }) }, token),
  conversations: (token: string) => request<ChatConversation[]>("/api/chat/conversations", {}, token),
  conversation: (token: string, id: number) => request<ChatConversationDetail>(`/api/chat/conversations/${id}`, {}, token),
  deleteConversation: (token: string, id: number) => request<{ message: string }>(`/api/chat/conversations/${id}`, { method: "DELETE" }, token),
  concepts: (token: string, q = "") => request<Concept[]>(`/api/graph/concepts${q ? `?q=${encodeURIComponent(q)}` : ""}`, {}, token),
  subgraph: (token: string, conceptId?: number, q?: string) => {
    const params = new URLSearchParams();
    if (conceptId) params.set("concept_id", String(conceptId));
    if (q) params.set("q", q);
    return request<Graph>(`/api/graph/subgraph?${params.toString()}`, {}, token);
  },
  recommendations: (token: string, conceptId: number) =>
    request<string[]>(`/api/graph/recommendations?concept_id=${conceptId}`, {}, token),
  qaPairs: (token: string, params: { q?: string; type?: string; concept_id?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.type) search.set("type", params.type);
    if (params.concept_id) search.set("concept_id", String(params.concept_id));
    return request<QAPair[]>(`/api/qa-pairs${search.toString() ? `?${search.toString()}` : ""}`, {}, token);
  },
  createQaPair: (token: string, pair: Omit<QAPair, "id" | "created_at" | "updated_at">) =>
    request<QAPair>("/api/qa-pairs", { method: "POST", body: JSON.stringify(pair) }, token),
  updateQaPair: (token: string, id: number, patch: Partial<QAPair>) =>
    request<QAPair>(`/api/qa-pairs/${id}`, { method: "PATCH", body: JSON.stringify(patch) }, token),
  deleteQaPair: (token: string, id: number) => request<{ message: string }>(`/api/qa-pairs/${id}`, { method: "DELETE" }, token),
  history: (token: string) => request<HistoryItem[]>("/api/history", {}, token),
  clearHistory: (token: string) => request<{ message: string }>("/api/history", { method: "DELETE" }, token),
  toggleFavorite: (token: string, historyId: number) =>
    request<{ favorited: boolean }>(`/api/history/${historyId}/favorite`, { method: "POST" }, token),
  favorites: (token: string) => request<HistoryItem[]>("/api/history/favorites", {}, token),
  saveNote: (token: string, historyId: number, content: string) =>
    request<{ id: number; history_id: number; content: string; created_at: string; updated_at: string }>(`/api/history/${historyId}/notes`, { method: "POST", body: JSON.stringify({ content }) }, token),
  getNote: (token: string, historyId: number) =>
    request<{ id: number; history_id: number; content: string; created_at: string; updated_at: string } | null>(`/api/history/${historyId}/notes`, {}, token),
  adminUsers: (token: string) => request<UserRecord[]>("/api/admin/users", {}, token),
  updateUserRole: (token: string, userId: number, role: "admin" | "student") =>
    request<UserRecord>(`/api/admin/users/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) }, token),
  resetUserPassword: (token: string, userId: number, password: string) =>
    request<UserRecord>(`/api/admin/users/${userId}/password`, { method: "PATCH", body: JSON.stringify({ password }) }, token),
  logoutUser: (token: string, userId: number) => request<{ message: string }>(`/api/admin/users/${userId}/logout`, { method: "POST" }, token),
  deleteUser: (token: string, userId: number) => request<{ message: string }>(`/api/admin/users/${userId}`, { method: "DELETE" }, token),
  llmConfig: (token: string) => request<LlmConfig>("/api/admin/llm-config", {}, token),
  updateLlmConfig: (token: string, patch: { base_url?: string; model?: string; api_key?: string; clear_api_key?: boolean }) =>
    request<LlmConfig>("/api/admin/llm-config", { method: "PATCH", body: JSON.stringify(patch) }, token),
  testLlmConfig: (token: string) => request<LlmConfigTest>("/api/admin/llm-config/test", { method: "POST" }, token),
  adminEdges: (token: string) => request<GraphEdge[]>("/api/admin/edges", {}, token),
  createEdge: (token: string, edge: { source_id: number; target_id: number; relation_type: string; evidence: string }) =>
    request<GraphEdge>("/api/admin/edges", { method: "POST", body: JSON.stringify(edge) }, token),
  updateEdge: (token: string, id: number, patch: Partial<Pick<GraphEdge, "relation_type" | "evidence">>) =>
    request<GraphEdge>(`/api/admin/edges/${id}`, { method: "PATCH", body: JSON.stringify(patch) }, token),
  deleteEdge: (token: string, id: number) => request<{ message: string }>(`/api/admin/edges/${id}`, { method: "DELETE" }, token),
  createConcept: (token: string, concept: { slug: string; name_cn: string; name_en: string; aliases: string[]; chapter: string; description: string }) =>
    request<Concept>("/api/admin/concepts", { method: "POST", body: JSON.stringify(concept) }, token),
  updateConcept: (token: string, id: number, patch: Partial<Concept>) =>
    request<Concept>(`/api/admin/concepts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }, token),
  deleteConcept: (token: string, id: number) => request<{ message: string }>(`/api/admin/concepts/${id}`, { method: "DELETE" }, token),
  adminChunks: (token: string, q = "") =>
    request<TextChunk[]>(`/api/admin/chunks${q ? `?q=${encodeURIComponent(q)}` : ""}`, {}, token),
  adminChunkDetail: (token: string, chunkId: string) =>
    request<TextChunk>(`/api/admin/chunks/${encodeURIComponent(chunkId)}`, {}, token),
  chunkDetail: (token: string, chunkId: string) =>
    request<TextChunk>(`/api/system/chunks/${encodeURIComponent(chunkId)}`, {}, token),
  rebuildChunks: (token: string) => request<{ text_chunks: number }>("/api/admin/chunks/rebuild", { method: "POST" }, token),
  adminHistories: (token: string) => request<HistoryItem[]>("/api/admin/histories", {}, token)
};
