import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { Asset, AssetCategory, AssetStatus, AssetCondition } from '../types.js';
import { 
  Search, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  History,
  Wrench,
  X,
  FileCheck2,
  Tag
} from 'lucide-react';
import { Modal } from '../components/Modal.jsx';

export const AssetDirectoryScreen: React.FC = () => {
  const { user, triggerToast } = useApp();
  const [loading, setLoading] = useState(true);

  // States
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(15);
  const [offset, setOffset] = useState(0);

  // Filter params
  const [search, setSearch] = useState('');
  const [selCatId, setSelCatId] = useState('');
  const [selStatus, setSelStatus] = useState('');
  const [selCondition, setSelCondition] = useState('');
  const [isBookable, setIsBookable] = useState<string>('');

  // Selected Asset Detail view state
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [assetDetail, setAssetDetail] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Register form controls
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [regName, setRegName] = useState('');
  const [regCatId, setRegCatId] = useState('');
  const [regSerial, setRegSerial] = useState('');
  const [regAcqDate, setRegAcqDate] = useState(new Date().toISOString().split('T')[0]);
  const [regCost, setRegCost] = useState('');
  const [regCondition, setRegCondition] = useState<AssetCondition>('Excellent');
  const [regLocation, setRegLocation] = useState('');
  const [regIsBookable, setRegIsBookable] = useState(false);
  // Custom field dynamic values
  const [regCustomVals, setRegCustomVals] = useState<Record<string, any>>({});

  // Helper to trigger searches
  const loadAssetsList = async () => {
    try {
      setLoading(true);
      const queryParams: any = {
        limit: limit.toString(),
        offset: offset.toString()
      };
      if (search) queryParams.search = search;
      if (selCatId) queryParams.categoryId = selCatId;
      if (selStatus) queryParams.status = selStatus;
      if (selCondition) queryParams.condition = selCondition;
      if (isBookable) queryParams.isBookable = isBookable;

      const res = await api.getAssets(queryParams);
      setAssets(res.assets);
      setTotal(res.total);
    } catch (err: any) {
      triggerToast(err.message || 'Error fetching assets directory', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const cats = await api.getCategories();
      setCategories(cats);
    } catch (e) {
      console.error('Error fetching categories list', e);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  // Poll search updates
  useEffect(() => {
    const handler = setTimeout(() => {
      setOffset(0);
      loadAssetsList();
    }, 300); // debounce input
    return () => clearTimeout(handler);
  }, [search, selCatId, selStatus, selCondition, isBookable]);

  useEffect(() => {
    loadAssetsList();
  }, [offset]);

  // Load individual detail
  const handleViewDetails = async (id: string) => {
    setSelectedAssetId(id);
    setLoadingDetail(true);
    try {
      const detail = await api.getAsset(id);
      setAssetDetail(detail);
    } catch (err: any) {
      triggerToast(err.message || 'Failed to load asset dossier', 'error');
      setSelectedAssetId(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Handle category shift on creation form to dynamically load form fields!
  const handleCatChangeOnForm = (catId: string) => {
    setRegCatId(catId);
    const chosenCat = categories.find((c) => c.id === catId);
    if (chosenCat && chosenCat.customFields) {
      const initVals: any = {};
      Object.entries(chosenCat.customFields).forEach(([key, type]) => {
        initVals[key] = type === 'boolean' ? false : type === 'number' ? 0 : '';
      });
      setRegCustomVals(initVals);
    } else {
      setRegCustomVals({});
    }
  };

  const handleRegisterAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regCatId || !regSerial) {
      triggerToast('Asset Tag requires Label, Catalog, and Serial ID', 'error');
      return;
    }

    try {
      const data = {
        name: regName,
        categoryId: regCatId,
        serialNumber: regSerial,
        acquisitionDate: regAcqDate,
        acquisitionCost: Number(regCost) || 0,
        condition: regCondition,
        location: regLocation,
        isBookable: regIsBookable,
        customFieldValues: regCustomVals
      };

      await api.createAsset(data);
      triggerToast('New physical asset registered successfully!', 'success');
      setRegModalOpen(false);

      // Reset
      setRegName('');
      setRegCatId('');
      setRegSerial('');
      setRegCost('');
      setRegCondition('Excellent');
      setRegLocation('');
      setRegIsBookable(false);
      setRegCustomVals({});

      setOffset(0);
      loadAssetsList();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to register asset', 'error');
    }
  };

  const isManagerOrAdmin = user?.role === 'Admin' || user?.role === 'AssetManager';

  // State colors maps to light minimal
  const statusColorMap: Record<AssetStatus, string> = {
    Available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Allocated: 'bg-blue-50 text-blue-700 border-blue-200',
    Reserved: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    UnderMaintenance: 'bg-orange-50 text-orange-700 border-orange-200',
    Lost: 'bg-red-50 text-red-700 border-red-200',
    Retired: 'bg-gray-100 text-gray-700 border-gray-200',
    Disposed: 'bg-gray-200 text-gray-800 border-gray-300',
  };

  return (
    <div className="space-y-6 pt-2">
      {/* Search Header row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white border border-gray-200 p-5 rounded-2xl shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute inset-y-0 left-0 pl-3.5 w-5 h-5 text-gray-400 flex items-center h-full pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search directory by asset tag, label name, or serial number..."
            className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-2.5 pl-11 pr-4 text-sm outline-none transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <select
            value={selCatId}
            onChange={(e) => setSelCatId(e.target.value)}
            className="bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-xl py-2.5 px-3 outline-none focus:border-blue-500 focus:bg-white"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={selStatus}
            onChange={(e) => setSelStatus(e.target.value)}
            className="bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-xl py-2.5 px-3 outline-none focus:border-blue-500 focus:bg-white"
          >
            <option value="">All Statuses</option>
            <option value="Available">Available</option>
            <option value="Allocated">Allocated</option>
            <option value="Reserved">Reserved</option>
            <option value="UnderMaintenance">Under Maintenance</option>
            <option value="Lost">Lost</option>
            <option value="Retired">Retired</option>
          </select>

          <select
            value={isBookable}
            onChange={(e) => setIsBookable(e.target.value)}
            className="bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-xl py-2.5 px-3 outline-none focus:border-blue-500 focus:bg-white"
          >
            <option value="">All Types</option>
            <option value="true">Bookable Space/Resource</option>
            <option value="false">Allocatable Hardware</option>
          </select>

          {isManagerOrAdmin && (
            <button
              onClick={() => setRegModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm py-2.5 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Register Asset</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Layout Area - Grid splitting into Left: Directory Table, Right: Selected Detail Drawer */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        
        {/* LEFT: ASSETS DIRECTORY TABLE (2 Columns on large screens) */}
        <div className="xl:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-display font-bold text-lg text-gray-900">Resource Catalogue</h3>
              <p className="text-xs text-gray-500">Displaying {assets.length} items of {total} total resources recorded.</p>
            </div>
            
            {/* Simple Pagination Buttons */}
            <div className="flex items-center gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                className="p-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-35 rounded-lg cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono text-gray-500 font-bold">
                {Math.floor(offset / limit) + 1} / {Math.ceil(total / limit) || 1}
              </span>
              <button
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
                className="p-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-35 rounded-lg cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
            </div>
          ) : assets.length === 0 ? (
            <div className="p-16 text-center text-gray-400">
              No assets matching the filter criteria found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Tag ID</th>
                    <th className="py-2.5 px-3">Label / Name</th>
                    <th className="py-2.5 px-3">Catalog</th>
                    <th className="py-2.5 px-3">Condition</th>
                    <th className="py-2.5 px-3">Location</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs sm:text-sm">
                  {assets.map((asset) => {
                    const category = categories.find((c) => c.id === asset.categoryId);
                    const isSelected = selectedAssetId === asset.id;
                    return (
                      <tr 
                        key={asset.id} 
                        onClick={() => handleViewDetails(asset.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-blue-50/70 hover:bg-blue-50 text-blue-900 font-bold border-l-2 border-blue-600' 
                            : 'hover:bg-gray-50/50 text-gray-700'
                        }`}
                      >
                        <td className="py-3 px-3 font-mono font-bold text-gray-900">{asset.assetTag}</td>
                        <td className="py-3 px-3">
                          <div>
                            <div className="font-bold text-gray-800">{asset.name}</div>
                            <div className="text-[10px] text-gray-400 font-mono">SN: {asset.serialNumber}</div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-gray-600">{category?.name || 'Standard'}</td>
                        <td className="py-3 px-3 text-gray-600">{asset.condition}</td>
                        <td className="py-3 px-3 text-gray-600">{asset.location}</td>
                        <td className="py-3 px-3">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${
                            statusColorMap[asset.status] || 'bg-gray-100 text-gray-700'
                          }`}>
                            {asset.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RIGHT: SELECTED DOSSIER DRAWER */}
        <div className="xl:col-span-1">
          {selectedAssetId ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-6 relative overflow-hidden shadow-sm animate-fade-in">
              <button 
                onClick={() => setSelectedAssetId(null)}
                className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              {loadingDetail || !assetDetail ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
                  <div className="animate-spin rounded-full h-7 w-7 border-t-2 border-b-2 border-blue-600"></div>
                  <span className="text-xs font-medium">Assembling history timelines...</span>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Dossier Header */}
                  <div>
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">{assetDetail.asset.assetTag}</span>
                    <h3 className="font-display font-bold text-lg text-gray-900 mt-2 leading-tight">{assetDetail.asset.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">Classification Catalog: <strong>{categories.find(c => c.id === assetDetail.asset.categoryId)?.name || 'Generic'}</strong></p>
                  </div>

                  {/* Operational Details Card */}
                  <div className="bg-gray-50/50 border border-gray-150 rounded-xl p-4 space-y-2.5 text-xs">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Operational Specifications</span>
                    <div className="grid grid-cols-2 gap-y-2 text-gray-600">
                      <div>Serial Number:</div><div className="font-mono text-right text-gray-900 font-bold">{assetDetail.asset.serialNumber}</div>
                      <div>Acquisition Date:</div><div className="font-mono text-right text-gray-900">{assetDetail.asset.acquisitionDate}</div>
                      <div>Acquisition Value:</div><div className="text-right text-gray-900 font-bold">${assetDetail.asset.acquisitionCost}</div>
                      <div>Deployment Status:</div>
                      <div className="text-right">
                        <span className={`inline-block px-2 py-0.2 rounded-md text-[9px] font-bold uppercase tracking-wider ${statusColorMap[assetDetail.asset.status]}`}>{assetDetail.asset.status}</span>
                      </div>
                      <div>Physical Condition:</div><div className="text-right text-gray-900 font-bold">{assetDetail.asset.condition}</div>
                      <div>Current Location:</div><div className="text-right text-gray-900 font-bold">{assetDetail.asset.location}</div>
                      <div>Resource Type:</div><div className="text-right text-blue-600 font-bold">{assetDetail.asset.isBookable ? 'Bookable Space/Resource' : 'Allocatable Item'}</div>
                    </div>

                    {/* Custom Catalog Parameters */}
                    {Object.keys(assetDetail.asset.customFieldValues || {}).length > 0 && (
                      <div className="pt-3 border-t border-gray-100 mt-2 space-y-1.5">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Catalog Specifications</span>
                        {Object.entries(assetDetail.asset.customFieldValues).map(([key, val]: any) => (
                          <div key={key} className="flex justify-between items-center text-gray-600">
                            <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span>
                            <span className="text-gray-900 font-mono font-bold">{val.toString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Dossier Tabs/Timelines section */}
                  <div className="space-y-4">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block border-b border-gray-100 pb-1">Historical Logs Timeline</span>
                    
                    {/* Allocation History */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                        <FileCheck2 className="w-4 h-4 text-gray-400" />
                        <span>Allocation Logs ({assetDetail.allocationsHistory.length})</span>
                      </div>
                      {assetDetail.allocationsHistory.length === 0 ? (
                        <p className="text-[11px] text-gray-400 italic pl-5">No previous allocation records logged.</p>
                      ) : (
                        <div className="space-y-2 pl-5 border-l border-gray-200">
                          {assetDetail.allocationsHistory.slice(0, 3).map((alloc: any, i: number) => (
                            <div key={i} className="text-[11px] space-y-0.5">
                              <div className="flex justify-between text-gray-700 font-bold">
                                <span>To: {alloc.holderName}</span>
                                <span className={`text-[9px] font-bold ${alloc.status === 'Returned' ? 'text-gray-500' : alloc.status === 'Overdue' ? 'text-red-600' : 'text-blue-600'}`}>{alloc.status}</span>
                              </div>
                              <div className="text-gray-400 font-mono text-[9px]">Allocated: {new Date(alloc.allocatedAt).toLocaleDateString()}</div>
                              {alloc.actualReturnDate && (
                                <div className="text-gray-400 font-mono text-[9px]">Returned: {new Date(alloc.actualReturnDate).toLocaleDateString()}</div>
                              )}
                              {alloc.conditionCheckinNotes && (
                                <div className="text-[10px] text-gray-600 italic font-medium bg-gray-50 p-1.5 rounded-lg border border-gray-150 mt-1">" {alloc.conditionCheckinNotes} "</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Maintenance History */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                        <Wrench className="w-4 h-4 text-gray-400" />
                        <span>Maintenance Records ({assetDetail.maintenanceHistory.length})</span>
                      </div>
                      {assetDetail.maintenanceHistory.length === 0 ? (
                        <p className="text-[11px] text-gray-400 italic pl-5">No previous maintenance cases logged.</p>
                      ) : (
                        <div className="space-y-2 pl-5 border-l border-gray-200">
                          {assetDetail.maintenanceHistory.slice(0, 3).map((m: any, i: number) => (
                            <div key={i} className="text-[11px] space-y-0.5">
                              <div className="flex justify-between text-gray-700 font-bold">
                                <span>Status: {m.status}</span>
                                <span className={`text-[9px] font-bold uppercase ${m.priority === 'Critical' || m.priority === 'High' ? 'text-red-600' : 'text-gray-400'}`}>{m.priority}</span>
                              </div>
                              <p className="text-gray-600 italic">" {m.issueDescription} "</p>
                              {m.resolvedAt && <div className="text-gray-400 font-mono text-[9px]">Resolved: {new Date(m.resolvedAt).toLocaleDateString()}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Basic Lifecycle Transition State logs */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                        <History className="w-4 h-4 text-gray-400" />
                        <span>System Transition Timeline ({assetDetail.timeline.length})</span>
                      </div>
                      <div className="space-y-3.5 pl-5 border-l border-gray-200 max-h-48 overflow-y-auto">
                        {assetDetail.timeline.map((log: any, i: number) => (
                          <div key={i} className="text-[10px] relative">
                            <span className="absolute -left-7 mt-1.5 w-2.5 h-2.5 rounded-full bg-blue-600 border-2 border-white ring-1 ring-gray-100" />
                            <div className="font-bold text-gray-800">{log.fromStatus} &rarr; {log.toStatus}</div>
                            <div className="text-gray-400 font-mono text-[9px]">{new Date(log.changedAt).toLocaleDateString()} by Assigner</div>
                            <p className="text-gray-500 italic mt-0.5">Reason: {log.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 border-dashed rounded-2xl p-12 text-center text-gray-400 text-sm shadow-sm">
              <Tag className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <span>Select an item from the resource catalogue to assemble its complete operational dossier.</span>
            </div>
          )}
        </div>

      </div>

      {/* ASSET REGISTRATION MODAL */}
      <Modal
        isOpen={regModalOpen}
        onClose={() => setRegModalOpen(false)}
        title="Register Organization Asset/Resource"
        size="lg"
      >
        <form onSubmit={handleRegisterAsset} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Asset Name / Label
              </label>
              <input
                type="text"
                required
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="e.g. Dell XPS 15 Laptop"
                className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Serial Number
              </label>
              <input
                type="text"
                required
                value={regSerial}
                onChange={(e) => setRegSerial(e.target.value)}
                placeholder="e.g. SN-9872134AA"
                className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Asset Catalog Category
              </label>
              <select
                required
                value={regCatId}
                onChange={(e) => handleCatChangeOnForm(e.target.value)}
                className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
              >
                <option value="">-- Choose Category --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Storage / Installation Location
              </label>
              <input
                type="text"
                required
                value={regLocation}
                onChange={(e) => setRegLocation(e.target.value)}
                placeholder="e.g. HQ - Room 402"
                className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Acquisition Value ($)
              </label>
              <input
                type="number"
                value={regCost}
                onChange={(e) => setRegCost(e.target.value)}
                placeholder="e.g. 1499"
                className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Acquisition Date
              </label>
              <input
                type="date"
                value={regAcqDate}
                onChange={(e) => setRegAcqDate(e.target.value)}
                className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Initial Condition Rating
              </label>
              <select
                value={regCondition}
                onChange={(e) => setRegCondition(e.target.value as any)}
                className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
              >
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Poor">Poor</option>
                <option value="Broken">Broken</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-250 rounded-xl">
            <input
              type="checkbox"
              id="isBookable"
              checked={regIsBookable}
              onChange={(e) => setRegIsBookable(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="isBookable" className="text-xs sm:text-sm text-gray-700 font-bold cursor-pointer">
              Register as bookable shared resource / space (Enables Overlap Booking Validation)
            </label>
          </div>

          {/* DYNAMIC ATTRIBUTES INPUT PANEL */}
          {regCatId && Object.keys(regCustomVals).length > 0 && (
            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3">
              <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Dynamic Catalog Specifications Schema</span>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.entries(categories.find((c) => c.id === regCatId)?.customFields || {}).map(([key, type]) => (
                  <div key={key}>
                    <label className="block text-[11px] font-bold text-gray-500 capitalize mb-1.5">
                      {key.replace(/([A-Z])/g, ' $1')} ({type as string})
                    </label>
                    {type === 'boolean' ? (
                      <select
                        value={regCustomVals[key] ? 'true' : 'false'}
                        onChange={(e) => setRegCustomVals({ ...regCustomVals, [key]: e.target.value === 'true' })}
                        className="w-full bg-gray-55 border border-gray-250 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-2.5 px-3 text-xs outline-none transition-all"
                      >
                        <option value="false">No / False</option>
                        <option value="true">Yes / True</option>
                      </select>
                    ) : (
                      <input
                        type={type === 'number' ? 'number' : 'text'}
                        value={regCustomVals[key] || ''}
                        onChange={(e) => setRegCustomVals({ ...regCustomVals, [key]: type === 'number' ? Number(e.target.value) : e.target.value })}
                        className="w-full bg-gray-55 border border-gray-250 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-2.5 px-3 text-xs outline-none transition-all"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3.5 px-4 text-sm mt-4 transition-all shadow-xs"
          >
            Register to organization database
          </button>
        </form>
      </Modal>

    </div>
  );
};
