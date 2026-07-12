import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, getAuthToken, setAuthToken, getCurrentUser } from '../lib/api.js';
import { Employee, Notification } from '../types.js';

export type ScreenType = 
  | 'dashboard' 
  | 'organization' 
  | 'assets' 
  | 'allocations' 
  | 'bookings' 
  | 'maintenance' 
  | 'audit' 
  | 'analytics' 
  | 'logs';

interface AppContextProps {
  user: Employee | null;
  token: string | null;
  screen: ScreenType;
  setScreen: (screen: ScreenType) => void;
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  login: (credentials: any) => Promise<void>;
  signup: (data: any) => Promise<void>;
  logout: () => void;
  refreshNotifications: () => Promise<void>;
  markNotificationsAsRead: () => Promise<void>;
  triggerToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Employee | null>(null);
  const [token, setToken] = useState<string | null>(getAuthToken());
  const [screen, setScreenState] = useState<ScreenType>('dashboard');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const triggerToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  }, []);

  const setScreen = (newScreen: ScreenType) => {
    // Role protection for Admin only screens
    if (newScreen === 'organization' && user && user.role !== 'Admin') {
      triggerToast('Permission Denied: Organization setup is Admin only.', 'error');
      return;
    }
    setScreenState(newScreen);
  };

  const refreshNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getNotifications();
      setNotifications(data);
    } catch (e) {
      console.error('Failed to fetch notifications', e);
    }
  }, [token]);

  const markNotificationsAsRead = async () => {
    if (!token) return;
    try {
      await api.markNotificationsAsRead();
      await refreshNotifications();
    } catch (e) {
      console.error('Failed to mark notifications read', e);
    }
  };

  const loadCurrentUser = useCallback(async () => {
    const activeToken = getAuthToken();
    if (activeToken) {
      try {
        const data = await api.getMe();
        setUser(data.user);
        setToken(activeToken);
        // Initial load of notifications
        const nots = await api.getNotifications();
        setNotifications(nots);
      } catch (err) {
        console.error('Session expired', err);
        setAuthToken(null);
        setUser(null);
        setToken(null);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCurrentUser();
  }, [loadCurrentUser]);

  // Establish WebSocket connection for real-time push events and replace 10s polling
  useEffect(() => {
    if (!token) return;

    let socket: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let isDisposed = false;

    function connect() {
      if (isDisposed) return;
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      console.log('Connecting to real-time sync server...', wsUrl);
      
      const ws = new WebSocket(wsUrl);
      socket = ws;

      ws.onopen = () => {
        console.log('Real-time sync connected!');
        // Authenticate socket
        ws.send(JSON.stringify({ type: 'auth', token }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('Received WebSocket push event:', message);

          // Handle state-specific invalidations
          if (message.type === 'invalidate_notifications') {
            refreshNotifications();
          }

          // Broadly dispatch events to allow individual screen controllers to instantly refetch
          window.dispatchEvent(new CustomEvent('assetflow:ws_message', { detail: message }));
        } catch (e) {
          console.error('Error handling WebSocket push event', e);
        }
      };

      ws.onclose = (event) => {
        console.log('Real-time sync closed. Reconnecting...', event.reason);
        if (!isDisposed) {
          reconnectTimeout = setTimeout(connect, 3000); // Reconnect in 3s
        }
      };

      ws.onerror = (err) => {
        console.error('Real-time sync socket error:', err);
        ws.close();
      };
    }

    connect();

    return () => {
      isDisposed = true;
      if (socket) {
        socket.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [token, refreshNotifications]);

  const login = async (credentials: any) => {
    setLoading(true);
    try {
      const data = await api.login(credentials);
      setAuthToken(data.token);
      setToken(data.token);
      setUser(data.user);
      triggerToast(`Welcome back, ${data.user.name}!`, 'success');
      
      const nots = await api.getNotifications();
      setNotifications(nots);
    } catch (err: any) {
      triggerToast(err.message || 'Login failed. Please check credentials.', 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (data: any) => {
    setLoading(true);
    try {
      const res = await api.signup(data);
      setAuthToken(res.token);
      setToken(res.token);
      setUser(res.user);
      triggerToast(`Account created successfully! Welcome, ${res.user.name}.`, 'success');
      setNotifications([]);
    } catch (err: any) {
      triggerToast(err.message || 'Registration failed.', 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setNotifications([]);
    setScreenState('dashboard');
    triggerToast('Logged out successfully', 'info');
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <AppContext.Provider
      value={{
        user,
        token,
        screen,
        setScreen,
        notifications,
        unreadCount,
        loading,
        login,
        signup,
        logout,
        refreshNotifications,
        markNotificationsAsRead,
        triggerToast,
        toast
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
