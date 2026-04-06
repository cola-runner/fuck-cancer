import type React from 'react';
import type { Document } from '../pages/CaseDetailPage';

interface DocumentCardProps {
  document: Document;
}

const categoryColors: Record<string, { bg: string; text: string }> = {
  检查报告: { bg: 'bg-blue-50', text: 'text-blue-600' },
  影像资料: { bg: 'bg-purple-50', text: 'text-purple-600' },
  处方: { bg: 'bg-green-50', text: 'text-green-600' },
  病理: { bg: 'bg-red-50', text: 'text-red-600' },
  其他: { bg: 'bg-gray-50', text: 'text-gray-600' },
};

const fileTypeIcons: Record<string, React.ReactNode> = {
  pdf: (
    <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  ),
  image: (
    <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M2.25 18V6a2.25 2.25 0 0 1 2.25-2.25h15A2.25 2.25 0 0 1 21.75 6v12A2.25 2.25 0 0 1 19.5 20.25H4.5A2.25 2.25 0 0 1 2.25 18Z" />
    </svg>
  ),
  text: (
    <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  ),
};

function getFileIcon(mimeType?: string, filename?: string) {
  if (mimeType?.startsWith('image/') || filename?.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
    return fileTypeIcons.image;
  }
  if (mimeType === 'application/pdf' || filename?.endsWith('.pdf')) {
    return fileTypeIcons.pdf;
  }
  return fileTypeIcons.text;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function DocumentCard({ document: doc }: DocumentCardProps) {
  const colors = categoryColors[doc.category] || categoryColors['其他'];

  return (
    <div className="bg-white rounded-2xl p-5 shadow-[rgba(0,0,0,0.08)_0_2px_8px] hover:shadow-[rgba(0,0,0,0.12)_0_4px_16px] transition-all duration-300 flex gap-4 cursor-pointer group">
      {/* Thumbnail / Icon */}
      <div className="flex-shrink-0">
        {doc.thumbnailUrl ? (
          <img
            src={doc.thumbnailUrl}
            alt=""
            className="w-14 h-14 rounded-xl object-cover bg-[#f5f5f7]"
          />
        ) : (
          <div className="w-14 h-14 bg-[#f5f5f7] rounded-xl flex items-center justify-center">
            {getFileIcon(doc.mimeType, doc.filename)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <h4 className="text-[15px] font-semibold text-[#1d1d1f] truncate group-hover:text-[#0071e3] transition-colors">
            {doc.filename}
          </h4>
          {doc.category && (
            <span
              className={`flex-shrink-0 text-[12px] font-medium px-2.5 py-0.5 rounded-full ${colors.bg} ${colors.text}`}
            >
              {doc.category}
            </span>
          )}
        </div>
        <p className="text-[13px] text-[#86868b] mt-1">
          {formatDate(doc.date)}
        </p>
        {doc.summary && (
          <p className="text-[14px] text-[#86868b] mt-2 line-clamp-2 leading-relaxed">
            {doc.summary}
          </p>
        )}
      </div>
    </div>
  );
}
