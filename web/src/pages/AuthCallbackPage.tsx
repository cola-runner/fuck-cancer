import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loginError, setLoginError] = useState<string | null>(null);
  const authError = searchParams.get('error');
  const error = authError
    ? authError === 'unauthorized'
      ? '此账号不是本机配置的部署者账号'
      : authError === 'invalid_state'
        ? '登录请求已过期，请重新登录'
        : 'Google 登录失败，请重试'
    : loginError;

  useEffect(() => {
    if (authError) return;

    login()
      .then(() => navigate('/cases', { replace: true }))
      .catch(() => setLoginError('Failed to complete login'));
  }, [authError, login, navigate]);

  return (
    <div className="min-h-dvh flex items-center justify-center" style={{ padding: 24 }}>
      <div className="fc-card w-full" style={{ maxWidth: 400, padding: 32, borderRadius: 24, boxShadow: 'var(--shadow-lg)' }}>
        <h1 className="fc-display" lang="zh" style={{ fontSize: 22, color: 'var(--ink)' }}>Google 登录</h1>
        {error ? (
          <>
            <p lang="zh" style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, color: 'var(--clay)' }}>{error}</p>
            <button type="button" onClick={() => navigate('/', { replace: true })} className="fc-btn fc-btn-primary" lang="zh" style={{ marginTop: 22, height: 46 }}>
              返回首页
            </button>
          </>
        ) : (
          <div className="flex items-center" style={{ gap: 12, marginTop: 22, fontSize: 15, color: 'var(--ink-2)' }}>
            <div className="fc-spin" style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid var(--sage)', borderTopColor: 'transparent' }} />
            <span lang="zh">正在完成登录…</span>
          </div>
        )}
      </div>
    </div>
  );
}
