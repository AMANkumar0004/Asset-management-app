import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { Allocation, Employee, Department, Asset, TransferRequest } from '../types.js';
import { 
  UserCheck, 
  ArrowLeftRight, 
  Clock, 
  RotateCcw, 
  AlertTriangle, 
  Check,
  X
} from 'lucide-react';
import { Modal } from '../components/Modal.jsx';

export const AllocationScreen: React.FC = () => {
  const { user, triggerToast } = useApp();
  const [loading, setLoading] = useState(true);

  // Database States
  const [allocations, setAllocations] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Modals
  const [allocModalOpen, setAllocModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);

  // Allocate form state
  const [allocAssetId, setAllocAssetId] = useState('');
  const [allocRecipientType, setAllocRecipientType] = useState<'employee' | 'department'>('employee');
  const [allocEmployeeId, setAllocEmployeeId] = useState('');
  const [allocDeptId, setAllocDeptId] = useState('');
  const [allocExpectedReturn, setAllocExpectedReturn] = useState('');

  // Conflict Pre-Check State
  const [conflictError, setConflictError] = useState<{ message: string; allocationId: string; holderName: string } | null>(null);

  // Return form state
  const [returnAllocId, setReturnAllocId] = useState('');
  const [returnAssetName, setReturnAssetName] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnCondition, setReturnCondition] = useState('Excellent');

  const loadAllAllocationData = async () => {
    try {
      setLoading(true);
      const [allocData, transData, assetsData, empsData, deptsData] = await Promise.all([
        api.getAllocations(),
        api.getTransfers(),
        api.getAssets({ limit: '150' }),
        api.getEmployees(),
        api.getDepartments(),
      ]);
      setAllocations(allocData);
      setTransfers(transData);
      setAssets(assetsData.assets.filter((a: any) => a.status !== 'Retired' && a.status !== 'Disposed'));
      setEmployees(empsData);
      setDepartments(deptsData);
    } catch (err: any) {
      triggerToast(err.message || 'Failed to load allocations directory', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllAllocationData();
  }, []);

  // Conflict detection: Watch when asset selected to give feedback!
  useEffect(() => {
    if (!allocAssetId) {
      setConflictError(null);
      return;
    }
    const asset = assets.find((a) => a.id === allocAssetId);
    if (asset && asset.status === 'Allocated') {
      // Find active allocation for asset
      const activeAlloc = allocations.find((al) => al.assetId === allocAssetId && al.status === 'Active');
      const holder = activeAlloc ? activeAlloc.holderName : 'Another employee';
      setConflictError({
        message: `Allocation Conflict: This resource is currently deployed and held by ${holder}.`,
        allocationId: activeAlloc?.id || '',
        holderName: holder
      });
    } else {
      setConflictError(null);
    }
  }, [allocAssetId, assets, allocations]);

  const handleOpenAllocateModal = () => {
    setAllocAssetId('');
    setAllocRecipientType('employee');
    setAllocEmployeeId('');
    setAllocDeptId('');
    setAllocExpectedReturn(new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]); // 6 months default
    setConflictError(null);
    setAllocModalOpen(true);
  };

  const handleAllocateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocAssetId) return;

    if (conflictError) {
      triggerToast(`Double allocation blocked! Please raise a transfer request instead.`, 'error');
      return;
    }

    try {
      const data = {
        assetId: allocAssetId,
        employeeId: allocRecipientType === 'employee' ? allocEmployeeId : null,
        departmentId: allocRecipientType === 'department' ? allocDeptId : null,
        expectedReturnDate: new Date(allocExpectedReturn).toISOString()
      };

      await api.createAllocation(data);
      triggerToast('Allocation approved and completed successfully!', 'success');
      setAllocModalOpen(false);
      loadAllAllocationData();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to authorize allocation', 'error');
    }
  };

  const handleOpenReturnModal = (alloc: any) => {
    setReturnAllocId(alloc.id);
    setReturnAssetName(`${alloc.assetTag} - ${alloc.assetName}`);
    setReturnNotes('');
    setReturnCondition('Excellent');
    setReturnModalOpen(true);
  };

  const handleReturnAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.returnAllocation(returnAllocId, {
        conditionCheckinNotes: returnNotes,
        condition: returnCondition
      });
      triggerToast('Asset check-in approved. Status reverted to Available.', 'success');
      setReturnModalOpen(false);
      loadAllAllocationData();
    } catch (err: any) {
      triggerToast(err.message || 'Error executing check-in', 'error');
    }
  };

  const handleInitiateTransferFromConflict = async () => {
    if (!conflictError) return;
    try {
      await api.createTransfer({ allocationId: conflictError.allocationId });
      triggerToast('Transfer request initiated and route logged to managers!', 'success');
      setAllocModalOpen(false);
      loadAllAllocationData();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to file transfer request', 'error');
    }
  };

  const handleRespondTransfer = async (id: string, action: 'Approved' | 'Rejected') => {
    try {
      await api.respondTransfer(id, action);
      triggerToast(`Transfer request successfully ${action}!`, 'success');
      loadAllAllocationData();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to process transfer', 'error');
    }
  };

  const isManagerOrAdmin = user?.role === 'Admin' || user?.role === 'AssetManager';

  return (
    <div className="space-y-6 pt-2 animate-fade-in">
      
      {/* Title block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-gray-900 tracking-tight">Allocations & Resource Routing</h2>
          <p className="text-sm text-gray-500">Deploy organization hardware to staff or coordinate routing via transfer loops.</p>
        </div>
        {isManagerOrAdmin && (
          <button
            onClick={handleOpenAllocateModal}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm py-2.5 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shadow-xs"
          >
            <UserCheck className="w-4 h-4" />
            <span>Authorize Allocation</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        
        {/* LEFT/MID: ACTIVE ALLOCATIONS LIST */}
        <div className="xl:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden p-6 space-y-4 shadow-sm">
          <div>
            <h3 className="font-display font-bold text-lg text-gray-900">Active Deployment Roster</h3>
            <p className="text-xs text-gray-500">Currently active physical hardware loans registered inside ERP.</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
            </div>
          ) : allocations.filter((a) => a.status === 'Active' || a.status === 'Overdue').length === 0 ? (
            <div className="p-16 text-center text-gray-400 text-sm">No active allocations deployed right now.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Asset</th>
                    <th className="py-2.5 px-3">Deployed To</th>
                    <th className="py-2.5 px-3">Loan Date</th>
                    <th className="py-2.5 px-3">Due Date</th>
                    <th className="py-2.5 px-3">Status</th>
                    {isManagerOrAdmin && <th className="py-2.5 px-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs sm:text-sm">
                  {allocations
                    .filter((a) => a.status === 'Active' || a.status === 'Overdue')
                    .map((alloc) => (
                      <tr key={alloc.id} className="hover:bg-gray-50/50">
                        <td className="py-3.5 px-3">
                          <div>
                            <div className="font-bold text-gray-800">{alloc.assetName}</div>
                            <div className="text-[10px] text-blue-600 font-mono font-bold">{alloc.assetTag}</div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-gray-900 font-semibold">{alloc.holderName}</td>
                        <td className="py-3.5 px-3 text-gray-500 font-mono text-xs">{new Date(alloc.allocatedAt).toLocaleDateString()}</td>
                        <td className="py-3.5 px-3 text-gray-500 font-mono text-xs">{new Date(alloc.expectedReturnDate).toLocaleDateString()}</td>
                        <td className="py-3.5 px-3">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${
                            alloc.status === 'Overdue' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {alloc.status}
                          </span>
                        </td>
                        {isManagerOrAdmin && (
                          <td className="py-3.5 px-3 text-right">
                            <button
                              onClick={() => handleOpenReturnModal(alloc)}
                              className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-800 font-bold bg-blue-50 hover:bg-blue-100/70 py-1.5 px-3 rounded-lg border border-blue-200 transition-all cursor-pointer shadow-2xs"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Check In</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RIGHT: TRANSFER APPROVAL WORKFLOWS */}
        <div className="xl:col-span-1 bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <div>
            <h3 className="font-display font-bold text-lg text-gray-900 flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-blue-600" />
              <span>Transfers Control Panel</span>
            </h3>
            <p className="text-xs text-gray-500">Respond to active loops coordinating asset transfers directly between workers.</p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-600"></div>
            </div>
          ) : transfers.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-xs border border-dashed border-gray-200 rounded-xl">No active transfer requests queued.</div>
          ) : (
            <div className="space-y-3.5">
              {transfers.map((trans) => {
                const isRequested = trans.status === 'Requested';
                return (
                  <div key={trans.id} className="border border-gray-200 bg-gray-50/40 rounded-xl p-4 space-y-3 hover:border-gray-300 transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">{trans.assetTag}</span>
                        <h4 className="font-display font-bold text-gray-900 text-sm mt-1.5">{trans.assetName}</h4>
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        trans.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : trans.status === 'Rejected' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {trans.status}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-gray-500 font-mono">
                      <div className="flex justify-between"><span>Current Holder:</span><span className="text-gray-800 font-bold">{trans.holderName}</span></div>
                      <div className="flex justify-between"><span>Requested By:</span><span className="text-gray-800 font-bold">{trans.requesterName}</span></div>
                      <div className="flex justify-between"><span>Date:</span><span>{new Date(trans.requestedAt).toLocaleDateString()}</span></div>
                    </div>

                    {isRequested && (
                      <div className="pt-2 border-t border-gray-100 flex gap-2">
                        {isManagerOrAdmin ? (
                          <>
                            <button
                              onClick={() => handleRespondTransfer(trans.id, 'Approved')}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-2 rounded-lg text-xs flex items-center justify-center gap-1 cursor-pointer transition-all shadow-2xs"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => handleRespondTransfer(trans.id, 'Rejected')}
                              className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold py-1.5 px-2 rounded-lg text-xs flex items-center justify-center gap-1 cursor-pointer transition-all shadow-2xs"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </>
                        ) : (
                          <div className="text-gray-400 italic text-[11px] flex items-center gap-1.5 font-mono">
                            <Clock className="w-3.5 h-3.5 text-gray-300" />
                            <span>Awaiting Manager Approval</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* AUTHORIZE ALLOCATION MODAL */}
      <Modal
        isOpen={allocModalOpen}
        onClose={() => setAllocModalOpen(false)}
        title="Authorize Resource Allocation Loan"
        size="md"
      >
        <form onSubmit={handleAllocateAsset} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Select Available Hardware Asset
            </label>
            <select
              required
              value={allocAssetId}
              onChange={(e) => setAllocAssetId(e.target.value)}
              className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
            >
              <option value="">-- Choose Asset to loan --</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>{a.assetTag} - {a.name} ({a.status})</option>
              ))}
            </select>
          </div>

          {/* CONFLICT ERROR BANNER */}
          {conflictError && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <div className="flex gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <h4 className="font-display font-bold text-amber-950 text-sm">Double Allocation Guard</h4>
                  <p className="text-xs text-amber-800 mt-0.5 leading-relaxed font-medium">
                    {conflictError.message} To avoid double-allocating resources, you can request an automated routing transfer directly.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleInitiateTransferFromConflict}
                className="w-full bg-white border border-amber-200 hover:bg-amber-50 text-amber-800 font-bold py-2 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>Initiate Direct Transfer Request Instead</span>
              </button>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Recipient Assignment Scope
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!!conflictError}
                onClick={() => setAllocRecipientType('employee')}
                className={`py-2.5 text-xs font-bold rounded-lg border transition-colors ${
                  allocRecipientType === 'employee' 
                    ? 'bg-blue-50 text-blue-600 border-blue-500' 
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                Individual Employee
              </button>
              <button
                type="button"
                disabled={!!conflictError}
                onClick={() => setAllocRecipientType('department')}
                className={`py-2.5 text-xs font-bold rounded-lg border transition-colors ${
                  allocRecipientType === 'department' 
                    ? 'bg-blue-50 text-blue-600 border-blue-500' 
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                Shared Department
              </button>
            </div>
          </div>

          {allocRecipientType === 'employee' ? (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Nominated Recipient Employee
              </label>
              <select
                required
                disabled={!!conflictError}
                value={allocEmployeeId}
                onChange={(e) => setAllocEmployeeId(e.target.value)}
                className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
              >
                <option value="">-- Choose Employee --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.email})</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Target Department Scope
              </label>
              <select
                required
                disabled={!!conflictError}
                value={allocDeptId}
                onChange={(e) => setAllocDeptId(e.target.value)}
                className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
              >
                <option value="">-- Choose Department --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Expected Return Milestone Deadline
            </label>
            <input
              type="date"
              required
              disabled={!!conflictError}
              value={allocExpectedReturn}
              onChange={(e) => setAllocExpectedReturn(e.target.value)}
              className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={!!conflictError}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3 px-4 text-sm mt-4 transition-all disabled:opacity-50"
          >
            Authorize Check-Out Loan
          </button>
        </form>
      </Modal>

      {/* RETURN CHECK IN MODAL */}
      <Modal
        isOpen={returnModalOpen}
        onClose={() => setReturnModalOpen(false)}
        title="Approve Resource Return & Check-in"
      >
        <form onSubmit={handleReturnAsset} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
              Asset Item
            </label>
            <span className="text-sm font-bold text-gray-900 block bg-gray-50 p-3 rounded-lg border border-gray-200">{returnAssetName}</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Returned Physical Condition Rating
            </label>
            <select
              value={returnCondition}
              onChange={(e) => setReturnCondition(e.target.value)}
              className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
            >
              <option value="Excellent">Excellent (Like New)</option>
              <option value="Good">Good (Normal Wear)</option>
              <option value="Fair">Fair (Cosmetic Marks)</option>
              <option value="Poor">Poor (Heavily Degraded)</option>
              <option value="Broken">Broken / Unusable</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Check-in Condition Notes / Inspection Comments
            </label>
            <textarea
              required
              rows={4}
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="e.g. Scratched bottom chassis. Screen working perfectly. Cleaned keyboard."
              className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3 px-4 text-sm mt-4 transition-all"
          >
            Authorize Check-In Re-entry
          </button>
        </form>
      </Modal>

    </div>
  );
};
