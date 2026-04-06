const GOOGLE_AUTH_URL = '/api/auth/google';

export default function LoginPage() {
  const handleGoogleLogin = () => {
    window.location.href = GOOGLE_AUTH_URL;
  };

  return (
    <div className="min-h-dvh bg-[#f5f5f7] flex items-center justify-center px-6">
      <div className="w-full max-w-[380px]">
        {/* Logo / App Name */}
        <div className="text-center mb-10">
          <h1 className="text-[40px] font-bold tracking-tight text-[#1d1d1f] leading-tight">
            FUCK CANCER
          </h1>
          <p className="mt-3 text-[17px] text-[#86868b] font-normal">
            病程管理，从收集资料开始
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl p-10 shadow-[rgba(0,0,0,0.08)_0_2px_8px]">
          <div className="text-center mb-8">
            <h2 className="text-[22px] font-semibold text-[#1d1d1f]">
              登录
            </h2>
            <p className="mt-2 text-[15px] text-[#86868b]">
              使用 Google 账号安全登录
            </p>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-[#0071e3] hover:bg-[#0077ED] text-white text-[17px] font-normal rounded-xl h-[50px] transition-all duration-200 cursor-pointer active:scale-[0.98]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" />
            </svg>
            Sign in with Google
          </button>
        </div>

        {/* Footer */}
        <p className="text-center mt-8 text-[13px] text-[#86868b]">
          登录即表示您同意我们的服务条款和隐私政策
        </p>
      </div>
    </div>
  );
}
