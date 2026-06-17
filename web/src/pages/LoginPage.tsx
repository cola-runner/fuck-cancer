const GOOGLE_AUTH_URL = '/api/auth/google';

export default function LoginPage() {
  const handleGoogleLogin = () => { window.location.href = GOOGLE_AUTH_URL; };

  return (
    <div className="min-h-dvh flex items-center justify-center" style={{ padding: '24px' }}>
      <div className="w-full flex flex-col items-center text-center" style={{ maxWidth: 380 }}>
        {/* Leaf mark */}
        <div className="flex items-center justify-center fc-rise" style={{ width: 76, height: 76, borderRadius: 24, background: 'var(--sage-tint)', color: 'var(--sage-strong)', marginBottom: 26, boxShadow: 'var(--shadow-sm)' }}>
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 19c0-7 5-13 14-13 0 9-6 14-14 13zM5 19c3-3 5-5 8-6.5" />
          </svg>
        </div>

        <h1 className="fc-display fc-rise" lang="zh" style={{ fontSize: 34, lineHeight: 1.25, color: 'var(--ink)', letterSpacing: '-.5px' }}>
          陪你一起，<br />照顾最重要的人
        </h1>
        <p className="fc-muted fc-rise" lang="zh" style={{ fontSize: 16, marginTop: 14, lineHeight: 1.7, maxWidth: 320 }}>
          把零散的报告、处方、录音收拢成一个档案，用日常的话就能问清楚病情。
        </p>

        <div style={{ height: 40 }} />

        <button onClick={handleGoogleLogin} className="flex items-center justify-center w-full cursor-pointer fc-rise"
          style={{ gap: 12, background: 'var(--surface)', color: 'var(--ink)', fontSize: 16, fontWeight: 600, height: 54, borderRadius: 16, border: '1px solid var(--line)', boxShadow: 'var(--shadow-md)' }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}>
          <svg className="flex-shrink-0" width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          <span lang="zh">使用 Google 账号登录</span>
        </button>

        <p className="fc-faint flex items-center justify-center" lang="zh" style={{ gap: 6, fontSize: 13, marginTop: 18, lineHeight: 1.6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75M6.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          资料存在你自己的 NotebookLM，本机只留索引
        </p>
      </div>
    </div>
  );
}
