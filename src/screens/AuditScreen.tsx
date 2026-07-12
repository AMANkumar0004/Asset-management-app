import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { 
  ClipboardCheck, 
  Play, 
  History, 
  ListFilter,
  ShieldCheck
} from 'lucide-react';

export const AuditScreen: React.FC = () => {
  const { user, triggerToast } = useApp();
  const [loading, setLoading] = useState(true);

  // Database States
  const [auditCycles, setAuditCycles] = useState<any[]>([]);
  const [activeCycle, setActiveCycle] = useState<any | null>(null);
  const [checklist, setChecklist] = useState<any[]>([]);

  // Local state for recording verification findings
  // Map of assetId -> { result: 'Verified' | 'Missing' | 'Damaged', notes: string }
  const [localFindings, setLocalFindings] = useState<Record<string, { result: 'Verified' | 'Missing' | 'Damaged'; notes: string }>>({});

  // Cycle creation parameters
  const [scopeType, setScopeType] = useState<'department' | 'location'>('location');
  const [scopeValue, setScopeValue] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  const loadAuditData = async () => {
    try {
      setLoading(true);
      const cycles = await api.getAudits();
      setAuditCycles(cycles);

      // Find any active cycle
      const active = cycles.find((c: any) => c.status === 'Active');
      if (active) {
        setActiveCycle(active);
        // Load findings checklist for this active cycle
        const findingsRes = await api.getAuditFindings(active.id);
        setChecklist(findingsRes.checklist || []);

        // Populate local findings state
        const initialFindings: Record<string, { result: 'Verified' | 'Missing' | 'Damaged'; notes: string }> = {};
        (findingsRes.checklist || []).forEach((item: any) => {
          initialFindings[item.assetId] = {
            result: item.finding ? item.finding.result : 'Verified',
            notes: item.finding ? item.finding.notes : ''
          };
        });
        setLocalFindings(initialFindings);
      } else {
        setActiveCycle(null);
        setChecklist([]);
        setLocalFindings({});
      }
    } catch (err: any) {
      triggerToast(err.message || 'Error compiling audit rosters', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditData();
  }, []);

  const handleLaunchCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scopeValue || !dateStart || !dateEnd) {
      triggerToast('All audit boundary parameters are required.', 'error');
      return;
    }

    try {
      await api.createAudit({
        scopeType,
        scopeValue,
        dateRangeStart: new Date(dateStart).toISOString(),
        dateRangeEnd: new Date(dateEnd).toISOString(),
        auditorIds: [user?.id] // Assign current creator as default auditor
      });

      triggerToast('Enterprise audit cycle initialized!', 'success');
      setScopeValue('');
      setDateStart('');
      setDateEnd('');
      loadAuditData();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to initialize audit cycle', 'error');
    }
  };

  const handleRecordFindingChange = (assetId: string, field: 'result' | 'notes', val: string) => {
    setLocalFindings((prev) => ({
      ...prev,
      [assetId]: {
        ...prev[assetId],
        [field]: val
      }
    }));
  };

  const handleSaveSingleFinding = async (assetId: string) => {
    if (!activeCycle) return;
    const finding = localFindings[assetId] || { result: 'Verified', notes: '' };
    try {
      await api.recordAuditFinding(activeCycle.id, {
        assetId,
        result: finding.result,
        notes: finding.notes
      });
      triggerToast('Verification logged successfully', 'success');
    } catch (err: any) {
      triggerToast(err.message || 'Failed to record finding', 'error');
    }
  };

  const handleCloseAuditCycle = async () => {
    if (!activeCycle) return;
    if (!confirm('Close this audit cycle? Asset conditions and lost records will immediately update in the main ERP database.')) return;

    try {
      // First, save all dirty findings as we close to ensure zero loss
      const savePromises = Object.entries(localFindings).map(([assetId, f]) => {
        const finding = f as { result: 'Verified' | 'Missing' | 'Damaged'; notes: string };
        return api.recordAuditFinding(activeCycle.id, {
          assetId,
          result: finding.result,
          notes: finding.notes
        });
      });
      await Promise.all(savePromises);

      // Now request final atomic closure
      await api.closeAuditCycle(activeCycle.id);
      triggerToast('Audit cycle closed! Dynamic cascades successfully resolved.', 'success');
      loadAuditData();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to close audit cycle', 'error');
    }
  };

  const isManagerOrAdmin = user?.role === 'Admin' || user?.role === 'AssetManager';
  const pastCycles = auditCycles.filter((c) => c.status === 'Closed');

  return (
    <div className="space-y-6 pt-2 animate-fade-in">
      <div className="pb-2">
        <h2 className="font-display font-bold text-2xl text-gray-900 tracking-tight">Audit & Dynamic Verification</h2>
        <p className="text-sm text-gray-500">Launch verification cycles, cross-check assets physically, and close cycles to auto-retire missing items.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
          
          {/* LEFT AREA: ACTIVE SPREADSHEET CHECKLIST */}
          <div className="xl:col-span-3 space-y-6">
            {activeCycle ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-6 shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-gray-100">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
                      <ClipboardCheck className="w-5.5 h-5.5" />
                    </div>
                    <div>
                      <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full font-mono font-bold uppercase">Active Cycle</span>
                      <h3 className="font-display font-bold text-base text-gray-900 mt-1.5 leading-none">
                        Audit of Scope: <span className="capitalize">{activeCycle.scopeType}</span> &bull; "{activeCycle.scopeValue}"
                      </h3>
                      <p className="text-[10px] text-gray-500 mt-1 font-medium">Due milestone: {new Date(activeCycle.dateRangeEnd).toLocaleDateString()}</p>
                    </div>
                  </div>

                  {isManagerOrAdmin && (
                    <button
                      onClick={handleCloseAuditCycle}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm py-2 px-4 rounded-xl cursor-pointer shadow-xs flex items-center gap-1.5 transition-all"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Approve & Close Cycle</span>
                    </button>
                  )}
                </div>

                {/* Checklist Directory Table */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <ListFilter className="w-4.5 h-4.5 text-gray-500" />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Dynamic Asset checklist</span>
                  </div>

                  {checklist.length === 0 ? (
                    <div className="p-12 text-center text-gray-450 text-xs bg-gray-50 border border-dashed border-gray-200 rounded-xl">
                      No assets found matching the scope constraints of this audit cycle.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                            <th className="py-2.5 px-3">Asset Tag</th>
                            <th className="py-2.5 px-3">Resource Detail</th>
                            <th className="py-2.5 px-3">Verification Findings</th>
                            <th className="py-2.5 px-3">Verification Inspection Notes</th>
                            <th className="py-2.5 px-3 text-right">Commit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-xs sm:text-sm">
                          {checklist.map((item) => {
                            const local = localFindings[item.assetId] || { result: 'Verified', notes: '' };
                            return (
                              <tr key={item.assetId} className="hover:bg-gray-55/50 text-gray-700">
                                <td className="py-3.5 px-3 font-mono font-bold text-gray-900">{item.assetTag}</td>
                                <td className="py-3.5 px-3">
                                  <div className="font-bold text-gray-800">{item.name}</div>
                                  <div className="text-[10px] text-gray-400 font-mono mt-0.5">SN: {item.serialNumber} &bull; Loc: {item.location} &bull; Condition: {item.condition}</div>
                                </td>
                                <td className="py-3.5 px-3">
                                  {isManagerOrAdmin ? (
                                    <div className="flex gap-1">
                                      {(['Verified', 'Missing', 'Damaged'] as const).map((r) => (
                                        <button
                                          type="button"
                                          key={r}
                                          onClick={() => handleRecordFindingChange(item.assetId, 'result', r)}
                                          className={`px-2 py-1 text-[10px] font-bold rounded border cursor-pointer transition-all ${
                                            local.result === r
                                              ? r === 'Verified'
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-2xs'
                                                : r === 'Missing'
                                                ? 'bg-red-50 text-red-700 border-red-300 font-bold animate-pulse shadow-2xs'
                                                : 'bg-orange-50 text-orange-700 border-orange-300 shadow-2xs'
                                              : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                          }`}
                                        >
                                          {r}
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="font-bold font-mono text-xs">{local.result}</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-3">
                                  {isManagerOrAdmin ? (
                                    <input
                                      type="text"
                                      value={local.notes}
                                      onChange={(e) => handleRecordFindingChange(item.assetId, 'notes', e.target.value)}
                                      placeholder="Add physical condition comments..."
                                      className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-lg py-1 px-2 text-xs outline-none transition-all"
                                    />
                                  ) : (
                                    <span className="text-gray-500 italic font-medium">{local.notes || 'No notes logged'}</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-3 text-right">
                                  {isManagerOrAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => handleSaveSingleFinding(item.assetId)}
                                      className="text-xs bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 hover:text-blue-800 font-bold py-1.5 px-2.5 rounded-lg transition-colors cursor-pointer shadow-2xs"
                                    >
                                      Save Log
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Launch Audit Form Area */
              <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center max-w-xl mx-auto space-y-6 shadow-sm">
                <div className="space-y-2">
                  <ClipboardCheck className="w-12 h-12 text-blue-600 mx-auto" />
                  <h3 className="font-display font-bold text-xl text-gray-900">Schedule Verification Cycle</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    Verify physical resources dynamically. Launches cover specific boundary scopes and enforce rules checksheets.
                  </p>
                </div>

                {isManagerOrAdmin ? (
                  <form onSubmit={handleLaunchCycle} className="space-y-4 max-w-md mx-auto text-left">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Boundary Filter Scope</label>
                        <select
                          value={scopeType}
                          onChange={(e: any) => setScopeType(e.target.value)}
                          className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-3.5 text-xs outline-none transition-all"
                        >
                          <option value="location">Location Room</option>
                          <option value="department">Primary Department</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Boundary Filter Match</label>
                        <input
                          type="text"
                          required
                          value={scopeValue}
                          onChange={(e) => setScopeValue(e.target.value)}
                          placeholder="e.g. Headquarters"
                          className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-3.5 text-xs outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Audit Start Date</label>
                        <input
                          type="date"
                          required
                          value={dateStart}
                          onChange={(e) => setDateStart(e.target.value)}
                          className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-3 text-xs outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Audit End Deadline</label>
                        <input
                          type="date"
                          required
                          value={dateEnd}
                          onChange={(e) => setDateEnd(e.target.value)}
                          className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-3 text-xs outline-none transition-all"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3.5 px-4 text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                    >
                      <Play className="w-4 h-4" />
                      <span>Start Live Audit Cycle</span>
                    </button>
                  </form>
                ) : (
                  <div className="bg-gray-50 text-gray-500 text-xs py-3.5 px-4 rounded-xl border border-gray-200 inline-block font-bold">
                    Awaiting systems Administrator to schedule the next physical audit loop.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT AREA: HISTORICAL LOGS */}
          <div className="xl:col-span-1 bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-sm">
            <h3 className="font-display font-bold text-base text-gray-900 flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" />
              <span>Audit Log Archives</span>
            </h3>
            <p className="text-xs text-gray-500 font-medium">Reconciled audit cycle records closed in the organizational trace database.</p>

            {pastCycles.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs border border-dashed border-gray-200 rounded-xl">No historical records logged.</div>
            ) : (
              <div className="space-y-3.5">
                {pastCycles.map((cycle) => (
                  <div key={cycle.id} className="border border-gray-200 bg-gray-50/40 rounded-xl p-4 space-y-2 hover:border-gray-300 transition-all">
                    <div className="flex justify-between items-start">
                      <h4 className="font-display font-bold text-gray-900 text-xs leading-tight">Scope: {cycle.scopeValue}</h4>
                      <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold uppercase">Closed</span>
                    </div>
                    <span className="text-[9px] text-gray-500 font-mono block">Boundary type: {cycle.scopeType}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
};
