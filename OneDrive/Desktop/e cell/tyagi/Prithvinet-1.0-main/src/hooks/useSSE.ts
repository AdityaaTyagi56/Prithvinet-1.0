import { useState, useCallback } from 'react';

export function useSSE(url: string) {
  const [data, setData] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);

  const streamQuery = useCallback(async (payload: any) => {
    setIsStreaming(true);
    setData('');
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') {
              break;
            }
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.content) {
                setData(prev => prev + parsed.content);
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (error) {
      console.error('SSE Error:', error);
    } finally {
      setIsStreaming(false);
    }
  }, [url]);

  return { data, isStreaming, streamQuery };
}
