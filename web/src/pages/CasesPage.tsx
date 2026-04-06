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
      <div className="max-w-[980px] mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-[34px] font-bold text-[#1d1d1f] tracking-tight">
              病例列表
            </h1>
            <p className="mt-1 text-[17px] text-[#86868b]">
              管理您的所有病例记录
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-[#0071e3] hover:bg-[#0077ED] text-white text-[15px] font-medium rounded-[980px] h-[44px] px-6 transition-all duration-200 cursor-pointer active:scale-[0.98]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            新建病例
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-[3px] border-[#0071e3] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : cases.length === 0 ? (
          /* Empty State */
          <div className="text-center py-24">
            <div className="w-20 h-20 mx-auto mb-6 bg-[#e8e8ed] rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-[#86868b]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </div>
            <h3 className="text-[22px] font-semibold text-[#1d1d1f] mb-2">
              还没有病例
            </h3>
            <p className="text-[17px] text-[#86868b] mb-8">
              创建您的第一个病例，开始管理病程资料
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="bg-[#0071e3] hover:bg-[#0077ED] text-white text-[15px] font-medium rounded-[980px] h-[44px] px-8 transition-all duration-200 cursor-pointer active:scale-[0.98]"
            >
              新建病例
            </button>
          </div>
        ) : (
          /* Case Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {cases.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/cases/${c.id}`)}
                className="text-left bg-white rounded-2xl p-6 shadow-[rgba(0,0,0,0.08)_0_2px_8px] hover:shadow-[rgba(0,0,0,0.12)_0_4px_16px] transition-all duration-300 cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-[#f5f5f7] rounded-xl flex items-center justify-center group-hover:bg-[#0071e3]/10 transition-colors duration-300">
                    <svg className="w-6 h-6 text-[#86868b] group-hover:text-[#0071e3] transition-colors duration-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                  </div>
                  <span className="text-[13px] text-[#86868b]">
                    {c.fileCount} 份文件
                  </span>
                </div>
                <h3 className="text-[19px] font-semibold text-[#1d1d1f] mb-1">
                  {c.patientName}
                </h3>
                <p className="text-[15px] text-[#86868b] mb-3 line-clamp-2">
                  {c.diagnosis}
                </p>
                <p className="text-[13px] text-[#aeaeb2]">
                  更新于 {formatDate(c.updatedAt)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* New Case Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          <div className="relative bg-white rounded-2xl w-full max-w-[480px] shadow-[rgba(0,0,0,0.2)_0_8px_32px] overflow-hidden">
            <div className="p-8">
              <h2 className="text-[22px] font-semibold text-[#1d1d1f] mb-1">
                新建病例
              </h2>
              <p className="text-[15px] text-[#86868b] mb-6">
                填写患者基本信息
              </p>

              <form onSubmit={handleCreate} className="space-y-5">
                <div>
                  <label className="block text-[13px] font-medium text-[#86868b] mb-2 uppercase tracking-wide">
                    患者姓名
                  </label>
                  <input
                    type="text"
                    value={form.patientName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, patientName: e.target.value }))
                    }
                    placeholder="请输入患者姓名"
                    className="w-full h-[48px] px-4 text-[17px] text-[#1d1d1f] bg-[#f5f5f7] rounded-xl border-none outline-none focus:ring-2 focus:ring-[#0071e3] placeholder:text-[#aeaeb2] transition-all"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#86868b] mb-2 uppercase tracking-wide">
                    诊断信息
                  </label>
                  <input
                    type="text"
                    value={form.diagnosis}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, diagnosis: e.target.value }))
                    }
                    placeholder="例如：肺癌 IIIA 期"
                    className="w-full h-[48px] px-4 text-[17px] text-[#1d1d1f] bg-[#f5f5f7] rounded-xl border-none outline-none focus:ring-2 focus:ring-[#0071e3] placeholder:text-[#aeaeb2] transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#86868b] mb-2 uppercase tracking-wide">
                    备注
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    placeholder="可选：添加一些备注信息"
                    rows={3}
                    className="w-full px-4 py-3 text-[17px] text-[#1d1d1f] bg-[#f5f5f7] rounded-xl border-none outline-none focus:ring-2 focus:ring-[#0071e3] placeholder:text-[#aeaeb2] resize-none transition-all"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 h-[44px] text-[15px] font-medium text-[#0071e3] bg-[#f5f5f7] hover:bg-[#e8e8ed] rounded-xl transition-colors cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 h-[44px] text-[15px] font-medium text-white bg-[#0071e3] hover:bg-[#0077ED] disabled:opacity-50 rounded-xl transition-all cursor-pointer active:scale-[0.98]"
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
