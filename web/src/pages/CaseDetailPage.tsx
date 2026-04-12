import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import Layout from '../components/Layout';
import DocumentCard from '../components/DocumentCard';
import UploadModal from '../components/UploadModal';

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
  category: string | null;
  docDate: string | null;
  ocrText: string | null;
  aiSummary: string | null;
  analysisStatus: 'not_requested' | 'queued' | 'processing' | 'completed' | 'failed';
  analysisError: string | null;
  createdAt: string;
}

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ patientName: '', diagnosis: '' });
  const [retryingDocId, setRetryingDocId] = useState<string | null>(null);

  useEffect(() => {
    loadCase();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const hasActiveAnalysis = documents.some((doc) =>
      doc.analysisStatus === 'queued' || doc.analysisStatus === 'processing'
    );

    if (!hasActiveAnalysis) return;

    const timer = window.setTimeout(() => {
      loadCase({ silent: true });
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [documents, id]);

  const loadCase = async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const [caseRes, docsRes] = await Promise.all([
        api.get(`/cases/${id}`),
        api.get(`/cases/${id}/documents`),
      ]);
      setCaseData(caseRes.data.case);
      setDocuments(docsRes.data.documents || []);
      setEditForm({
        patientName: caseRes.data.case.patientName,
        diagnosis: caseRes.data.case.diagnosis || '',
      });
    } catch (err) {
      console.error('Failed to load case:', err);
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  };

  const handleSaveEdit = async () => {
    try {
      const { data } = await api.patch(`/cases/${id}`, editForm);
      setCaseData(data.case);
      setEditing(false);
    } catch (err) {
      console.error('Failed to update case:', err);
    }
  };

  const handleUploadComplete = () => {
    setShowUpload(false);
    loadCase({ silent: true });
  };

  const handleRetryAnalysis = async (documentId: string) => {
    setRetryingDocId(documentId);
    try {
      const { data } = await api.post(`/documents/${documentId}/reanalyze`);
      if (data.document) {
        setDocuments((prev) =>
          prev.map((doc) => (doc.id === documentId ? data.document : doc))
        );
      }
    } catch (err) {
      console.error('Failed to reanalyze document:', err);
      await loadCase({ silent: true });
    } finally {
      setRetryingDocId(null);
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

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-32">
          <div
            className="w-7 h-7 rounded-full animate-spin"
            style={{ border: '2.5px solid #059669', borderTopColor: 'transparent' }}
          />
        </div>
      </Layout>
    );
  }

  if (!caseData) {
    return (
      <Layout>
        <div className="text-center py-32">
          <p style={{ fontSize: '17px', color: '#64748d' }}>病例不存在</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-[1100px] mx-auto px-6 py-10">
        {/* Back button */}
        <button
          onClick={() => navigate('/cases')}
          className="flex items-center gap-1 mb-8 cursor-pointer transition-colors"
          style={{ fontSize: '14px', color: '#059669', background: 'none', border: 'none', padding: 0 }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = '#047857';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = '#059669';
          }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          病例列表
        </button>

        {/* Patient Info Card */}
        <div
          className="mb-10"
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e5edf5',
            borderRadius: '8px',
            padding: '32px',
            boxShadow: 'rgba(50,50,93,0.1) 0 2px 5px -1px, rgba(0,0,0,0.06) 0 1px 3px -1px',
          }}
        >
          {editing ? (
            <div className="space-y-5">
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
                  value={editForm.patientName}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, patientName: e.target.value }))
                  }
                  className="w-full outline-none transition-all"
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
                  value={editForm.diagnosis}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, diagnosis: e.target.value }))
                  }
                  className="w-full outline-none transition-all"
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
              </div>
              <div className="flex gap-3 pt-1">
              <button
                onClick={() => setEditing(false)}
                  className="cursor-pointer transition-colors"
                  style={{
                    height: '36px',
                    padding: '0 20px',
                    fontSize: '14px',
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
                  onClick={handleSaveEdit}
                  className="cursor-pointer transition-all"
                  style={{
                    height: '36px',
                    padding: '0 20px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#ffffff',
                    backgroundColor: '#059669',
                    border: 'none',
                    borderRadius: '6px',
                    boxShadow: 'rgba(50,50,93,0.11) 0 4px 6px, rgba(0,0,0,0.08) 0 1px 3px',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#047857';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#059669';
                  }}
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div>
                <h1
                  style={{
                    fontSize: '34px',
                    fontWeight: 300,
                    color: '#061b31',
                    letterSpacing: '-0.6px',
                    lineHeight: 1.2,
                  }}
                >
                  {caseData.patientName}
                </h1>
                <div className="mt-3">
                  <span
                    style={{
                      display: 'inline-block',
                      backgroundColor: 'rgba(5,150,105,0.08)',
                      color: '#059669',
                      fontSize: '13px',
                      fontWeight: 500,
                      borderRadius: '4px',
                      padding: '4px 12px',
                    }}
                  >
                    {caseData.diagnosis}
                  </span>
                </div>
                <p
                  className="mt-3"
                  style={{ fontSize: '13px', color: '#64748d' }}
                >
                  创建于 {formatDate(caseData.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 cursor-pointer transition-colors mt-1"
                style={{
                  fontSize: '14px',
                  color: '#059669',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = '#047857';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = '#059669';
                }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                </svg>
                编辑
              </button>
            </div>
          )}
        </div>

        {/* Documents Section Header */}
        <div className="mt-10 mb-4">
          <div className="flex items-center justify-between pb-3" style={{ borderBottom: '1px solid #e5edf5' }}>
            <span
              className="uppercase"
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#273951',
                letterSpacing: '0.5px',
              }}
            >
              文件资料
            </span>
            <span style={{ fontSize: '13px', color: '#64748d' }}>
              {documents.length > 0 ? `${documents.length} 份` : ''}
            </span>
          </div>
        </div>

        {/* Document List */}
        {documents.length === 0 ? (
          <div
            className="flex flex-col items-center text-center py-20"
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5edf5',
              borderRadius: '8px',
            }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
              style={{ backgroundColor: 'rgba(5,150,105,0.08)' }}
            >
              <svg
                className="w-7 h-7"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.2}
                stroke="currentColor"
                style={{ color: '#059669' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <p style={{ fontSize: '16px', fontWeight: 500, color: '#061b31' }} className="mb-1">
              暂无文件
            </p>
            <p style={{ fontSize: '14px', color: '#64748d' }}>
              点击右下角 + 按钮上传文件
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {[...documents]
              .sort(
                (a, b) =>
                  new Date(b.docDate || b.createdAt).getTime() -
                  new Date(a.docDate || a.createdAt).getTime()
              )
              .map((doc) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  onRetry={handleRetryAnalysis}
                  retrying={retryingDocId === doc.id}
                />
              ))}
          </div>
        )}

        {/* AI Chat Entry Card */}
        <div className="mt-8">
          <button
            onClick={() => navigate(`/cases/${id}/chat`)}
            className="w-full cursor-pointer transition-all duration-300 group flex items-stretch overflow-hidden"
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5edf5',
              borderRadius: '8px',
              boxShadow: 'rgba(50,50,93,0.1) 0 2px 5px -1px, rgba(0,0,0,0.06) 0 1px 3px -1px',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                'rgba(50,50,93,0.25) 0 6px 12px -2px, rgba(0,0,0,0.1) 0 3px 7px -3px';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                'rgba(50,50,93,0.1) 0 2px 5px -1px, rgba(0,0,0,0.06) 0 1px 3px -1px';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            }}
          >
            {/* Left gradient strip */}
            <div
              className="w-1.5 flex-shrink-0"
              style={{ background: 'linear-gradient(to bottom, #059669, #047857)' }}
            />

            <div className="flex items-center gap-5 flex-1 p-6 text-left">
              <div>
                <h3
                  style={{ fontSize: '16px', fontWeight: 600, color: '#061b31' }}
                >
                  AI 病情分析
                </h3>
                <p
                  className="mt-0.5"
                  style={{ fontSize: '14px', color: '#64748d' }}
                >
                  基于病例资料进行 AI 问答
                </p>
              </div>
            </div>

            <div
              className="flex items-center pr-6"
              style={{ color: '#64748d' }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>
        </div>

        {/* Bottom spacer for FAB */}
        <div className="h-24" />
      </div>

      {/* Upload FAB */}
      <button
        onClick={() => setShowUpload(true)}
        className="fixed bottom-8 right-8 flex items-center justify-center cursor-pointer transition-all duration-200 z-40"
        style={{
          width: '56px',
          height: '56px',
          backgroundColor: '#059669',
          color: '#ffffff',
          borderRadius: '50%',
          border: 'none',
          boxShadow: 'rgba(5,150,105,0.4) 0 4px 15px',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#047857';
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#059669';
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
        }}
      >
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      {/* Upload Modal */}
      {showUpload && (
        <UploadModal
          caseId={id!}
          onClose={() => setShowUpload(false)}
          onUploadComplete={handleUploadComplete}
        />
      )}
    </Layout>
  );
}
