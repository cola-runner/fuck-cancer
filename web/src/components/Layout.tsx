import { type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

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
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: '#ffffff' }}>
      {/* Sticky Nav Bar — Stripe white */}
      <nav
        className="sticky top-0 z-50 backdrop-blur-sm"
        style={{
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderBottom: '1px solid #e5edf5',
        }}
      >
        <div className="max-w-[1100px] mx-auto px-6 flex items-center justify-between" style={{ height: '56px' }}>
          {/* Left: logomark + text */}
          <button
            onClick={() => navigate('/cases')}
            className="flex items-center cursor-pointer"
          >
            <div
              className="flex items-center justify-center text-white"
              style={{
                width: '18px',
                height: '18px',
                backgroundColor: '#059669',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              FC
            </div>
            <span
              className="ml-2"
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#061b31',
                letterSpacing: '0.5px',
              }}
            >
              FUCK CANCER
            </span>
          </button>

          {/* Right: settings icon + avatar */}
          <div className="flex items-center gap-5">
            {/* Settings icon */}
            <button
              onClick={() => navigate('/settings')}
              className="cursor-pointer transition-colors"
              style={{
                color: location.pathname === '/settings' ? '#059669' : '#64748d',
              }}
              aria-label="设置"
            >
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>

            {/* User Avatar with dropdown */}
            {user && (
              <div className="relative group">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt=""
                    className="w-[28px] h-[28px] rounded-full object-cover cursor-pointer transition-all"
                    style={{ ring: '1px solid transparent' }}
                  />
                ) : (
                  <div
                    className="w-[28px] h-[28px] rounded-full flex items-center justify-center cursor-pointer text-white transition-all"
                    style={{
                      backgroundColor: '#059669',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    {user.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}

                {/* Dropdown */}
                <div className="absolute right-0 top-full mt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                  <div
                    className="bg-white py-1"
                    style={{
                      borderRadius: '8px',
                      boxShadow: 'rgba(50,50,93,0.25) 0 6px 12px -2px, rgba(0,0,0,0.1) 0 3px 7px -3px',
                      border: '1px solid #e5edf5',
                      minWidth: '180px',
                    }}
                  >
                    <div
                      className="px-4 py-3"
                      style={{ borderBottom: '1px solid #e5edf5' }}
                    >
                      <p
                        className="truncate"
                        style={{ fontSize: '14px', fontWeight: 500, color: '#061b31' }}
                      >
                        {user.name}
                      </p>
                      <p
                        className="truncate mt-0.5"
                        style={{ fontSize: '12px', color: '#64748d' }}
                      >
                        {user.email}
                      </p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2.5 cursor-pointer transition-colors hover:bg-[#f8fafc]"
                      style={{
                        fontSize: '14px',
                        color: '#ea2261',
                        borderRadius: '0 0 8px 8px',
                      }}
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

      {/* Page Content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
