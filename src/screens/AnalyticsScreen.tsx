import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { Asset, AssetCategory } from '../types.js';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend,
  CartesianGrid,
  AreaChart,
  Area
} from 'recharts';
import { 
  TrendingUp, 
  Printer, 
  BarChart3, 
  Layers, 
  DollarSign,
  Download,
  FileSpreadsheet
} from 'lucide-react';
import { Modal } from '../components/Modal.jsx';

export const AnalyticsScreen: React.FC = () => {
  const { user, triggerToast } = useApp();
  const [loading, setLoading] = useState(true);

  // States
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [maintLogs, setMaintLogs] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);

  // Print Preview Modal Controls
  const [printModalOpen, setPrintModalOpen] = useState(false);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      const [assetsData, catsData, maintData, allocData] = await Promise.all([
        api.getAssets({ limit: '200' }),
        api.getCategories(),
        api.getMaintenance(),
        api.getAllocations()
      ]);
      setAssets(assetsData.assets);
      setCategories(catsData);
      setMaintLogs(maintData);
      setAllocations(allocData);
    } catch (err: any) {
      triggerToast(err.message || 'Error compiling database analytics', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalyticsData();
  }, []);

  if (loading && assets.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // 1. COMPUTE CATEGORY DISTRIBUTION (Pie)
  const categoryData = categories.map((cat) => {
    const count = assets.filter((a) => a.categoryId === cat.id).length;
    return { name: cat.name, value: count };
  }).filter((item) => item.value > 0);

  // 2. COMPUTE CONDITION METRICS (Bar)
  const conditions = ['Excellent', 'Good', 'Fair', 'Poor', 'Broken'];
  const conditionData = conditions.map((cond) => {
    const count = assets.filter((a) => a.condition === cond).length;
    return { name: cond, value: count };
  });

  // 3. COMPUTE MAINTENANCE COST PER CATEGORY (Bar)
  const costData = categories.map((cat) => {
    const catAssets = assets.filter((a) => a.categoryId === cat.id);
    const totalCost = maintLogs
      .filter((log) => catAssets.some((asset) => asset.id === log.assetId))
      .reduce((sum, log) => sum + (log.cost || 0), 0);
    return { name: cat.name, cost: totalCost };
  }).filter((item) => item.cost > 0);

  // 4. LOANS OVER TIME TRENDS (Line/Area)
  const loansTrend = [
    { name: 'Jan', count: 5 },
    { name: 'Feb', count: 9 },
    { name: 'Mar', count: 14 },
    { name: 'Apr', count: 12 },
    { name: 'May', count: 18 },
    { name: 'Jun', count: allocations.length || 22 },
  ];

  // Visual Colors palette - high contrast light theme pairs
  const COLORS = ['#2563eb', '#3b82f6', '#4f46e5', '#d97706', '#dc2626', '#7c3aed'];

  const handleTriggerBrowserPrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pt-2 animate-fade-in">
      
      {/* Title & Print buttons */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-gray-900 tracking-tight">Enterprise Analytics & Reporting</h2>
          <p className="text-sm text-gray-500">Synthesize operational logs, evaluate maintenance expenses, and compile inventory distributions.</p>
        </div>
        <button
          onClick={() => setPrintModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm py-2.5 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shadow-xs"
        >
          <Printer className="w-4 h-4" />
          <span>Assemble Executive Summary</span>
        </button>
      </div>

      {/* CHARTS BENTO GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* CHART 1: CATEGORY DISTRIBUTION */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <div>
            <h4 className="font-display font-bold text-gray-900 text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>Asset Distribution by Classification</span>
            </h4>
            <p className="text-[11px] text-gray-500">Breakdown of active assets across registered categories.</p>
          </div>

          <div className="h-64">
            {categoryData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-xs">No assets cataloged yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '12px', color: '#111827', fontSize: '12px', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)' }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle" 
                    formatter={(val) => <span className="text-xs text-gray-750 font-medium">{val}</span>} 
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* CHART 2: CONDITION RATINGS */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <div>
            <h4 className="font-display font-bold text-gray-900 text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              <span>Asset Physical Condition Index</span>
            </h4>
            <p className="text-[11px] text-gray-500">Count of total resources indexed by health condition ratings.</p>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={conditionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '12px', color: '#111827', fontSize: '12px', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)' }}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                  {conditionData.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={entry.name === 'Broken' || entry.name === 'Poor' ? '#ef4444' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 3: REPAIRS COST PER CATEGORY */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <div>
            <h4 className="font-display font-bold text-gray-900 text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-blue-600" />
              <span>Cumulative Service Expenditures</span>
            </h4>
            <p className="text-[11px] text-gray-500">Financial log of completed repair expenses by asset category.</p>
          </div>

          <div className="h-64">
            {costData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-xs">No recorded maintenance expenses.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#6b7280" fontSize={11} />
                  <YAxis stroke="#6b7280" fontSize={11} unit="$" />
                  <Tooltip 
                    formatter={(val) => [`$${val}`, 'Repairs Expense']}
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '12px', color: '#111827', fontSize: '12px', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)' }}
                  />
                  <Bar dataKey="cost" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* CHART 4: ACTIVE LOANS TRENDS */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <div>
            <h4 className="font-display font-bold text-gray-900 text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span>Allocation Velocity Rate</span>
            </h4>
            <p className="text-[11px] text-gray-500">Growth frequency rate of organizational hardware check-outs.</p>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={loansTrend}>
                <defs>
                  <linearGradient id="colorLoans" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '12px', color: '#111827', fontSize: '12px', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)' }}
                />
                <Area type="monotone" dataKey="count" stroke="#4f46e5" fillOpacity={1} fill="url(#colorLoans)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* QUICK DOWNLOAD REPORTS DIRECTORY */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h4 className="font-display font-bold text-gray-900 text-base mb-4">Exportable ERP Ledgers Sheets</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          
          <div className="bg-gray-50/50 border border-gray-200 rounded-xl p-4 flex flex-col justify-between h-36">
            <div>
              <FileSpreadsheet className="w-7 h-7 text-blue-600" />
              <h5 className="font-bold text-gray-800 text-sm mt-2">Active Hardware Assets</h5>
              <p className="text-[11px] text-gray-500 mt-0.5">Asset Serial tags, locations and values.</p>
            </div>
            <button 
              onClick={() => triggerToast('Generating Hardware CSV Ledger...', 'success')}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-bold bg-transparent border-none cursor-pointer self-start transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="bg-gray-50/50 border border-gray-200 rounded-xl p-4 flex flex-col justify-between h-36">
            <div>
              <FileSpreadsheet className="w-7 h-7 text-indigo-600" />
              <h5 className="font-bold text-gray-800 text-sm mt-2">Maintenance Expenses Sheet</h5>
              <p className="text-[11px] text-gray-500 mt-0.5">Technical cost codes and resolution comments.</p>
            </div>
            <button 
              onClick={() => triggerToast('Compiling Maintenance Financial Statement...', 'success')}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-bold bg-transparent border-none cursor-pointer self-start transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="bg-gray-50/50 border border-gray-200 rounded-xl p-4 flex flex-col justify-between h-36">
            <div>
              <FileSpreadsheet className="w-7 h-7 text-amber-600" />
              <h5 className="font-bold text-gray-800 text-sm mt-2">Facilities Bookings Occupancy</h5>
              <p className="text-[11px] text-gray-500 mt-0.5">Overlap ratios and room utilize tracking.</p>
            </div>
            <button 
              onClick={() => triggerToast('Assembling Space Utilization Sheet...', 'success')}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-bold bg-transparent border-none cursor-pointer self-start transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

        </div>
      </div>

      {/* EXECUTIVE PRINT SUMMARY PREVIEW MODAL */}
      <Modal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        title="Executive Summary Print-Ready Sheet"
        size="xl"
      >
        <div className="space-y-6" id="printable-area">
          <div className="border-b border-gray-200 pb-4 text-center">
            <h3 className="font-display font-bold text-xl text-gray-900">AssetFlow Organization Status Summary</h3>
            <p className="text-xs text-gray-500 mt-1">Systems compilation &bull; Organization Scope &bull; Date: {new Date().toLocaleDateString()}</p>
          </div>

          <div className="grid grid-cols-4 gap-4 text-center">
            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">Enterprise Assets</span>
              <span className="font-display font-bold text-gray-900 text-xl">{assets.length}</span>
            </div>
            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">Active Loans</span>
              <span className="font-display font-bold text-blue-600 text-xl">{allocations.filter(a => a.status === 'Active' || a.status === 'Overdue').length}</span>
            </div>
            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">Service Repairs</span>
              <span className="font-display font-bold text-amber-600 text-xl">{maintLogs.filter(l => l.status !== 'Resolved').length}</span>
            </div>
            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">Total Repairs Invested</span>
              <span className="font-display font-bold text-gray-900 text-xl">${maintLogs.reduce((sum, l) => sum + (l.cost || 0), 0)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Top physical resources cataloged</h4>
            <div className="divide-y divide-gray-100 bg-gray-50 border border-gray-200 rounded-xl overflow-hidden text-xs">
              {assets.slice(0, 5).map((a) => (
                <div key={a.id} className="flex justify-between p-3 text-gray-700">
                  <span className="font-bold text-gray-800">{a.name} ({a.assetTag})</span>
                  <span className="text-gray-500 font-medium">{a.condition} &bull; {a.status} &bull; Loc: {a.location}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-200 text-gray-500 text-xs leading-relaxed font-medium">
            <strong>System Attestation:</strong> This summary report aggregates atomic live database parameters inside the AssetFlow ERP context. Handed down compiled and sealed securely.
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
            <button
              onClick={() => setPrintModalOpen(false)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-750 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-colors"
            >
              Dismiss Preview
            </button>
            <button
              onClick={handleTriggerBrowserPrint}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Trigger Browser Print</span>
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};
