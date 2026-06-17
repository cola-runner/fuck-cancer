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
  const [form, setForm] = useState<NewCaseForm>({ patientName: '', diagnosis: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadCases(); }, []);

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

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });

  return (
    <Layout>
      <div className="mx-auto" style={{ maxWidth: 1000, padding: '0 22px' }}>
        {/* Hero header */}
        <div style={{ paddingTop: 40, paddingBottom: 28 }}>
          <h1 className="fc-display" lang="zh" style={{ fontSize: 30, lineHeight: 1.3, color: 'var(--ink)' }}>
            你照顾的人，<br />我替你记着。
          </h1>
          <p className="fc-muted" lang="zh" style={{ fontSize: 15.5, marginTop: 10 }}>
            每位家人一个病程档案，资料、用药、问答都在一处。
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center" style={{ padding: '120px 0' }}>
            <div className="fc-spin" style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid var(--sage)', borderTopColor: 'transparent' }} />
          </div>
        ) : cases.length === 0 ? (
          <EmptyState onNew={() => setShowModal(true)} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 16, paddingBottom: 48 }}>
            {cases.map((c, i) => (
              <button
                key={c.id}
                onClick={() => navigate(`/cases/${c.id}`)}
                className="fc-card fc-rise text-left cursor-pointer"
                style={{ padding: 20, transition: 'transform .18s ease, box-shadow .2s ease', animationDelay: `${i * 60}ms` }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'none'; }}
              >
                <div className="fc-tile fc-display" style={{ width: 48, height: 48, borderRadius: 15, background: 'var(--sage-tint)', color: 'var(--sage-strong)', fontSize: 20, marginBottom: 14 }}>
                  {c.patientName.charAt(0)}
                </div>
                <h3 className="fc-display" lang="zh" style={{ fontSize: 18, color: 'var(--ink)' }}>{c.patientName}</h3>
                <p className="fc-muted line-clamp-2" lang="zh" style={{ fontSize: 13.5, marginTop: 3, minHeight: 38 }}>{c.diagnosis}</p>
                <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
                  <span className="fc-chip fc-chip-sage" lang="zh">{c.fileCount} 份资料</span>
                  <span className="fc-faint" lang="zh" style={{ fontSize: 12 }}>{formatDate(c.updatedAt)}</span>
                </div>
              </button>
            ))}

            <button
              onClick={() => setShowModal(true)}
              className="fc-rise cursor-pointer flex flex-col items-center justify-center"
              style={{ border: '1.5px dashed var(--line)', borderRadius: 'var(--r-lg)', background: 'transparent', color: 'var(--sage-strong)', minHeight: 160, gap: 8 }}
            >
              <PlusIcon />
              <span lang="zh" style={{ fontSize: 14.5, fontWeight: 600 }}>新建病例</span>
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <NewCaseModal
          form={form}
          setForm={setForm}
          submitting={submitting}
          onClose={() => setShowModal(false)}
          onSubmit={handleCreate}
        />
      )}
    </Layout>
  );
}

function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center text-center" style={{ padding: '90px 0' }}>
      <div className="flex items-center justify-center" style={{ width: 78, height: 78, borderRadius: '50%', background: 'var(--sage-tint)', color: 'var(--sage-strong)', marginBottom: 22 }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 19c0-7 5-13 14-13 0 9-6 14-14 13zM5 19c3-3 5-5 8-6.5" />
        </svg>
      </div>
      <h3 className="fc-display" lang="zh" style={{ fontSize: 20, color: 'var(--ink)', marginBottom: 8 }}>还没有病例</h3>
      <p className="fc-muted" lang="zh" style={{ fontSize: 15, maxWidth: 280, marginBottom: 26 }}>
        为第一位家人建个档案，开始把零散的资料收拢起来。
      </p>
      <button onClick={onNew} className="fc-btn fc-btn-primary" lang="zh"><PlusIcon /> 新建病例</button>
    </div>
  );
}

function NewCaseModal({ form, setForm, submitting, onClose, onSubmit }: {
  form: NewCaseForm;
  setForm: React.Dispatch<React.SetStateAction<NewCaseForm>>;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(45,40,35,0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="fc-card relative w-full fc-rise" style={{ maxWidth: 460, boxShadow: 'var(--shadow-lg)', borderRadius: 26, margin: '0 0 env(safe-area-inset-bottom)' }}>
        <div style={{ padding: 28 }}>
          <h2 className="fc-display" lang="zh" style={{ fontSize: 22, color: 'var(--ink)' }}>新建病例</h2>
          <p className="fc-muted" lang="zh" style={{ fontSize: 14, marginTop: 4, marginBottom: 22 }}>填写家人的基本信息</p>

          <form onSubmit={onSubmit} className="flex flex-col" style={{ gap: 18 }}>
            <div>
              <label className="fc-label" lang="zh">患者姓名</label>
              <input className="fc-input" lang="zh" value={form.patientName} autoFocus required
                onChange={(e) => setForm((f) => ({ ...f, patientName: e.target.value }))} placeholder="请输入患者姓名" />
            </div>
            <div>
              <label className="fc-label" lang="zh">诊断信息</label>
              <input className="fc-input" lang="zh" value={form.diagnosis} required
                onChange={(e) => setForm((f) => ({ ...f, diagnosis: e.target.value }))} placeholder="例如：肺癌 IIIA 期" />
            </div>
            <div>
              <label className="fc-label" lang="zh">备注（可选）</label>
              <textarea className="fc-input" lang="zh" rows={3} value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="想补充的情况…" />
            </div>
            <div className="flex" style={{ gap: 12, paddingTop: 4 }}>
              <button type="button" onClick={onClose} className="fc-btn fc-btn-ghost" style={{ flex: 1, height: 50 }} lang="zh">取消</button>
              <button type="submit" disabled={submitting} className="fc-btn fc-btn-primary" style={{ flex: 1, height: 50 }} lang="zh">
                {submitting ? '创建中…' : '创建'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
