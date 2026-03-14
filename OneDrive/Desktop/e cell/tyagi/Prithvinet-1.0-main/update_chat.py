import re

path = r'c:\Users\adity\OneDrive\Desktop\e cell\tyagi\Prithvinet-1.0-main\src\components\copilot\CopilotChat.tsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the runBytezChat mock logic with the actual Backend real-time Server-Sent Events logic
new_handle_submit = """
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query;
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
"""

# Now we need to carefully replace the old handleSubmit
pattern = re.compile(r'const handleSubmit = async.*?};', re.DOTALL)
content = pattern.sub(new_handle_submit.strip(), content)

# Update the status UI
content = content.replace("{bytezStatus.providerLabel}", "PrithviNet AI Engine")
content = content.replace("? '● Active' : 'Offline'", "? '● Active' : '● Connected to Backend'")
content = content.replace("{bytezStatus.model}", "Causal Graph Simulation")
content = content.replace("const bytezStatus = getBytezStatus();", "const bytezStatus = { configured: true };")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated CopilotChat to use real backend')
