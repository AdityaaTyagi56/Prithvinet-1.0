import React, { useState, useCallback, useMemo } from 'react';
import { useAuthStore } from '../../store/authStore';
import { PublicPortal } from '../public/PublicPortal';
import { DashboardPage } from './DashboardPage';
import { ComplianceDashboard } from '../admin/ComplianceDashboard';
import { ForecastPage } from '../officer/ForecastPage';
import { AlertsDashboard } from './AlertsDashboard';
import { RegionalAnalytics } from './RegionalAnalytics';
import { IndustryTracker } from './IndustryTracker';
import { AqiLogsPage } from './AqiLogsPage';
import { AshokEmblem } from '../../components/AshokEmblem';
import { MissionLifeLogo, AzadiLogo } from '../../components/GovLogos';
import {
  LogOut, Wind, Droplets, Volume2, Globe, Eye, Search, Phone, Mail,
  ExternalLink, ChevronRight, LayoutDashboard, Activity, Brain, ShieldCheck,
  Bell, MapPin, Factory, Home, Sun, Moon, User, Menu, X, Flag,
  FileSpreadsheet, MessageSquare, Shield, Briefcase,
} from 'lucide-react';
import type { PollutionType } from '../../lib/mockData';

type TabId = 'overview' | 'telemetry' | 'forecast' | 'compliance' | 'alerts' | 'regional' | 'industries' | 'aqi-logs';

// ─── Role → Tab Permissions ─────────────────────────────────
const ROLE_TABS: Record<string, TabId[]> = {
  admin:            ['overview', 'telemetry', 'forecast', 'compliance', 'alerts', 'regional', 'industries', 'aqi-logs'],
  member_secretary: ['overview', 'telemetry', 'forecast', 'compliance', 'alerts', 'regional', 'industries', 'aqi-logs'],
  regional_officer: ['overview', 'telemetry', 'forecast', 'alerts', 'regional', 'aqi-logs'],
};
const DEFAULT_TABS: TabId[] = ['overview', 'telemetry', 'forecast', 'aqi-logs'];

// ─── Role display config ────────────────────────────────────
const ROLE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  admin:            { label: 'Administrator', color: 'bg-red-600', icon: <Shield className="h-3 w-3" /> },
  member_secretary: { label: 'Member Secretary', color: 'bg-purple-600', icon: <Briefcase className="h-3 w-3" /> },
  regional_officer: { label: 'Regional Officer', color: 'bg-blue-600', icon: <MapPin className="h-3 w-3" /> },
};

// Bilingual labels
const LABEL = {
  en: {
    board: 'Chhattisgarh Environment Conservation Board',
    boardHi: 'छत्तीसगढ़ पर्यावरण संरक्षण बोर्ड',
    title: 'PrithviNet — National Environmental Monitoring System',
    titleHi: 'पृथ्वीनेट — राष्ट्रीय पर्यावरण निगरानी प्रणाली',
    ministry: 'Ministry of Environment, Forest and Climate Change',
    ministryHi: 'पर्यावरण, वन और जलवायु परिवर्तन मंत्रालय',
    govOfIndia: 'Government of India',
    govOfIndiaHi: 'भारत सरकार',
    login: 'Logged in as',
    signout: 'Sign Out',
    screenReader: 'Screen Reader Access',
    skipToMain: 'Skip to Main Content',
    home: 'Home',
    dashboard: 'Dashboard',
    lastUpdated: 'Last Updated',
  },
  hi: {
    board: 'छत्तीसगढ़ पर्यावरण संरक्षण बोर्ड',
    boardHi: 'Chhattisgarh Environment Conservation Board',
    title: 'पृथ्वीनेट — राष्ट्रीय पर्यावरण निगरानी प्रणाली',
    titleHi: 'PrithviNet — National Environmental Monitoring System',
    ministry: 'पर्यावरण, वन और जलवायु परिवर्तन मंत्रालय',
    ministryHi: 'Ministry of Environment, Forest and Climate Change',
    govOfIndia: 'भारत सरकार',
    govOfIndiaHi: 'Government of India',
    login: 'इस रूप में लॉग इन',
    signout: 'साइन आउट',
    screenReader: 'स्क्रीन रीडर एक्सेस',
    skipToMain: 'मुख्य सामग्री पर जाएं',
    home: 'होम',
    dashboard: 'डैशबोर्ड',
    lastUpdated: 'अंतिम अपडेट',
  },
};

const ALL_NAV_ITEMS: { id: TabId; label: string; labelHi: string; icon: React.ReactNode }[] = [
  { id: 'overview',    label: 'National Overview',  labelHi: 'राष्ट्रीय अवलोकन',   icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
  { id: 'telemetry',   label: 'Live Monitoring',    labelHi: 'लाइव निगरानी',        icon: <Activity className="h-3.5 w-3.5" /> },
  { id: 'forecast',    label: 'AI Forecast',        labelHi: 'AI पूर्वानुमान',       icon: <Brain className="h-3.5 w-3.5" /> },
  { id: 'compliance',  label: 'Compliance',         labelHi: 'अनुपालन',             icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { id: 'alerts',      label: 'Alerts',             labelHi: 'अलर्ट',               icon: <Bell className="h-3.5 w-3.5" /> },
  { id: 'regional',    label: 'Regional Analytics', labelHi: 'क्षेत्रीय विश्लेषण', icon: <MapPin className="h-3.5 w-3.5" /> },
  { id: 'industries',  label: 'Industry Tracker',   labelHi: 'उद्योग ट्रैकर',       icon: <Factory className="h-3.5 w-3.5" /> },
  { id: 'aqi-logs',    label: 'AQI Logs',           labelHi: 'AQI लॉग',             icon: <FileSpreadsheet className="h-3.5 w-3.5" /> },
];

export function UnifiedDashboard() {
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [pollutionType, setPollutionType] = useState<PollutionType>('air');
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const [fontSize, setFontSize] = useState(0);
  const [highContrast, setHighContrast] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const t = LABEL[lang];
  const userRole = user?.role || 'admin';
  const allowedTabs = ROLE_TABS[userRole] || DEFAULT_TABS;
  const roleInfo = ROLE_CONFIG[userRole] || ROLE_CONFIG.admin;

  // Filter nav items to only those allowed for the current role
  const navItems = useMemo(
    () => ALL_NAV_ITEMS.filter(item => allowedTabs.includes(item.id)),
    [allowedTabs],
  );

  // If current tab isn't allowed, snap to overview
  const safeTab = allowedTabs.includes(activeTab) ? activeTab : 'overview';

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return navItems;
    const q = searchQuery.toLowerCase();
    return navItems.filter(item =>
      item.label.toLowerCase().includes(q) || item.labelHi.includes(q)
    );
  }, [searchQuery, navItems]);

  const changeFontSize = useCallback((delta: number) => {
    setFontSize(prev => {
      const next = Math.max(-1, Math.min(2, prev + delta));
      document.documentElement.style.fontSize = `${16 + next * 2}px`;
      return next;
    });
  }, []);

  const resetFontSize = useCallback(() => {
    setFontSize(0);
    document.documentElement.style.fontSize = '16px';
  }, []);

  const toggleContrast = useCallback(() => {
    setHighContrast(prev => {
      const next = !prev;
      document.documentElement.classList.toggle('high-contrast', next);
      return next;
    });
  }, []);

  const typeConfig: Record<PollutionType, { icon: React.ReactNode; label: string; color: string; activeColor: string }> = {
    air:   { icon: <Wind className="h-4 w-4" />,     label: 'Air',   color: 'border-green-300/50 text-green-100 hover:bg-green-800/30', activeColor: 'border-green-300 bg-green-800/60 text-white shadow-sm' },
    water: { icon: <Droplets className="h-4 w-4" />,  label: 'Water', color: 'border-cyan-300/50 text-cyan-100 hover:bg-cyan-800/30', activeColor: 'border-cyan-300 bg-cyan-800/60 text-white shadow-sm' },
    noise: { icon: <Volume2 className="h-4 w-4" />,   label: 'Noise', color: 'border-amber-300/50 text-amber-100 hover:bg-amber-800/30', activeColor: 'border-amber-300 bg-amber-800/60 text-white shadow-sm' },
  };

  return (
    <div className="min-h-screen bg-[#f5f7f5] flex flex-col">
      {/* Skip to main content (accessibility) */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:bg-[#FF9933] focus:text-white focus:p-2 focus:z-[100] focus:text-sm">
        {t.skipToMain}
      </a>

      {/* ═══ 1. DARK GREEN TOP BAR ═══ */}
      <div className="parivesh-topbar" role="navigation" aria-label="Accessibility toolbar">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex items-center justify-between">
          {/* Left: Indian flag + GOI text */}
          <div className="flex items-center gap-2.5 text-[11px]">
            <div className="flex-shrink-0 w-6 h-[14px] rounded-[2px] overflow-hidden flex flex-col shadow-sm" aria-label="Indian Flag">
              <div className="flex-1 bg-[#FF9933]" />
              <div className="flex-1 bg-white relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-[5px] h-[5px] rounded-full border border-[#000080]" />
                </div>
              </div>
              <div className="flex-1 bg-[#138808]" />
            </div>
            <span className="text-white/90 font-medium">
              भारत | Government of India
            </span>
          </div>

          {/* Right: A- A A+ | Contrast | Screen Reader | Language */}
          <div className="flex items-center gap-0.5 text-[11px] text-white/80">
            <button onClick={() => changeFontSize(-1)} className="px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors text-[11px]" title="Decrease font size" aria-label="Decrease font size">A<sup>-</sup></button>
            <button onClick={resetFontSize} className="px-1 py-0.5 rounded hover:bg-white/10 transition-colors text-[13px] font-bold" title="Default font size" aria-label="Reset font size">A</button>
            <button onClick={() => changeFontSize(1)} className="px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors text-[15px] font-bold" title="Increase font size" aria-label="Increase font size">A<sup>+</sup></button>

            <span className="text-white/25 mx-1.5">|</span>

            <button onClick={toggleContrast} className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${highContrast ? 'bg-yellow-400 text-black' : 'hover:bg-white/10'}`} title={highContrast ? 'Normal contrast' : 'High contrast'} aria-label="Toggle high contrast" aria-pressed={highContrast}>
              {highContrast ? <Sun className="h-3 w-3 inline" /> : <Moon className="h-3 w-3 inline" />}
            </button>

            <span className="text-white/25 mx-1.5 hidden sm:inline">|</span>

            <button className="hidden sm:flex items-center gap-1 hover:text-white transition-colors text-[11px]" title={t.screenReader}>
              <Eye className="h-3 w-3" />
              <span className="hidden md:inline">{t.screenReader}</span>
            </button>

            <span className="text-white/25 mx-1.5 hidden sm:inline">|</span>

            <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="flex items-center gap-1 px-2.5 py-0.5 rounded hover:bg-white/10 transition-colors text-[11px] font-semibold" aria-label={lang === 'en' ? 'Switch to Hindi' : 'Switch to English'}>
              <Globe className="h-3 w-3" />
              {lang === 'en' ? 'English' : 'हिंदी'}
              <ChevronRight className="h-2.5 w-2.5 rotate-90" />
            </button>
          </div>
        </div>
      </div>

      {/* ═══ 2. WHITE HEADER BAND ═══ */}
      <header className="parivesh-header" role="banner">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between py-3 sm:py-4">
            {/* LEFT: PrithviNet Logo + Brand */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-[#14532d] via-[#16a34a] to-[#22c55e] flex items-center justify-center shadow-lg flex-shrink-0 border-2 border-green-200/50">
                <svg viewBox="0 0 40 40" className="w-8 h-8 sm:w-9 sm:h-9" fill="none">
                  <path d="M20 4C20 4 8 12 8 24C8 30 13 36 20 36C27 36 32 30 32 24C32 12 20 4 20 4Z" fill="#4ade80" opacity="0.9" />
                  <path d="M20 8C20 8 12 14 12 24C12 28 15 32 20 32" stroke="white" strokeWidth="1.5" fill="none" />
                  <path d="M20 12L20 30" stroke="white" strokeWidth="1.2" />
                  <path d="M20 18L15 22" stroke="white" strokeWidth="1" />
                  <path d="M20 22L25 18" stroke="white" strokeWidth="1" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-[#14532d]/60 font-medium tracking-wide leading-tight">
                  {t.boardHi}
                </div>
                <div className="text-xl sm:text-2xl font-bold text-[#14532d] leading-tight tracking-tight">
                  PrithviNet
                </div>
                <div className="text-[10px] text-gray-400 leading-tight hidden sm:block tracking-wider uppercase">
                  Environmental Monitoring System
                </div>
              </div>
            </div>

            {/* CENTER: Ministry text */}
            <div className="hidden md:flex flex-col items-center text-center flex-1 px-6">
              <div className="text-base sm:text-lg font-bold text-[#14532d] leading-snug">
                {t.ministryHi}
              </div>
              <div className="text-sm sm:text-[15px] font-semibold text-[#14532d] leading-snug mt-0.5">
                {t.ministry}
              </div>
              <div className="text-[10px] text-gray-400 mt-1 tracking-wide">
                {t.govOfIndiaHi} | {t.govOfIndia}
              </div>
            </div>

            {/* RIGHT: Government logos + National Emblem */}
            <div className="flex items-center gap-4 sm:gap-5 flex-shrink-0">
              <div className="hidden lg:flex flex-col items-center">
                <MissionLifeLogo height={42} />
              </div>
              <div className="hidden lg:flex flex-col items-center">
                <AzadiLogo height={52} />
              </div>
              <div className="flex flex-col items-center">
                <AshokEmblem size={52} className="drop-shadow-md" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ═══ 3. GREEN NAVIGATION BAR ═══ */}
      <nav className="parivesh-nav" role="navigation" aria-label="Main navigation">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex items-center justify-between min-h-[42px]">

          {/* Nav tabs — filtered by role */}
          <div className="flex overflow-x-auto hide-scrollbar shrink min-w-0">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-[12px] sm:text-[13px] font-medium whitespace-nowrap transition-all ${
                  safeTab === item.id
                    ? 'bg-[#0a3a1f] text-white border-b-2 border-[#FF9933]'
                    : 'text-green-100/90 hover:text-white hover:bg-white/10 border-b-2 border-transparent'
                }`}
                aria-current={safeTab === item.id ? 'page' : undefined}
              >
                {item.icon}
                <span className="hidden sm:inline">{lang === 'en' ? item.label : item.labelHi}</span>
              </button>
            ))}
          </div>

          {/* Right side — user info + role badge */}
          <div className="hidden lg:flex items-center gap-2 ml-3 flex-shrink-0">
            <button
              onClick={() => { setSearchOpen(true); setSearchQuery(''); }}
              className="flex items-center gap-1.5 bg-gradient-to-b from-[#f5c842] to-[#e6a817] hover:from-[#e6a817] hover:to-[#d49a0e] text-[#14532d] px-3 py-1.5 rounded text-xs font-bold transition-colors shadow-sm whitespace-nowrap">
              <Search className="h-3.5 w-3.5" />
              Search
            </button>

            {/* Role badge */}
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-white uppercase tracking-wide ${roleInfo.color}`}>
              {roleInfo.icon}
              {roleInfo.label}
            </span>

            {/* User name */}
            <div className="flex items-center gap-1 border border-white/30 rounded px-2.5 py-1 text-white text-[11px] bg-white/5 whitespace-nowrap">
              <User className="h-3 w-3 flex-shrink-0" />
              <span className="max-w-[120px] truncate">{(user as any)?.name || user?.email}</span>
            </div>

            {/* Logout */}
            <button
              onClick={logout}
              className="flex items-center gap-1 border border-red-400/50 bg-red-700/30 hover:bg-red-700/55 text-white text-[11px] px-2.5 py-1 rounded transition-colors whitespace-nowrap"
              title={t.signout}
            >
              <LogOut className="h-3 w-3" />
              {t.signout}
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded bg-white/10 text-white ml-2 flex-shrink-0"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-white/10 px-4 py-3 space-y-3">
            <div className="flex gap-1 flex-wrap">
              {(Object.entries(typeConfig) as [PollutionType, typeof typeConfig.air][]).map(([type, cfg]) => (
                <button
                  key={type}
                  onClick={() => setPollutionType(type)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                    pollutionType === type ? cfg.activeColor : cfg.color
                  }`}
                >
                  {cfg.icon} {cfg.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-white">
                <User className="h-4 w-4 text-green-200" />
                <span>{(user as any)?.name || user?.email}</span>
                <span className={`ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold text-white uppercase ${roleInfo.color}`}>
                  {roleInfo.label}
                </span>
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-1 bg-red-700/50 text-white text-xs px-3 py-1.5 rounded border border-red-400/30"
              >
                <LogOut className="h-3 w-3" /> {t.signout}
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* ═══ 4. DOMAIN SELECTOR + ROLE WELCOME BAR ═══ */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-4">
          {/* Pollution type pills */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400 font-medium hidden sm:inline uppercase tracking-wider">Domain:</span>
            <div className="flex gap-1.5">
              {(Object.entries(typeConfig) as [PollutionType, typeof typeConfig.air][]).map(([type, cfg]) => (
                <button
                  key={type}
                  onClick={() => setPollutionType(type)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold border transition-all ${
                    pollutionType === type
                      ? type === 'air'
                        ? 'bg-[#14532d] text-white border-[#14532d] shadow-sm'
                        : type === 'water'
                          ? 'bg-cyan-700 text-white border-cyan-700 shadow-sm'
                          : 'bg-amber-600 text-white border-amber-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                  }`}
                >
                  {cfg.icon}
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>
          {/* Welcome + designation */}
          <div className="text-[11px] text-gray-500 hidden md:flex items-center gap-2">
            <span>Welcome, <span className="font-semibold text-[#14532d]">{(user as any)?.name || 'Officer'}</span></span>
            {(user as any)?.designation && (
              <>
                <span className="text-gray-300">|</span>
                <span className="text-gray-400">{(user as any)?.designation}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Marquee / News Ticker ═══ */}
      <div className="gov-marquee py-1.5" role="marquee" aria-live="off">
        <div className="gov-marquee-inner">
          &nbsp;&nbsp;&nbsp; Welcome to PrithviNet — Chhattisgarh's Real-Time Environmental Monitoring System &nbsp;&bull;&nbsp;
          Air Quality, Water Quality &amp; Noise Levels monitored 24/7 across all districts &nbsp;&bull;&nbsp;
          Report environmental violations: info-cecb@gov.in | Helpline: 0771-2973100 &nbsp;&bull;&nbsp;
          CPCB National Ambient Air Quality Standards (NAAQS) enforced &nbsp;&bull;&nbsp;
          AI-powered 48-hour forecasting now available for all monitoring stations &nbsp;&nbsp;&nbsp;
        </div>
      </div>

      {/* ═══ Breadcrumb Bar ═══ */}
      <div className="bg-white border-b border-gray-200 shadow-sm" role="navigation" aria-label="Breadcrumb">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
          <ol className="text-xs text-gray-500 flex items-center gap-1 list-none m-0 p-0">
            <li className="flex items-center gap-1">
              <Home className="h-3 w-3 text-green-700" />
              <span className="text-green-700 hover:underline cursor-pointer">{t.home}</span>
            </li>
            <li className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-gray-400" />
              <span className="text-green-700 hover:underline cursor-pointer">{t.dashboard}</span>
            </li>
            <li className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-gray-400" />
              <span className="text-gray-700 font-medium">
                {lang === 'en'
                  ? ALL_NAV_ITEMS.find(n => n.id === safeTab)?.label
                  : ALL_NAV_ITEMS.find(n => n.id === safeTab)?.labelHi}
              </span>
            </li>
          </ol>
          <div className="text-xs text-gray-500 hidden sm:block">
            {t.lastUpdated}: {new Date().toLocaleString(lang === 'en' ? 'en-IN' : 'hi-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        </div>
      </div>

      {/* ═══ Main Content ═══ */}
      <main id="main-content" className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6" role="main">
        {safeTab === 'overview' && <PublicPortal pollutionType={pollutionType} />}
        {safeTab === 'telemetry' && <DashboardPage pollutionType={pollutionType} />}
        {safeTab === 'forecast' && <ForecastPage pollutionType={pollutionType} />}
        {safeTab === 'compliance' && <ComplianceDashboard pollutionType={pollutionType} />}
        {safeTab === 'alerts' && <AlertsDashboard />}
        {safeTab === 'regional' && <RegionalAnalytics />}
        {safeTab === 'industries' && <IndustryTracker />}
        {safeTab === 'aqi-logs' && <AqiLogsPage />}
      </main>

      {/* ═══ Government Footer ═══ */}
      <footer className="gov-footer mt-auto" role="contentinfo">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <h4 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-[#FF9933] rounded-full inline-block" />
                About PrithviNet
              </h4>
              <p className="text-green-200/60 text-xs leading-relaxed">
                PrithviNet is the National Environmental Monitoring System operated under the supervision of the
                Chhattisgarh Environment Conservation Board (CECB) and Ministry of Environment, Forest and Climate Change (MoEFCC),
                Government of India. Real-time monitoring of Air, Water, and Noise pollution across the state.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-[#FF9933] rounded-full inline-block" />
                Important Links
              </h4>
              <ul className="text-xs space-y-2">
                <li><a href="https://cpcb.nic.in/" target="_blank" rel="noopener noreferrer" className="text-green-300/70 hover:text-white cursor-pointer flex items-center gap-1 transition-colors"><ExternalLink className="h-3 w-3" /> Central Pollution Control Board (CPCB)</a></li>
                <li><a href="https://moef.gov.in/en/division/environment-impact-assessment-eia/national-clean-air-programme-ncap/" target="_blank" rel="noopener noreferrer" className="text-green-300/70 hover:text-white cursor-pointer flex items-center gap-1 transition-colors"><ExternalLink className="h-3 w-3" /> National Clean Air Programme (NCAP)</a></li>
                <li><a href="https://airquality.cpcb.gov.in/" target="_blank" rel="noopener noreferrer" className="text-green-300/70 hover:text-white cursor-pointer flex items-center gap-1 transition-colors"><ExternalLink className="h-3 w-3" /> Air Quality Index Dashboard</a></li>
                <li><a href="https://rtionline.gov.in/" target="_blank" rel="noopener noreferrer" className="text-green-300/70 hover:text-white cursor-pointer flex items-center gap-1 transition-colors"><ExternalLink className="h-3 w-3" /> Right to Information (RTI)</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-[#FF9933] rounded-full inline-block" />
                Quick Links
              </h4>
              <ul className="text-xs space-y-2">
                <li><a href="https://cgepb.gov.in/" target="_blank" rel="noopener noreferrer" className="text-green-300/70 hover:text-white cursor-pointer flex items-center gap-1 transition-colors"><ExternalLink className="h-3 w-3" /> CECB Official Website</a></li>
                <li><a href="https://parivesh.nic.in/" target="_blank" rel="noopener noreferrer" className="text-green-300/70 hover:text-white cursor-pointer flex items-center gap-1 transition-colors"><ExternalLink className="h-3 w-3" /> Parivesh Portal</a></li>
                <li><a href="https://cpcb.nic.in/guidelines-2/" target="_blank" rel="noopener noreferrer" className="text-green-300/70 hover:text-white cursor-pointer flex items-center gap-1 transition-colors"><ExternalLink className="h-3 w-3" /> Environmental Guidelines</a></li>
                <li><a href="https://pgportal.gov.in/" target="_blank" rel="noopener noreferrer" className="text-green-300/70 hover:text-white cursor-pointer flex items-center gap-1 transition-colors"><ExternalLink className="h-3 w-3" /> Citizen Grievances</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-[#FF9933] rounded-full inline-block" />
                Contact Us
              </h4>
              <div className="text-green-200/60 text-xs leading-relaxed space-y-2">
                <p>
                  CECB Head Office, Sector 19, Atal Nagar<br />
                  Naya Raipur, Chhattisgarh - 492002
                </p>
                <p className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-green-300/60" /> <a href="mailto:info-cecb@gov.in" className="hover:text-white transition-colors">info-cecb@gov.in</a></p>
                <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-green-300/60" /> <a href="tel:07712973100" className="hover:text-white transition-colors">0771-2973100</a></p>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 mt-6 pt-4 flex flex-col sm:flex-row justify-between items-center text-[11px] text-green-200/40 gap-2">
            <div>&copy; {new Date().getFullYear()} Chhattisgarh Environment Conservation Board. All Rights Reserved.</div>
            <div>Designed &amp; Developed by National Informatics Centre (NIC) | Content owned by CECB, Govt. of Chhattisgarh</div>
          </div>
        </div>
      </footer>

      {/* ═══ Search Modal ═══ */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center pt-20 px-4"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-[#0d2e14] border border-white/20 rounded-xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <Search className="h-4 w-4 text-[#f5c842] flex-shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Search dashboard sections…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { setSearchOpen(false); }
                  if (e.key === 'Enter' && searchResults.length > 0) {
                    setActiveTab(searchResults[0].id); setSearchOpen(false); setSearchQuery('');
                  }
                }}
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder-green-300/40"
              />
              <button onClick={() => setSearchOpen(false)} className="text-green-300/50 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="py-2 max-h-72 overflow-y-auto">
              {searchResults.length === 0 && (
                <li className="px-4 py-3 text-green-300/50 text-sm">No results found.</li>
              )}
              {searchResults.map(item => (
                <li key={item.id}>
                  <button
                    onClick={() => { setActiveTab(item.id); setSearchOpen(false); setSearchQuery(''); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-green-100 hover:bg-white/10 transition-colors text-left"
                  >
                    <span className="text-[#f5c842]">{item.icon}</span>
                    <span>{item.label}</span>
                    <span className="ml-auto text-green-300/40 text-xs">{item.labelHi}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-green-300/30 flex-shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="px-4 py-2 border-t border-white/10 text-[10px] text-green-300/30">
              Press Enter to navigate · Esc to close
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
