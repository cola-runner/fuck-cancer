import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';

interface ResearchModalProps {
  caseId: string;
  onClose: () => void;
  onImportComplete: () => void;
}

interface ResearchSource {
  url: string;
  title: string;
  resultType: number | string;
  reportMarkdown?: string;
}

type Phase = 'input' | 'searching' | 'results' | 'importing';

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

function isReport(s: ResearchSource) {
  return s.resultType === 5 || s.resultType === 'report';
}
function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export default function ResearchModal({ caseId, onClose, onImportComplete }: ResearchModalProps) {
  const [phase, setPhase] = useState<Phase>('input');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'fast' | 'deep'>('fast');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [sources, setSources] = useState<ResearchSource[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const startedAtRef = useRef(0);

  const getErrorMessage = (err: unknown) => {
    if (typeof err === 'object' && err !== null && 'response' in err && typeof (err as { response?: unknown }).response === 'object') {
      const response = (err as { response?: { data?: { error?: string } } }).response;
      if (response?.data?.error) return response.data.error;
    }
    if (err instanceof Error) return err.message;
    return '操作失败，请重试';
  };

  const handleStart = async () => {
    if (!query.trim()) return;
    setError('');
    try {
      const { data } = await api.post(`/cases/${caseId}/research`, { query: query.trim(), mode });
      setTaskId(data.task.taskId);
      startedAtRef.current = Date.now();
      setPhase('searching');
    } catch (err) {
      console.error('Research start failed:', err);
      setError(getErrorMessage(err));
    }
  };

  useEffect(() => {
    if (phase !== 'searching' || !taskId) return;
    const timer = window.setInterval(async () => {
      if (Date.now() - startedAtRef.current > POLL_TIMEOUT_MS) {
        window.clearInterval(timer); setError('搜索超时，请重试'); setPhase('input'); return;
      }
      try {
        const { data } = await api.get(`/cases/${caseId}/research/${taskId}`);
        if (data.research.status === 'completed') {
          window.clearInterval(timer);
          const found: ResearchSource[] = data.research.sources || [];
          setSummary(data.research.summary || '');
          setSources(found);
          setSelected(new Set(found.map((_: ResearchSource, i: number) => i)));
          setPhase('results');
        }
      } catch (err) {
        window.clearInterval(timer); console.error('Research poll failed:', err); setError(getErrorMessage(err)); setPhase('input');
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [phase, taskId, caseId]);

  const toggle = (i: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    return next;
  });

  const handleImport = async () => {
    if (!taskId || selected.size === 0) return;
    setPhase('importing');
    setError('');
    try {
      await api.post(`/cases/${caseId}/research/${taskId}/import`, { sources: sources.filter((_, i) => selected.has(i)) });
      onImportComplete();
    } catch (err) {
      console.error('Research import failed:', err);
      setError(getErrorMessage(err));
      setPhase('results');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(45,40,35,0.4)', backdropFilter: 'blur(4px)' }} onClick={phase === 'importing' ? undefined : onClose} />
      <div className="fc-card relative w-full fc-rise flex flex-col" style={{ maxWidth: 560, maxHeight: '86dvh', borderRadius: 26, boxShadow: 'var(--shadow-lg)' }}>
        {/* Header */}
        <div className="flex items-start justify-between" style={{ padding: '22px 24px 14px', gap: 12 }}>
          <div>
            <h2 className="fc-display" lang="zh" style={{ fontSize: 21, color: 'var(--ink)' }}>搜索资料</h2>
            <p className="fc-muted" lang="zh" style={{ fontSize: 13, marginTop: 3, lineHeight: 1.6 }}>由 NotebookLM 在网络上查找权威资料，导入后即可在问答中引用</p>
          </div>
          <button onClick={onClose} disabled={phase === 'importing'} className="fc-iconbtn" aria-label="关闭" style={{ width: 34, height: 34, background: 'var(--surface-2)', color: 'var(--ink-2)', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto" style={{ padding: '0 24px 24px', flex: 1 }}>
          {phase === 'input' && (
            <div className="flex flex-col" style={{ gap: 16 }}>
              <div>
                <label className="fc-label" lang="zh">想查什么</label>
                <input className="fc-input" lang="zh" value={query} autoFocus
                  onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                  placeholder="例如：卡培他滨 副作用 注意事项" />
              </div>
              <div className="flex" style={{ gap: 8 }}>
                {([{ key: 'fast', label: '快速搜索', hint: '约半分钟' }, { key: 'deep', label: '深度研究', hint: '几分钟，附报告' }] as const).map((m) => (
                  <button key={m.key} onClick={() => setMode(m.key)} className="flex-1 cursor-pointer"
                    style={{ height: 56, borderRadius: 14, border: 'none', background: mode === m.key ? 'var(--sage)' : 'var(--surface-2)', color: mode === m.key ? '#fff' : 'var(--ink-2)', transition: 'all .15s ease' }}>
                    <span lang="zh" style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{m.label}</span>
                    <span lang="zh" style={{ display: 'block', fontSize: 11, opacity: .85 }}>{m.hint}</span>
                  </button>
                ))}
              </div>
              <button onClick={handleStart} disabled={!query.trim()} className="fc-btn fc-btn-primary" lang="zh" style={{ width: '100%', height: 50 }}>开始搜索</button>
            </div>
          )}

          {phase === 'searching' && (
            <div className="text-center" style={{ padding: '40px 0' }}>
              <div className="fc-spin mx-auto" style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid var(--sage)', borderTopColor: 'transparent', marginBottom: 16 }} />
              <p lang="zh" style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{mode === 'deep' ? '深度研究中…' : '搜索中…'}</p>
              <p className="fc-muted" lang="zh" style={{ fontSize: 13.5 }}>{mode === 'deep' ? 'NotebookLM 正在研究并撰写报告，通常需要几分钟' : 'NotebookLM 正在查找相关网页'}</p>
            </div>
          )}

          {(phase === 'results' || phase === 'importing') && (
            <div className="flex flex-col" style={{ gap: 14 }}>
              {summary && <p lang="zh" className="fc-muted" style={{ fontSize: 13, background: 'var(--surface-2)', borderRadius: 14, padding: '12px 14px', lineHeight: 1.7 }}>{summary}</p>}
              {sources.length === 0 ? (
                <p className="fc-muted text-center" lang="zh" style={{ padding: '32px 0', fontSize: 14 }}>没有找到相关资料，换个关键词试试</p>
              ) : (
                <div className="flex flex-col" style={{ gap: 8 }}>
                  {sources.map((s, i) => (
                    <label key={i} className="flex items-start cursor-pointer" style={{ gap: 11, padding: 13, borderRadius: 14, border: `1px solid ${selected.has(i) ? 'var(--sage)' : 'var(--line)'}`, background: selected.has(i) ? 'var(--sage-tint-2)' : 'var(--surface)', transition: 'all .14s ease' }}>
                      <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} disabled={phase === 'importing'} style={{ marginTop: 2, accentColor: 'var(--sage)', width: 16, height: 16 }} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span lang="zh" style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{s.title || '未命名'}</span>
                        <span lang="zh" className="fc-faint" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>{isReport(s) ? '深度研究报告' : hostOf(s.url)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {sources.length > 0 && (
                <button onClick={handleImport} disabled={phase === 'importing' || selected.size === 0} className="fc-btn fc-btn-primary" lang="zh" style={{ width: '100%', height: 50 }}>
                  {phase === 'importing' ? '导入中…' : `导入选中的 ${selected.size} 项`}
                </button>
              )}
            </div>
          )}

          {error && <p lang="zh" className="text-center" style={{ fontSize: 13.5, color: 'var(--clay)', marginTop: 16 }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
