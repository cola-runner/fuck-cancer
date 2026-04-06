import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadChat();
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadChat = async () => {
    try {
      const [chatRes, settingsRes] = await Promise.all([
        api.get(`/cases/${id}/chat`),
        api.get('/settings').catch(() => ({ data: { apiKey: null } })),
      ]);
      setMessages(chatRes.data.messages || []);
      setHasApiKey(!!settingsRes.data.apiKey);
    } catch (err) {
      console.error('Failed to load chat:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      const { data } = await api.post(`/cases/${id}/chat`, {
        message: text,
      });
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== userMessage.id),
        data.userMessage,
        data.assistantMessage,
      ]);
    } catch (err) {
      console.error('Failed to send message:', err);
      // Add error message
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: '抱歉，发送消息失败。请重试。',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-dvh flex flex-col bg-[#f5f5f7]">
      {/* Header */}
      <div className="flex-shrink-0 bg-[rgba(0,0,0,0.8)] backdrop-blur-[20px] backdrop-saturate-[180%] text-white">
        <div className="max-w-[980px] mx-auto px-6 h-[52px] flex items-center justify-between">
          <button
            onClick={() => navigate(`/cases/${id}`)}
            className="flex items-center gap-1 text-[15px] text-white/80 hover:text-white cursor-pointer transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            返回
          </button>
          <h1 className="text-[15px] font-semibold">AI 对话</h1>
          <div className="w-10" />
        </div>
      </div>

      {/* API Key Banner */}
      {!hasApiKey && (
        <div className="flex-shrink-0 bg-[#fff3cd] border-b border-[#ffecb5]">
          <div className="max-w-[980px] mx-auto px-6 py-3 flex items-center justify-between">
            <p className="text-[14px] text-[#856404]">
              配置 API Key 后解锁 AI 功能
            </p>
            <button
              onClick={() => navigate('/settings')}
              className="text-[14px] font-medium text-[#0071e3] hover:text-[#0077ED] cursor-pointer transition-colors"
            >
              前往设置
            </button>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[780px] mx-auto px-6 py-6">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-[3px] border-[#0071e3] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-[#0071e3] to-[#40a9ff] rounded-2xl flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                </svg>
              </div>
              <h3 className="text-[19px] font-semibold text-[#1d1d1f] mb-2">
                开始对话
              </h3>
              <p className="text-[15px] text-[#86868b] max-w-[320px] mx-auto">
                AI 将基于该病例的所有资料为您解答问题
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-5 py-3 ${
                      msg.role === 'user'
                        ? 'bg-[#0071e3] text-white'
                        : 'bg-white text-[#1d1d1f] shadow-[rgba(0,0,0,0.08)_0_2px_8px]'
                    }`}
                  >
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))}

              {/* Typing Indicator */}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-white text-[#1d1d1f] shadow-[rgba(0,0,0,0.08)_0_2px_8px] rounded-2xl px-5 py-4">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 bg-[#86868b] rounded-full animate-bounce [animation-delay:0ms]" />
                      <div className="w-2 h-2 bg-[#86868b] rounded-full animate-bounce [animation-delay:150ms]" />
                      <div className="w-2 h-2 bg-[#86868b] rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input Bar */}
      <div className="flex-shrink-0 border-t border-[#d2d2d7]/50 bg-white/80 backdrop-blur-[20px]">
        <div className="max-w-[780px] mx-auto px-6 py-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 bg-[#f5f5f7] rounded-2xl px-4 py-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入您的问题..."
                rows={1}
                className="w-full text-[15px] text-[#1d1d1f] bg-transparent outline-none resize-none placeholder:text-[#aeaeb2] max-h-[120px]"
                style={{ minHeight: '24px' }}
                disabled={!hasApiKey}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending || !hasApiKey}
              className="flex-shrink-0 w-10 h-10 bg-[#0071e3] disabled:bg-[#aeaeb2] text-white rounded-full flex items-center justify-center cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
