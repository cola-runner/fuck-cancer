import { useState, useRef, useCallback } from 'react';
import api from '../lib/api';

interface UploadModalProps {
  caseId: string;
  onClose: () => void;
  onUploadComplete: () => void;
}

type UploadTab = 'file' | 'camera' | 'text';

function getErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'response' in err && typeof (err as { response?: unknown }).response === 'object') {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  if (err instanceof Error) return err.message;
  return '上传失败，请重试';
}

export default function UploadModal({ caseId, onClose, onUploadComplete }: UploadModalProps) {
  const [activeTab, setActiveTab] = useState<UploadTab>('file');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState('');
  const [textContent, setTextContent] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setError('');
    const fileList = Array.from(files);
    try {
      for (let index = 0; index < fileList.length; index += 1) {
        const formData = new FormData();
        formData.append('file', fileList[index]);
        setUploadProgress(`上传中 ${index + 1}/${fileList.length}`);
        await api.post(`/cases/${caseId}/documents/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      onUploadComplete();
    } catch (err) {
      console.error('Upload failed:', err);
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  }, [caseId, onUploadComplete]);

  const handleTextSubmit = async () => {
    if (!textContent.trim()) return;
    setUploading(true);
    setError('');
    try {
      await api.post(`/cases/${caseId}/documents/text`, { title: textTitle.trim() || '文本记录', content: textContent });
      onUploadComplete();
    } catch (err) {
      console.error('Text submit failed:', err);
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const tabs: { key: UploadTab; label: string; icon: React.ReactNode }[] = [
    { key: 'file', label: '选择文件', icon: <Ic d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5M12 18v-6m-2.5 2.5L12 12l2.5 2.5" /> },
    { key: 'camera', label: '拍照', icon: <Ic d="M3 9a2 2 0 0 1 2-2h1.5l1-2h5l1 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" /> },
    { key: 'text', label: '粘贴文本', icon: <Ic d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5M8 13h8M8 17h5" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(45,40,35,0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="fc-card relative w-full fc-rise flex flex-col" style={{ maxWidth: 520, maxHeight: '86dvh', borderRadius: 26, boxShadow: 'var(--shadow-lg)' }}>
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: '22px 24px 14px' }}>
          <h2 className="fc-display" lang="zh" style={{ fontSize: 21, color: 'var(--ink)' }}>添加资料</h2>
          <button onClick={onClose} className="fc-iconbtn" aria-label="关闭" style={{ width: 34, height: 34, background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex" style={{ gap: 6, padding: '0 24px 16px' }}>
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} lang="zh"
              className="flex-1 flex items-center justify-center cursor-pointer"
              style={{ gap: 7, height: 42, borderRadius: 13, fontSize: 13.5, fontWeight: 600, border: 'none',
                background: activeTab === tab.key ? 'var(--sage)' : 'var(--surface-2)',
                color: activeTab === tab.key ? '#fff' : 'var(--ink-2)', transition: 'all .15s ease' }}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto" style={{ padding: '0 24px 24px', flex: 1 }}>
          {activeTab === 'file' && (
            <>
              <div onDrop={handleDrop} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className="text-center cursor-pointer"
                style={{ border: `2px dashed ${dragOver ? 'var(--sage)' : 'var(--line)'}`, borderRadius: 20, padding: '38px 20px', background: dragOver ? 'var(--sage-tint-2)' : 'transparent', transition: 'all .15s ease' }}>
                <div className="mx-auto flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--sage-tint)', color: 'var(--sage-strong)', marginBottom: 14 }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m-5 5 5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
                </div>
                <p lang="zh" style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{dragOver ? '松手上传' : '拖放文件到此处'}</p>
                <p className="fc-muted" lang="zh" style={{ fontSize: 13.5 }}>或点击选择（PDF、图片、音频、文档）</p>
              </div>
              <input ref={fileInputRef} type="file" multiple className="hidden"
                accept="image/*,audio/*,video/mp4,video/quicktime,.pdf,.txt,.md,.doc,.docx,.ppt,.pptx,.csv,.epub"
                onChange={(e) => e.target.files && handleFiles(e.target.files)} />
            </>
          )}

          {activeTab === 'camera' && (
            <div className="text-center" style={{ padding: '20px 0' }}>
              <button onClick={() => cameraInputRef.current?.click()} className="mx-auto flex items-center justify-center cursor-pointer"
                style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--coral)', color: '#fff', border: 'none', marginBottom: 16, boxShadow: 'var(--shadow-coral)' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9a2 2 0 0 1 2-2h1.5l1-2h5l1 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13.5" r="3.5" /></svg>
              </button>
              <p lang="zh" style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>拍照上传</p>
              <p className="fc-muted" lang="zh" style={{ fontSize: 13.5 }}>拍摄检查报告、处方单等</p>
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => e.target.files && handleFiles(e.target.files)} />
            </div>
          )}

          {activeTab === 'text' && (
            <div className="flex flex-col" style={{ gap: 16 }}>
              <div>
                <label className="fc-label" lang="zh">标题</label>
                <input className="fc-input" lang="zh" value={textTitle} onChange={(e) => setTextTitle(e.target.value)} placeholder="例如：门诊记录、医嘱" />
              </div>
              <div>
                <label className="fc-label" lang="zh">内容</label>
                <textarea className="fc-input" lang="zh" rows={7} value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="粘贴或输入文本内容…" />
              </div>
              <button onClick={handleTextSubmit} disabled={uploading || !textContent.trim()} className="fc-btn fc-btn-primary" lang="zh" style={{ width: '100%', height: 50 }}>
                {uploading ? '提交中…' : '提交'}
              </button>
            </div>
          )}

          {uploading && activeTab !== 'text' && (
            <div className="text-center" style={{ marginTop: 18 }}>
              <div className="fc-spin mx-auto" style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--sage)', borderTopColor: 'transparent', marginBottom: 10 }} />
              <p className="fc-muted" lang="zh" style={{ fontSize: 14 }}>{uploadProgress || '上传中…'}</p>
            </div>
          )}
          {error && <p lang="zh" className="text-center" style={{ fontSize: 13.5, color: 'var(--clay)', marginTop: 16 }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}

function Ic({ d }: { d: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}
