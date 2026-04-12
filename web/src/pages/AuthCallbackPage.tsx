import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    const authError = searchParams.get('error');

    if (authError) {
      setError(authError);
      return;
    }

    if (!token) {
      setError('Missing login token');
      return;
    }

    login(token)
      .then(() => navigate('/cases', { replace: true }))
      .catch(() => setError('Failed to complete login'));
  }, [login, navigate, searchParams]);

  return (
    <div className="min-h-dvh bg-[#f5f5f7] flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <h1 className="text-[24px] font-semibold text-[#111827]">Google 登录</h1>
        {error ? (
          <>
            <p className="mt-3 text-[15px] leading-6 text-[#b91c1c]">{error}</p>
            <button
              type="button"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-[#064e3b] px-5 text-white"
              onClick={() => navigate('/', { replace: true })}
            >
              返回首页
            </button>
          </>
        ) : (
          <div className="mt-6 flex items-center gap-3 text-[15px] text-[#4b5563]">
            <div className="h-5 w-5 rounded-full border-2 border-[#064e3b] border-t-transparent animate-spin" />
            正在完成登录...
          </div>
        )}
      </div>
    </div>
  );
}
