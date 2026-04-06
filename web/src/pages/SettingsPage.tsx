import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import Layout from '../components/Layout';

type LLMProvider = 'gemini' | 'claude' | 'openai';

export default function SettingsPage() {
  const { user } = useAuth();
  const [provider, setProvider] = useState<LLMProvider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await api.get('/settings');
      if (data.provider) setProvider(data.provider);
      if (data.apiKey) setApiKey(data.apiKey);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError('请输入 API Key');
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await api.put('/settings', { provider, apiKey });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const providers: { value: LLMProvider; label: string; description: string }[] = [
    {
      value: 'gemini',
      label: 'Google Gemini',
      description: 'Gemini 2.5 Pro',
    },
    {
      value: 'claude',
      label: 'Anthropic Claude',
      description: 'Claude Sonnet 4',
    },
    {
      value: 'openai',
      label: 'OpenAI',
      description: 'GPT-4o',
    },
  ];

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-[3px] border-[#0071e3] border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-[680px] mx-auto px-6 py-10">
        <h1 className="text-[34px] font-bold text-[#1d1d1f] tracking-tight mb-10">
          设置
        </h1>

        {/* Account Section */}
        <section className="mb-10">
          <h2 className="text-[13px] font-semibold text-[#86868b] uppercase tracking-wider mb-3">
            账户
          </h2>
          <div className="bg-white rounded-2xl shadow-[rgba(0,0,0,0.08)_0_2px_8px] p-6">
            <div className="flex items-center gap-4">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt=""
                  className="w-14 h-14 rounded-full object-cover"
                />
              ) : (
                <div className="w-14 h-14 bg-[#0071e3] rounded-full flex items-center justify-center text-white text-[20px] font-semibold">
                  {user?.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              <div>
                <p className="text-[17px] font-semibold text-[#1d1d1f]">
                  {user?.name || 'Unknown'}
                </p>
                <p className="text-[15px] text-[#86868b]">
                  {user?.email || ''}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* LLM Provider Section */}
        <section className="mb-10">
          <h2 className="text-[13px] font-semibold text-[#86868b] uppercase tracking-wider mb-3">
            AI 模型
          </h2>
          <div className="bg-white rounded-2xl shadow-[rgba(0,0,0,0.08)_0_2px_8px] overflow-hidden">
            {providers.map((p, index) => (
              <button
                key={p.value}
                onClick={() => setProvider(p.value)}
                className={`w-full flex items-center justify-between px-6 py-4 cursor-pointer transition-colors hover:bg-[#f5f5f7] ${
                  index < providers.length - 1
                    ? 'border-b border-[#f5f5f7]'
                    : ''
                }`}
              >
                <div className="text-left">
                  <p className="text-[17px] text-[#1d1d1f] font-medium">
                    {p.label}
                  </p>
                  <p className="text-[13px] text-[#86868b]">
                    {p.description}
                  </p>
                </div>
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                    provider === p.value
                      ? 'border-[#0071e3] bg-[#0071e3]'
                      : 'border-[#d2d2d7]'
                  }`}
                >
                  {provider === p.value && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* API Key Section */}
        <section className="mb-10">
          <h2 className="text-[13px] font-semibold text-[#86868b] uppercase tracking-wider mb-3">
            API Key
          </h2>
          <div className="bg-white rounded-2xl shadow-[rgba(0,0,0,0.08)_0_2px_8px] p-6">
            <p className="text-[15px] text-[#86868b] mb-4">
              输入您的{' '}
              {providers.find((p) => p.value === provider)?.label} API Key
              以启用 AI 功能
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError('');
              }}
              placeholder="sk-..."
              className="w-full h-[48px] px-4 text-[17px] text-[#1d1d1f] bg-[#f5f5f7] rounded-xl outline-none focus:ring-2 focus:ring-[#0071e3] placeholder:text-[#aeaeb2] font-mono transition-all"
            />

            {error && (
              <p className="mt-3 text-[14px] text-[#ff3b30]">{error}</p>
            )}

            {saved && (
              <p className="mt-3 text-[14px] text-[#34c759] flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                设置已保存
              </p>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="mt-5 w-full h-[44px] text-[15px] font-medium text-white bg-[#0071e3] hover:bg-[#0077ED] disabled:opacity-50 rounded-xl transition-all cursor-pointer active:scale-[0.98]"
            >
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </section>
      </div>
    </Layout>
  );
}
