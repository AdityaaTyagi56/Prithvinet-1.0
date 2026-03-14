import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { PublicPortal } from '../public/PublicPortal';
import { DashboardPage } from './DashboardPage';
import { ComplianceDashboard } from '../admin/ComplianceDashboard';
import { ForecastPage } from '../officer/ForecastPage';
import { AlertsDashboard } from './AlertsDashboard';
import { RegionalAnalytics } from './RegionalAnalytics';
import { IndustryTracker } from './IndustryTracker';
import { CopilotChat } from '../../components/copilot/CopilotChat';
import { 
  MessageSquare,
  LogOut,
  Wind,
  Droplets,
  Volume2,
} from 'lucide-react';
import type { PollutionType } from '../../lib/mockData';

type TabId = 'overview' | 'telemetry' | 'forecast' | 'compliance' | 'alerts' | 'regional' | 'industries';

export function UnifiedDashboard() {
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [pollutionType, setPollutionType] = useState<PollutionType>('air');

  const navItems: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'National Overview' },
    { id: 'telemetry', label: 'Live Monitoring' },
    { id: 'forecast', label: 'AI Forecast' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'regional', label: 'Regional Analytics' },
    { id: 'industries', label: 'Industry Tracker' },
  ];

  const typeConfig: Record<PollutionType, { icon: React.ReactNode; label: string; color: string; activeColor: string }> = {
    air:   { icon: <Wind className="h-4 w-4" />,     label: 'Air',   color: 'border-blue-300 text-blue-200 hover:bg-blue-800/30', activeColor: 'border-blue-400 bg-blue-800/50 text-white' },
    water: { icon: <Droplets className="h-4 w-4" />,  label: 'Water', color: 'border-cyan-300 text-cyan-200 hover:bg-cyan-800/30', activeColor: 'border-cyan-400 bg-cyan-800/50 text-white' },
    noise: { icon: <Volume2 className="h-4 w-4" />,   label: 'Noise', color: 'border-amber-300 text-amber-200 hover:bg-amber-800/30', activeColor: 'border-amber-400 bg-amber-800/50 text-white' },
  };

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex flex-col">
      {/* Tricolor stripe */}
      <div className="gov-stripe" />

      {/* Official Government Header */}
      <header className="gov-header">
        <div className="max-w-[1300px] mx-auto px-4 sm:px-6">
          {/* Top row: emblem + title + user info */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-4">
              {/* Ashoka Emblem placeholder */}
              <div className="flex-shrink-0">
                <div className="w-14 h-14 rounded-full bg-white/10 border-2 border-white/30 flex items-center justify-center text-2xl">
                  🏛️
                </div>
              </div>
              <div>
                <div className="text-[11px] text-blue-200 tracking-wide">Chhattisgarh Environment Conservation Board | छत्तीसगढ़ पर्यावरण संरक्षण बोर्ड</div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">
                  PrithviNet — National Environmental Monitoring System
                </h1>
                <div className="text-[11px] text-blue-200 tracking-wide">Ministry of Environment, Forest and Climate Change, Government of India</div>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-4">
              {/* Pollution Type Selector */}
              <div className="flex gap-1 bg-white/5 rounded-lg p-1 border border-white/10">
                {(Object.entries(typeConfig) as [PollutionType, typeof typeConfig.air][]).map(([type, cfg]) => (
                  <button
                    key={type}
                    onClick={() => setPollutionType(type)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                      pollutionType === type ? cfg.activeColor : cfg.color
                    }`}
                  >
                    {cfg.icon} {cfg.label}
                  </button>
                ))}
              </div>

              <div className="text-right text-xs">
                <div className="text-blue-200">Logged in as</div>
                <div className="font-semibold text-white">{(user as any)?.name || user?.email}</div>
                <div className="text-blue-300 text-[10px]">{user?.email}</div>
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-2 rounded border border-white/20 transition-colors"
                title="Logout"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          </div>

          {/* Navigation tabs */}
          <nav className="flex gap-0 -mb-px">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === item.id
                    ? 'border-[#FF9933] text-white bg-white/10'
                    : 'border-transparent text-blue-200 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Breadcrumb bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[1300px] mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            <span className="text-blue-700 hover:underline cursor-pointer">Home</span>
            <span className="mx-1.5">›</span>
            <span className="text-blue-700 hover:underline cursor-pointer">Dashboard</span>
            <span className="mx-1.5">›</span>
            <span className="text-gray-700 font-medium">{navItems.find(n => n.id === activeTab)?.label}</span>
          </div>
          <div className="text-xs text-gray-500">
            Last Updated: {new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-[1300px] w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'overview' && <PublicPortal pollutionType={pollutionType} />}
        {activeTab === 'telemetry' && <DashboardPage pollutionType={pollutionType} />}
        {activeTab === 'forecast' && <ForecastPage pollutionType={pollutionType} />}
        {activeTab === 'compliance' && <ComplianceDashboard pollutionType={pollutionType} />}
        {activeTab === 'alerts' && <AlertsDashboard />}
        {activeTab === 'regional' && <RegionalAnalytics />}
        {activeTab === 'industries' && <IndustryTracker />}
      </main>

      {/* Government Footer */}
      <footer className="gov-footer mt-auto">
        <div className="max-w-[1300px] mx-auto px-4 sm:px-6 py-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h4 className="text-white font-semibold text-sm mb-2">About PrithviNet</h4>
              <p className="text-gray-400 text-xs leading-relaxed">
                PrithviNet is the National Environmental Monitoring System operated under the supervision of the
                Chhattisgarh Environment Conservation Board (CECB) and Ministry of Environment, Forest and Climate Change (MoEFCC),
                Government of India.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-2">Important Links</h4>
              <ul className="text-xs space-y-1">
                <li><span className="text-blue-300 hover:underline cursor-pointer">Central Pollution Control Board (CPCB)</span></li>
                <li><span className="text-blue-300 hover:underline cursor-pointer">National Clean Air Programme (NCAP)</span></li>
                <li><span className="text-blue-300 hover:underline cursor-pointer">Air Quality Index Dashboard</span></li>
                <li><span className="text-blue-300 hover:underline cursor-pointer">Right to Information (RTI)</span></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-2">Contact</h4>
              <p className="text-gray-400 text-xs leading-relaxed">
                CECB Head Office, Sector 19, Atal Nagar<br />
                Naya Raipur, Chhattisgarh – 492002<br />
                Email: info-cecb@gov.in | Phone: 0771-2973100
              </p>
            </div>
          </div>
          <div className="border-t border-white/10 mt-5 pt-4 flex flex-col sm:flex-row justify-between items-center text-[11px] text-gray-500">
            <div>© {new Date().getFullYear()} Chhattisgarh Environment Conservation Board. All Rights Reserved.</div>
            <div>Designed & Developed by National Informatics Centre (NIC) | Content owned by CECB, Govt. of Chhattisgarh</div>
          </div>
        </div>
      </footer>

      {/* AI Assistant Widget */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
        {isCopilotOpen && (
          <div className="mb-3 w-[400px] shadow-xl rounded-lg overflow-hidden border border-gray-200 bg-white">
            <div className="bg-[#1a365d] flex justify-between items-center px-4 py-2.5">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-200" />
                <span className="font-semibold text-white text-sm">PrithviNet AI Assistant</span>
              </div>
              <button
                onClick={() => setIsCopilotOpen(false)}
                className="text-blue-200 hover:text-white text-lg leading-none"
              >
                ×
              </button>
            </div>
            <CopilotChat />
          </div>
        )}
        <button
          onClick={() => setIsCopilotOpen(!isCopilotOpen)}
          className="bg-[#1a365d] hover:bg-[#2a4a7f] text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transition-colors text-sm font-medium border border-[#2a4a7f]"
        >
          <MessageSquare className="h-5 w-5" />
          {isCopilotOpen ? 'Close' : 'AI Assistant'}
        </button>
      </div>
    </div>
  );
}