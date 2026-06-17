import type { Document } from '../pages/CaseDetailPage';

interface DocumentCardProps {
  document: Document;
  onRetry?: (documentId: string) => void;
  retrying?: boolean;
}

function kindOf(d: Document): 'note' | 'web' | 'image' | 'audio' | 'pdf' | 'file' {
  if (d.origin === 'auto' || d.origin === 'research' || d.fileType === 'web') return 'web';
  const t = d.fileType ?? '';
  const n = d.fileName ?? '';
  if (t.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(n)) return 'image';
  if (t.startsWith('audio/') || t.startsWith('video/') || /\.(mp3|m4a|wav|mp4|mov)$/i.test(n)) return 'audio';
  if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (t === 'text/plain' || t === 'text/markdown' || d.textContent) return 'note';
  return 'file';
}

function Icon({ kind }: { kind: string }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'web') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></svg>;
  if (kind === 'image') return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="M5 18l5-5 4 4 2-2 3 3" /></svg>;
  if (kind === 'audio') return <svg {...common}><rect x="3.5" y="9" width="3.5" height="6" rx="1" /><path d="M7 12c0-4 2.5-7 5-7v14c-2.5 0-5-3-5-7z" /><path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10" /></svg>;
  if (kind === 'pdf') return <svg {...common}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5" /></svg>;
  // note (default)
  return <svg {...common}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5M8 13h8M8 17h5" /></svg>;
}

function host(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function snippet(s?: string | null) {
  if (!s) return null;
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > 150 ? `${t.slice(0, 147)}…` : t;
}

export default function DocumentCard({ document: d, onRetry, retrying = false }: DocumentCardProps) {
  const kind = kindOf(d);
  const isWeb = kind === 'web';
  const isAuto = d.origin === 'auto';
  const tileBg = isWeb ? 'var(--official-tint)' : 'var(--sage-tint)';
  const tileColor = isWeb ? 'var(--official)' : 'var(--sage-strong)';
  const preview = snippet(d.textContent);
  const canRetry = !!onRetry && d.sourceStatus === 'error';

  return (
    <div className="fc-card fc-rise" style={{ padding: 15, marginBottom: 11, display: 'flex', gap: 13 }}>
      <div className="fc-tile" style={{ background: tileBg, color: tileColor }}><Icon kind={kind} /></div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-start justify-between" style={{ gap: 10 }}>
          <span lang="zh" style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.4, color: 'var(--ink)' }}>
            {d.fileName || '未命名资料'}
          </span>
          <div className="flex items-center" style={{ gap: 6, flexShrink: 0 }}>
            {isAuto && <span className="fc-chip fc-chip-official" lang="zh">自动整理</span>}
            {d.sourceStatus === 'processing' ? (
              <span className="fc-chip fc-chip-amber fc-pulse" lang="zh">整理中</span>
            ) : d.sourceStatus === 'error' ? (
              <span className="fc-chip fc-chip-clay" lang="zh">处理失败</span>
            ) : isWeb ? (
              <span className="fc-chip fc-chip-official" lang="zh">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" /></svg>
                官方
              </span>
            ) : (
              <span className="fc-chip fc-chip-sage" lang="zh">已就绪</span>
            )}
          </div>
        </div>

        {preview && (
          <p lang="zh" className="fc-muted" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.65, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {preview}
          </p>
        )}

        {d.sourceStatus === 'error' && d.sourceError && (
          <p lang="zh" style={{ fontSize: 12.5, marginTop: 6, color: 'var(--clay)', lineHeight: 1.55 }}>{d.sourceError}</p>
        )}

        <div className="flex items-center" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {d.sourceUrl && (
            <>
              <span className="fc-faint" style={{ fontSize: 12.5 }}>{host(d.sourceUrl)}</span>
              <span className="fc-faint" style={{ fontSize: 11 }}>·</span>
              <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12.5, color: 'var(--official)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                查看原文
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
              </a>
            </>
          )}
          {!d.sourceUrl && (
            <span className="fc-faint" lang="zh" style={{ fontSize: 12 }}>
              {new Date(d.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {canRetry && (
            <button type="button" disabled={retrying} onClick={() => onRetry!(d.id)}
              style={{ fontSize: 12.5, fontWeight: 600, color: retrying ? 'var(--ink-3)' : 'var(--sage-strong)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {retrying ? '检测中…' : '重新检测'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
