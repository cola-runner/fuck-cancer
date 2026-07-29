import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import Layout from '../components/Layout';
import DocumentCard from '../components/DocumentCard';
import UploadModal from '../components/UploadModal';
import ResearchModal from '../components/ResearchModal';
import type { SourceAuthority } from '../lib/source-label';

interface CaseDetail {
  id: string;
  patientName: string;
  diagnosis: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  fileName: string | null;
  fileType: string | null;
  textContent: string | null;
  sourceUrl: string | null;
  origin: 'research' | 'auto' | null;
  sourceAuthority?: SourceAuthority | null;
  sourceStatus: 'processing' | 'ready' | 'error';
  sourceError: string | null;
  coverageStatus: 'pending' | 'ready' | 'error';
  coverageError: string | null;
  createdAt: string;
}

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ patientName: '', diagnosis: '' });
  const [retryingDocId, setRetryingDocId] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});

  const loadCase = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const [caseRes, docsRes] = await Promise.all([
        api.get(`/cases/${id}`),
        api.get(`/cases/${id}/documents`),
      ]);
      setCaseData(caseRes.data.case);
      setDocuments(docsRes.data.documents || []);
      setEditForm({ patientName: caseRes.data.case.patientName, diagnosis: caseRes.data.case.diagnosis || '' });
    } catch (err) {
      console.error('Failed to load case:', err);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadCase(); }, [loadCase]);

  useEffect(() => {
    if (!id) return;
    const now = Date.now();
    const hasRecentActive = documents.some((d) => {
      const active = d.sourceStatus === 'processing'
        || (d.origin === null && d.coverageStatus === 'pending');
      return active && now - new Date(d.createdAt).getTime() < 10 * 60 * 1000;
    });
    // keep polling a while after the newest doc — the drug-coverage pipeline
    // adds official leaflets a couple minutes after an upload finishes.
    const hasRecent = documents.some((d) => now - new Date(d.createdAt).getTime() < 3 * 60 * 1000);
    if (!hasRecentActive && !hasRecent) return;
    const t = window.setTimeout(() => { void loadCase({ silent: true }); }, hasRecentActive ? 2000 : 6000);
    return () => window.clearTimeout(t);
  }, [documents, id, loadCase]);

  const handleSaveEdit = async () => {
    try {
      const { data } = await api.patch(`/cases/${id}`, editForm);
      setCaseData(data.case);
      setEditing(false);
    } catch (err) {
      console.error('Failed to update case:', err);
    }
  };

  const handleRefreshDoc = async (documentId: string) => {
    setRetryingDocId(documentId);
    try {
      const { data } = await api.post(`/documents/${documentId}/refresh`);
      if (data.document) {
        setDocuments((prev) => prev.map((d) => (d.id === documentId ? data.document : d)));
      }
    } catch (err) {
      console.error('Failed to refresh document:', err);
      await loadCase({ silent: true });
    } finally {
      setRetryingDocId(null);
    }
  };

  const handleDeleteDoc = async (documentId: string) => {
    const target = documents.find((document) => document.id === documentId);
    if (!window.confirm(`确定删除“${target?.fileName || '这份资料'}”吗？`)) return;

    setDeletingDocId(documentId);
    setDeleteErrors((prev) => {
      const next = { ...prev };
      delete next[documentId];
      return next;
    });
    try {
      await api.delete(`/documents/${documentId}`);
      setDocuments((prev) => prev.filter((document) => document.id !== documentId));
    } catch (err) {
      console.error('Failed to delete document:', err);
      setDeleteErrors((prev) => ({
        ...prev,
        [documentId]: '删除失败，资料仍在，可重试',
      }));
    } finally {
      setDeletingDocId(null);
    }
  };

  const byNewest = (a: Document, b: Document) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const userDocs = documents.filter((d) => d.origin == null).sort(byNewest);
  const officialDocs = documents.filter((d) => d.origin != null).sort(byNewest);
  const hasOfficialAuto = documents.some(
    (d) => d.origin === 'auto' && d.sourceAuthority === 'official' && d.sourceStatus === 'ready',
  );

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center" style={{ padding: '120px 0' }}>
          <div className="fc-spin" style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid var(--sage)', borderTopColor: 'transparent' }} />
        </div>
      </Layout>
    );
  }

  if (!caseData) {
    return (
      <Layout>
        <div className="text-center" style={{ padding: '120px 0' }}>
          <p className="fc-muted" lang="zh" style={{ fontSize: 16 }}>病例不存在</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto" style={{ maxWidth: 640, padding: '18px 22px 130px' }}>
        {/* Back */}
        <button onClick={() => navigate('/cases')} className="flex items-center cursor-pointer"
          style={{ gap: 5, background: 'none', border: 'none', padding: 0, color: 'var(--sage-strong)', fontSize: 14, fontWeight: 600, marginBottom: 18 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 19l-7-7 7-7" /></svg>
          <span lang="zh">病例列表</span>
        </button>

        {/* Patient header */}
        {editing ? (
          <div className="fc-card" style={{ padding: 20, marginBottom: 24 }}>
            <label className="fc-label" lang="zh">患者姓名</label>
            <input className="fc-input" lang="zh" value={editForm.patientName} style={{ marginBottom: 14 }}
              onChange={(e) => setEditForm((f) => ({ ...f, patientName: e.target.value }))} />
            <label className="fc-label" lang="zh">诊断信息</label>
            <input className="fc-input" lang="zh" value={editForm.diagnosis}
              onChange={(e) => setEditForm((f) => ({ ...f, diagnosis: e.target.value }))} />
            <div className="flex" style={{ gap: 12, marginTop: 18 }}>
              <button onClick={() => setEditing(false)} className="fc-btn fc-btn-ghost" style={{ flex: 1, height: 46 }} lang="zh">取消</button>
              <button onClick={handleSaveEdit} className="fc-btn fc-btn-primary" style={{ flex: 1, height: 46 }} lang="zh">保存</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center" style={{ gap: 14, marginBottom: 18 }}>
            <div className="fc-tile fc-display" style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--sage-tint)', color: 'var(--sage-strong)', fontSize: 24 }}>
              {caseData.patientName.charAt(0)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className="fc-display" lang="zh" style={{ fontSize: 25, color: 'var(--ink)' }}>{caseData.patientName}</h1>
              <div className="fc-muted" lang="zh" style={{ fontSize: 14, marginTop: 1 }}>{caseData.diagnosis}</div>
            </div>
            <button onClick={() => setEditing(true)} className="fc-iconbtn" aria-label="编辑" style={{ color: 'var(--ink-2)' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m16.9 4.5 1.7-1.7a1.875 1.875 0 1 1 2.65 2.65L9.4 19.95 5 21l1.05-4.4z" /></svg>
            </button>
          </div>
        )}

        {/* Reassurance banner — the core feature, framed as care */}
        {hasOfficialAuto && (
          <div className="fc-rise" style={{ background: 'linear-gradient(135deg, var(--sage-tint) 0%, var(--sage-tint-2) 100%)', borderRadius: 'var(--r-lg)', padding: '16px 17px', display: 'flex', gap: 13, marginBottom: 26 }}>
            <div style={{ color: 'var(--sage-strong)', flexShrink: 0, marginTop: 1 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" strokeWidth="1.6" /></svg>
            </div>
            <div>
              <div lang="zh" style={{ fontSize: 15, fontWeight: 600, color: 'var(--sage-strong)' }}>已为你收集用药资料</div>
              <p lang="zh" style={{ fontSize: 13.5, color: 'var(--sage-strong)', opacity: .9, marginTop: 3 }}>
                至少一份已就绪资料标记为官方来源；具体来源请以资料卡和原文链接为准。
              </p>
            </div>
          </div>
        )}

        {/* Your uploads */}
        <SectionHeader
          title="你的资料"
          action={<HeaderBtn onClick={() => setShowUpload(true)} icon="plus" label="添加" />}
        />
        {userDocs.length === 0 ? (
          <EmptyHint text="还没有资料，点「添加」上传出院记录、检查报告或处方照片。" />
        ) : (
          userDocs.map((d) => (
            <DocumentCard
              key={d.id}
              document={d}
              onRetry={handleRefreshDoc}
              retrying={retryingDocId === d.id}
              onDelete={handleDeleteDoc}
              deleting={deletingDocId === d.id}
              deleteError={deleteErrors[d.id]}
            />
          ))
        )}

        {/* Official / collected */}
        <div style={{ marginTop: 26 }}>
          <SectionHeader
            title="用药说明与资料"
            action={<HeaderBtn onClick={() => setShowResearch(true)} icon="search" label="搜索资料" />}
          />
          {officialDocs.length === 0 ? (
            <EmptyHint text="上传含药物的资料后，这里会自动补充用药说明与相关资料；也可以手动搜索。" />
          ) : (
            officialDocs.map((d) => (
              <DocumentCard
                key={d.id}
                document={d}
                onRetry={handleRefreshDoc}
                retrying={retryingDocId === d.id}
                onDelete={handleDeleteDoc}
                deleting={deletingDocId === d.id}
                deleteError={deleteErrors[d.id]}
              />
            ))
          )}
        </div>
      </div>

      {/* Sticky ask bar */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center', padding: '10px 22px calc(16px + env(safe-area-inset-bottom))', background: 'linear-gradient(180deg, rgba(239,231,220,0), var(--canvas) 42%)', pointerEvents: 'none' }}>
        <button onClick={() => navigate(`/cases/${id}/chat`)} className="fc-btn fc-btn-coral" lang="zh" style={{ width: '100%', maxWidth: 596, height: 56, pointerEvents: 'auto' }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.9L18.8 9.7 13.8 11.5 12 16.4 10.2 11.5 5.2 9.7 10.2 7.9z" /></svg>
          问问 AI（基于以上资料）
        </button>
      </div>

      {showUpload && (
        <UploadModal caseId={id!} onClose={() => setShowUpload(false)} onUploadComplete={() => { setShowUpload(false); loadCase({ silent: true }); }} />
      )}
      {showResearch && (
        <ResearchModal caseId={id!} onClose={() => setShowResearch(false)} onImportComplete={() => { setShowResearch(false); loadCase({ silent: true }); }} />
      )}
    </Layout>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between" style={{ margin: '4px 2px 12px' }}>
      <span lang="zh" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '.3px' }}>{title}</span>
      {action}
    </div>
  );
}

function HeaderBtn({ onClick, icon, label }: { onClick: () => void; icon: 'plus' | 'search'; label: string }) {
  return (
    <button onClick={onClick} className="flex items-center cursor-pointer" style={{ gap: 5, background: 'none', border: 'none', padding: 0, color: 'var(--sage-strong)', fontSize: 13, fontWeight: 600 }}>
      {icon === 'plus' ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.2-3.2" /></svg>
      )}
      <span lang="zh">{label}</span>
    </button>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="fc-card" style={{ padding: '18px 16px', background: 'var(--surface-2)', boxShadow: 'none' }}>
      <p className="fc-muted" lang="zh" style={{ fontSize: 13.5 }}>{text}</p>
    </div>
  );
}
