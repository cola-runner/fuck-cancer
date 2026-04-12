import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import Layout from '../components/Layout';

type LLMProvider = 'gemini' | 'claude' | 'openai';

export default function SettingsPage() {
  const { user } = useAuth();
  const [provider, setProvider] = useState<LLMProvider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
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
      setHasSavedApiKey(!!data.hasApiKey);
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
      setApiKey('');
      setHasSavedApiKey(true);
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
          <div
            className="w-8 h-8 rounded-full animate-spin"
            style={{ border: '3px solid #059669', borderTopColor: 'transparent' }}
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-[680px] mx-auto px-6 py-10">
        <h1
          style={{
            fontSize: '34px',
            fontWeight: 300,
            color: '#061b31',
            letterSpacing: '-0.6px',
            marginBottom: '40px',
          }}
        >
          设置
        </h1>

        {/* Account Section */}
        <section className="mb-10">
          <h2
            className="uppercase mb-3"
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#273951',
              letterSpacing: '0.5px',
            }}
          >
            账户
          </h2>
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5edf5',
              borderRadius: '6px',
              padding: '24px',
              boxShadow: 'rgba(50,50,93,0.1) 0 2px 5px -1px, rgba(0,0,0,0.06) 0 1px 3px -1px',
            }}
          >
            <div className="flex items-center gap-4">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt=""
                  className="w-14 h-14 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-white"
                  style={{
                    backgroundColor: '#059669',
                    fontSize: '20px',
                    fontWeight: 600,
                  }}
                >
                  {user?.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              <div>
                <p style={{ fontSize: '16px', fontWeight: 500, color: '#061b31' }}>
                  {user?.name || 'Unknown'}
                </p>
                <p style={{ fontSize: '14px', color: '#64748d' }} className="mt-0.5">
                  {user?.email || ''}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* LLM Provider Section */}
        <section className="mb-10">
          <h2
            className="uppercase mb-3"
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#273951',
              letterSpacing: '0.5px',
            }}
          >
            AI 模型
          </h2>
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5edf5',
              borderRadius: '6px',
              overflow: 'hidden',
              boxShadow: 'rgba(50,50,93,0.1) 0 2px 5px -1px, rgba(0,0,0,0.06) 0 1px 3px -1px',
            }}
          >
            {providers.map((p, index) => (
              <button
                key={p.value}
                onClick={() => setProvider(p.value)}
                className="w-full flex items-center justify-between cursor-pointer transition-colors"
                style={{
                  padding: '16px 20px',
                  borderBottom: index < providers.length - 1 ? '1px solid #e5edf5' : 'none',
                  backgroundColor: provider === p.value ? 'rgba(5,150,105,0.04)' : '#ffffff',
                  border: provider === p.value ? `1px solid #059669` : undefined,
                  borderTop: index === 0 && provider === p.value ? '1px solid #059669' : index === 0 ? 'none' : undefined,
                }}
              >
                <div className="text-left">
                  <p style={{ fontSize: '15px', fontWeight: 500, color: '#061b31' }}>
                    {p.label}
                  </p>
                  <p style={{ fontSize: '13px', color: '#64748d' }} className="mt-0.5">
                    {p.description}
                  </p>
                </div>
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    border: provider === p.value ? '2px solid #059669' : '2px solid #e5edf5',
                    backgroundColor: provider === p.value ? '#059669' : 'transparent',
                  }}
                >
                  {provider === p.value && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
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
          <h2
            className="uppercase mb-3"
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#273951',
              letterSpacing: '0.5px',
            }}
          >
            API Key
          </h2>
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5edf5',
              borderRadius: '6px',
              padding: '24px',
              boxShadow: 'rgba(50,50,93,0.1) 0 2px 5px -1px, rgba(0,0,0,0.06) 0 1px 3px -1px',
            }}
          >
            <p style={{ fontSize: '14px', color: '#64748d' }} className="mb-4">
              输入您的{' '}
              {providers.find((p) => p.value === provider)?.label} API Key
              以启用 AI 功能
            </p>
            {hasSavedApiKey && (
              <p style={{ fontSize: '13px', color: '#64748d' }} className="mb-3">
                当前已保存 API Key。输入新的值将覆盖旧配置。
              </p>
            )}
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError('');
              }}
              placeholder="sk-..."
              className="w-full outline-none transition-all font-mono placeholder:text-[#64748d]"
              style={{
                height: '44px',
                padding: '0 12px',
                fontSize: '15px',
                color: '#061b31',
                backgroundColor: '#ffffff',
                border: '1px solid #e5edf5',
                borderRadius: '6px',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#059669';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(5,150,105,0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5edf5';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />

            {error && (
              <p className="mt-3" style={{ fontSize: '14px', color: '#ea2261' }}>{error}</p>
            )}

            {saved && (
              <p className="mt-3 flex items-center gap-1.5" style={{ fontSize: '14px', color: '#108c3d' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                设置已保存
              </p>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="mt-5 cursor-pointer transition-all"
              style={{
                width: '100%',
                height: '40px',
                padding: '0 24px',
                fontSize: '15px',
                fontWeight: 500,
                color: '#ffffff',
                backgroundColor: '#059669',
                border: 'none',
                borderRadius: '6px',
                opacity: saving ? 0.6 : 1,
                boxShadow: 'rgba(50,50,93,0.11) 0 4px 6px, rgba(0,0,0,0.08) 0 1px 3px',
              }}
              onMouseEnter={(e) => {
                if (!saving) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#047857';
              }}
              onMouseLeave={(e) => {
                if (!saving) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#059669';
              }}
            >
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </section>
      </div>
    </Layout>
  );
}
