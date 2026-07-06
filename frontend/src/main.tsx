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
  ChevronDown,
  ChevronUp,
  CircleUserRound,
  Clock3,
  Database,
  GitBranch,
  Heart,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  MessageSquareText,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserX,
  Wrench,
  X
} from "lucide-react";
import { api, ApiError } from "./api";
import type { AskResponse, ChatConversation, ChatMessage, Concept, Graph, GraphEdge, HistoryItem, LlmConfig, QAPair, ReferenceBook, SystemStats, TextChunk, UserRecord } from "./types";

/* ── 来源原文模态框 ── */
function SourceModal({ chunkId, token, onClose }: { chunkId: string; token: string; onClose: () => void }) {
  const [chunk, setChunk] = useState<TextChunk | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.chunkDetail(token, chunkId)
      .then((data) => { if (!cancelled) setChunk(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "加载失败"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [chunkId, token]);

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalContent" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h3>来源原文</h3>
          <button className="iconBtn" onClick={onClose} title="关闭"><X size={18} /></button>
        </div>
        {loading && <div className="emptyState small">加载中...</div>}
        {error && <p className="error">{error}</p>}
        {chunk && (
          <div className="modalBody">
            <div className="sourceMeta">
              <span className="tag">{chunk.chapter}</span>
              {chunk.section && <span className="tag muted">{chunk.section}</span>}
              <span className="tag muted">PDF 第 {chunk.pdf_page} 页</span>
            </div>
            <div className="sourceFullText">
              {chunk.preview}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 可展开来源卡片 ── */
function SourceCard({ source, token, index }: { source: AskResponse["sources"][number]; token: string; index: number }) {
  const [expanded, setExpanded] = useState(index === 0);
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="sourceCard">
        <div className="sourceCardHeader">
          <strong>{source.chapter}</strong>
          <span>PDF 第 {source.pdf_page} 页 · 相关度 {source.score}</span>
        </div>
        <div className="sourceCardActions">
          <button
            className="textBtn"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "收起" : "展开"}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? "收起" : "展开"}
          </button>
          <button className="textBtn" onClick={() => setShowModal(true)}>
            查看完整原文
          </button>
        </div>
        <div className={`sourceCardBody ${expanded ? "open" : ""}`}>
          <p>{source.summary || source.snippet}</p>
        </div>
      </div>
      {showModal && <SourceModal chunkId={source.chunk_id} token={token} onClose={() => setShowModal(false)} />}
    </>
  );
}
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

  useEffect(() => {
    const handler = () => {
      // token 失效：清状态 + 提示用户
      setToken("");
      setUsername("");
      setRole("student");
      localStorage.removeItem("qa_token");
      localStorage.removeItem("qa_username");
      localStorage.removeItem("qa_role");
      setToast("登录已失效，请重新登录");
    };
    window.addEventListener("auth:unauthorized", handler);
    return () => window.removeEventListener("auth:unauthorized", handler);
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
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}><NotebookPen size={18} />我的笔记</button>
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("qa_ask_sidebar_collapsed") === "1";
  });
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [favorites, setFavorites] = useState<HistoryItem[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showFullThread, setShowFullThread] = useState(false);
  const [favoritedIds, setFavoritedIds] = useState<Set<number>>(new Set());
  // 防止同一 message 重复点击收藏按钮触发并发 API
  const favoriteInflightRef = useRef<Set<number>>(new Set());

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("qa_ask_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }

  async function loadConversations(nextId = conversationId) {
    try {
      const items = await api.conversations(token);
      setConversations(items);
      if (nextId) await openConversation(nextId, false);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        setConversations([]);
        setToast(err instanceof Error ? err.message : "加载会话失败");
      }
    }
  }

  async function loadFavorites() {
    try {
      const data = await api.favorites(token);
      setFavorites(data);
      setFavoritedIds(new Set(data.map((f) => f.message_id).filter((id): id is number => id != null)));
    } catch (err) {
      // 401 由 api.request 统一处理；其他错误仅提示，不动 favoritedIds（保留乐观更新）
      if (!(err instanceof ApiError && err.status === 401)) {
        setToast(err instanceof Error ? err.message : "加载收藏失败");
      }
    }
  }

  async function toggleMessageFavorite(message: ChatMessage, e: React.MouseEvent) {
    e.stopPropagation();
    if (favoriteInflightRef.current.has(message.id)) return;
    favoriteInflightRef.current.add(message.id);
    try {
      const result = await fetchHistoryIdForMessage(message);
      if (result == null) {
        setToast("该消息没有可收藏的历史记录");
        return;
      }
      const res = await api.toggleFavorite(token, result);
      setFavoritedIds((prev) => {
        const next = new Set(prev);
        if (res.favorited) next.add(message.id);
        else next.delete(message.id);
        return next;
      });
      // 实时同步侧栏收藏夹列表：取消时立即移除，新增时刷新整个列表（数量小，开销可忽略）
      if (res.favorited) {
        loadFavorites();
      } else {
        setFavorites((prev) => prev.filter((f) => f.message_id !== message.id));
      }
      setToast(res.favorited ? "已加入收藏" : "已取消收藏");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "收藏操作失败");
    } finally {
      favoriteInflightRef.current.delete(message.id);
    }
  }

  // 缓存 history 列表（按 message_id 建索引），避免每次收藏都线性扫描
  const historyCacheRef = useRef<{ index: Map<number, number>; fetchedAt: number } | null>(null);
  async function fetchHistoryIdForMessage(message: ChatMessage): Promise<number | null> {
    try {
      const now = Date.now();
      if (!historyCacheRef.current || now - historyCacheRef.current.fetchedAt > 30000) {
        const items = await api.history(token);
        const index = new Map<number, number>();
        for (const item of items) {
          if (item.message_id != null) index.set(item.message_id, item.id);
        }
        historyCacheRef.current = { index, fetchedAt: now };
      }
      return historyCacheRef.current.index.get(message.id) ?? null;
    } catch {
      return null;
    }
  }

  // 打开会话时刷新缓存
  async function openConversation(id: number, refreshList = true) {
    try {
      const detail = await api.conversation(token, id);
      setConversationId(detail.id);
      setMessages(detail.messages);
      const lastAssistant = [...detail.messages].reverse().find((item) => item.role === "assistant");
      setActiveMessageId(lastAssistant?.id ?? null);
      if (refreshList) setConversations(await api.conversations(token));
      setShowFavorites(false);
      setShowFullThread(false);
      // 切换会话时清缓存，避免切换后 history 列表过期
      historyCacheRef.current = null;
    } catch (err) {
      setToast(err instanceof Error ? err.message : "打开会话失败");
    }
  }

  async function openFavorite(item: HistoryItem) {
    if (item.conversation_id == null) {
      setToast("该收藏没有关联的会话，无法打开");
      return;
    }
    try {
      const detail = await api.conversation(token, item.conversation_id);
      setConversationId(detail.id);
      setMessages(detail.messages);
      const target = detail.messages.find((m) => m.id === item.message_id) ||
        [...detail.messages].reverse().find((m) => m.role === "assistant");
      setActiveMessageId(target?.id ?? null);
      setShowFavorites(false);
      setShowFullThread(false);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "打开收藏失败");
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

  async function newConversation() {
    setConversationId(null);
    setMessages([]);
    setActiveMessageId(null);
    setQuestion("");
    setShowFullThread(false);
    setShowFavorites(false);
    setSidebarQuery("");
    historyCacheRef.current = null;
  }

  const askInFlightRef = useRef(0);

  async function ask(q = question) {
    if (!q.trim()) return;
    setQuestion(q);
    setLoading(true);
    const requestId = ++askInFlightRef.current;
    try {
      const result = await api.ask(q, token, conversationId);
      // 只接受最新一次请求的结果，避免旧请求覆盖新状态
      if (requestId !== askInFlightRef.current) return;
      setConversationId(result.conversation_id);
      setActiveMessageId(result.message_id);
      await loadConversations(result.conversation_id);
    } catch (err) {
      if (requestId === askInFlightRef.current) {
        setToast(err instanceof Error ? err.message : "问答失败");
      }
    } finally {
      if (requestId === askInFlightRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadConversations().catch(() => setConversations([]));
    loadFavorites().catch(() => setFavorites([]));
  }, []);

  const assistantMessages = messages.filter((item) => item.role === "assistant");
  const activeAssistant: ChatMessage | null =
    assistantMessages.find((item) => item.id === activeMessageId) ||
    (assistantMessages.length ? assistantMessages[assistantMessages.length - 1] : null);
  const canShowEvidence = activeAssistant?.status === "answered" || activeAssistant?.status === "llm_error";

  // 会话列表按时间分组（今天 / 昨天 / 本周 / 更早）
  const filteredConversations = conversations.filter((c) => {
    if (!sidebarQuery.trim()) return true;
    return c.title.toLowerCase().includes(sidebarQuery.toLowerCase());
  });
  const grouped = groupByDate(filteredConversations);

  return (
    <div className="workspace">
      <section className="topBand">
        <div>
          <h2>问答工作台</h2>
          <p>支持连续追问；每轮回答都会独立刷新来源、推荐问题和知识图谱，不会沿用旧证据。</p>
        </div>
        <div className="row">
          <button className="danger" onClick={deleteCurrentConversation} disabled={!conversationId}><Trash2 size={16} />删除会话</button>
        </div>
      </section>
      <div className="askShell" data-collapsed={sidebarCollapsed ? "1" : "0"}>
        <aside className="askSidebar">
          <div className="askSidebarTop">
            <button className="primary newChatBtn" onClick={newConversation}>
              <Plus size={16} />新建会话
            </button>
            <button className="iconBtn" onClick={toggleSidebar} title="收起侧边栏" aria-label="收起侧边栏">
              <PanelLeftClose size={16} />
            </button>
          </div>
          <div className="searchInput">
            <Search size={16} />
            <input
              value={sidebarQuery}
              onChange={(e) => setSidebarQuery(e.target.value)}
              placeholder="搜索会话"
            />
          </div>

          {showFavorites ? (
            <FavoritesView
              favorites={favorites}
              onOpen={openFavorite}
              onBack={() => setShowFavorites(false)}
              sidebarQuery={sidebarQuery}
            />
          ) : (
            <div className="sidebarScroll">
              <div className="sidebarGroup">
                <button className="favoritesEntry" onClick={() => setShowFavorites(true)}>
                  <Heart size={14} />
                  <span>收藏夹</span>
                  <small>{favorites.length}</small>
                </button>
              </div>

              {filteredConversations.length === 0 && (
                <div className="emptyState small">{sidebarQuery ? "没有匹配的会话" : "还没有会话"}</div>
              )}

              {grouped.map((group) => (
                <div key={group.label} className="sidebarGroup">
                  <div className="sidebarGroupLabel">{group.label}</div>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      className={`sidebarConvItem ${item.id === conversationId ? "active" : ""}`}
                      onClick={() => openConversation(item.id)}
                      title={item.title}
                    >
                      <span className="sidebarConvTitle">{item.title}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </aside>

        <div className="askMain">
          {sidebarCollapsed && (
            <button className="iconBtn sidebarToggleFloat" onClick={toggleSidebar} title="展开侧边栏" aria-label="展开侧边栏">
              <PanelLeftOpen size={18} />
            </button>
          )}

          {/* 对话消息流：只显示用户提问序列，AI 完整回答在下方详情区 */}
          {(() => {
            const userMessages = messages.filter((m) => m.role === "user");
            const defaultVisibleCount = userMessages.length <= 1 ? userMessages.length : 1;
            const visibleUsers = showFullThread
              ? userMessages
              : userMessages.slice(-defaultVisibleCount);
            const hiddenCount = userMessages.length - visibleUsers.length;
            return (
              <section className="messageThread compact">
                {userMessages.length === 0 && (
                  <div className="emptyState small">
                    开始提问后，会显示最近的问题。
                  </div>
                )}
                {visibleUsers.map((message) => (
                  <article
                    key={message.id}
                    className={`chatBubble user`}
                    onClick={() => {
                      // 点击用户问题时，定位到该问题对应的 assistant 回答
                      const idx = messages.findIndex((m) => m.id === message.id);
                      if (idx < 0) return;
                      const nextAssistant = messages.slice(idx).find((m) => m.role === "assistant");
                      if (nextAssistant) {
                        setActiveMessageId(nextAssistant.id);
                      } else {
                        // 该问题无 assistant 回答（可能 LLM 失败或还在生成中）
                        setToast("该问题暂无回答");
                      }
                    }}
                  >
                    <header>
                      <strong>你</strong>
                      <time>{new Date(message.created_at).toLocaleTimeString()}</time>
                    </header>
                    <p>{message.content}</p>
                  </article>
                ))}
                {hiddenCount > 0 && (
                  <button className="textBtn threadToggle" onClick={() => setShowFullThread((v) => !v)}>
                    {showFullThread ? (
                      <><ChevronUp size={14} />收起历史提问（共 {userMessages.length} 条）</>
                    ) : (
                      <><ChevronDown size={14} />展开历史提问（还有 {hiddenCount} 条）</>
                    )}
                  </button>
                )}
              </section>
            );
          })()}

          {/* 当前轮次详情：来源、图谱、推荐问题（核心展示区） */}
          {activeAssistant && (
            <div className={`answerShell ${!canShowEvidence ? "single" : ""}`}>
              <section className="answerPanel">
                <div className="panelHeader">
                  <h3>当前轮次详情</h3>
                  <div className="panelHeaderRight">
                    <button
                      className={`iconBtn favoriteBtnInline ${favoritedIds.has(activeAssistant.id) ? "favorited" : ""}`}
                      onClick={(e) => toggleMessageFavorite(activeAssistant, e)}
                      title={favoritedIds.has(activeAssistant.id) ? "取消收藏" : "收藏这条回答"}
                      aria-label={favoritedIds.has(activeAssistant.id) ? "取消收藏" : "收藏这条回答"}
                    >
                      <Heart size={16} fill={favoritedIds.has(activeAssistant.id) ? "currentColor" : "none"} />
                    </button>
                    <StatusBadge result={activeAssistant} />
                  </div>
                </div>
                <MarkdownBlock content={activeAssistant.content} />
                {activeAssistant.status === "llm_error" && (
                  <p className="warning">外部 LLM 调用失败，当前展示本地证据降级回答。</p>
                )}
                <PerformanceStrip message={activeAssistant} />
              </section>
              {canShowEvidence && (
                <section className="sidePanel">
                  <h3>来源</h3>
                  <div className="sourceList">
                    {activeAssistant.sources.map((source, index) => (
                      <SourceCard key={source.chunk_id} source={source} token={token} index={index} />
                    ))}
                  </div>
                  {activeAssistant.related_questions.length > 0 && <h3>相关问题</h3>}
                  <div className="stackButtons">
                    {activeAssistant.related_questions.map((item) => (
                      <button key={item} onClick={() => ask(item)}>{item}</button>
                    ))}
                  </div>
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

          {/* 输入框（ChatGPT 风格固定在底部） */}
          <section className="askBox elevated">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask();
              }}
              placeholder="向智能助教提问…(Ctrl/⌘ + Enter 发送)"
            />
            <div className="askActions">
              <div className="chips">
                {sampleQuestions.map((item) => (
                  <button key={item} onClick={() => ask(item)}>{item}</button>
                ))}
              </div>
              <button className="primary askButton" onClick={() => ask()} disabled={loading}>
                <Send size={18} />{loading ? "生成中" : "提问"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ── 会话列表按时间分组 ── */
function groupByDate(items: ChatConversation[]): { label: string; items: ChatConversation[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: Record<string, ChatConversation[]> = { 今天: [], 昨天: [], 本周: [], 更早: [] };
  items.forEach((item) => {
    const d = new Date(item.updated_at);
    if (d >= today) groups["今天"].push(item);
    else if (d >= yesterday) groups["昨天"].push(item);
    else if (d >= weekAgo) groups["本周"].push(item);
    else groups["更早"].push(item);
  });

  return Object.entries(groups)
    .filter(([, arr]) => arr.length > 0)
    .map(([label, items]) => ({ label, items }));
}

/* ── 收藏夹视图（合并自原 HistoryView）── */
function FavoritesView({
  favorites,
  onOpen,
  onBack,
  sidebarQuery
}: {
  favorites: HistoryItem[];
  onOpen: (item: HistoryItem) => void;
  onBack: () => void;
  sidebarQuery: string;
}) {
  const filtered = favorites.filter((f) => {
    if (!sidebarQuery.trim()) return true;
    return f.question.toLowerCase().includes(sidebarQuery.toLowerCase());
  });

  return (
    <div className="sidebarScroll">
      <div className="sidebarGroup">
        <button className="favoritesEntry" onClick={onBack}>
          <ChevronDown size={14} style={{ transform: "rotate(-90deg)" }} />
          <span>返回会话列表</span>
        </button>
        <div className="sidebarGroupLabel">收藏夹</div>
        {filtered.length === 0 && (
          <div className="emptyState small">{sidebarQuery ? "没有匹配的收藏" : "还没有收藏任何回答"}</div>
        )}
        {filtered.map((item) => (
          <button
            key={item.id}
            className="sidebarConvItem"
            onClick={() => onOpen(item)}
            title={item.question}
          >
            <span className="sidebarConvTitle">{item.question}</span>
            <Heart size={12} fill="currentColor" style={{ color: "var(--danger)", flexShrink: 0 }} />
          </button>
        ))}
      </div>
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<QAPair | null>(null);
  const [draft, setDraft] = useState({ question: "", answer: "", type: "概念解释", quality_status: "已校对" });

  async function load(nextPage = page) {
    try {
      const result = await api.qaPairsPage(token, { q: query, type: type || undefined, page: nextPage, page_size: pageSize });
      setPairs(result.items);
      setTotal(result.total);
      setPage(result.page);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "加载问答对失败");
    }
  }

  useEffect(() => { load(1); }, [pageSize]);

  async function save() {
    try {
      if (editing) await api.updateQaPair(token, editing.id, draft);
      else await api.createQaPair(token, { ...draft, concept_ids: [], source_refs: [] });
      setEditing(null);
      setDraft({ question: "", answer: "", type: "概念解释", quality_status: "已校对" });
      await load(page);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function remove(id: number) {
    try {
      await api.deleteQaPair(token, id);
      await load(page);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "删除失败");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  function search() {
    load(1);
  }

  return (
    <div className="workspace">
      <section className="topBand"><div><h2>问答对管理</h2><p>维护课程问答对，普通用户可用于课程数据管理演示。</p></div></section>
      <section className="toolbar">
        <div className="searchInput"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索问题或答案" /></div>
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="">全部类型</option><option>概念解释</option><option>关系查询</option><option>应用场景</option></select>
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}><option value={10}>每页 10 条</option><option value={20}>每页 20 条</option><option value={25}>每页 25 条</option></select>
        <button onClick={search}><Search size={17} />查询</button>
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
      <section className="paginationBar">
        <span>共 {total} 条 · 第 {page} / {totalPages} 页</span>
        <div className="row compact">
          <button onClick={() => load(page - 1)} disabled={page <= 1}>上一页</button>
          <button onClick={() => load(page + 1)} disabled={page >= totalPages}>下一页</button>
        </div>
      </section>
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
  const [noteContent, setNoteContent] = useState("");
  const [noteLoaded, setNoteLoaded] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"favorites" | "all">("favorites");

  async function load() {
    try {
      const data = tab === "favorites" ? await api.favorites(token) : await api.history(token);
      setItems(data);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "加载历史失败");
    }
  }

  useEffect(() => { load(); }, [tab]);

  // 选中条目时加载对应笔记
  useEffect(() => {
    if (!selected) {
      setNoteContent("");
      setNoteLoaded(false);
      return;
    }
    setNoteLoaded(false);
    api.getNote(token, selected.id)
      .then((note) => {
        setNoteContent(note?.content ?? "");
        setNoteLoaded(true);
      })
      .catch(() => {
        setNoteContent("");
        setNoteLoaded(true);
      });
  }, [selected?.id, token]);

  async function saveNote() {
    if (!selected) return;
    setNoteSaving(true);
    try {
      await api.saveNote(token, selected.id, noteContent);
      setToast("笔记已保存");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "保存笔记失败");
    } finally {
      setNoteSaving(false);
    }
  }

  async function unfavorite(item: HistoryItem, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await api.toggleFavorite(token, item.id);
      if (tab === "favorites") {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      } else {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, favorited: false } : i)));
      }
      if (selected?.id === item.id) setSelected(null);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "取消收藏失败");
    }
  }

  async function favorite(item: HistoryItem, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const res = await api.toggleFavorite(token, item.id);
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, favorited: res.favorited } : i)));
    } catch (err) {
      setToast(err instanceof Error ? err.message : "收藏失败");
    }
  }

  async function clearAll() {
    if (!confirm("确认清空所有历史？此操作不可恢复。")) return;
    try {
      await api.clearHistory(token);
      setSelected(null);
      await load();
      setToast("已清空历史");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "清空失败");
    }
  }

  const filtered = items.filter((item) => {
    if (!query.trim()) return true;
    return item.question.toLowerCase().includes(query.toLowerCase()) ||
      item.answer_summary.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div className="workspace">
      <section className="topBand">
        <div>
          <h2>我的笔记</h2>
          <p>{tab === "favorites" ? "查看收藏的回答并编辑学习笔记。" : "查看所有历史提问，可一键收藏感兴趣的条目。"}</p>
        </div>
        <div className="row">
          <div className="segmented">
            <button className={tab === "favorites" ? "active" : ""} onClick={() => setTab("favorites")}>
              <Heart size={14} />收藏
            </button>
            <button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>
              <Clock3 size={14} />全部历史
            </button>
          </div>
          {tab === "all" && (
            <button className="danger" onClick={clearAll}><Trash2 size={17} />清空</button>
          )}
          <div className="searchInput" style={{ maxWidth: 220 }}>
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "favorites" ? "搜索收藏" : "搜索历史"}
            />
          </div>
        </div>
      </section>
      <section className="historyLayout">
        <div className="historyList">
          {filtered.length === 0 && (
            <div className="emptyState small">
              {items.length === 0
                ? (tab === "favorites" ? "还没有收藏任何回答。在问答页点击回答旁的爱心即可收藏。" : "还没有任何提问记录。")
                : "没有匹配的记录"}
            </div>
          )}
          {filtered.map((item) => (
            <article
              key={item.id}
              className={selected?.id === item.id ? "active" : ""}
              onClick={() => setSelected(item)}
            >
              <div className="historyActions">
                <time>{new Date(item.created_at).toLocaleString()}</time>
                <button
                  className={`favoriteBtn ${item.favorited ? "favorited" : ""}`}
                  onClick={(e) => (item.favorited ? unfavorite(item, e) : favorite(item, e))}
                  title={item.favorited ? "取消收藏" : "收藏"}
                >
                  <Heart size={16} fill={item.favorited ? "currentColor" : "none"} />
                </button>
              </div>
              <h3>{item.question}</h3>
              <p>{item.answer_summary}</p>
            </article>
          ))}
        </div>
        <aside className="historyDetail">
          {!selected && (
            <div className="emptyState">
              {tab === "favorites" ? "选择一条收藏查看完整回答并编辑笔记。" : "选择一条历史查看完整回答。"}
            </div>
          )}
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
                      <div className="sourceCardHeader">
                        <strong>{String(source["chapter"] || "教材来源")}</strong>
                        <span>PDF 第 {String(source["pdf_page"] || "-")} 页</span>
                      </div>
                    </summary>
                    <p>{String(source["summary"] || source["snippet"] || "")}</p>
                  </details>
                ))}
              </div>
              {tab === "favorites" && (
                <>
                  <h3>我的笔记</h3>
                  {noteLoaded ? (
                    <>
                      <textarea
                        className="noteEditor"
                        value={noteContent}
                        onChange={(e) => setNoteContent(e.target.value)}
                        placeholder="写下你的学习心得、疑问或延伸思考…"
                      />
                      <div className="row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
                        <span style={{ color: "var(--muted)", fontSize: 12, marginRight: "auto" }}>
                          {noteContent.length} 字
                        </span>
                        <button className="primary" onClick={saveNote} disabled={noteSaving}>
                          {noteSaving ? "保存中" : "保存笔记"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="emptyState small">加载笔记中…</div>
                  )}
                </>
              )}
            </>
          )}
        </aside>
      </section>
    </div>
  );
}

const emptyConceptDraft = { slug: "", name_cn: "", name_en: "", aliases: "", chapter: "", description: "" };
const emptyEdgeDraft = { source_id: "", target_id: "", relation_type: "相关", evidence: "" };
type AdminView = "overview" | "books" | "users" | "model" | "qa" | "chunks" | "concepts" | "edges" | "histories";

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
  const [adminView, setAdminView] = useState<AdminView>("overview");
  const [books, setBooks] = useState<ReferenceBook[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  async function loadAll() {
    try {
      const [nextStats, nextUsers, nextConcepts, nextEdges, nextChunks, nextQAPairs, nextHistories, nextLlmConfig, nextBooks] = await Promise.all([
        api.stats(),
        api.adminUsers(token),
        api.concepts(token),
        api.adminEdges(token),
        api.adminChunks(token, query),
        api.qaPairs(token),
        api.adminHistories(token),
        api.llmConfig(token),
        api.referenceBooks(token)
      ]);
      setStats(nextStats);
      setUsers(nextUsers);
      setConcepts(nextConcepts);
      setEdges(nextEdges);
      setChunks(nextChunks);
      setQaPairs(nextQAPairs);
      setHistories(nextHistories);
      setLlmConfig(nextLlmConfig);
      setBooks(nextBooks);
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

  async function uploadBook() {
    if (!uploadFile) {
      setToast("请选择 PDF 文件");
      return;
    }
    try {
      await api.uploadReferenceBook(token, uploadFile);
      setUploadFile(null);
      setToast("参考书已上传，可在确认后设为当前教材并重建索引");
      await loadAll();
      reloadStats();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "上传参考书失败");
    }
  }

  async function activateBook(id: number) {
    try {
      await api.activateReferenceBook(token, id);
      setToast("当前参考书已切换");
      await loadAll();
      reloadStats();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "切换参考书失败");
    }
  }

  async function rebuildBook(id: number) {
    try {
      const result = await api.rebuildReferenceBook(token, id);
      setToast(`索引重建完成：${result.chunk_count} 个文本块，向量索引${result.vector_index_ready ? "可用" : "未就绪"}`);
      await loadAll();
      reloadStats();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "重建参考书索引失败");
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
      <section className="topBand">
        <div><h2>管理后台</h2><p>管理员可审计用户、数据资产、知识图谱、文本块和提问历史。</p></div>
        <button className="primary" onClick={loadAll}><LayoutDashboard size={17} />刷新</button>
      </section>
      <section className="adminTabs">
        {[
          ["overview", "总览"],
          ["books", "教材与索引"],
          ["users", "用户与权限"],
          ["model", "模型 API"],
          ["qa", "问答对"],
          ["chunks", "文本块"],
          ["concepts", "知识点"],
          ["edges", "图谱边"],
          ["histories", "历史审计"]
        ].map(([view, label]) => (
          <button key={view} className={adminView === view ? "active" : ""} onClick={() => setAdminView(view as AdminView)}>{label}</button>
        ))}
      </section>

      {adminView === "overview" && (
        <section className="adminGrid compact">
          <button className="metricButton" onClick={() => setAdminView("concepts")}><Metric label="知识点" value={stats?.concepts ?? "-"} /></button>
          <button className="metricButton" onClick={() => setAdminView("edges")}><Metric label="图谱边" value={stats?.graph_edges ?? "-"} /></button>
          <button className="metricButton" onClick={() => setAdminView("qa")}><Metric label="问答对" value={stats?.qa_pairs ?? "-"} /></button>
          <button className="metricButton" onClick={() => setAdminView("chunks")}><Metric label="文本块" value={stats?.text_chunks ?? "-"} /></button>
          <button className="metricButton" onClick={() => setAdminView("model")}><Metric label="LLM" value={stats?.llm_configured ? "已配置" : "未配置"} /></button>
          <button className="metricButton" onClick={() => setAdminView("books")}><Metric label="教材" value={stats?.active_book ? "已配置" : (stats?.pdf_available ? "可用" : "缺失")} /></button>
          <AdminCard title="当前索引状态">
            <div className="statusRows">
              <span>检索模式<strong>{stats?.retrieval_mode ?? "-"}</strong></span>
              <span>向量索引<strong>{stats?.vector_index_ready ? "可用" : "未就绪"}</strong></span>
              <span>索引状态<strong>{stats?.index_status ?? "-"}</strong></span>
              <span>当前教材<strong>{shortFileName(stats?.active_book?.filename ?? "未设置")}</strong></span>
            </div>
          </AdminCard>
        </section>
      )}

      {adminView === "books" && (
        <AdminCard title="教材与索引">
          <div className="adminForm">
            <label>上传新的 PDF 参考书<input type="file" accept="application/pdf,.pdf" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} /></label>
            <div className="row"><button className="primary" onClick={uploadBook}>上传参考书</button><button onClick={() => loadAll()}>刷新状态</button></div>
            <p className="hint">上传文件保存在服务器运行数据目录，不会进入 Git。切换参考书后需要重建索引。</p>
          </div>
          <div className="tableWrap">
            <table className="adminTable">
              <thead><tr><th>参考书</th><th>状态</th><th>文本块</th><th>向量模式</th><th>操作</th></tr></thead>
              <tbody>{books.map((book) => <tr key={book.id}><td><strong>{book.display_name}</strong><span>{book.filename}</span></td><td><span className={book.index_status === "ready" ? "tag" : "tag muted"}>{book.is_active ? "当前" : book.index_status}</span>{book.index_error && <p className="error">{book.index_error}</p>}</td><td>{book.chunk_count}</td><td>{book.retrieval_mode}</td><td><div className="row compact">{!book.is_active && <button onClick={() => activateBook(book.id)}>设为当前</button>}<button className="primary" onClick={() => rebuildBook(book.id)}><Wrench size={16} />重建</button></div></td></tr>)}</tbody>
            </table>
          </div>
        </AdminCard>
      )}

      {adminView === "model" && (
        <AdminCard title="模型 API">
          <div className="adminForm">
            <label>Base URL<input value={llmDraft.base_url} onChange={(e) => setLlmDraft({ ...llmDraft, base_url: e.target.value })} placeholder="https://api.minimaxi.com/v1" /></label>
            <label>模型<input value={llmDraft.model} onChange={(e) => setLlmDraft({ ...llmDraft, model: e.target.value })} placeholder="MiniMax-M3" /></label>
            <label>API Key<input type="password" value={llmDraft.api_key} onChange={(e) => setLlmDraft({ ...llmDraft, api_key: e.target.value })} placeholder={llmConfig?.has_api_key ? `已配置：${llmConfig.api_key_preview}` : "粘贴新的 API Key"} /></label>
            <div className="row"><button className="primary" onClick={() => saveLlmConfig()}><KeyRound size={16} />保存配置</button><button onClick={testLlmConfig}>检查配置</button><button className="danger" onClick={() => saveLlmConfig(true)}>清除 Key</button></div>
            <p className="hint">{llmConfig?.has_api_key ? `当前 Key：${llmConfig.api_key_preview}` : "当前没有可用 API Key"} · {llmConfig?.disabled ? "外部 LLM 已被环境变量禁用" : "外部 LLM 可按配置调用"}</p>
          </div>
        </AdminCard>
      )}

      {adminView === "users" && (
        <AdminCard title="用户与角色">
          <div className="tableWrap"><table className="userAdminTable"><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.username}</strong><span>{new Date(user.created_at).toLocaleDateString()}</span></td><td><span className="tag">{user.role}</span></td><td><div className="userActions"><button onClick={async () => { await api.updateUserRole(token, user.id, user.role === "admin" ? "student" : "admin"); await loadAll(); }}>切换角色</button><input type="password" value={passwordDrafts[user.id] || ""} onChange={(e) => setPasswordDrafts({ ...passwordDrafts, [user.id]: e.target.value })} placeholder="新密码" /><button onClick={() => resetPassword(user.id)}>改密</button><button onClick={() => logoutUser(user.id)}>注销</button><button className="danger" onClick={() => removeUser(user.id)}><UserX size={15} />删除</button></div></td></tr>)}</tbody></table></div>
        </AdminCard>
      )}

      {adminView === "qa" && (
        <AdminCard title="问答对"><div className="sectionHeader"><strong>{qaPairs.length} 条</strong><button onClick={openQAManager}>进入分页管理</button></div><div className="compactList">{qaPairs.slice(0, 8).map((pair) => <article key={pair.id}><strong>{pair.question}</strong><span>{pair.type} · {pair.quality_status}</span><p>{pair.answer}</p></article>)}</div></AdminCard>
      )}

      {adminView === "chunks" && (
        <AdminCard title="教材文本块"><div className="row"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索文本块" /><button onClick={loadAll}>搜索</button><button className="primary" onClick={rebuild}><Wrench size={16} />重建索引</button></div><div className="compactList">{chunks.map((chunk) => <article key={chunk.id}><strong>{chunk.chapter} · PDF {chunk.pdf_page}</strong><p>{chunk.preview}</p></article>)}</div></AdminCard>
      )}

      {adminView === "concepts" && (
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
      )}

      {adminView === "edges" && (
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
      )}

      {adminView === "histories" && (
        <AdminCard title="历史审计"><div className="compactList">{histories.map((item) => <article key={item.id}><strong>{item.question}</strong><p>{item.answer_summary}</p></article>)}</div></AdminCard>
      )}
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

function shortFileName(name: string) {
  if (name.length <= 26) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  return `${name.slice(0, 18)}...${name.slice(Math.max(dot - 4, 18), dot)}${ext}`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}

createRoot(document.getElementById("root")!).render(<App />);
