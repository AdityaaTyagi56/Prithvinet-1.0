import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { api } from "../../lib/api";
import { AshokEmblem } from "../../components/AshokEmblem";
import { MissionLifeLogo, AzadiLogo } from "../../components/GovLogos";
import { Shield, LogIn, Globe, Eye } from "lucide-react";

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
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full gov-card overflow-hidden shadow-lg">
          <div className="gov-card-header justify-center text-center">
            <Shield className="h-4 w-4" />
            Authorized Personnel Login
          </div>
          <div className="p-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <AshokEmblem size={56} />
            </div>
            <p className="text-center text-gray-500 text-sm mb-6">
              Official access to PrithviNet Dashboard
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-700 text-xs text-center">{error}</p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. admin@cecb.gov.in"
                  autoComplete="username"
                  className="mt-1 block w-full rounded-lg border border-gray-300 bg-white text-gray-800 px-3 py-2.5 shadow-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="mt-1 block w-full rounded-lg border border-gray-300 bg-white text-gray-800 px-3 py-2.5 shadow-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[#14532d] to-[#166534] hover:from-[#166534] hover:to-[#15803d] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    Sign In to Dashboard
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 bg-green-50 border border-green-100 rounded-lg p-3 text-center">
              <p className="text-[11px] text-green-700 font-medium">
                Demo credentials pre-filled
              </p>
              <p className="text-[10px] text-green-500 mt-0.5">
                admin@cecb.gov.in / password123
              </p>
            </div>

            <div className="mt-4 text-center text-[11px] text-gray-400">
              For authorized CECB / MoEFCC personnel only.
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
