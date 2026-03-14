import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { api } from "../../lib/api";
import { AshokEmblem } from "../../components/AshokEmblem";
import { MissionLifeLogo, AzadiLogo } from "../../components/GovLogos";
import { Shield, LogIn, Globe, Eye, Mail, Lock, Activity, Wind, Waves } from "lucide-react";

export function LoginPage() {
  const [email, setEmail] = useState("admin@cecb.gov.in");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password.trim()) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      const loginRes = await api.post('/auth/login', {
        email: email.trim(),
        password: password.trim(),
      });
      const { access_token } = loginRes.data;
      const meRes = await api.get('/auth/me');
      setAuth(meRes.data, access_token);
      navigate("/dashboard");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail) {
        setError(String(detail));
      } else if (err?.response?.status === 401) {
        setError("Invalid email or password. Please try again.");
      } else {
        setError(
          "Unable to connect to the server. Please ensure the backend is running.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f5f7f5]">
      {/* ═══ 1. Dark green top bar (PARIVESH style) ═══ */}
      <div className="parivesh-topbar">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2.5">
            {/* Indian tricolor flag */}
            <div className="flex-shrink-0 w-6 h-[14px] rounded-[2px] overflow-hidden flex flex-col shadow-sm">
              <div className="flex-1 bg-[#FF9933]" />
              <div className="flex-1 bg-white relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-[5px] h-[5px] rounded-full border border-[#000080]" />
                </div>
              </div>
              <div className="flex-1 bg-[#138808]" />
            </div>
            <span className="text-white/90 font-medium">भारत | Government of India</span>
          </div>
          <div className="flex items-center gap-2 text-white/80">
            <button className="hidden sm:flex items-center gap-1 hover:text-white text-[11px]">
              <Eye className="h-3 w-3" /> Screen Reader Access
            </button>
            <span className="text-white/25 hidden sm:inline">|</span>
            <span className="text-[11px]">A<sup>-</sup></span>
            <span className="text-[13px] font-bold">A</span>
            <span className="text-[15px] font-bold">A<sup>+</sup></span>
            <span className="text-white/25 mx-1">|</span>
            <button className="flex items-center gap-1 hover:text-white text-[11px] font-semibold">
              <Globe className="h-3 w-3" /> English
            </button>
          </div>
        </div>
      </div>

      {/* ═══ 2. White header band (PARIVESH style) ═══ */}
      <div className="parivesh-header">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex items-center justify-between py-3 sm:py-4">
          {/* Left: PrithviNet Logo */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-[#14532d] via-[#16a34a] to-[#22c55e] flex items-center justify-center shadow-lg flex-shrink-0 border-2 border-green-200/50">
              <svg viewBox="0 0 40 40" className="w-8 h-8 sm:w-9 sm:h-9" fill="none">
                <path d="M20 4C20 4 8 12 8 24C8 30 13 36 20 36C27 36 32 30 32 24C32 12 20 4 20 4Z" fill="#4ade80" opacity="0.9" />
                <path d="M20 8C20 8 12 14 12 24C12 28 15 32 20 32" stroke="white" strokeWidth="1.5" fill="none" />
                <path d="M20 12L20 30" stroke="white" strokeWidth="1.2" />
                <path d="M20 18L15 22" stroke="white" strokeWidth="1" />
                <path d="M20 22L25 18" stroke="white" strokeWidth="1" />
              </svg>
            </div>
            <div>
              <div className="text-[10px] text-[#14532d]/60 font-medium">छत्तीसगढ़ पर्यावरण संरक्षण बोर्ड</div>
              <div className="text-xl sm:text-2xl font-bold text-[#14532d] leading-tight">PrithviNet</div>
              <div className="text-[10px] text-gray-400 hidden sm:block tracking-wider uppercase">Environmental Monitoring System</div>
            </div>
          </div>

          {/* Center: Ministry text */}
          <div className="hidden md:flex flex-col items-center text-center flex-1 px-6">
            <div className="text-base sm:text-lg font-bold text-[#14532d] leading-snug">पर्यावरण, वन और जलवायु परिवर्तन मंत्रालय</div>
            <div className="text-sm sm:text-[15px] font-semibold text-[#14532d] leading-snug mt-0.5">Ministry of Environment, Forest and Climate Change</div>
            <div className="text-[10px] text-gray-400 mt-1 tracking-wide">भारत सरकार | Government of India</div>
          </div>

          {/* Right: Logos + National Emblem */}
          <div className="flex items-center gap-4 sm:gap-5 flex-shrink-0">
            <div className="hidden lg:flex flex-col items-center">
              <MissionLifeLogo height={42} />
            </div>
            <div className="hidden lg:flex flex-col items-center">
              <AzadiLogo height={52} />
            </div>
            <AshokEmblem size={52} className="drop-shadow-md" />
          </div>
        </div>
      </div>

      {/* Login form area */}
      <div className="flex-1 flex flex-col md:flex-row relative z-0">
        {/* Left Side: Hero Branding */}
        <div className="hidden md:flex flex-col flex-1 bg-gradient-to-br from-[#064e3b] via-[#14532d] to-[#166534] relative overflow-hidden">
          <div className="absolute inset-0">
            <img 
              src="https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?q=80&w=2626&auto=format&fit=crop" 
              alt="Environment Forest"
              className="w-full h-full object-cover opacity-20 mix-blend-overlay"
            />
          </div>
          <div className="relative z-10 flex flex-col justify-center h-full p-12 lg:p-20 text-white">
            <div className="mb-8 flex gap-4">
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-xl">
                <Wind className="w-8 h-8 text-green-300" />
              </div>
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-xl">
                <Waves className="w-8 h-8 text-blue-300" />
              </div>
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-xl">
                <Activity className="w-8 h-8 text-amber-300" />
              </div>
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold mb-6 leading-tight drop-shadow-md">
              Smart Environmental<br/>
              <span className="text-green-400">Monitoring Platform</span>
            </h1>
            <p className="text-lg text-green-50 max-w-xl leading-relaxed mb-10 drop-shadow">
              Real-time air, water, and noise pollution tracking. AI-assisted compliance, predictive analytics, and regional risk mapping for actionable insights.
            </p>
            <div className="mt-auto">
              <div className="flex items-center gap-4 text-sm font-medium text-green-200/80">
                <div className="w-12 h-[1px] bg-green-200/40"></div>
                PS 01: Govt. of Chhattisgarh
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="w-full md:w-[480px] lg:w-[550px] bg-white flex flex-col justify-center px-8 py-12 md:px-12 shadow-[-20px_0_40px_-5px_rgba(0,0,0,0.1)] relative z-10">
          <div className="max-w-sm mx-auto w-full">
            <div className="text-center mb-8">
               <div className="mx-auto w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mb-5 border border-green-100 shadow-inner">
                 <Shield className="h-8 w-8 text-[#14532d]" />
               </div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Secure Portal Login</h2>
              <p className="text-sm text-gray-500 mt-2">Authorized PrithviNet access</p>
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 rounded-r-lg p-4 mb-6 animate-pulse">
                <p className="text-red-700 text-sm font-medium">{error}</p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Official Email Address
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400 group-focus-within:text-green-600 transition-colors">
                    <Mail className="h-5 w-5" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. admin@cecb.gov.in"
                    className="block w-full pl-11 pr-3 py-3 bg-[#f8faf8] border border-gray-200 rounded-xl text-gray-900 focus:bg-white focus:border-green-600 focus:ring-2 focus:ring-green-600/20 transition-all shadow-sm outline-none"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400 group-focus-within:text-green-600 transition-colors">
                    <Lock className="h-5 w-5" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="block w-full pl-11 pr-3 py-3 bg-[#f8faf8] border border-gray-200 rounded-xl text-gray-900 focus:bg-white focus:border-green-600 focus:ring-2 focus:ring-green-600/20 transition-all shadow-sm outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#14532d] to-[#166534] hover:from-[#166534] hover:to-[#15803d] focus:outline-none focus:ring-4 focus:ring-green-700/30 transition-all disabled:opacity-60 shadow-lg shadow-green-900/20 mt-6"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Authenticating...
                  </span>
                ) : (
                  <>
                    <LogIn className="h-5 w-5" />
                    Sign In to Dashboard
                  </>
                )}
              </button>
            </form>

            <div className="mt-10">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-white text-gray-400 font-medium tracking-wide uppercase text-xs">Govt Directory (Demo)</span>
                </div>
              </div>

              <div className="mt-6 bg-gradient-to-r from-green-50/50 to-emerald-50/50 border border-green-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-xs space-y-1">
                  <div
                    className="flex justify-between items-center cursor-pointer hover:bg-white p-2.5 rounded-lg transition-all group border border-transparent hover:border-green-100"
                    onClick={() => setEmail("admin@cecb.gov.in")}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-green-900 group-hover:text-green-700">System Admin</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 uppercase">Admin</span>
                    </div>
                    <span className="font-mono text-green-700 bg-green-100/50 px-2 py-1 rounded">admin@cecb...</span>
                  </div>
                  <div
                    className="flex justify-between items-center cursor-pointer hover:bg-white p-2.5 rounded-lg transition-all group border border-transparent hover:border-green-100"
                    onClick={() => setEmail("member-secretary@cecb.gov.in")}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-green-900 group-hover:text-green-700">Head Office</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 uppercase">Secretary</span>
                    </div>
                    <span className="font-mono text-green-700 bg-green-100/50 px-2 py-1 rounded">member-sec...@</span>
                  </div>
                  <div
                    className="flex justify-between items-center cursor-pointer hover:bg-white p-2.5 rounded-lg transition-all group border border-transparent hover:border-green-100"
                    onClick={() => setEmail("ro.raipur@cecb.gov.in")}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-green-900 group-hover:text-green-700">RO Raipur</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 uppercase">Regional</span>
                    </div>
                    <span className="font-mono text-green-700 bg-green-100/50 px-2 py-1 rounded">ro.raipur@...</span>
                  </div>
                  <div
                    className="flex justify-between items-center cursor-pointer hover:bg-white p-2.5 rounded-lg transition-all group border border-transparent hover:border-green-100"
                    onClick={() => setEmail("ro.bhilai@cecb.gov.in")}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-green-900 group-hover:text-green-700">RO Bhilai</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 uppercase">Regional</span>
                    </div>
                    <span className="font-mono text-green-700 bg-green-100/50 px-2 py-1 rounded">ro.bhilai@...</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-8 text-center text-[11px] text-gray-400 font-medium">
              For authorized CECB personnel only. <br/> Access is logged and monitored.
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}

      <div className="gov-footer text-center text-green-200/50 text-[11px] py-3 relative">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#FF9933] via-[#FFD700] to-[#138808]" />
        &copy; {new Date().getFullYear()} CECB, Govt. of Chhattisgarh | Designed by NIC
      </div>
    </div>
  );
}
