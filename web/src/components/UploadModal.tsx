import { useState, useRef, useCallback } from 'react';
import api from '../lib/api';

interface UploadModalProps {
  caseId: string;
  onClose: () => void;
  onUploadComplete: () => void;
}

type UploadTab = 'file' | 'camera' | 'text';

export default function UploadModal({
  caseId,
  onClose,
  onUploadComplete,
}: UploadModalProps) {
  const [activeTab, setActiveTab] = useState<UploadTab>('file');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState('');
  const [textContent, setTextContent] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const getErrorMessage = (err: unknown) => {
    if (
      typeof err === 'object' &&
      err !== null &&
      'response' in err &&
      typeof (err as { response?: unknown }).response === 'object'
    ) {
      const response = (err as { response?: { data?: { error?: string } } }).response;
      if (response?.data?.error) {
        return response.data.error;
      }
    }
    if (err instanceof Error) {
      return err.message;
    }
    return '上传失败，请重试';
  };

  const handleFiles = async (files: FileList | File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setError('');
    const fileList = Array.from(files);
    try {
      for (let index = 0; index < fileList.length; index += 1) {
        const formData = new FormData();
        formData.append('file', fileList[index]);
        setUploadProgress(`上传中 ${index + 1}/${fileList.length}`);
        await api.post(`/cases/${caseId}/documents/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      onUploadComplete();
    } catch (err) {
      console.error('Upload failed:', err);
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const handleTextSubmit = async () => {
    if (!textContent.trim()) return;
    setUploading(true);
    setError('');
    try {
      await api.post(`/cases/${caseId}/documents/text`, {
        title: textTitle.trim() || '文本记录',
        content: textContent,
      });
      onUploadComplete();
    } catch (err) {
      console.error('Text submit failed:', err);
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [caseId]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const tabs: { key: UploadTab; label: string; icon: React.ReactNode }[] = [
    {
      key: 'file',
      label: '选择文件',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      ),
    },
    {
      key: 'camera',
      label: '拍照',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
        </svg>
      ),
    },
    {
      key: 'text',
      label: '粘贴文本',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white w-full sm:max-w-[520px] sm:rounded-2xl rounded-t-2xl shadow-[rgba(0,0,0,0.2)_0_8px_32px] overflow-hidden max-h-[85dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-[22px] font-semibold text-[#1d1d1f]">
            添加资料
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 bg-[#e8e8ed] hover:bg-[#d2d2d7] rounded-full flex items-center justify-center cursor-pointer transition-colors"
          >
            <svg className="w-4 h-4 text-[#86868b]" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 mb-5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 h-[40px] rounded-xl text-[14px] font-medium cursor-pointer transition-all ${
                activeTab === tab.key
                  ? 'bg-[#0071e3] text-white'
                  : 'bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 pb-6 overflow-y-auto flex-1">
          {activeTab === 'file' && (
            <>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  dragOver
                    ? 'border-[#0071e3] bg-[#0071e3]/5'
                    : 'border-[#d2d2d7] hover:border-[#86868b]'
                }`}
              >
                <div className="w-14 h-14 mx-auto mb-4 bg-[#f5f5f7] rounded-full flex items-center justify-center">
                  <svg className="w-7 h-7 text-[#86868b]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <p className="text-[17px] font-medium text-[#1d1d1f] mb-1">
                  {dragOver ? '松手上传' : '拖放文件到此处'}
                </p>
                <p className="text-[14px] text-[#86868b]">
                  或点击选择文件 (PDF, 图片, DICOM)
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.dcm"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
                className="hidden"
              />
            </>
          )}

          {activeTab === 'camera' && (
            <div className="text-center py-6">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="w-20 h-20 mx-auto mb-4 bg-[#0071e3] hover:bg-[#0077ED] rounded-full flex items-center justify-center cursor-pointer transition-colors active:scale-95"
              >
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                </svg>
              </button>
              <p className="text-[17px] font-medium text-[#1d1d1f] mb-1">
                拍照上传
              </p>
              <p className="text-[14px] text-[#86868b]">
                拍摄检查报告、处方单等医疗文件
              </p>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
                className="hidden"
              />
            </div>
          )}

          {activeTab === 'text' && (
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-[#86868b] mb-2">
                  标题
                </label>
                <input
                  type="text"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="例如：门诊记录、医嘱"
                  className="w-full h-[44px] px-4 text-[15px] text-[#1d1d1f] bg-[#f5f5f7] rounded-xl outline-none focus:ring-2 focus:ring-[#0071e3] placeholder:text-[#aeaeb2] transition-all"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#86868b] mb-2">
                  内容
                </label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="粘贴或输入文本内容..."
                  rows={8}
                  className="w-full px-4 py-3 text-[15px] text-[#1d1d1f] bg-[#f5f5f7] rounded-xl outline-none focus:ring-2 focus:ring-[#0071e3] placeholder:text-[#aeaeb2] resize-none transition-all"
                />
              </div>
              <button
                onClick={handleTextSubmit}
                disabled={uploading || !textContent.trim()}
                className="w-full h-[44px] text-[15px] font-medium text-white bg-[#0071e3] hover:bg-[#0077ED] disabled:opacity-50 rounded-xl transition-all cursor-pointer active:scale-[0.98]"
              >
                {uploading ? '提交中...' : '提交'}
              </button>
            </div>
          )}

          {/* Upload progress */}
          {uploading && activeTab !== 'text' && (
            <div className="mt-5 text-center">
              <div className="w-8 h-8 mx-auto mb-3 border-[3px] border-[#0071e3] border-t-transparent rounded-full animate-spin" />
              <p className="text-[15px] text-[#86868b]">{uploadProgress || '上传中...'}</p>
            </div>
          )}

          {error && (
            <p className="mt-4 text-center" style={{ fontSize: '14px', color: '#b91c1c' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
