import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { 
  Clock, 
  ShieldAlert, 
  Database,
  Terminal,
  RefreshCw,
  Search
} from 'lucide-react';

export const LogsScreen: React.FC = () => {
  const { user, triggerToast } = useApp();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [filterAction, setFilterAction] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadLogs = async () => {
    try {
      setLoading(true);
      const res = await api.getActivityLogs();
      setLogs(res || []);
    } catch (err: any) {
      triggerToast(err.message || 'Failed to pull system security logs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'Admin' || user?.role === 'AssetManager') {
      loadLogs();
    }
  }, [user]);

  useEffect(() => {
    const handleWsMessage = (e: Event) => {
      const customEvent = e as CustomEvent;
      const message = customEvent.detail;
      if (message.type === 'invalidate_dashboard' && (user?.role === 'Admin' || user?.role === 'AssetManager')) {
        console.log('WS Trigger: Refreshing System Activity Logs...');
        loadLogs();
      }
    };

    window.addEventListener('assetflow:ws_message', handleWsMessage);
    return () => {
      window.removeEventListener('assetflow:ws_message', handleWsMessage);
    };
  }, [user]);

  if (user?.role !== 'Admin' && user?.role !== 'AssetManager') {
    return (
      <div className="bg-red-50 border border-red-200 p-6 rounded-2xl max-w-lg mx-auto text-center mt-12 shadow-sm">
        <ShieldAlert className="w-12 h-12 text-red-600 mx-auto mb-3 animate-pulse" />
        <h3 className="font-display font-bold text-lg text-red-950">Access Unauthorized</h3>
        <p className="text-red-800 text-sm mt-1 font-medium">
          Only organization Asset Managers and system Administrators are authorized to inspect central security activity logs.
          Please contact your IT administrator to update your access clearance.
        </p>
      </div>
    );
  }

  // Deduplicate list of unique actions for filter dropdown
  const actionTypes = Array.from(new Set(logs.map((l) => l.action)));
  const usersList = Array.from(new Set(logs.map((l) => l.userName || 'System')));

  // Filter local logs based on inputs
  const filteredLogs = logs.filter((log) => {
    const matchesAction = filterAction ? log.action === filterAction : true;
    const matchesUser = filterUser ? (log.userName || 'System') === filterUser : true;
    
    const searchString = searchQuery.toLowerCase();
    const metadataStr = JSON.stringify(log.metadata || {}).toLowerCase();
    const matchesSearch = searchQuery 
      ? log.action.toLowerCase().includes(searchString) || 
        (log.userName || '').toLowerCase().includes(searchString) || 
        log.entityType.toLowerCase().includes(searchString) ||
        metadataStr.includes(searchString)
      : true;

    return matchesAction && matchesUser && matchesSearch;
  });

  return (
    <div className="space-y-6 pt-2 animate-fade-in">
      
      {/* Title Block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-gray-900 tracking-tight">Security Audit Logs & Trail</h2>
          <p className="text-sm text-gray-500">Immutable read-only system ledger tracking every single asset allocation, reservation, and status transition.</p>
        </div>
        <button
          onClick={loadLogs}
          className="p-2.5 bg-white hover:bg-gray-50 text-gray-700 hover:text-gray-950 rounded-xl border border-gray-200 transition-colors flex items-center gap-1.5 font-bold text-xs cursor-pointer shadow-2xs"
        >
          <RefreshCw className="w-4 h-4 text-gray-400" />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* FILTER CONTROLS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white border border-gray-200 p-5 rounded-2xl shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute inset-y-0 left-0 pl-3.5 w-5 h-5 text-gray-400 flex items-center h-full pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs by keyword, asset tag, metadata key..."
            className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-2.5 pl-11 pr-4 text-sm outline-none transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-gray-55 border border-gray-200 text-gray-700 text-xs rounded-xl py-2.5 px-3 outline-none focus:border-blue-500 focus:bg-white"
          >
            <option value="">All Actions</option>
            {actionTypes.map((act) => (
              <option key={act} value={act}>{act}</option>
            ))}
          </select>

          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="bg-gray-55 border border-gray-200 text-gray-700 text-xs rounded-xl py-2.5 px-3 outline-none focus:border-blue-500 focus:bg-white"
          >
            <option value="">All Operators</option>
            {usersList.map((usr) => (
              <option key={usr} value={usr}>{usr}</option>
            ))}
          </select>
        </div>
      </div>

      {/* LOGS DIRECTORY CONTAINER */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-white border border-gray-200 p-16 rounded-2xl text-center text-gray-400 text-sm shadow-sm">
          No matches found for active query filter.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Terminal className="w-5 h-5 text-blue-600" />
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Immutable Security Ledger Console</span>
          </div>

          <div className="space-y-3.5">
            {filteredLogs.map((log) => (
              <div 
                key={log.id} 
                className="bg-gray-50/55 border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:border-gray-300 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
                    <Database className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-gray-900 text-sm">{log.action}</span>
                      <span className="text-[10px] bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.2 rounded font-mono uppercase tracking-wider font-bold">
                        {log.entityType}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 pt-1.5 font-mono">
                      <span className="flex items-center gap-1 font-medium"><Clock className="w-3.5 h-3.5 text-gray-400" />{new Date(log.timestamp).toLocaleDateString()} &bull; {new Date(log.timestamp).toLocaleTimeString()}</span>
                      <span className="font-medium">Operator: <strong className="text-gray-800 font-bold">{log.userName || 'System'}</strong></span>
                      <span className="font-medium">Entity ID: <span className="text-gray-400">{log.entityId}</span></span>
                    </div>

                    {/* Metadata attributes representation */}
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-gray-150 flex flex-wrap gap-1.5">
                        {Object.entries(log.metadata).map(([k, v]: any) => (
                          <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-200 rounded-md text-[10px] font-mono text-gray-500 shadow-2xs">
                            <span className="text-blue-600 font-bold">{k}:</span>
                            <span className="text-gray-800 font-bold">{v.toString()}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-[11px] text-gray-400 font-mono text-right shrink-0">
                  ID: {log.id}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
