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
  filename: string;
  category: string;
  date: string;
  summary?: string;
  thumbnailUrl?: string;
  fileUrl?: string;
  mimeType?: string;
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

  useEffect(() => {
    loadCase();
  }, [id]);

  const loadCase = async () => {
    try {
      const [caseRes, docsRes] = await Promise.all([
        api.get(`/cases/${id}`),
        api.get(`/cases/${id}/documents`),
      ]);
      setCaseData(caseRes.data.case);
      setDocuments(docsRes.data.documents || []);
      setEditForm({
        patientName: caseRes.data.case.patientName,
        diagnosis: caseRes.data.case.diagnosis,
      });
    } catch (err) {
      console.error('Failed to load case:', err);
    } finally {
      setLoading(false);
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
    loadCase();
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
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-[3px] border-[#0071e3] border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!caseData) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-[17px] text-[#86868b]">病例不存在</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-[980px] mx-auto px-6 py-8">
        {/* Back button */}
        <button
          onClick={() => navigate('/cases')}
          className="flex items-center gap-1 text-[15px] text-[#0071e3] hover:text-[#0077ED] mb-6 cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          返回病例列表
        </button>

        {/* Patient Info Bar */}
        <div className="bg-white rounded-2xl p-6 shadow-[rgba(0,0,0,0.08)_0_2px_8px] mb-8">
          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-[#86868b] mb-1">
                  患者姓名
                </label>
                <input
                  type="text"
                  value={editForm.patientName}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, patientName: e.target.value }))
                  }
                  className="w-full h-[44px] px-4 text-[17px] text-[#1d1d1f] bg-[#f5f5f7] rounded-xl outline-none focus:ring-2 focus:ring-[#0071e3] transition-all"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#86868b] mb-1">
                  诊断信息
                </label>
                <input
                  type="text"
                  value={editForm.diagnosis}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, diagnosis: e.target.value }))
                  }
                  className="w-full h-[44px] px-4 text-[17px] text-[#1d1d1f] bg-[#f5f5f7] rounded-xl outline-none focus:ring-2 focus:ring-[#0071e3] transition-all"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setEditing(false)}
                  className="h-[36px] px-5 text-[14px] text-[#0071e3] bg-[#f5f5f7] hover:bg-[#e8e8ed] rounded-lg transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="h-[36px] px-5 text-[14px] text-white bg-[#0071e3] hover:bg-[#0077ED] rounded-lg transition-colors cursor-pointer"
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-[28px] font-bold text-[#1d1d1f] tracking-tight">
                  {caseData.patientName}
                </h1>
                <p className="text-[17px] text-[#86868b] mt-1">
                  {caseData.diagnosis}
                </p>
                <p className="text-[13px] text-[#aeaeb2] mt-2">
                  创建于 {formatDate(caseData.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 text-[14px] text-[#0071e3] hover:text-[#0077ED] cursor-pointer transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                </svg>
                编辑
              </button>
            </div>
          )}
        </div>

        {/* Section Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[22px] font-semibold text-[#1d1d1f]">
            文件资料
          </h2>
          <span className="text-[15px] text-[#86868b]">
            {documents.length} 份文件
          </span>
        </div>

        {/* Document List */}
        {documents.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-[rgba(0,0,0,0.08)_0_2px_8px]">
            <div className="w-16 h-16 mx-auto mb-4 bg-[#f5f5f7] rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-[#aeaeb2]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <p className="text-[17px] text-[#86868b] mb-1">
              暂无文件
            </p>
            <p className="text-[15px] text-[#aeaeb2]">
              点击右下角按钮上传文件
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((doc) => (
                <DocumentCard key={doc.id} document={doc} />
              ))}
          </div>
        )}

        {/* AI Chat Entry */}
        <div className="mt-8">
          <button
            onClick={() => navigate(`/cases/${id}/chat`)}
            className="w-full bg-white rounded-2xl p-6 shadow-[rgba(0,0,0,0.08)_0_2px_8px] hover:shadow-[rgba(0,0,0,0.12)_0_4px_16px] transition-all duration-300 cursor-pointer group flex items-center gap-4"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-[#0071e3] to-[#40a9ff] rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
              </svg>
            </div>
            <div className="text-left flex-1">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f] group-hover:text-[#0071e3] transition-colors">
                AI 对话
              </h3>
              <p className="text-[15px] text-[#86868b]">
                基于病例资料进行 AI 问答
              </p>
            </div>
            <svg className="w-5 h-5 text-[#aeaeb2] group-hover:text-[#0071e3] transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Upload FAB */}
      <button
        onClick={() => setShowUpload(true)}
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#0071e3] hover:bg-[#0077ED] text-white rounded-full shadow-[rgba(0,113,227,0.4)_0_4px_16px] flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-[0.92] z-40"
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
