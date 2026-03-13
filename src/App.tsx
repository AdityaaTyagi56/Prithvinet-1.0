import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuthStore } from './store/authStore';
import { api } from './lib/api';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { ForecastPage } from './pages/officer/ForecastPage';
import { PublicPortal } from './pages/public/PublicPortal';
import { ComplianceDashboard } from './pages/admin/ComplianceDashboard';
import { UnifiedDashboard } from './pages/dashboard/UnifiedDashboard';

type AllowedRole = 'admin' | 'regulator' | string;

function normalizeRole(role: string): string {
  if (role === 'super_admin') return 'admin';
  if (role === 'regional_officer') return 'regulator';
  return role;
}

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: AllowedRole[];
}) {
  const user = useAuthStore(state => state.user);
  const accessToken = useAuthStore(state => state.accessToken);

  const isAuthenticated = Boolean(user || accessToken);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    if (!user) {
      return <Navigate to="/login" replace />;
    }

    const role = normalizeRole(user.role);
    if (!allowedRoles.includes(role)) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}

export default function App() {
  const user = useAuthStore(state => state.user);
  const accessToken = useAuthStore(state => state.accessToken);
  const setAuth = useAuthStore(state => state.setAuth);
  const logout = useAuthStore(state => state.logout);

  const [isHydratingAuth, setIsHydratingAuth] = useState(true);

  useEffect(() => {
    async function hydrateUser() {
      // No token and no user — send to login
      if (!accessToken && !user) {
        setIsHydratingAuth(false);
        return;
      }

      if (user) {
        setIsHydratingAuth(false);
        return;
      }

      try {
        const userRes = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        setAuth(userRes.data, accessToken);
      } catch (error) {
        // Token invalid — clear and send to login
        logout();
      } finally {
        setIsHydratingAuth(false);
      }
    }

    hydrateUser();
  }, [accessToken, user, setAuth, logout]);

  const isAuthenticated = Boolean(user || accessToken);

  if (isHydratingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f4f8] text-gray-600">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-[#1a365d] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm">Loading PrithviNet...</span>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        <Route path="/public" element={<PublicPortal pollutionType="air" />} />
        <Route 
          path="/dashboard/*" 
          element={
            <ProtectedRoute>
              <UnifiedDashboard />
            </ProtectedRoute>
          } 
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        {/* Legacy routes redirect to dashboard */}
        <Route path="/forecast" element={<Navigate to="/dashboard" replace />} />
        <Route path="/compliance" element={<Navigate to="/dashboard" replace />} />
        <Route path="/copilot" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
