import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth-context';
import Layout from '../components/Layout';

export default function SettingsPage() {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      const { data } = await api.get('/settings');
      setConnected(!!data.notebooklm?.connected);
      setHint(data.notebooklm?.hint ?? null);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center" style={{ padding: '100px 0' }}>
          <div className="fc-spin" style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid var(--sage)', borderTopColor: 'transparent' }} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto" style={{ maxWidth: 600, padding: '36px 22px 60px' }}>
        <h1 className="fc-display" lang="zh" style={{ fontSize: 28, color: 'var(--ink)', marginBottom: 30 }}>设置</h1>

        {/* Account */}
        <Label>账户</Label>
        <div className="fc-card" style={{ padding: 20, marginBottom: 28 }}>
          <div className="flex items-center" style={{ gap: 15 }}>
            <div className="fc-tile fc-display" style={{ width: 54, height: 54, borderRadius: 17, background: 'var(--sage-tint)', color: 'var(--sage-strong)', fontSize: 21 }}>
              {user?.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <p lang="zh" style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{user?.name || '未命名'}</p>
              <p className="fc-muted" style={{ fontSize: 14, marginTop: 1 }}>{user?.email || ''}</p>
            </div>
          </div>
        </div>

        {/* NotebookLM */}
        <Label>NotebookLM 连接</Label>
        <div className="fc-card" style={{ padding: 20 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: connected ? 'var(--sage)' : 'var(--clay)' }} />
            <p lang="zh" style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{connected ? '已连接' : '未连接'}</p>
          </div>
          <p className="fc-muted" lang="zh" style={{ fontSize: 13.5, marginTop: 12, lineHeight: 1.7 }}>
            文件存储、资料理解和 AI 问答，全部由服务端的 NotebookLM 会话提供，不需要任何 API Key。
          </p>
          {!connected && (
            <div style={{ marginTop: 16, background: 'var(--clay-tint)', borderRadius: 14, padding: '13px 14px' }}>
              <p lang="zh" style={{ fontSize: 13, color: 'var(--clay)', lineHeight: 1.6 }}>
                在服务器主机上运行以下命令重新连接：
              </p>
              <code style={{ marginTop: 8, display: 'block', fontSize: 12.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--ink)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 11px', overflowX: 'auto' }}>
                npx @cola_runner/notebooklm-cli@0.1.4 login --paste --storage &lt;NOTEBOOKLM_STORAGE_PATH&gt;
              </code>
              {hint && <p className="fc-faint" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>{hint}</p>}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <h2 lang="zh" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '.3px', marginBottom: 12 }}>{children}</h2>;
}
