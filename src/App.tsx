import React from 'react';
import { AppProvider, useApp } from './context/AppContext.jsx';
import { Navigation } from './components/Navigation.jsx';
import { LoginScreen } from './screens/LoginScreen.jsx';
import { DashboardScreen } from './screens/DashboardScreen.jsx';
import { AssetDirectoryScreen } from './screens/AssetDirectoryScreen.jsx';
import { AllocationScreen } from './screens/AllocationScreen.jsx';
import { BookingScreen } from './screens/BookingScreen.jsx';
import { MaintenanceScreen } from './screens/MaintenanceScreen.jsx';
import { AuditScreen } from './screens/AuditScreen.jsx';
import { AnalyticsScreen } from './screens/AnalyticsScreen.jsx';
import { OrganizationScreen } from './screens/OrganizationScreen.jsx';
import { LogsScreen } from './screens/LogsScreen.jsx';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, AlertCircle, Info } from 'lucide-react';

const MainApp: React.FC = () => {
  const { user, screen, toast } = useApp();

  // If no logged in user session, direct to central signup/login page
  if (!user) {
    return <LoginScreen />;
  }

  // Map Screen IDs directly to their corresponding Screen components
  const renderScreen = () => {
    switch (screen) {
      case 'dashboard':
        return <DashboardScreen />;
      case 'assets':
        return <AssetDirectoryScreen />;
      case 'allocations':
        return <AllocationScreen />;
      case 'bookings':
        return <BookingScreen />;
      case 'maintenance':
        return <MaintenanceScreen />;
      case 'audit':
        return <AuditScreen />;
      case 'analytics':
        return <AnalyticsScreen />;
      case 'organization':
        return <OrganizationScreen />;
      case 'logs':
        return <LogsScreen />;
      default:
        return <DashboardScreen />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] font-sans antialiased text-gray-900 selection:bg-blue-500/25 selection:text-blue-900">
      {/* Responsive Shell Sidebar & Header Navigation */}
      <Navigation />

      {/* Main Container Shell */}
      <main className="md:pl-64 pt-16 min-h-screen flex flex-col">
        <div className="flex-1 p-4 sm:p-6 md:p-8 max-w-[1600px] w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={screen}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
              className="w-full h-full"
            >
              {renderScreen()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* FLOATING TOAST FEED SYSTEM */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-5 right-5 z-50 flex items-center gap-3 bg-white border border-gray-200 shadow-2xl p-4 rounded-xl max-w-sm w-full"
          >
            {toast.type === 'success' && (
              <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-green-600 shrink-0">
                <CheckCircle className="w-5 h-5" />
              </div>
            )}
            {toast.type === 'error' && (
              <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-600 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
            )}
            {toast.type === 'info' && (
              <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                <Info className="w-5 h-5" />
              </div>
            )}

            <div className="flex-1">
              <p className="text-xs sm:text-sm font-semibold text-gray-900 leading-snug">
                {toast.message}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}
