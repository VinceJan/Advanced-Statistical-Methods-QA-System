import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import cytoscape from "cytoscape";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  BookOpen,
  Brain,
  CircleUserRound,
  Clock3,
  Database,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  MessageSquareText,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserX,
  Wrench
} from "lucide-react";
import { api, ApiError } from "./api";
import type { AskResponse, ChatConversation, ChatMessage, Concept, Graph, GraphEdge, HistoryItem, LlmConfig, QAPair, SystemStats, TextChunk, UserRecord } from "./types";
import "./styles.css";

type Tab = "ask" | "manage" | "graph" | "history" | "admin";

const sampleQuestions = [
  "什么是交叉验证？",
  "岭回归和 Lasso 有什么区别？",
  "逻辑回归可以用来解决什么问题？",
  "偏差-方差权衡如何解释过拟合？"
];

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("qa_token") || "");
  const [username, setUsername] = useState(() => localStorage.getItem("qa_username") || "");
  const [role, setRole] = useState<"admin" | "student">(() => (localStorage.getItem("qa_role") as "admin" | "student") || "student");
  const [tab, setTab] = useState<Tab>("ask");
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    api.stats().then(setStats).catch(() => setStats(null));
  }, []);

  function onAuth(authToken: string, name: string, nextRole: "admin" | "student") {
    setToken(authToken);
    setUsername(name);
    setRole(nextRole);
    localStorage.setItem("qa_token", authToken);
    localStorage.setItem("qa_username", name);
    localStorage.setItem("qa_role", nextRole);
  }

  function logout() {
    setToken("");
    setUsername("");
    setRole("student");
    localStorage.removeItem("qa_token");
    localStorage.removeItem("qa_username");
    localStorage.removeItem("qa_role");
  }

  if (!token) {
    return <AuthScreen onAuth={onAuth} stats={stats} />;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandIcon"><Brain size={22} /></div>
          <div>
            <h1>高级统计方法</h1>
            <p>知识图谱智能问答系统</p>
          </div>
        </div>
        <nav className="nav">
          <button className={tab === "ask" ? "active" : ""} onClick={() => setTab("ask")}><MessageSquareText size={18} />问答工作台</button>
          {role === "admin" && <button className={tab === "manage" ? "active" : ""} onClick={() => setTab("manage")}><Database size={18} />问答对管理</button>}
          <button className={tab === "graph" ? "active" : ""} onClick={() => setTab("graph")}><GitBranch size={18} />知识图谱</button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}><Clock3 size={18} />学习历史</button>
          {role === "admin" && <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}><ShieldCheck size={18} />管理后台</button>}
        </nav>
        <div className="sidebarStats">
          <Metric label="知识点" value={stats?.concepts ?? "-"} />
          <Metric label="图谱边" value={stats?.graph_edges ?? "-"} />
          <Metric label="问答对" value={stats?.qa_pairs ?? "-"} />
          <Metric label="文本块" value={stats?.text_chunks ?? "-"} />
        </div>
        <div className="userBox">
          <CircleUserRound size={18} />
          <span>{username}<small>{role === "admin" ? "管理员" : "学生"}</small></span>
          <button title="退出登录" onClick={logout}><LogOut size={17} /></button>
        </div>
      </aside>
      <main className="main">
        {toast && <div className="toast" onAnimationEnd={() => setToast("")}>{toast}</div>}
        {tab === "ask" && <AskWorkspace token={token} setToast={setToast} />}
        {tab === "manage" && role === "admin" && <QAManager token={token} setToast={setToast} />}
        {tab === "graph" && <GraphExplorer token={token} setToast={setToast} />}
        {tab === "history" && <HistoryView token={token} setToast={setToast} />}
        {tab === "admin" && role === "admin" && <AdminConsole token={token} setToast={setToast} openQAManager={() => setTab("manage")} reloadStats={() => api.stats().then(setStats)} />}
      </main>
    </div>
  );
}

function AuthScreen({ onAuth, stats }: { onAuth: (token: string, username: string, role: "admin" | "student") => void; stats: SystemStats | null }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const auth = mode === "login" ? await api.login(username, password) : await api.register(username, password);
      onAuth(auth.token, auth.username, auth.role);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "认证失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="authPage">
      <section className="authPanel">
        <div className="brand wide">
          <div className="brandIcon"><BookOpen size={24} /></div>
          <div>
            <h1>高级统计方法智能问答系统</h1>
            <p>教材 RAG、知识图谱、可信来源与管理后台</p>
          </div>
        </div>
        <form className="authForm" onSubmit={submit}>
          <div className="segmented">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>登录</button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>注册</button>
          </div>
          <label>用户名<input value={username} onChange={(e) => setUsername(e.target.value)} /></label>
          <label>密码<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={loading}><LogIn size={18} />{loading ? "处理中" : "进入系统"}</button>
        </form>
        <div className="metricsStrip">
          <Metric label="知识点" value={stats?.concepts ?? "-"} />
          <Metric label="图谱边" value={stats?.graph_edges ?? "-"} />
          <Metric label="问答对" value={stats?.qa_pairs ?? "-"} />
          <Metric label="文本块" value={stats?.text_chunks ?? "-"} />
        </div>
      </section>
    </div>
  );
}

function AskWorkspace({ token, setToast }: { token: string; setToast: (value: string) => void }) {
  const [question, setQuestion] = useState(sampleQuestions[1]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeMessageId, setActiveMessageId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadConversations(nextId = conversationId) {
    const items = await api.conversations(token);
    setConversations(items);
    if (nextId) await openConversation(nextId, false);
  }

  async function openConversation(id: number, refreshList = true) {
    try {
      const detail = await api.conversation(token, id);
      setConversationId(detail.id);
      setMessages(detail.messages);
      const lastAssistant = [...detail.messages].reverse().find((item) => item.role === "assistant");
      setActiveMessageId(lastAssistant?.id ?? null);
      if (refreshList) setConversations(await api.conversations(token));
    } catch (err) {
      setToast(err instanceof Error ? err.message : "打开会话失败");
    }
  }

  async function deleteCurrentConversation() {
    if (!conversationId) return;
    try {
      await api.deleteConversation(token, conversationId);
      setConversationId(null);
      setMessages([]);
      setActiveMessageId(null);
      setConversations(await api.conversations(token));
    } catch (err) {
      setToast(err instanceof Error ? err.message : "删除会话失败");
    }
  }

  async function ask(q = question) {
    if (!q.trim()) return;
    setQuestion(q);
    setLoading(true);
    try {
      const result = await api.ask(q, token, conversationId);
      setConversationId(result.conversation_id);
      setActiveMessageId(result.message_id);
      await loadConversations(result.conversation_id);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "问答失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConversations().catch(() => setConversations([]));
  }, []);

  const assistantMessages = messages.filter((item) => item.role === "assistant");
  const activeAssistant: ChatMessage | null =
    assistantMessages.find((item) => item.id === activeMessageId) ||
    (assistantMessages.length ? assistantMessages[assistantMessages.length - 1] : null);
  const canShowEvidence = activeAssistant?.status === "answered" || activeAssistant?.status === "llm_error";

  return (
    <div className="workspace">
      <section className="topBand">
        <div>
          <h2>问答工作台</h2>
          <p>支持连续追问；每轮回答都会独立刷新来源、推荐问题和知识图谱，不会沿用旧证据。</p>
        </div>
        <div className="row">
          <button onClick={() => { setConversationId(null); setMessages([]); setActiveMessageId(null); }}>新建会话</button>
          <button className="danger" onClick={deleteCurrentConversation} disabled={!conversationId}><Trash2 size={16} />删除会话</button>
        </div>
      </section>
      <section className="askBox elevated">
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} />
        <div className="askActions">
          <div className="chips">{sampleQuestions.map((item) => <button key={item} onClick={() => ask(item)}>{item}</button>)}</div>
          <button className="primary askButton" onClick={() => ask()} disabled={loading}><Send size={18} />{loading ? "生成中" : "提问"}</button>
        </div>
      </section>
      <section className="conversationLayout">
        <aside className="conversationList">
          <h3>最近会话</h3>
          {conversations.length === 0 && <div className="emptyState small">还没有会话。</div>}
          {conversations.map((item) => (
            <button key={item.id} className={item.id === conversationId ? "active" : ""} onClick={() => openConversation(item.id)}>
              <strong>{item.title}</strong>
              <span>{item.message_count} 条消息 · {new Date(item.updated_at).toLocaleString()}</span>
            </button>
          ))}
        </aside>
        <section className="messageThread">
          {messages.length === 0 && <div className="emptyState">开始提问后，这里会保留当前会话的上下文。</div>}
          {messages.map((message) => (
            <article key={message.id} className={`chatBubble ${message.role} ${message.id === activeMessageId ? "active" : ""}`} onClick={() => message.role === "assistant" && setActiveMessageId(message.id)}>
              <header><strong>{message.role === "user" ? "你" : "助教"}</strong><time>{new Date(message.created_at).toLocaleTimeString()}</time></header>
              {message.role === "assistant" ? <MarkdownBlock content={message.content} /> : <p>{message.content}</p>}
              {message.role === "assistant" && <PerformanceStrip message={message} />}
            </article>
          ))}
        </section>
      </section>
      {activeAssistant && (
        <div className={`answerShell ${!canShowEvidence ? "single" : ""}`}>
          <section className="answerPanel">
            <div className="panelHeader">
              <h3>当前轮次详情</h3>
              <StatusBadge result={activeAssistant} />
            </div>
            <MarkdownBlock content={activeAssistant.content} />
            {activeAssistant.status === "llm_error" && <p className="warning">外部 LLM 调用失败，当前展示本地证据降级回答。</p>}
          </section>
          {canShowEvidence && (
            <section className="sidePanel">
              <h3>来源</h3>
              <div className="sourceList">
                {activeAssistant.sources.map((source, index) => (
                  <details key={source.chunk_id} open={index === 0}>
                    <summary>
                      <strong>{source.chapter}</strong>
                      <span>PDF 第 {source.pdf_page} 页 · 相关度 {source.score}</span>
                    </summary>
                    <p>{source.summary || source.snippet}</p>
                  </details>
                ))}
              </div>
              {activeAssistant.related_questions.length > 0 && <h3>相关问题</h3>}
              <div className="stackButtons">{activeAssistant.related_questions.map((item) => <button key={item} onClick={() => ask(item)}>{item}</button>)}</div>
            </section>
          )}
          {canShowEvidence && activeAssistant.graph.nodes.length > 0 && (
            <section className="graphPanel widePanel">
              <h3>关联知识图谱子图</h3>
              <GraphCanvas graph={activeAssistant.graph} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

type ResponseLike = {
  status: AskResponse["status"] | "";
  confidence: number;
  retrieval_confidence: number;
};

function StatusBadge({ result }: { result: ResponseLike }) {
  const label = {
    answered: "已回答",
    out_of_scope: "不在课程范围",
    insufficient_evidence: "证据不足",
    llm_error: "降级回答",
    "": "处理中"
  }[result.status];
  return (
    <div className={`statusBadge ${result.status}`}>
      <span>{label}</span>
      <small>置信度 {Math.round(result.confidence * 100)}% · 检索 {result.retrieval_confidence.toFixed(2)}</small>
    </div>
  );
}

function PerformanceStrip({ message }: { message: ChatMessage }) {
  const perf = message.performance;
  if (!perf || !perf.total_ms) return null;
  return (
    <div className="perfStrip">
      <span>总耗时 {perf.total_ms}ms</span>
      <span>检索 {perf.retrieval_ms}ms</span>
      <span>图谱 {perf.graph_ms}ms</span>
      <span>LLM {perf.llm_ms}ms</span>
      <span>缓存 {perf.retrieval_cache || "-"}</span>
    </div>
  );
}

function MarkdownBlock({ content }: { content: string }) {
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{content}</ReactMarkdown></div>;
}

function QAManager({ token, setToast }: { token: string; setToast: (value: string) => void }) {
  const [pairs, setPairs] = useState<QAPair[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [editing, setEditing] = useState<QAPair | null>(null);
  const [draft, setDraft] = useState({ question: "", answer: "", type: "概念解释", quality_status: "已校对" });

  async function load() {
    try {
      setPairs(await api.qaPairs(token, { q: query, type: type || undefined }));
    } catch (err) {
      setToast(err instanceof Error ? err.message : "加载问答对失败");
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    try {
      if (editing) await api.updateQaPair(token, editing.id, draft);
      else await api.createQaPair(token, { ...draft, concept_ids: [], source_refs: [] });
      setEditing(null);
      setDraft({ question: "", answer: "", type: "概念解释", quality_status: "已校对" });
      await load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function remove(id: number) {
    try {
      await api.deleteQaPair(token, id);
      await load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div className="workspace">
      <section className="topBand"><div><h2>问答对管理</h2><p>维护课程问答对，普通用户可用于课程数据管理演示。</p></div></section>
      <section className="toolbar">
        <div className="searchInput"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索问题或答案" /></div>
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="">全部类型</option><option>概念解释</option><option>关系查询</option><option>应用场景</option></select>
        <button onClick={load}><Search size={17} />查询</button>
      </section>
      <section className="editor elevated">
        <input value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} placeholder="问题文本" />
        <textarea value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} placeholder="答案文本" />
        <div className="row"><select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}><option>概念解释</option><option>关系查询</option><option>应用场景</option></select><select value={draft.quality_status} onChange={(e) => setDraft({ ...draft, quality_status: e.target.value })}><option>已校对</option><option>草稿</option><option>需复核</option></select><button className="primary" onClick={save}><Plus size={17} />{editing ? "保存修改" : "新增问答对"}</button></div>
      </section>
      <div className="qaList">
        {pairs.map((pair) => (
          <article key={pair.id}>
            <div><span className="tag">{pair.type}</span><span className="tag muted">{pair.quality_status}</span></div>
            <h3>{pair.question}</h3>
            <p>{pair.answer}</p>
            <footer><button onClick={() => { setEditing(pair); setDraft({ question: pair.question, answer: pair.answer, type: pair.type, quality_status: pair.quality_status }); }}>编辑</button><button className="danger" onClick={() => remove(pair.id)}><Trash2 size={16} />删除</button></footer>
          </article>
        ))}
      </div>
    </div>
  );
}

function GraphExplorer({ token, setToast }: { token: string; setToast: (value: string) => void }) {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selected, setSelected] = useState<Concept | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [recs, setRecs] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  async function choose(concept: Concept) {
    setSelected(concept);
    setGraph(null);
    setRecs([]);
    const [nextGraph, nextRecs] = await Promise.allSettled([
      api.subgraph(token, concept.id),
      api.recommendations(token, concept.id)
    ]);
    if (nextGraph.status === "fulfilled") setGraph(nextGraph.value);
    else setToast(nextGraph.reason instanceof Error ? nextGraph.reason.message : "加载知识点子图失败");
    if (nextRecs.status === "fulfilled") setRecs(nextRecs.value);
    else setToast(nextRecs.reason instanceof Error ? nextRecs.reason.message : "加载推荐问题失败");
  }

  async function load() {
    setLoading(true);
    try {
      const items = await api.concepts(token, query);
      setConcepts(items);
      if (items[0]) {
        await choose(items[0]);
      } else {
        setSelected(null);
        setGraph(null);
        setRecs([]);
      }
    } catch (err) {
      setConcepts([]);
      setSelected(null);
      setGraph(null);
      setRecs([]);
      setToast(err instanceof Error ? err.message : "加载图谱失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="workspace">
      <section className="topBand"><div><h2>知识图谱</h2><p>自动布局避免标签重叠，点击节点可切换邻域和推荐问题。</p></div></section>
      <section className="graphLayout">
        <aside className="conceptList">
          <div className="searchInput">
            <Search size={18} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(); }} placeholder="搜索知识点" />
          </div>
          <button onClick={load} disabled={loading}>{loading ? "搜索中" : "搜索"}</button>
          <div className="conceptScroll">
            {concepts.length === 0 && <div className="emptyState small">没有匹配知识点。</div>}
            {concepts.map((concept) => <button key={concept.id} className={selected?.id === concept.id ? "active" : ""} onClick={() => choose(concept)}><strong>{concept.name_cn}</strong><span>{concept.name_en}</span></button>)}
          </div>
        </aside>
        <section className="graphPanel">
          <h3>{selected ? selected.name_cn : "知识点子图"}</h3>
          {selected && <p className="description">{selected.description}</p>}
          {selected && graph && <GraphCanvas graph={graph} onNodeClick={(id) => { const next = concepts.find((item) => item.id === id); if (next) choose(next); }} />}
          {selected && !graph && <div className="emptyState">正在加载知识点子图。</div>}
          {!selected && <div className="emptyState">请选择或搜索一个课程知识点。</div>}
          <h3>推荐问题</h3>
          <div className="stackButtons">{recs.length > 0 ? recs.map((item) => <button key={item}>{item}</button>) : <div className="emptyState small">暂无推荐问题。</div>}</div>
        </section>
      </section>
    </div>
  );
}

function HistoryView({ token, setToast }: { token: string; setToast: (value: string) => void }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  async function load() { try { setItems(await api.history(token)); } catch (err) { setToast(err instanceof Error ? err.message : "加载历史失败"); } }
  async function clear() { try { await api.clearHistory(token); setSelected(null); await load(); } catch (err) { setToast(err instanceof Error ? err.message : "清空失败"); } }
  useEffect(() => { load(); }, []);
  return (
    <div className="workspace">
      <section className="topBand"><div><h2>学习历史</h2><p>点击任意记录可查看当时回答全文和引用来源。</p></div><button className="danger" onClick={clear}><Trash2 size={17} />清空</button></section>
      <section className="historyLayout">
        <div className="historyList">
          {items.map((item) => (
            <article key={item.id} className={selected?.id === item.id ? "active" : ""} onClick={() => setSelected(item)}>
              <time>{new Date(item.created_at).toLocaleString()}</time>
              <h3>{item.question}</h3>
              <p>{item.answer_summary}</p>
            </article>
          ))}
        </div>
        <aside className="historyDetail">
          {!selected && <div className="emptyState">选择一条历史记录查看完整回答。</div>}
          {selected && (
            <>
              <time>{new Date(selected.created_at).toLocaleString()}</time>
              <h3>{selected.question}</h3>
              <MarkdownBlock content={selected.answer} />
              {selected.sources.length > 0 && <h3>当时来源</h3>}
              <div className="sourceList">
                {selected.sources.map((source, index) => (
                  <details key={`${String(source["chunk_id"] || "source")}-${index}`} open={index === 0}>
                    <summary>
                      <strong>{String(source["chapter"] || "教材来源")}</strong>
                      <span>PDF 第 {String(source["pdf_page"] || "-")} 页</span>
                    </summary>
                    <p>{String(source["summary"] || source["snippet"] || "")}</p>
                  </details>
                ))}
              </div>
            </>
          )}
        </aside>
      </section>
    </div>
  );
}

const emptyConceptDraft = { slug: "", name_cn: "", name_en: "", aliases: "", chapter: "", description: "" };
const emptyEdgeDraft = { source_id: "", target_id: "", relation_type: "相关", evidence: "" };

function AdminConsole({
  token,
  setToast,
  openQAManager,
  reloadStats
}: {
  token: string;
  setToast: (value: string) => void;
  openQAManager: () => void;
  reloadStats: () => void;
}) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [chunks, setChunks] = useState<TextChunk[]>([]);
  const [qaPairs, setQaPairs] = useState<QAPair[]>([]);
  const [histories, setHistories] = useState<HistoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [conceptDraft, setConceptDraft] = useState(emptyConceptDraft);
  const [editingConcept, setEditingConcept] = useState<Concept | null>(null);
  const [edgeDraft, setEdgeDraft] = useState(emptyEdgeDraft);
  const [editingEdge, setEditingEdge] = useState<GraphEdge | null>(null);
  const [llmConfig, setLlmConfig] = useState<LlmConfig | null>(null);
  const [llmDraft, setLlmDraft] = useState({ base_url: "", model: "", api_key: "" });
  const [passwordDrafts, setPasswordDrafts] = useState<Record<number, string>>({});

  async function loadAll() {
    try {
      const [nextStats, nextUsers, nextConcepts, nextEdges, nextChunks, nextQAPairs, nextHistories, nextLlmConfig] = await Promise.all([
        api.stats(),
        api.adminUsers(token),
        api.concepts(token),
        api.adminEdges(token),
        api.adminChunks(token, query),
        api.qaPairs(token),
        api.adminHistories(token),
        api.llmConfig(token)
      ]);
      setStats(nextStats);
      setUsers(nextUsers);
      setConcepts(nextConcepts);
      setEdges(nextEdges);
      setChunks(nextChunks);
      setQaPairs(nextQAPairs);
      setHistories(nextHistories);
      setLlmConfig(nextLlmConfig);
      setLlmDraft((draft) => ({
        base_url: draft.base_url || nextLlmConfig.base_url,
        model: draft.model || nextLlmConfig.model,
        api_key: ""
      }));
    } catch (err) {
      setToast(err instanceof Error ? err.message : "加载后台失败");
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function rebuild() {
    try {
      const result = await api.rebuildChunks(token);
      setToast(`索引重建完成：${result.text_chunks} 个文本块`);
      reloadStats();
      await loadAll();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "重建失败");
    }
  }

  async function saveLlmConfig(clearKey = false) {
    try {
      const next = await api.updateLlmConfig(token, {
        base_url: llmDraft.base_url,
        model: llmDraft.model,
        api_key: llmDraft.api_key || undefined,
        clear_api_key: clearKey
      });
      setLlmConfig(next);
      setLlmDraft({ base_url: next.base_url, model: next.model, api_key: "" });
      setToast(clearKey ? "API Key 已清除" : "模型配置已保存");
      reloadStats();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "保存模型配置失败");
    }
  }

  async function testLlmConfig() {
    try {
      const result = await api.testLlmConfig(token);
      setToast(result.message);
      await loadAll();
      reloadStats();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "检查模型配置失败");
    }
  }

  async function resetPassword(userId: number) {
    const password = passwordDrafts[userId] || "";
    if (password.length < 6) {
      setToast("新密码至少 6 位");
      return;
    }
    try {
      await api.resetUserPassword(token, userId, password);
      setPasswordDrafts((drafts) => ({ ...drafts, [userId]: "" }));
      setToast("密码已修改，原会话已注销");
      await loadAll();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "修改密码失败");
    }
  }

  async function logoutUser(userId: number) {
    try {
      await api.logoutUser(token, userId);
      setToast("用户会话已注销");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "注销会话失败");
    }
  }

  async function removeUser(userId: number) {
    try {
      await api.deleteUser(token, userId);
      setToast("用户已删除");
      await loadAll();
      reloadStats();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "删除用户失败");
    }
  }

  async function saveConcept() {
    try {
      const payload = {
        slug: conceptDraft.slug.trim(),
        name_cn: conceptDraft.name_cn.trim(),
        name_en: conceptDraft.name_en.trim(),
        aliases: conceptDraft.aliases.split(/[，,\s]+/).map((item) => item.trim()).filter(Boolean),
        chapter: conceptDraft.chapter.trim(),
        description: conceptDraft.description.trim()
      };
      if (editingConcept) {
        await api.updateConcept(token, editingConcept.id, payload);
      } else {
        await api.createConcept(token, payload);
      }
      setConceptDraft(emptyConceptDraft);
      setEditingConcept(null);
      await loadAll();
      reloadStats();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "保存知识点失败");
    }
  }

  async function removeConcept(id: number) {
    try {
      await api.deleteConcept(token, id);
      await loadAll();
      reloadStats();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "删除知识点失败");
    }
  }

  async function saveEdge() {
    try {
      const payload = {
        source_id: Number(edgeDraft.source_id),
        target_id: Number(edgeDraft.target_id),
        relation_type: edgeDraft.relation_type.trim(),
        evidence: edgeDraft.evidence.trim()
      };
      if (!payload.source_id || !payload.target_id || !payload.relation_type) {
        setToast("请选择图谱边的起点、终点和关系");
        return;
      }
      if (editingEdge) {
        await api.updateEdge(token, editingEdge.id, { relation_type: payload.relation_type, evidence: payload.evidence });
      } else {
        await api.createEdge(token, payload);
      }
      setEdgeDraft(emptyEdgeDraft);
      setEditingEdge(null);
      await loadAll();
      reloadStats();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "保存图谱边失败");
    }
  }

  async function removeEdge(id: number) {
    try {
      await api.deleteEdge(token, id);
      await loadAll();
      reloadStats();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "删除图谱边失败");
    }
  }

  return (
    <div className="workspace">
      <section className="topBand"><div><h2>管理后台</h2><p>管理员可审计用户、数据资产、知识图谱、文本块和提问历史。</p></div><button className="primary" onClick={loadAll}><LayoutDashboard size={17} />刷新</button></section>
      <section className="adminGrid">
        <AdminCard title="系统状态"><div className="metricsStrip adminMetrics"><Metric label="知识点" value={stats?.concepts ?? "-"} /><Metric label="图谱边" value={stats?.graph_edges ?? "-"} /><Metric label="问答对" value={stats?.qa_pairs ?? "-"} /><Metric label="文本块" value={stats?.text_chunks ?? "-"} /><Metric label="LLM" value={stats?.llm_configured ? "已配置" : "未配置"} /><Metric label="教材" value={stats?.pdf_available ? "可用" : "缺失"} /></div></AdminCard>
        <AdminCard title="模型 API">
          <div className="adminForm">
            <label>Base URL<input value={llmDraft.base_url} onChange={(e) => setLlmDraft({ ...llmDraft, base_url: e.target.value })} placeholder="https://api.minimaxi.com/v1" /></label>
            <label>模型<input value={llmDraft.model} onChange={(e) => setLlmDraft({ ...llmDraft, model: e.target.value })} placeholder="MiniMax-M3" /></label>
            <label>API Key<input type="password" value={llmDraft.api_key} onChange={(e) => setLlmDraft({ ...llmDraft, api_key: e.target.value })} placeholder={llmConfig?.has_api_key ? `已配置：${llmConfig.api_key_preview}` : "粘贴新的 API Key"} /></label>
            <div className="row"><button className="primary" onClick={() => saveLlmConfig()}><KeyRound size={16} />保存配置</button><button onClick={testLlmConfig}>检查配置</button><button className="danger" onClick={() => saveLlmConfig(true)}>清除 Key</button></div>
            <p className="hint">{llmConfig?.has_api_key ? `当前 Key：${llmConfig.api_key_preview}` : "当前没有可用 API Key"} · {llmConfig?.disabled ? "外部 LLM 已被环境变量禁用" : "外部 LLM 可按配置调用"}</p>
          </div>
        </AdminCard>
        <AdminCard title="用户与角色">
          <table className="userAdminTable"><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.username}</strong><span>{new Date(user.created_at).toLocaleDateString()}</span></td><td><span className="tag">{user.role}</span></td><td><div className="userActions"><button onClick={async () => { await api.updateUserRole(token, user.id, user.role === "admin" ? "student" : "admin"); await loadAll(); }}>切换角色</button><input type="password" value={passwordDrafts[user.id] || ""} onChange={(e) => setPasswordDrafts({ ...passwordDrafts, [user.id]: e.target.value })} placeholder="新密码" /><button onClick={() => resetPassword(user.id)}>改密</button><button onClick={() => logoutUser(user.id)}>注销</button><button className="danger" onClick={() => removeUser(user.id)}><UserX size={15} />删除</button></div></td></tr>)}</tbody></table>
        </AdminCard>
        <AdminCard title="问答对"><div className="sectionHeader"><strong>{qaPairs.length} 条</strong><button onClick={openQAManager}>进入管理</button></div><div className="compactList">{qaPairs.slice(0, 6).map((pair) => <article key={pair.id}><strong>{pair.question}</strong><span>{pair.type} · {pair.quality_status}</span><p>{pair.answer}</p></article>)}</div></AdminCard>
        <AdminCard title="教材文本块"><div className="row"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索文本块" /><button onClick={loadAll}>搜索</button><button className="primary" onClick={rebuild}><Wrench size={16} />重建索引</button></div><div className="compactList">{chunks.map((chunk) => <article key={chunk.id}><strong>{chunk.chapter} · PDF {chunk.pdf_page}</strong><p>{chunk.preview}</p></article>)}</div></AdminCard>
        <AdminCard title="知识点">
          <div className="adminForm">
            {!editingConcept && <input value={conceptDraft.slug} onChange={(e) => setConceptDraft({ ...conceptDraft, slug: e.target.value })} placeholder="slug" />}
            <input value={conceptDraft.name_cn} onChange={(e) => setConceptDraft({ ...conceptDraft, name_cn: e.target.value })} placeholder="中文名称" />
            <input value={conceptDraft.name_en} onChange={(e) => setConceptDraft({ ...conceptDraft, name_en: e.target.value })} placeholder="英文名称" />
            <input value={conceptDraft.aliases} onChange={(e) => setConceptDraft({ ...conceptDraft, aliases: e.target.value })} placeholder="别名，用逗号分隔" />
            <input value={conceptDraft.chapter} onChange={(e) => setConceptDraft({ ...conceptDraft, chapter: e.target.value })} placeholder="章节" />
            <textarea value={conceptDraft.description} onChange={(e) => setConceptDraft({ ...conceptDraft, description: e.target.value })} placeholder="描述" />
            <div className="row"><button className="primary" onClick={saveConcept}>{editingConcept ? "保存知识点" : "新增知识点"}</button>{editingConcept && <button onClick={() => { setEditingConcept(null); setConceptDraft(emptyConceptDraft); }}>取消</button>}</div>
          </div>
          <div className="compactList two">{concepts.slice(0, 80).map((concept) => <article key={concept.id}><strong>{concept.name_cn}</strong><span>{concept.name_en}</span><p>{concept.description}</p><footer><button onClick={() => { setEditingConcept(concept); setConceptDraft({ slug: concept.slug, name_cn: concept.name_cn, name_en: concept.name_en, aliases: concept.aliases.join("，"), chapter: concept.chapter, description: concept.description }); }}>编辑</button><button className="danger" onClick={() => removeConcept(concept.id)}><Trash2 size={15} />删除</button></footer></article>)}</div>
        </AdminCard>
        <AdminCard title="图谱边">
          <div className="adminForm">
            <div className="row">
              <select value={edgeDraft.source_id} onChange={(e) => setEdgeDraft({ ...edgeDraft, source_id: e.target.value })} disabled={Boolean(editingEdge)}><option value="">起点</option>{concepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.name_cn}</option>)}</select>
              <select value={edgeDraft.target_id} onChange={(e) => setEdgeDraft({ ...edgeDraft, target_id: e.target.value })} disabled={Boolean(editingEdge)}><option value="">终点</option>{concepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.name_cn}</option>)}</select>
            </div>
            <input value={edgeDraft.relation_type} onChange={(e) => setEdgeDraft({ ...edgeDraft, relation_type: e.target.value })} placeholder="关系类型" />
            <textarea value={edgeDraft.evidence} onChange={(e) => setEdgeDraft({ ...edgeDraft, evidence: e.target.value })} placeholder="关系证据" />
            <div className="row"><button className="primary" onClick={saveEdge}>{editingEdge ? "保存图谱边" : "新增图谱边"}</button>{editingEdge && <button onClick={() => { setEditingEdge(null); setEdgeDraft(emptyEdgeDraft); }}>取消</button>}</div>
          </div>
          <div className="compactList">{edges.slice(0, 120).map((edge) => <article key={edge.id}><strong>{edge.source_name} --{edge.relation_type}--&gt; {edge.target_name}</strong><p>{edge.evidence}</p><footer><button onClick={() => { setEditingEdge(edge); setEdgeDraft({ source_id: String(edge.source_id), target_id: String(edge.target_id), relation_type: edge.relation_type, evidence: edge.evidence }); }}>编辑</button><button className="danger" onClick={() => removeEdge(edge.id)}><Trash2 size={15} />删除</button></footer></article>)}</div>
        </AdminCard>
        <AdminCard title="历史审计"><div className="compactList">{histories.map((item) => <article key={item.id}><strong>{item.question}</strong><p>{item.answer_summary}</p></article>)}</div></AdminCard>
      </section>
    </div>
  );
}

function AdminCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="adminCard"><h3>{title}</h3>{children}</section>;
}

function GraphCanvas({ graph, onNodeClick }: { graph: Graph; onNodeClick?: (id: number) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const elements = useMemo(() => [
    ...graph.nodes.map((node) => ({ data: { id: String(node.id), label: wrapLabel(node.name_cn), sub: node.name_en } })),
    ...graph.edges.map((edge) => ({ data: { id: `e${edge.id}`, source: String(edge.source_id), target: String(edge.target_id), label: edge.relation_type } }))
  ], [graph]);

  useEffect(() => {
    if (!ref.current) return;
    const cy = cytoscape({
      container: ref.current,
      elements,
      style: [
        { selector: "node", style: { "background-color": "#e1f3f2", "border-color": "#1f6f8b", "border-width": "2px", label: "data(label)", "font-size": "12px", color: "#123044", "text-wrap": "wrap", "text-max-width": "96px", "text-valign": "center", "text-halign": "center", width: "104px", height: "58px", "overlay-opacity": 0 } },
        { selector: "edge", style: { width: "1.7px", "line-color": "#8aa5b2", "target-arrow-color": "#8aa5b2", "target-arrow-shape": "triangle", "curve-style": "bezier", "text-opacity": 0 } }
      ],
      layout: { name: "cose", animate: false, nodeRepulsion: 18000, idealEdgeLength: 160, nodeOverlap: 24, componentSpacing: 120, fit: true, padding: 58 }
    });
    cy.on("tap", "node", (event) => onNodeClick?.(Number(event.target.id())));
    return () => cy.destroy();
  }, [elements, onNodeClick]);

  if (graph.nodes.length === 0) return <div className="emptyState">没有可展示的知识图谱子图。</div>;
  return <div className="graphCanvas" ref={ref} />;
}

function wrapLabel(label: string) {
  return label.length > 6 ? `${label.slice(0, 4)}\n${label.slice(4)}` : label;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}

createRoot(document.getElementById("root")!).render(<App />);
