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
    <div className="min-h-dvh bg-[#f5f5f7] flex flex-col">
      {/* Sticky Nav Bar - Glass Effect */}
      <nav className="sticky top-0 z-50 bg-[rgba(0,0,0,0.8)] backdrop-blur-[20px] backdrop-saturate-[180%]">
        <div className="max-w-[980px] mx-auto px-6 h-[48px] flex items-center justify-between">
          {/* Left: App Name */}
          <button
            onClick={() => navigate('/cases')}
            className="text-[14px] font-semibold text-white/90 hover:text-white tracking-wide cursor-pointer transition-colors"
          >
            FUCK CANCER
          </button>

          {/* Right: Settings + Avatar */}
          <div className="flex items-center gap-4">
            {/* Settings Icon */}
            <button
              onClick={() => navigate('/settings')}
              className={`text-white/60 hover:text-white/90 cursor-pointer transition-colors ${
                location.pathname === '/settings' ? 'text-white/90' : ''
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>

            {/* User Avatar / Logout */}
            {user && (
              <div className="relative group">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover cursor-pointer ring-2 ring-transparent hover:ring-white/30 transition-all"
                  />
                ) : (
                  <div className="w-7 h-7 bg-[#0071e3] rounded-full flex items-center justify-center cursor-pointer text-white text-[12px] font-semibold ring-2 ring-transparent hover:ring-white/30 transition-all">
                    {user.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}

                {/* Dropdown */}
                <div className="absolute right-0 top-full mt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                  <div className="bg-white rounded-xl shadow-[rgba(0,0,0,0.15)_0_4px_16px] py-1 min-w-[160px]">
                    <div className="px-4 py-3 border-b border-[#f5f5f7]">
                      <p className="text-[14px] font-medium text-[#1d1d1f] truncate">
                        {user.name}
                      </p>
                      <p className="text-[12px] text-[#86868b] truncate">
                        {user.email}
                      </p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2.5 text-[14px] text-[#ff3b30] hover:bg-[#f5f5f7] cursor-pointer transition-colors"
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

      {/* Content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
