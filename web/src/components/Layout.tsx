import { type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Sticky translucent top bar */}
      <nav
        className="sticky top-0 z-50"
        style={{
          background: 'rgba(244,238,230,0.86)',
          backdropFilter: 'saturate(160%) blur(12px)',
          WebkitBackdropFilter: 'saturate(160%) blur(12px)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div
          className="mx-auto flex items-center justify-between"
          style={{ maxWidth: 1040, height: 60, padding: '0 22px' }}
        >
          {/* Brand */}
          <button
            onClick={() => navigate('/cases')}
            className="flex items-center gap-2 cursor-pointer"
            style={{ background: 'none', border: 'none', padding: 0 }}
          >
            <span style={{ color: 'var(--sage)', display: 'flex' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 19c0-7 5-13 14-13 0 9-6 14-14 13zM5 19c3-3 5-5 8-6.5" />
              </svg>
            </span>
            <span className="fc-display" lang="zh" style={{ fontSize: 19, color: 'var(--ink)' }}>陪伴</span>
          </button>

          {/* Right cluster */}
          <div className="flex items-center" style={{ gap: 14 }}>
            <button
              onClick={() => navigate('/settings')}
              className="fc-iconbtn"
              style={{ color: location.pathname === '/settings' ? 'var(--sage)' : 'var(--ink-2)' }}
              aria-label="设置"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>

            {user && (
              <div className="relative group">
                <div
                  className="rounded-full flex items-center justify-center cursor-pointer text-white fc-display"
                  style={{ width: 34, height: 34, background: 'var(--sage)', fontSize: 14, boxShadow: 'var(--shadow-sm)' }}
                >
                  {user.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="absolute right-0 top-full mt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                  <div className="fc-card py-1" style={{ minWidth: 188, boxShadow: 'var(--shadow-md)' }}>
                    <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
                      <p className="truncate" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{user.name}</p>
                      <p className="truncate fc-muted" style={{ fontSize: 12, marginTop: 2 }}>{user.email}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2.5 cursor-pointer"
                      style={{ fontSize: 14, color: 'var(--clay)', background: 'none', border: 'none' }}
                    >
                      退出登录
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="flex-1">{children}</main>
    </div>
  );
}
