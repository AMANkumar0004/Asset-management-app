import React, { useState, useEffect } from 'react';
import { useApp, ScreenType } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { 
  ShieldAlert, 
  FolderCheck, 
  Wrench, 
  CalendarClock, 
  RefreshCw, 
  PlusCircle, 
  PenTool, 
  BookMarked,
  ArrowRightCircle,
  Clock,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { motion } from 'motion/react';
import { Modal } from '../components/Modal.jsx';

export const DashboardScreen: React.FC = () => {
  const { user, setScreen, triggerToast } = useApp();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({
    kpis: {
      totalAssets: 0,
      available: 0,
      allocated: 0,
      reserved: 0,
      maintenance: 0,
      lost: 0,
      activeAllocations: 0,
      overdueAllocations: 0,
      activeBookings: 0,
      pendingTransfers: 0,
      urgentMaintenance: 0
    },
    overdueList: []
  });

  const [quickMaintOpen, setQuickMaintOpen] = useState(false);
  const [assetsList, setAssetsList] = useState<any[]>([]);
  const [maintAssetId, setMaintAssetId] = useState('');
  const [maintDesc, setMaintDesc] = useState('');
  const [maintPriority, setMaintPriority] = useState('Medium');

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await api.getKpis();
      setData(res);

      // Load assets list for quick select
      const assetsData = await api.getAssets({ limit: '100' });
      setAssetsList(assetsData.assets.filter((a: any) => a.status !== 'Retired' && a.status !== 'Disposed'));
    } catch (err: any) {
      triggerToast(err.message || 'Failed to fetch dashboard KPIs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    const handleWsMessage = (e: Event) => {
      const customEvent = e as CustomEvent;
      const message = customEvent.detail;
      if (message.type === 'invalidate_dashboard') {
        console.log('WS Trigger: Refreshing Dashboard Data...');
        fetchDashboardData();
      }
    };

    window.addEventListener('assetflow:ws_message', handleWsMessage);
    return () => {
      window.removeEventListener('assetflow:ws_message', handleWsMessage);
    };
  }, []);

  const handleQuickMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintAssetId || !maintDesc) {
      triggerToast('Please select an asset and write descriptions.', 'error');
      return;
    }
    try {
      await api.createMaintenance({
        assetId: maintAssetId,
        issueDescription: maintDesc,
        priority: maintPriority
      });
      triggerToast('Maintenance request filed successfully!', 'success');
      setQuickMaintOpen(false);
      setMaintAssetId('');
      setMaintDesc('');
      setMaintPriority('Medium');
      fetchDashboardData();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to submit maintenance request', 'error');
    }
  };

  if (loading && !data.kpis.totalAssets) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  const kpis = data.kpis;
  const overdueList = data.overdueList;

  const isManagerOrAdmin = user?.role === 'Admin' || user?.role === 'AssetManager';

  const cards = [
    { label: 'Assets Available', value: kpis.available, color: 'text-emerald-600 bg-white border-gray-200' },
    { label: 'Currently Allocated', value: kpis.allocated, color: 'text-blue-600 bg-white border-gray-200' },
    { label: 'Active Bookings', value: kpis.activeBookings, color: 'text-indigo-600 bg-white border-gray-200' },
    { label: 'Under Maintenance', value: kpis.maintenance, color: 'text-orange-600 bg-white border-gray-200' },
    { label: 'Pending Transfers', value: kpis.pendingTransfers, color: 'text-amber-600 bg-white border-gray-200' },
    { label: 'Overdue Items', value: kpis.overdueAllocations, color: kpis.overdueAllocations > 0 ? 'text-red-650 bg-red-50 border-red-500 ring-1 ring-red-500 animate-pulse font-extrabold shadow-md' : 'text-gray-450 bg-gray-50 border-gray-200' },
  ];

  return (
    <div className="space-y-6 pt-2">
      {/* Greeting & Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white border border-gray-200 p-6 rounded-2xl gap-4 shadow-sm">
        <div>
          <h2 className="font-display font-bold text-2xl text-gray-900 tracking-tight">
            Welcome back, <span className="text-blue-600">{user?.name}</span>
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Role: <span className="text-gray-700 font-bold">{user?.role}</span> &bull; 
            Department: <span className="text-gray-700 font-bold">{user?.departmentId ? 'Departmental Scope' : 'Organization Scope'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchDashboardData}
            className="p-2.5 bg-white hover:bg-gray-50 text-gray-700 rounded-xl border border-gray-200 transition-colors shadow-xs"
            title="Refresh dashboard"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* QUICK ACTIONS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isManagerOrAdmin && (
          <button 
            onClick={() => setScreen('assets')}
            className="flex items-center justify-between p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm transition-all cursor-pointer font-bold text-sm group"
          >
            <div className="flex items-center gap-3">
              <PlusCircle className="w-5 h-5 text-white" />
              <span>Register New Asset</span>
            </div>
            <ChevronRight className="w-5 h-5 opacity-70 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}
        
        <button 
          onClick={() => setScreen('bookings')}
          className="flex items-center justify-between p-4 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl shadow-sm transition-all cursor-pointer font-bold text-sm group"
        >
          <div className="flex items-center gap-3">
            <BookMarked className="w-5 h-5 text-blue-600" />
            <span>Book Space or Resource</span>
          </div>
          <ChevronRight className="w-5 h-5 opacity-70 group-hover:translate-x-0.5 transition-transform" />
        </button>

        <button 
          onClick={() => setQuickMaintOpen(true)}
          className="flex items-center justify-between p-4 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl shadow-sm transition-all cursor-pointer font-bold text-sm group"
        >
          <div className="flex items-center gap-3">
            <PenTool className="w-5 h-5 text-blue-600" />
            <span>Raise Maintenance Request</span>
          </div>
          <ChevronRight className="w-5 h-5 opacity-70 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* KPI METRIC CARDS GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {cards.map((card, i) => (
          <div 
            key={i} 
            className={`p-4 border rounded-xl flex flex-col justify-between h-28 transition-all hover:scale-[1.02] ${card.color}`}
          >
            <span className="text-[11px] sm:text-xs font-semibold text-slate-450 uppercase tracking-wider">{card.label}</span>
            <span className="font-display font-bold text-2xl sm:text-3xl leading-none">{card.value}</span>
          </div>
        ))}
      </div>

      {/* OVERDUE ALERTS WARNING PANEL */}
      {overdueList.length > 0 && (
        <div className="border border-red-200 bg-red-50/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-red-100/60 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-red-950">Overdue Assets Requiring Action</h3>
              <p className="text-xs text-red-700">Allocated physical resources that are past their expected return milestones.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-red-100 text-red-800 text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Asset Tag</th>
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Current Holder</th>
                  <th className="py-2.5 px-3">Return Deadline</th>
                  <th className="py-2.5 px-3 text-right">Days Overdue</th>
                  {isManagerOrAdmin && <th className="py-2.5 px-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100/50 text-sm">
                {overdueList.map((item: any, i: number) => (
                  <tr key={i} className="hover:bg-red-50/20">
                    <td className="py-3 px-3 font-mono font-bold text-red-600">{item.assetTag}</td>
                    <td className="py-3 px-3 text-red-950 font-semibold">{item.assetName}</td>
                    <td className="py-3 px-3 text-red-900">{item.holderName}</td>
                    <td className="py-3 px-3 text-red-800 font-mono text-xs">{new Date(item.expectedReturnDate).toLocaleDateString()}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs font-bold text-red-600">{item.daysOverdue} days</td>
                    {isManagerOrAdmin && (
                      <td className="py-3 px-3 text-right">
                        <button 
                          onClick={() => setScreen('allocations')}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-bold"
                        >
                          <span>Manage Return</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DASHBOARD GRID CONTENT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Help & Org Directives */}
        <div className="bg-white border border-gray-200 p-6 rounded-2xl flex flex-col justify-between shadow-sm">
          <div>
            <h3 className="font-display font-bold text-lg text-gray-900 mb-3">AssetFlow ERP Instructions</h3>
            <p className="text-gray-600 text-sm leading-relaxed mb-4">
              Welcome to the organization's central command. Please note these strict business policies enforced at the ERP core database:
            </p>
            <ul className="space-y-3.5 text-xs text-gray-600">
              <li className="flex gap-2.5">
                <span className="text-blue-600 font-mono font-bold">01.</span>
                <span><strong>Lifecycle Guardrails:</strong> Asset status updates must strictly follow legal states. Assets cannot flip to under maintenance or allocation without verified approvals.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-blue-600 font-mono font-bold">02.</span>
                <span><strong>No Double Allocations:</strong> If an item is already allocated, the system rejects allocations and requests you file a formal Transfer Request to coordinate.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-blue-600 font-mono font-bold">03.</span>
                <span><strong>Meeting Room overlap checks:</strong> Interactive bookings execute exclusion range scans inside transactional blocks to prevent double-bookings.</span>
              </li>
            </ul>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">Database Engine: <strong>Relational Sandboxed JSON</strong></span>
            <button 
              onClick={() => setScreen('analytics')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 group"
            >
              <span>View Full Reports</span>
              <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
            </button>
          </div>
        </div>

        {/* Short Activity feed preview */}
        <div className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-display font-bold text-lg text-gray-900">Resource System Health</h3>
            <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-0.5 rounded-full font-mono font-bold">Online</span>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 bg-gray-50/50 border border-gray-100 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
                  <FolderCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-800">Asset Registries</div>
                  <div className="text-xs text-gray-450">Active count & details</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-extrabold text-gray-900">{kpis.totalAssets} Registered</div>
                <div className="text-[10px] text-gray-400 font-mono">Auto AF-Tagging sequential</div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-gray-50/50 border border-gray-100 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <CalendarClock className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-800">Space Utilization</div>
                  <div className="text-xs text-gray-450">Meeting rooms & AV suites</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-extrabold text-gray-900">{kpis.activeBookings} Current</div>
                <div className="text-[10px] text-gray-400 font-mono">Overlap validated</div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-gray-50/50 border border-gray-100 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-800">Active Maintenance</div>
                  <div className="text-xs text-gray-450">Urgent + Standard columns</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-extrabold text-gray-900">{kpis.urgentMaintenance} Urgent</div>
                <div className="text-[10px] text-gray-400 font-mono">Lifecycle gate enabled</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QUICK MAINTENANCE MODAL */}
      <Modal 
        isOpen={quickMaintOpen} 
        onClose={() => setQuickMaintOpen(false)} 
        title="Raise Resource Maintenance Ticket"
      >
        <form onSubmit={handleQuickMaintenance} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Select Affected Asset
            </label>
            <select
              required
              value={maintAssetId}
              onChange={(e) => setMaintAssetId(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
            >
              <option value="">-- Choose Asset to ticket --</option>
              {assetsList.map((a) => (
                <option key={a.id} value={a.id}>{a.assetTag} - {a.name} ({a.status})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Describe Issue / Damaged Details
            </label>
            <textarea
              required
              rows={4}
              value={maintDesc}
              onChange={(e) => setMaintDesc(e.target.value)}
              placeholder="Provide a description of the symptoms, broken parts, or failures."
              className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Assigned Severity Priority
            </label>
            <div className="grid grid-cols-4 gap-2">
              {['Low', 'Medium', 'High', 'Critical'].map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setMaintPriority(p)}
                  className={`py-2 text-xs font-bold rounded-lg border transition-colors ${
                    maintPriority === p 
                      ? 'bg-blue-50 text-blue-600 border-blue-500' 
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3 px-4 text-sm mt-4 transition-all"
          >
            Submit Request
          </button>
        </form>
      </Modal>
    </div>
  );
};
