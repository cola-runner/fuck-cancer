import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';

interface Reference {
  sourceId: string;
  citationNumber?: number;
  citedText?: string | null;
  score?: number;
  fileName?: string | null;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  references?: Reference[] | null;
  createdAt: string;
}

const SUGGESTED = [
  '这些药一起吃安全吗？',
  '有哪些常见副作用？',
  '饮食上要注意什么？',
];

function requestErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return '发送失败，请稍后重试。';
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadChat = useCallback(async () => {
    try {
      const [chatRes, settingsRes] = await Promise.all([
        api.get(`/cases/${id}/chat`),
        api.get('/settings').catch(() => ({ data: { notebooklm: { connected: false } } })),
      ]);
      setMessages(chatRes.data.messages || []);
      setConnected(!!settingsRes.data.notebooklm?.connected);
    } catch (err) {
      console.error('Failed to load chat:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadChat(); }, [loadChat]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const userMessage: Message = { id: `temp-${Date.now()}`, role: 'user', content: trimmed, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSendError('');
    setSending(true);
    try {
      const { data } = await api.post(`/cases/${id}/chat`, { message: trimmed });
      setMessages((prev) => [...prev.filter((m) => m.id !== userMessage.id), data.userMessage, data.assistantMessage]);
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages((prev) => prev.filter((message) => message.id !== userMessage.id));
      setInput(trimmed);
      setSendError(requestErrorMessage(err));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const disabled = !connected;

  return (
    <div className="h-dvh flex flex-col">
      {/* Top bar */}
      <div className="flex-shrink-0" style={{ background: 'rgba(244,238,230,0.86)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--line)' }}>
        <div className="mx-auto flex items-center" style={{ maxWidth: 720, padding: '0 18px', height: 60, gap: 12 }}>
          <button onClick={() => navigate(`/cases/${id}`)} className="fc-iconbtn" aria-label="返回" style={{ color: 'var(--ink)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <h1 className="fc-display" lang="zh" style={{ fontSize: 17, color: 'var(--ink)' }}>问问 AI</h1>
            <div className="fc-faint" lang="zh" style={{ fontSize: 12 }}>基于该病例的资料回答</div>
          </div>
        </div>
      </div>

      {/* Connection banner */}
      {!connected && (
        <div className="mx-auto w-full" style={{ maxWidth: 720, padding: '12px 18px 0' }}>
          <div className="flex items-center justify-between" style={{ background: 'var(--amber-tint)', borderRadius: 14, padding: '11px 14px' }}>
            <span lang="zh" style={{ fontSize: 13.5, color: 'var(--amber)' }}>NotebookLM 未连接，问答暂不可用</span>
            <button onClick={() => navigate('/settings')} lang="zh" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--amber)', background: 'none', border: 'none', cursor: 'pointer' }}>前往设置</button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex flex-col" style={{ maxWidth: 720, padding: '18px', gap: 18 }}>
          {loading ? (
            <div className="flex justify-center" style={{ padding: '80px 0' }}>
              <div className="fc-spin" style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid var(--sage)', borderTopColor: 'transparent' }} />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center" style={{ padding: '64px 0 28px' }}>
              <div className="mx-auto flex items-center justify-center" style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--sage-tint)', color: 'var(--sage-strong)', marginBottom: 16 }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.9L18.8 9.7 13.8 11.5 12 16.4 10.2 11.5 5.2 9.7 10.2 7.9z" /></svg>
              </div>
              <h3 className="fc-display" lang="zh" style={{ fontSize: 19, color: 'var(--ink)', marginBottom: 6 }}>有什么想了解的？</h3>
              <p className="fc-muted" lang="zh" style={{ fontSize: 14.5, maxWidth: 300, margin: '0 auto' }}>我会基于这个病例的资料回答，并附上可核验的资料出处。</p>
            </div>
          ) : (
            messages.map((m) => (m.role === 'user'
              ? <div key={m.id} className="fc-bubble-user fc-rise" lang="zh">{m.content}</div>
              : <AssistantMessage key={m.id} m={m} />
            ))
          )}

          {sending && (
            <div className="fc-answer" style={{ display: 'inline-flex', gap: 6, width: 'auto', alignSelf: 'flex-start' }}>
              {[0, 1, 2].map((i) => (
                <span key={i} className="fc-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ink-3)', animationDelay: `${i * 200}ms` }} />
              ))}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Suggested chips (empty state only) */}
      {!loading && messages.length === 0 && connected && (
        <div className="mx-auto w-full flex" style={{ maxWidth: 720, gap: 8, padding: '0 18px 6px', overflowX: 'auto' }}>
          {SUGGESTED.map((q) => (
            <button key={q} className="fc-qchip" lang="zh" onClick={() => sendMessage(q)}>{q}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0" style={{ background: 'var(--bg)', borderTop: '1px solid var(--line)' }}>
        <div className="mx-auto" style={{ maxWidth: 720, padding: '10px 18px calc(14px + env(safe-area-inset-bottom))' }}>
          {sendError && (
            <div role="alert" lang="zh" style={{ color: 'var(--clay)', fontSize: 13, marginBottom: 8, padding: '0 4px' }}>
              {sendError}
            </div>
          )}
          <div className="flex items-center" style={{ gap: 10 }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (sendError) setSendError('');
              }}
              onKeyDown={handleKeyDown}
              placeholder="问问关于病情、用药的任何问题…"
              rows={1}
              lang="zh"
              disabled={disabled}
              className="flex-1"
              style={{ border: 'none', background: 'var(--surface)', borderRadius: 22, padding: '13px 18px', fontSize: 15.5, color: 'var(--ink)', boxShadow: 'var(--shadow-sm)', outline: 'none', resize: 'none', maxHeight: 120, fontFamily: 'inherit', lineHeight: 1.5 }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || sending || disabled}
              aria-label="发送"
              className="flex-shrink-0 flex items-center justify-center"
              style={{ width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: input.trim() && !disabled ? 'pointer' : 'default', background: !input.trim() || disabled ? 'var(--line)' : 'var(--sage)', color: !input.trim() || disabled ? 'var(--ink-3)' : '#fff', boxShadow: !input.trim() || disabled ? 'none' : 'var(--shadow-sage)', transition: 'background .2s ease' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l14-7-5 7 5 7-14-7z" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssistantMessage({ m }: { m: Message }) {
  const refs = m.references ?? [];
  return (
    <div className="fc-rise flex flex-col" style={{ gap: 12, alignSelf: 'flex-start', maxWidth: '94%' }}>
      <div className="fc-answer">
        <p lang="zh" style={{ fontSize: 15, lineHeight: 1.75, whiteSpace: 'pre-wrap', color: 'var(--ink)' }}>{m.content}</p>
      </div>
      {refs.length > 0 && (
        <div className="flex flex-col" style={{ gap: 8 }}>
          <span className="fc-faint" lang="zh" style={{ fontSize: 12, fontWeight: 700, marginLeft: 2 }}>来源 · {refs.length} 处</span>
          {refs.map((ref, i) => (
            <div key={`${m.id}-ref-${i}`} className="fc-cite" style={{ cursor: 'default' }}>
              <span className="fc-cite-num">{ref.citationNumber ?? i + 1}</span>
              <span style={{ minWidth: 0 }}>
                <span lang="zh" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{ref.fileName || '资料'}</span>
                {ref.citedText && (
                  <span lang="zh" className="fc-muted" style={{ display: 'block', fontSize: 12.5, marginTop: 4, lineHeight: 1.6 }}>“{ref.citedText}”</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
