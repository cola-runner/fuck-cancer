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
    <div className="h-dvh flex flex-col" style={{ backgroundColor: '#f8fafc' }}>
      {/* Top Bar */}
      <div
        className="flex-shrink-0"
        style={{
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e5edf5',
          height: '56px',
        }}
      >
        <div className="max-w-[780px] mx-auto px-6 h-full flex items-center justify-between">
          <button
            onClick={() => navigate(`/cases/${id}`)}
            className="flex items-center gap-1 cursor-pointer transition-colors"
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
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            返回
          </button>
          <h1
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: '#061b31',
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
            }}
          >
            AI 对话
          </h1>
          <div className="w-10" />
        </div>
      </div>

      {/* API Key Banner */}
      {!hasApiKey && (
        <div
          className="flex-shrink-0"
          style={{
            backgroundColor: 'rgba(5,150,105,0.06)',
            border: '1px solid rgba(5,150,105,0.25)',
            borderRadius: '6px',
            margin: '12px 24px 0',
          }}
        >
          <div className="max-w-[780px] mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                style={{ color: '#059669' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
              </svg>
              <p style={{ fontSize: '14px', color: '#061b31' }}>
                配置 API Key 后解锁 AI 功能
              </p>
            </div>
            <button
              onClick={() => navigate('/settings')}
              className="cursor-pointer transition-colors"
              style={{
                fontSize: '14px',
                fontWeight: 500,
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
              <div
                className="w-8 h-8 rounded-full animate-spin"
                style={{ border: '3px solid #059669', borderTopColor: 'transparent' }}
              />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-20">
              <div
                className="w-16 h-16 mx-auto mb-4 flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #059669, #047857)',
                  borderRadius: '8px',
                }}
              >
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                </svg>
              </div>
              <h3
                style={{ fontSize: '18px', fontWeight: 400, color: '#061b31' }}
                className="mb-2"
              >
                开始对话
              </h3>
              <p
                className="max-w-[320px] mx-auto"
                style={{ fontSize: '15px', color: '#64748d' }}
              >
                AI 将基于该病例的所有资料为您解答问题
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="max-w-[85%]"
                    style={
                      msg.role === 'user'
                        ? {
                            backgroundColor: '#059669',
                            color: '#ffffff',
                            borderRadius: '12px 12px 2px 12px',
                            padding: '10px 16px',
                          }
                        : {
                            backgroundColor: '#ffffff',
                            color: '#061b31',
                            border: '1px solid #e5edf5',
                            borderRadius: '12px 12px 12px 2px',
                            padding: '12px 16px',
                            boxShadow: 'rgba(50,50,93,0.1) 0 2px 5px -1px, rgba(0,0,0,0.06) 0 1px 3px -1px',
                          }
                    }
                  >
                    <p style={{ fontSize: '15px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))}

              {/* Typing Indicator */}
              {sending && (
                <div className="flex justify-start">
                  <div
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5edf5',
                      borderRadius: '12px 12px 12px 2px',
                      padding: '14px 16px',
                      boxShadow: 'rgba(50,50,93,0.1) 0 2px 5px -1px, rgba(0,0,0,0.06) 0 1px 3px -1px',
                    }}
                  >
                    <div className="flex gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full animate-bounce [animation-delay:0ms]"
                        style={{ backgroundColor: '#64748d' }}
                      />
                      <div
                        className="w-2 h-2 rounded-full animate-bounce [animation-delay:150ms]"
                        style={{ backgroundColor: '#64748d' }}
                      />
                      <div
                        className="w-2 h-2 rounded-full animate-bounce [animation-delay:300ms]"
                        style={{ backgroundColor: '#64748d' }}
                      />
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
      <div
        className="flex-shrink-0"
        style={{
          backgroundColor: '#ffffff',
          borderTop: '1px solid #e5edf5',
          padding: '12px 0',
        }}
      >
        <div className="max-w-[780px] mx-auto px-4 py-0">
          <div className="flex items-end gap-3">
            <div
              className="flex-1"
              style={{
                border: '1px solid #e5edf5',
                borderRadius: '6px',
                padding: '10px 12px',
                backgroundColor: '#ffffff',
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入您的问题..."
                rows={1}
                className="w-full outline-none resize-none placeholder:text-[#64748d]"
                style={{
                  fontSize: '15px',
                  color: '#061b31',
                  backgroundColor: 'transparent',
                  minHeight: '24px',
                  maxHeight: '120px',
                  border: 'none',
                  padding: 0,
                }}
                disabled={!hasApiKey}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending || !hasApiKey}
              className="flex-shrink-0 flex items-center justify-center cursor-pointer disabled:cursor-not-allowed transition-colors"
              style={{
                width: '40px',
                height: '40px',
                backgroundColor: !input.trim() || sending || !hasApiKey ? '#e5edf5' : '#059669',
                color: !input.trim() || sending || !hasApiKey ? '#64748d' : '#ffffff',
                borderRadius: '6px',
                border: 'none',
                padding: '0 12px',
              }}
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
