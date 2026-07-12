import React, { useState } from 'react';
import { useApp, ScreenType } from '../context/AppContext.jsx';
import { 
  LayoutDashboard, 
  Building2, 
  FolderTree, 
  UserCheck, 
  CalendarClock, 
  Wrench, 
  ClipboardCheck, 
  BarChart3, 
  FileSearch, 
  LogOut, 
  Bell, 
  Menu, 
  X,
  User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Navigation: React.FC = () => {
  const { user, screen, setScreen, logout, notifications, unreadCount, markNotificationsAsRead } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'alert' | 'warning' | 'info'>('all');

  const filteredNotifications = notifications.filter(n => {
    if (notifFilter === 'all') return true;
    return n.type === notifFilter;
  });

  if (!user) return null;

  const menuItems = [
    { id: 'dashboard' as ScreenType, label: 'Dashboard', icon: LayoutDashboard, roles: ['Employee', 'DepartmentHead', 'AssetManager', 'Admin'] },
    { id: 'assets' as ScreenType, label: 'Asset Directory', icon: FolderTree, roles: ['Employee', 'DepartmentHead', 'AssetManager', 'Admin'] },
    { id: 'allocations' as ScreenType, label: 'Allocations & Transfers', icon: UserCheck, roles: ['Employee', 'DepartmentHead', 'AssetManager', 'Admin'] },
    { id: 'bookings' as ScreenType, label: 'Resource Booking', icon: CalendarClock, roles: ['Employee', 'DepartmentHead', 'AssetManager', 'Admin'] },
    { id: 'maintenance' as ScreenType, label: 'Maintenance', icon: Wrench, roles: ['Employee', 'DepartmentHead', 'AssetManager', 'Admin'] },
    { id: 'audit' as ScreenType, label: 'Asset Audit', icon: ClipboardCheck, roles: ['Employee', 'DepartmentHead', 'AssetManager', 'Admin'] },
    { id: 'analytics' as ScreenType, label: 'Reports & Analytics', icon: BarChart3, roles: ['Employee', 'DepartmentHead', 'AssetManager', 'Admin'] },
    { id: 'organization' as ScreenType, label: 'Organization Setup', icon: Building2, roles: ['Admin'] },
    { id: 'logs' as ScreenType, label: 'Activity Logs', icon: FileSearch, roles: ['Admin', 'AssetManager'] },
  ];

  const allowedItems = menuItems.filter(item => item.roles.includes(user.role));

  const handleNav = (target: ScreenType) => {
    setScreen(target);
    setMobileOpen(false);
  };

  const handleToggleNotifications = () => {
    setNotifOpen(!notifOpen);
    if (!notifOpen && unreadCount > 0) {
      markNotificationsAsRead();
    }
  };

  return (
    <>
      {/* Top Header Bar */}
      <header className="bg-white border-b border-gray-200 h-16 fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button 
            className="md:hidden text-gray-500 hover:text-gray-900"
            onClick={() => setMobileOpen(true)}
            id="mobile-menu-btn"
          >
            <Menu className="w-6 h-6" />
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-display font-bold text-white text-sm tracking-wider">
              AF
            </div>
            <span className="font-display font-bold text-xl text-gray-900 tracking-tight">
              Asset<span className="text-blue-600">Flow</span>
            </span>
            <span className="hidden sm:inline bg-gray-50 text-gray-500 text-xs px-2 py-0.5 rounded-full font-mono border border-gray-200">
              v1.0.0 ERP
            </span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-4">
          {/* Notifications Trigger */}
          <div className="relative">
            <button 
              onClick={handleToggleNotifications}
              className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
              id="notif-bell-btn"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              )}
            </button>

            {/* Notifications Panel */}
            <AnimatePresence>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/85">
                      <span className="font-display font-bold text-gray-900 text-sm">Notifications</span>
                      <button 
                        onClick={markNotificationsAsRead}
                        className="text-xs text-blue-600 hover:text-blue-700 font-bold"
                      >
                        Mark all as read
                      </button>
                    </div>

                    {/* Filter Tabs for Grouping by Type */}
                    <div className="flex border-b border-gray-100 bg-gray-55/10 text-[11px] leading-none">
                      {(['all', 'alert', 'warning', 'info'] as const).map((type) => {
                        const count = type === 'all' 
                          ? notifications.length 
                          : notifications.filter(n => n.type === type).length;
                        const label = type === 'all' ? 'All' : type === 'alert' ? 'Alerts' : type === 'warning' ? 'Warnings' : 'Info';
                        const isActive = notifFilter === type;
                        return (
                          <button
                            key={type}
                            onClick={() => setNotifFilter(type)}
                            className={`flex-1 py-3 font-bold text-center border-b-2 transition-all cursor-pointer ${
                              isActive 
                                ? 'border-blue-600 text-blue-600 bg-white' 
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {label} ({count})
                          </button>
                        );
                      })}
                    </div>

                    <div className="max-h-[350px] overflow-y-auto divide-y divide-gray-100">
                      {filteredNotifications.length === 0 ? (
                        <div className="p-6 text-center text-gray-400 text-sm">
                          No {notifFilter !== 'all' ? `${notifFilter} ` : ''}notifications yet
                        </div>
                      ) : (
                        filteredNotifications.map((n) => (
                          <div 
                            key={n.id} 
                            className={`p-4 hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-blue-50/30 border-l-2 border-blue-600' : ''}`}
                          >
                            <div className="flex gap-2">
                              <span className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${
                                n.type === 'alert' ? 'bg-red-500 animate-pulse' : n.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                              }`} />
                              <div>
                                <p className="text-gray-800 text-xs sm:text-sm leading-relaxed font-medium">{n.message}</p>
                                <span className="text-[10px] text-gray-400 font-mono mt-1 block">
                                  {new Date(n.createdAt).toLocaleDateString()} at {new Date(n.createdAt).toLocaleTimeString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* User Profile Summary */}
          <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs">
              {user.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-sm font-bold text-gray-900 leading-tight">{user.name}</div>
              <div className="text-xs text-gray-500 font-mono leading-none">{user.role}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 fixed top-16 bottom-0 left-0 z-30 pt-4 justify-between">
        <div className="px-3 flex-1 overflow-y-auto space-y-1">
          {allowedItems.map((item) => {
            const Icon = item.icon;
            const isActive = screen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold transition-all group ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-transparent'
                }`}
              >
                <Icon className={`w-4.5 h-4.5 transition-transform group-hover:scale-105 ${isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                <span>{item.label}</span>
                {isActive && (
                  <motion.div 
                    layoutId="activeIndicator"
                    className="ml-auto w-1.5 h-1.5 bg-blue-600 rounded-full"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer Logout */}
        <div className="p-3 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold text-gray-550 hover:text-red-600 hover:bg-red-50 transition-colors group"
          >
            <LogOut className="w-4.5 h-4.5 text-gray-400 group-hover:text-red-505 transition-transform group-hover:-translate-x-0.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Nav Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 md:hidden"
            />
            {/* Drawer */}
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-white border-r border-gray-200 z-50 flex flex-col justify-between pt-5 pb-5 md:hidden shadow-2xl"
            >
              <div>
                <div className="flex items-center justify-between px-6 pb-6 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-display font-bold text-white tracking-wider text-sm">
                      AF
                    </div>
                    <span className="font-display font-bold text-lg text-gray-900">
                      Asset<span className="text-blue-600">Flow</span>
                    </span>
                  </div>
                  <button 
                    onClick={() => setMobileOpen(false)}
                    className="p-1.5 text-gray-550 hover:text-gray-900 bg-gray-100 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="px-3 pt-4 space-y-1 overflow-y-auto max-h-[calc(100vh-160px)]">
                  {allowedItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = screen === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNav(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold transition-colors ${
                          isActive 
                            ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-transparent'
                        }`}
                      >
                        <Icon className={`w-4.5 h-4.5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="px-3 pt-4 border-t border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-3 px-3 py-2 mb-3 bg-gray-100/60 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold border border-transparent">
                    {user.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-gray-900 leading-tight">{user.name}</div>
                    <div className="text-xs text-gray-500 font-mono">{user.role}</div>
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors group"
                >
                  <LogOut className="w-4.5 h-4.5 text-gray-400 group-hover:text-red-505" />
                  <span>Sign Out</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
