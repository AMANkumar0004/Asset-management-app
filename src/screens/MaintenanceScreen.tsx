import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { MaintenanceRequest, Asset, MaintenanceStatus } from '../types.js';
import { 
  Wrench, 
  Plus, 
  Clock
} from 'lucide-react';
import { Modal } from '../components/Modal.jsx';

export const MaintenanceScreen: React.FC = () => {
  const { user, triggerToast } = useApp();
  const [loading, setLoading] = useState(true);

  // Database lists
  const [tickets, setTickets] = useState<any[]>([]);
  const [assetsList, setAssetsList] = useState<Asset[]>([]);

  // Create Modal Controls
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [regAssetId, setRegAssetId] = useState('');
  const [regDesc, setRegDesc] = useState('');
  const [regPriority, setRegPriority] = useState('Medium');

  // Update Modal Controls (Manager-only actions)
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [selTicket, setSelTicket] = useState<any | null>(null);
  const [upStatus, setUpStatus] = useState<MaintenanceStatus>('Pending');
  const [upTechnician, setUpTechnician] = useState('');

  const loadMaintenanceData = async () => {
    try {
      setLoading(true);
      const [ticketsData, assetsData] = await Promise.all([
        api.getMaintenance(),
        api.getAssets({ limit: '100' })
      ]);
      setTickets(ticketsData);
      setAssetsList(assetsData.assets.filter((a: any) => a.status !== 'Retired' && a.status !== 'Disposed'));
    } catch (err: any) {
      triggerToast(err.message || 'Failed to fetch maintenance tickets', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMaintenanceData();
  }, []);

  useEffect(() => {
    const handleWsMessage = (e: Event) => {
      const customEvent = e as CustomEvent;
      const message = customEvent.detail;
      if (message.type === 'invalidate_maintenance') {
        console.log('WS Trigger: Refreshing Maintenance...');
        loadMaintenanceData();
      }
    };

    window.addEventListener('assetflow:ws_message', handleWsMessage);
    return () => {
      window.removeEventListener('assetflow:ws_message', handleWsMessage);
    };
  }, []);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regAssetId || !regDesc) {
      triggerToast('Please select an asset and write descriptions.', 'error');
      return;
    }

    try {
      await api.createMaintenance({
        assetId: regAssetId,
        issueDescription: regDesc,
        priority: regPriority
      });
      triggerToast('Maintenance ticket reported successfully!', 'success');
      setCreateModalOpen(false);
      setRegAssetId('');
      setRegDesc('');
      setRegPriority('Medium');
      loadMaintenanceData();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to submit maintenance log', 'error');
    }
  };

  const handleOpenUpdateModal = (ticket: any) => {
    setSelTicket(ticket);
    setUpStatus(ticket.status);
    setUpTechnician(ticket.assignedTechnician || '');
    setUpdateModalOpen(true);
  };

  const handleUpdateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selTicket) return;

    try {
      await api.updateMaintenanceStatus(selTicket.id, upStatus, {
        assignedTechnician: upTechnician || null
      });

      triggerToast('Ticket status updated successfully', 'success');
      setUpdateModalOpen(false);
      setSelTicket(null);
      loadMaintenanceData();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to update ticket status', 'error');
    }
  };

  const isManagerOrAdmin = user?.role === 'Admin' || user?.role === 'AssetManager';

  // Strict Status mapping with light minimal color themes
  const statusColorMap: Record<MaintenanceStatus, string> = {
    Pending: 'bg-amber-50 text-amber-700 border-amber-200',
    Approved: 'bg-blue-50 text-blue-700 border-blue-200',
    Rejected: 'bg-red-50 text-red-700 border-red-200',
    TechnicianAssigned: 'bg-purple-50 text-purple-700 border-purple-200',
    InProgress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    Resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };

  return (
    <div className="space-y-6 pt-2 animate-fade-in">
      
      {/* Header block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-gray-900 tracking-tight">Maintenance & Repairs Registry</h2>
          <p className="text-sm text-gray-500">File equipment defect tickets, update repairs work orders, and log service technicians cost ledger.</p>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm py-2.5 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Report Defect Ticket</span>
        </button>
      </div>

      {loading && tickets.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      ) : tickets.length === 0 ? (
        <div className="bg-white border border-gray-200 p-16 rounded-2xl text-center text-gray-450 text-sm shadow-sm">
          No active maintenance or repairs tickets registered. All facilities operating optimally.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Asset Defect</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Issue Description</th>
                  <th className="py-2.5 px-3">Reported By</th>
                  <th className="py-2.5 px-3">Ticket Status</th>
                  <th className="py-2.5 px-3">Assigned Technician</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs sm:text-sm">
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-gray-50/50 text-gray-700">
                    <td className="py-3.5 px-3">
                      <div>
                        <div className="font-bold text-gray-800">{ticket.assetName}</div>
                        <div className="text-[10px] text-blue-600 font-mono font-bold mt-0.5">{ticket.assetTag}</div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${
                        ticket.priority === 'Critical' || ticket.priority === 'High' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                      }`}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 max-w-xs truncate">
                      <div>
                        <p className="text-gray-900 font-medium">{ticket.issueDescription}</p>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 font-mono text-xs text-gray-500">{ticket.creatorName || 'System'}</td>
                    <td className="py-3.5 px-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${
                        statusColorMap[ticket.status as MaintenanceStatus] || 'bg-gray-50 text-gray-500 border-gray-200'
                      }`}>
                        {ticket.status.replace(/([A-Z])/g, ' $1')}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-gray-800 font-semibold">
                      {ticket.assignedTechnician ? (
                        <span className="text-gray-800 text-xs">{ticket.assignedTechnician}</span>
                      ) : (
                        <span className="text-gray-400 font-mono text-xs">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      {isManagerOrAdmin ? (
                        <button
                          onClick={() => handleOpenUpdateModal(ticket)}
                          className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 hover:text-blue-800 font-bold text-xs py-1.5 px-2.5 rounded-lg transition-colors cursor-pointer shadow-2xs"
                        >
                          Manage Workorder
                        </button>
                      ) : (
                        <div className="text-[11px] text-gray-450 italic flex items-center justify-end gap-1 font-mono">
                          <Clock className="w-3.5 h-3.5 text-gray-300" />
                          <span>Queue Active</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE MAINTENANCE DEFECT MODAL */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Raise Resource Defect Ticket"
      >
        <form onSubmit={handleCreateTicket} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Select Affected Asset Item
            </label>
            <select
              required
              value={regAssetId}
              onChange={(e) => setRegAssetId(e.target.value)}
              className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
            >
              <option value="">-- Choose Asset --</option>
              {assetsList.map((a) => (
                <option key={a.id} value={a.id}>{a.assetTag} - {a.name} ({a.status})</option>
              ))}
            </select>
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
                  onClick={() => setRegPriority(p)}
                  className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                    regPriority === p 
                      ? 'bg-blue-50 text-blue-600 border-blue-500 shadow-2xs' 
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-350 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Describe Symptoms / Failure Detail
            </label>
            <textarea
              required
              rows={4}
              value={regDesc}
              onChange={(e) => setRegDesc(e.target.value)}
              placeholder="e.g. Printer is displaying Jam error. Paper feed wheel appears stuck."
              className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3 px-4 text-sm mt-4 transition-all"
          >
            Submit Defect Report
          </button>
        </form>
      </Modal>

      {/* UPDATE / RESOLVE WORKORDER MODAL (MANAGER ONLY) */}
      <Modal
        isOpen={updateModalOpen}
        onClose={() => setUpdateModalOpen(false)}
        title="Manage Workorder & Repairs Log"
      >
        {selTicket && (
          <form onSubmit={handleUpdateTicket} className="space-y-4">
            
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-700 space-y-1">
              <div>Asset Tag: <span className="font-mono text-blue-600 font-bold bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">{selTicket.assetTag}</span></div>
              <div className="pt-1">Label: <span className="text-gray-900 font-bold">{selTicket.assetName}</span></div>
              <p className="pt-1.5 border-t border-gray-150 mt-1.5 italic text-gray-500">" {selTicket.issueDescription} "</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Workorder Status
              </label>
              <select
                required
                value={upStatus}
                onChange={(e) => setUpStatus(e.target.value as any)}
                className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
              >
                <option value="Pending">Pending Assignment</option>
                <option value="Approved">Approved / In Queue</option>
                <option value="TechnicianAssigned">Technician Assigned</option>
                <option value="InProgress">In Progress</option>
                <option value="Resolved">Resolved / Repaired (Reverts Asset status to Available)</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Assign Technician Name / Agency
              </label>
              <input
                type="text"
                value={upTechnician}
                onChange={(e) => setUpTechnician(e.target.value)}
                placeholder="e.g. John Doe, Facility Tech Dept"
                className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3.5 px-4 text-sm mt-4 transition-all"
            >
              Commit Workorder Updates
            </button>
          </form>
        )}
      </Modal>

    </div>
  );
};
