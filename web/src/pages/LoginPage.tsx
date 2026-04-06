const GOOGLE_AUTH_URL = '/api/auth/google';

export default function LoginPage() {
  const handleGoogleLogin = () => {
    window.location.href = GOOGLE_AUTH_URL;
  };

  return (
    <div
      className="min-h-dvh flex items-center justify-center px-6"
      style={{ backgroundColor: '#064e3b' }}
    >
      <div className="w-full max-w-[400px] flex flex-col items-center text-center">
        {/* Badge */}
        <div
          className="inline-flex items-center px-[14px] py-[6px] text-[12px]"
          style={{
            border: '1px solid rgba(255,255,255,0.15)',
            color: 'rgba(255,255,255,0.7)',
            borderRadius: '4px',
            letterSpacing: '0.5px',
            fontWeight: 500,
          }}
        >
          FUCK CANCER
        </div>

        {/* Hero Heading */}
        <h1
          className="text-white mt-6"
          style={{
            fontSize: '52px',
            fontWeight: 300,
            letterSpacing: '-1.2px',
            lineHeight: 1.06,
          }}
        >
          为每一位患者
          <br />
          和家属而生
        </h1>

        {/* Subtitle */}
        <p
          className="mt-4"
          style={{
            fontSize: '17px',
            fontWeight: 400,
            color: 'rgba(255,255,255,0.55)',
            lineHeight: 1.5,
          }}
        >
          整合就诊资料，让 AI 成为您最懂病情的助手
        </p>

        {/* Spacer */}
        <div className="h-12" />

        {/* Google Sign-in Button */}
        <button
          onClick={handleGoogleLogin}
          className="flex items-center justify-center gap-3 w-full cursor-pointer transition-all duration-200"
          style={{
            backgroundColor: '#ffffff',
            color: '#061b31',
            fontSize: '16px',
            fontWeight: 500,
            height: '52px',
            borderRadius: '6px',
            border: 'none',
            boxShadow: 'rgba(50,50,93,0.25) 0 6px 12px -2px, rgba(0,0,0,0.1) 0 3px 7px -3px',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              'rgba(50,50,93,0.35) 0 8px 16px -2px, rgba(0,0,0,0.15) 0 4px 9px -3px';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              'rgba(50,50,93,0.25) 0 6px 12px -2px, rgba(0,0,0,0.1) 0 3px 7px -3px';
          }}
        >
          {/* Google "G" logo in full color */}
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          使用 Google 账号登录
        </button>

        {/* Privacy note */}
        <p
          className="mt-6 flex items-center justify-center gap-1.5"
          style={{
            fontSize: '13px',
            color: 'rgba(255,255,255,0.35)',
          }}
        >
          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          资料仅存储在您的 Google Drive
        </p>
      </div>
    </div>
  );
}
