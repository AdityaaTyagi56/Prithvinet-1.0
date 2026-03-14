import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  role: string;
  name?: string;
  designation?: string;
  region_office_id?: string;
  industry_id?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: localStorage.getItem('accessToken'),
  setAuth: (user, token) => {
    localStorage.setItem('accessToken', token);
    set({ user, accessToken: token });
  },
  logout: () => {
    localStorage.removeItem('accessToken');
    set({ user: null, accessToken: null });
  },
}));
