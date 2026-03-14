import React, { useState, useRef, useEffect } from 'react';
import { getBytezStatus, runBytezChat } from '../../lib/bytez';

export function CopilotChat() {
  const bytezStatus = { configured: true };
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent | undefined, preset?: string) => {
    e?.preventDefault();
    const q = preset || query;
    if (!q.trim() || isLoading) return;

    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setQuery('');
    setIsLoading(true);

    try {
      // Connect to the REAL AI Copilot backend with Causal Graph Integration
      const token = localStorage.getItem('auth_token') || sessionStorage.getItem('prithvinet_store');
      
      const response = await fetch('http://127.0.0.1:8000/api/v1/copilot/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Optional: Add Auth Header if backend restricts it
        },
        body: JSON.stringify({
          session_id: "dashboard_session",
          query: q
        })
      });

      if (!response.ok) {
        throw new Error("Backend connection failed");
      }

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      // Handle the Event-Stream (SSE) Response from our Real AI Engine
      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');

      if (reader) {
        let aiText = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          // The backend streams direct text tokens
          aiText += chunk;
          setMessages(prev => {
            const newM = [...prev];
            newM[newM.length - 1].content = aiText;
            return newM;
          });
        }
      }
    } catch (err) {
      console.warn("Backend real AI failed, ensure uvicorn is running", err);
      // Fallback for UI continuity
      setMessages(prev => [...prev, { role: 'assistant', content: 'Simulation Assistant offline: Please start the backend Python server.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h2 className="text-base font-semibold text-[#14532d]">PrithviNet AI Copilot</h2>
        <p className="text-xs text-gray-500">Environmental Data Analysis Assistant</p>
        <div className="mt-1 flex items-center gap-2 text-[11px]">
          <span className="rounded px-2 py-0.5 border bg-green-50 text-green-700 border-green-200">
            {bytezStatus.configured ? '● Active' : '● Connected to Backend'}
          </span>
          <span className="rounded px-2 py-0.5 border bg-blue-50 text-blue-700 border-blue-200">
            PrithviNet AI Engine
          </span>
          <span className="text-gray-400 truncate max-w-[140px]">Causal Graph Simulation</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="text-4xl mb-3">🌍</div>
            <h3 className="text-base font-semibold text-gray-700 mb-1">PrithviNet AI Assistant</h3>
            <p className="text-xs text-gray-500 mb-5">Ask about air quality, pollution forecasts, compliance, or run what-if scenarios.</p>
            <div className="space-y-2 w-full">
              <button
                onClick={() => handleSubmit(undefined, "What's the current air quality situation?")}
                className="w-full text-left px-4 py-3 rounded bg-gray-50 border border-gray-200 text-sm text-gray-700 hover:border-[#14532d] hover:bg-green-50 transition-colors"
              >
                📊 What's the current air quality situation?
              </button>
              <button
                onClick={() => handleSubmit(undefined, "Analyze Bharat Steel SO2 emissions")}
                className="w-full text-left px-4 py-3 rounded bg-gray-50 border border-gray-200 text-sm text-gray-700 hover:border-[#14532d] hover:bg-green-50 transition-colors"
              >
                🏭 Analyze Bharat Steel SO2 emissions
              </button>
              <button
                onClick={() => handleSubmit(undefined, "Simulate festival shutdown impact")}
                className="w-full text-left px-4 py-3 rounded bg-gray-50 border border-gray-200 text-sm text-gray-700 hover:border-[#14532d] hover:bg-green-50 transition-colors"
              >
                🎆 Simulate festival shutdown impact
              </button>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-lg text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[#14532d] text-white'
                : 'bg-gray-100 text-gray-800 border border-gray-200'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[80%] p-3 rounded-lg bg-gray-100 text-gray-600 border border-gray-200">
              <span className="animate-pulse">Analyzing environmental data...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          <button
            onClick={() => handleSubmit(undefined, "Analyze Bharat Steel SO2 emissions")}
            className="whitespace-nowrap px-3 py-1.5 text-xs font-medium bg-green-50 text-[#14532d] rounded hover:bg-green-100 border border-green-200"
          >
            SO2 Scenario
          </button>
          <button
            onClick={() => handleSubmit(undefined, "Simulate festival shutdown impact")}
            className="whitespace-nowrap px-3 py-1.5 text-xs font-medium bg-green-50 text-[#14532d] rounded hover:bg-green-100 border border-green-200"
          >
            Festival Shutdown
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ask about air quality data..."
            className="flex-1 rounded border border-gray-300 bg-white text-gray-800 px-3 py-2 focus:border-[#14532d] focus:outline-none focus:ring-1 focus:ring-[#14532d] placeholder-gray-400 text-sm"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="px-4 py-2 bg-[#14532d] text-white rounded hover:bg-[#166534] disabled:opacity-50 text-sm font-medium"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
