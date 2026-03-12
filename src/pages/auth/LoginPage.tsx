import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { DEMO_TOKEN } from '../../lib/mockData';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const setAuth = useAuthStore(state => state.setAuth);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    const user = {
      id: 'usr-' + Date.now(),
      email: email.trim(),
      name: username.trim(),
      role: 'super_admin',
      region_office_id: 'ro-1',
    };
    setAuth(user, DEMO_TOKEN);
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f0f4f8]">
      {/* Tricolor stripe */}
      <div className="gov-stripe" />
      
      {/* Government Header */}
      <div className="bg-[#1a365d] py-4 text-center text-white">
        <div className="text-[11px] text-blue-200 mb-1">Chhattisgarh Environment Conservation Board | छत्तीसगढ़ पर्यावरण संरक्षण मंडल</div>
        <h1 className="text-xl font-bold">PrithviNet — Environmental Monitoring System</h1>
        <div className="text-[11px] text-blue-200 mt-1">Ministry of Environment, Forest and Climate Change, Government of India</div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full gov-card overflow-hidden">
          <div className="gov-card-header text-center">
            🏤 Authorized Personnel Login
          </div>
          <div className="p-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-16 h-16 rounded-full bg-blue-50 border-2 border-[#1a365d]/20 flex items-center justify-center text-3xl">
                🏛️
              </div>
            </div>
            <p className="text-center text-gray-500 text-sm mb-6">Official access to PrithviNet Dashboard</p>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
                <p className="text-red-700 text-xs text-center">⚠ {error}</p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Full Name</label>
                <input 
                  type="text" 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="e.g. Rajesh Kumar"
                  className="mt-1 block w-full rounded border border-gray-300 bg-white text-gray-800 px-3 py-2 shadow-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email Address</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="e.g. rajesh.kumar@cecb.gov.in"
                  className="mt-1 block w-full rounded border border-gray-300 bg-white text-gray-800 px-3 py-2 shadow-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
                />
              </div>
              <button 
                type="submit"
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded text-sm font-semibold text-white bg-[#1a365d] hover:bg-[#2a4a7f] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1a365d] transition-colors"
              >
                Sign In to Dashboard
              </button>
            </form>
            <div className="mt-6 text-center text-[11px] text-gray-400">
              For authorized CECB / MoEFCC personnel only.
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-[#1a365d] text-center text-gray-400 text-[11px] py-3">
        © {new Date().getFullYear()} CECB, Govt. of Chhattisgarh | Designed by NIC
      </div>
    </div>
  );
}
