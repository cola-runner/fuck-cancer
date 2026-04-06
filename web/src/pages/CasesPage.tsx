import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import Layout from '../components/Layout';

interface Case {
  id: string;
  patientName: string;
  diagnosis: string;
  notes?: string;
  fileCount: number;
  updatedAt: string;
}

interface NewCaseForm {
  patientName: string;
  diagnosis: string;
  notes: string;
}

export default function CasesPage() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<NewCaseForm>({
    patientName: '',
    diagnosis: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    try {
      const { data } = await api.get('/cases');
      setCases(data.cases || []);
    } catch (err) {
      console.error('Failed to load cases:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patientName.trim() || !form.diagnosis.trim()) return;
    setSubmitting(true);
    try {
      const { data } = await api.post('/cases', form);
      setCases((prev) => [data.case, ...prev]);
      setShowModal(false);
      setForm({ patientName: '', diagnosis: '', notes: '' });
    } catch (err) {
      console.error('Failed to create case:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Layout>
      <div className="max-w-[1100px] mx-auto px-6">
        {/* Page Header */}
        <div className="pt-16 pb-12 flex items-end justify-between">
          <div>
            <h1
              style={{
                fontSize: '48px',
                fontWeight: 300,
                color: '#061b31',
                letterSpacing: '-0.96px',
                lineHeight: 1.1,
              }}
            >
              病例
            </h1>
            <p
              className="mt-2"
              style={{ fontSize: '18px', color: '#64748d' }}
            >
              管理您的治疗记录
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 cursor-pointer transition-all duration-200"
            style={{
              backgroundColor: '#059669',
              color: '#ffffff',
              fontSize: '15px',
              fontWeight: 500,
              borderRadius: '6px',
              padding: '10px 20px',
              border: 'none',
              boxShadow: 'rgba(50,50,93,0.11) 0 4px 6px, rgba(0,0,0,0.08) 0 1px 3px',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#047857';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#059669';
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            新建病例
          </button>
        </div>

        {/* Section Divider */}
        <div style={{ borderTop: '1px solid #e5edf5', marginBottom: '32px' }} />

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-32">
            <div
              className="w-7 h-7 border-t-transparent rounded-full animate-spin"
              style={{ border: '2.5px solid #059669', borderTopColor: 'transparent' }}
            />
          </div>
        ) : cases.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center text-center py-32">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
              style={{ backgroundColor: 'rgba(5,150,105,0.08)' }}
            >
              <svg
                className="w-9 h-9"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.2}
                stroke="currentColor"
                style={{ color: '#059669' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </div>
            <h3
              style={{ fontSize: '22px', fontWeight: 400, color: '#061b31' }}
              className="mb-2"
            >
              暂无病例
            </h3>
            <p
              className="mb-10 max-w-[260px] leading-relaxed"
              style={{ fontSize: '16px', color: '#64748d' }}
            >
              创建您的第一个病例，开始管理病程资料
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="cursor-pointer transition-all duration-200"
              style={{
                backgroundColor: '#059669',
                color: '#ffffff',
                fontSize: '15px',
                fontWeight: 500,
                borderRadius: '6px',
                padding: '10px 24px',
                border: 'none',
                boxShadow: 'rgba(50,50,93,0.11) 0 4px 6px, rgba(0,0,0,0.08) 0 1px 3px',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#047857';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#059669';
              }}
            >
              新建病例
            </button>
          </div>
        ) : (
          /* Case Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cases.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/cases/${c.id}`)}
                className="text-left cursor-pointer transition-all duration-300 group"
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e5edf5',
                  borderRadius: '8px',
                  padding: '24px',
                  boxShadow: 'rgba(50,50,93,0.1) 0 2px 5px -1px, rgba(0,0,0,0.06) 0 1px 3px -1px',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow =
                    'rgba(50,50,93,0.25) 0 6px 12px -2px, rgba(0,0,0,0.1) 0 3px 7px -3px';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow =
                    'rgba(50,50,93,0.1) 0 2px 5px -1px, rgba(0,0,0,0.06) 0 1px 3px -1px';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                }}
              >
                {/* Patient initial circle */}
                <div className="mb-4">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: 'rgba(5,150,105,0.1)',
                      color: '#059669',
                      fontSize: '16px',
                      fontWeight: 600,
                    }}
                  >
                    {c.patientName.charAt(0)}
                  </div>
                </div>

                {/* Patient Name */}
                <h3
                  style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    color: '#061b31',
                    lineHeight: 1.2,
                  }}
                >
                  {c.patientName}
                </h3>

                {/* Diagnosis */}
                <p
                  className="mt-1 line-clamp-2"
                  style={{ fontSize: '14px', color: '#64748d' }}
                >
                  {c.diagnosis}
                </p>

                {/* Bottom row */}
                <div
                  className="flex items-center justify-between mt-5"
                  style={{ fontSize: '12px', color: '#64748d' }}
                >
                  <span>{c.fileCount} 份文件</span>
                  <span>{formatDate(c.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* New Case Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
            onClick={() => setShowModal(false)}
          />
          <div
            className="relative w-full max-w-[480px] overflow-hidden"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              boxShadow: 'rgba(50,50,93,0.25) 0 6px 12px -2px, rgba(0,0,0,0.1) 0 3px 7px -3px',
            }}
          >
            <div className="p-8">
              <h2
                style={{
                  fontSize: '22px',
                  fontWeight: 400,
                  color: '#061b31',
                  marginBottom: '4px',
                }}
              >
                新建病例
              </h2>
              <p
                className="mb-7"
                style={{ fontSize: '15px', color: '#64748d' }}
              >
                填写患者基本信息
              </p>

              <form onSubmit={handleCreate} className="space-y-5">
                <div>
                  <label
                    className="block mb-2 uppercase"
                    style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#273951',
                      letterSpacing: '0.5px',
                    }}
                  >
                    患者姓名
                  </label>
                  <input
                    type="text"
                    value={form.patientName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, patientName: e.target.value }))
                    }
                    placeholder="请输入患者姓名"
                    className="w-full outline-none transition-all placeholder:text-[#64748d]"
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
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label
                    className="block mb-2 uppercase"
                    style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#273951',
                      letterSpacing: '0.5px',
                    }}
                  >
                    诊断信息
                  </label>
                  <input
                    type="text"
                    value={form.diagnosis}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, diagnosis: e.target.value }))
                    }
                    placeholder="例如：肺癌 IIIA 期"
                    className="w-full outline-none transition-all placeholder:text-[#64748d]"
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
                    required
                  />
                </div>

                <div>
                  <label
                    className="block mb-2 uppercase"
                    style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#273951',
                      letterSpacing: '0.5px',
                    }}
                  >
                    备注
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    placeholder="可选：添加一些备注信息"
                    rows={3}
                    className="w-full outline-none transition-all resize-none placeholder:text-[#64748d]"
                    style={{
                      padding: '10px 12px',
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
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 cursor-pointer transition-colors"
                    style={{
                      height: '44px',
                      fontSize: '15px',
                      fontWeight: 400,
                      color: '#059669',
                      backgroundColor: 'rgba(5,150,105,0.06)',
                      border: '1px solid rgba(83,58,253,0.2)',
                      borderRadius: '6px',
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 cursor-pointer transition-all"
                    style={{
                      height: '44px',
                      fontSize: '15px',
                      fontWeight: 500,
                      color: '#ffffff',
                      backgroundColor: '#059669',
                      border: 'none',
                      borderRadius: '6px',
                      opacity: submitting ? 0.6 : 1,
                      boxShadow: 'rgba(50,50,93,0.11) 0 4px 6px, rgba(0,0,0,0.08) 0 1px 3px',
                    }}
                  >
                    {submitting ? '创建中...' : '创建'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
