import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { api } from "../../lib/api";
import { AshokEmblem } from "../../components/AshokEmblem";
import { MissionLifeLogo, AzadiLogo } from "../../components/GovLogos";
import { Shield, LogIn, Mail, Lock } from "lucide-react";

export function LoginPage() {
  const [email, setEmail] = useState("admin@cecb.gov.in");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cardVisible, setCardVisible] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
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

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setCardVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-[#0b2f22] bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/images/login-bg-fallback-blur.jpg')" }}
    >
      {/* Full-screen background video */}
      {!videoFailed && (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster="/images/login-bg-fallback-blur.jpg"
          onLoadedData={() => setVideoFailed(false)}
          onError={() => setVideoFailed(true)}
        >
          <source src="/videos/login-bg.mp4?v=4" type="video/mp4" />
        </video>
      )}

      {/* Overlay for readability */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Centered login layer */}
      <div className="relative z-20 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="pointer-events-none px-6">
            <h1
              className="text-5xl md:text-7xl font-black tracking-[0.08em] text-white"
              style={{ textShadow: '0 4px 18px rgba(0,0,0,0.45)' }}
            >
              PRITHVINET
            </h1>
            <p
              className="mt-3 text-base md:text-xl font-bold tracking-wide text-white"
              style={{ textShadow: '0 3px 12px rgba(0,0,0,0.42)' }}
            >
              Real-Time Environmental Monitoring Platform
            </p>
          </div>

          <div className={`w-[380px] max-w-full transform transition-all duration-[800ms] ease-out ${cardVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
            <div className="rounded-2xl border border-white/30 bg-white p-8 shadow-xl">
            <div className="mx-auto w-full">
            <div className="text-center mb-8">
              <div className="mb-4 flex items-center justify-center gap-4">
                <MissionLifeLogo height={34} />
                <AshokEmblem size={40} className="drop-shadow-sm" />
                <AzadiLogo height={40} />
              </div>
              <h1 className="text-3xl font-extrabold tracking-wide text-[#14532d]">PRITHVINET</h1>
              <p className="mt-1 text-sm font-medium text-gray-600">Environmental Monitoring Platform</p>
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
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 text-center text-white/80 text-[11px] py-3">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#FF9933] via-[#FFD700] to-[#138808]" />
        &copy; {new Date().getFullYear()} CECB, Govt. of Chhattisgarh | Designed by NIC
      </div>
    </div>
  );
}
