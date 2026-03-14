import os

file_path = r'c:\Users\adity\OneDrive\Desktop\e cell\tyagi\Prithvinet-1.0-main\src\pages\auth\LoginPage.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

parts_top = content.split('      {/* Login form area */}')[0]
parts_bottom = content.split('      {/* Footer */}')[1]

new_login_area = """      {/* Login form area */}
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
                    onClick={() => setEmail("member-secretary@cecb.gov.in")}
                  >
                    <span className="font-bold text-green-900 group-hover:text-green-700">Head Office</span>
                    <span className="font-mono text-green-700 bg-green-100/50 px-2 py-1 rounded">member-secretary@...</span>
                  </div>
                  <div 
                    className="flex justify-between items-center cursor-pointer hover:bg-white p-2.5 rounded-lg transition-all group border border-transparent hover:border-green-100"
                    onClick={() => setEmail("ro.raipur@cecb.gov.in")}
                  >
                    <span className="font-bold text-green-900 group-hover:text-green-700">RO Raipur</span>
                    <span className="font-mono text-green-700 bg-green-100/50 px-2 py-1 rounded">ro.raipur@cecb...</span>
                  </div>
                  <div 
                    className="flex justify-between items-center cursor-pointer hover:bg-white p-2.5 rounded-lg transition-all group border border-transparent hover:border-green-100"
                    onClick={() => setEmail("ro.bhilai@cecb.gov.in")}
                  >
                    <span className="font-bold text-green-900 group-hover:text-green-700">RO Bhilai</span>
                    <span className="font-mono text-green-700 bg-green-100/50 px-2 py-1 rounded">ro.bhilai@cecb...</span>
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
"""

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(parts_top + new_login_area + parts_bottom)
