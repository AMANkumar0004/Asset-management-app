import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { Booking, Asset } from '../types.js';
import { 
  CalendarClock, 
  CalendarPlus, 
  AlertTriangle, 
  Info, 
  CalendarCheck2, 
  MapPin, 
  Users, 
  Clock
} from 'lucide-react';
import { Modal } from '../components/Modal.jsx';

export const BookingScreen: React.FC = () => {
  const { user, triggerToast } = useApp();
  const [loading, setLoading] = useState(true);

  // States
  const [resources, setResources] = useState<Asset[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  
  // Selected resource for booking calendar view
  const [selectedResourceId, setSelectedResourceId] = useState<string>('');

  // Booking Modal
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [bookStart, setBookStart] = useState('');
  const [bookEnd, setBookEnd] = useState('');

  // Overlap Pre-Check
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);

  const loadBookingData = async () => {
    try {
      setLoading(true);
      const [assetsData, bookingsData] = await Promise.all([
        api.getAssets({ limit: '100', isBookable: 'true' }),
        api.getBookings()
      ]);
      setResources(assetsData.assets);
      setBookings(bookingsData);
      
      if (assetsData.assets.length > 0 && !selectedResourceId) {
        setSelectedResourceId(assetsData.assets[0].id);
      }
    } catch (err: any) {
      triggerToast(err.message || 'Failed to fetch bookings list', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookingData();
  }, []);

  useEffect(() => {
    const handleWsMessage = (e: Event) => {
      const customEvent = e as CustomEvent;
      const message = customEvent.detail;
      if (message.type === 'invalidate_bookings') {
        console.log('WS Trigger: Refreshing Bookings...');
        loadBookingData();
      }
    };

    window.addEventListener('assetflow:ws_message', handleWsMessage);
    return () => {
      window.removeEventListener('assetflow:ws_message', handleWsMessage);
    };
  }, []);

  // Monitor start/end inputs for real-time overlap feedback on client!
  useEffect(() => {
    if (!selectedResourceId || !bookStart || !bookEnd) {
      setOverlapWarning(null);
      return;
    }

    const start = new Date(bookStart).getTime();
    const end = new Date(bookEnd).getTime();

    if (start >= end) {
      setOverlapWarning('Start time must be strictly before end time.');
      return;
    }

    // Check overlaps
    const filteredBookings = bookings.filter((b) => b.resourceId === selectedResourceId && b.status !== 'Cancelled');
    let hasOverlap = false;
    let overlappingUser = '';

    for (const b of filteredBookings) {
      const bStart = new Date(b.startTime).getTime();
      const bEnd = new Date(b.endTime).getTime();

      // STRICT range overlap S1 < E2 and S2 < E1
      if (start < bEnd && bStart < end) {
        hasOverlap = true;
        overlappingUser = b.bookerName || 'another employee';
        break;
      }
    }

    if (hasOverlap) {
      setOverlapWarning(`Booking Conflict! Times overlap with an active booking by ${overlappingUser} during this window.`);
    } else {
      setOverlapWarning(null);
    }

  }, [bookStart, bookEnd, selectedResourceId, bookings]);

  const handleOpenBookModal = () => {
    // Default start is tomorrow at 10:00, end tomorrow at 11:30
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');

    setBookStart(`${yyyy}-${mm}-${dd}T10:00`);
    setBookEnd(`${yyyy}-${mm}-${dd}T11:30`);
    setOverlapWarning(null);
    setBookModalOpen(true);
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResourceId || !bookStart || !bookEnd) return;

    if (overlapWarning) {
      triggerToast('Cannot reserve resource: Resolving timing overlap conflicts is required.', 'error');
      return;
    }

    try {
      await api.createBooking({
        resourceId: selectedResourceId,
        startTime: bookStart,
        endTime: bookEnd
      });
      triggerToast('Booking confirmed! Calendar space reserved.', 'success');
      setBookModalOpen(false);
      loadBookingData();
    } catch (err: any) {
      triggerToast(err.message || 'Error executing booking reservation', 'error');
    }
  };

  const handleCancelBooking = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    try {
      await api.cancelBooking(id);
      triggerToast('Booking cancelled.', 'success');
      loadBookingData();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to cancel booking', 'error');
    }
  };

  const selectedResource = resources.find((r) => r.id === selectedResourceId);
  const resourceBookings = bookings
    .filter((b) => b.resourceId === selectedResourceId)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  return (
    <div className="space-y-6 pt-2 animate-fade-in">
      
      {/* Title block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-gray-900 tracking-tight">Shared Resource Reservation</h2>
          <p className="text-sm text-gray-500">Reserve organization conference spaces or bookable lab equipment with transactional overlap protection.</p>
        </div>
        {selectedResourceId && (
          <button
            onClick={handleOpenBookModal}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm py-2.5 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shadow-xs"
          >
            <CalendarPlus className="w-4 h-4" />
            <span>Book Selected Space</span>
          </button>
        )}
      </div>

      {loading && resources.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      ) : resources.length === 0 ? (
        <div className="bg-white border border-gray-200 p-16 rounded-2xl text-center text-gray-400 text-sm shadow-sm">
          No bookable resources registered in system database.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* COLUMN 1: SELECTOR LIST */}
          <div className="lg:col-span-1 bg-white border border-gray-200 rounded-2xl p-4 space-y-3.5 shadow-sm">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Bookable Resources Inventory</span>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {resources.map((res) => (
                <button
                  key={res.id}
                  onClick={() => setSelectedResourceId(res.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    selectedResourceId === res.id
                      ? 'bg-blue-50/70 text-blue-900 border-blue-400 font-bold shadow-sm'
                      : 'bg-gray-50/50 text-gray-750 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="font-display font-bold text-gray-900 text-sm leading-tight">{res.name}</span>
                  <span className="font-mono text-[10px] text-blue-600 font-bold mt-1.5">{res.assetTag}</span>
                  
                  <div className="flex justify-between items-center mt-2.5 pt-2.5 border-t border-gray-100 text-[10px] text-gray-500">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-gray-450" />{res.location}</span>
                    {res.customFieldValues.seatingCapacity && (
                      <span className="flex items-center gap-1"><Users className="w-3 h-3 text-gray-450" />Cap: {res.customFieldValues.seatingCapacity}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* COLUMNS 2-4: RESERVATION CALENDAR VIEW */}
          <div className="lg:col-span-3 bg-white border border-gray-200 rounded-2xl p-6 space-y-6 shadow-sm">
            {selectedResource && (
              <>
                {/* Space Detail Panel */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-gray-100">
                  <div>
                    <h3 className="font-display font-bold text-xl text-gray-900 tracking-tight">{selectedResource.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">Tag ID: <strong className="text-blue-600 font-mono font-bold bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">{selectedResource.assetTag}</strong> &bull; Location: <strong>{selectedResource.location}</strong></p>
                  </div>
                  {selectedResource.customFieldValues.videoHardware && (
                    <span className="bg-gray-50 text-gray-600 border border-gray-150 text-xs px-2.5 py-1 rounded-lg font-bold">
                      HW: {selectedResource.customFieldValues.videoHardware}
                    </span>
                  )}
                </div>

                {/* Booking Lists */}
                <div>
                  <h4 className="font-display font-bold text-sm text-gray-800 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <CalendarCheck2 className="w-4.5 h-4.5 text-blue-600" />
                    <span>Reservation Bookings Registry</span>
                  </h4>

                  {resourceBookings.length === 0 ? (
                    <div className="p-16 text-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                      No active bookings registered for this space. Feel free to reserve a slot.
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {resourceBookings.map((book) => {
                        const isOwner = book.bookedBy === user?.id;
                        const isManager = user?.role === 'Admin' || user?.role === 'AssetManager';
                        const canCancel = (isOwner || isManager) && book.status !== 'Cancelled' && book.status !== 'Completed';
                        
                        return (
                          <div 
                            key={book.id} 
                            className={`flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 rounded-xl border transition-all ${
                              book.status === 'Cancelled' 
                                ? 'bg-gray-50 text-gray-400 border-gray-200' 
                                : book.status === 'Ongoing' 
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-bold shadow-xs' 
                                : 'bg-white border-gray-200 hover:border-gray-300 text-gray-700'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-900 text-sm">{book.bookerName}</span>
                                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                                  book.status === 'Cancelled' ? 'bg-gray-100 text-gray-400 border-gray-200' : book.status === 'Ongoing' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                                }`}>
                                  {book.status}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-3 text-xs text-gray-500 font-mono pt-1">
                                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-gray-400" />{new Date(book.startTime).toLocaleDateString()}</span>
                                <span>{new Date(book.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} &rarr; {new Date(book.endTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                              </div>
                            </div>

                            {canCancel && (
                              <button
                                onClick={() => handleCancelBooking(book.id)}
                                className="mt-3.5 sm:mt-0 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors cursor-pointer self-stretch sm:self-auto text-center shadow-2xs"
                              >
                                Cancel Booking
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

        </div>
      )}

      {/* BOOKING RESERVATION MODAL */}
      <Modal
        isOpen={bookModalOpen}
        onClose={() => setBookModalOpen(false)}
        title={`Book Resource: ${selectedResource?.name}`}
      >
        <form onSubmit={handleCreateBooking} className="space-y-4">
          
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2 text-blue-800 text-xs leading-relaxed">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <span>
              The calendar scheduler performs real-time overlap validation constraints to prevent room double-bookings.
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Reservation Start Time
            </label>
            <input
              type="datetime-local"
              required
              value={bookStart}
              onChange={(e) => setBookStart(e.target.value)}
              className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Reservation End Time
            </label>
            <input
              type="datetime-local"
              required
              value={bookEnd}
              onChange={(e) => setBookEnd(e.target.value)}
              className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
            />
          </div>

          {/* REAL TIME OVERLAP ERROR REPORTING */}
          {overlapWarning && (
            <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl p-3.5 text-xs sm:text-sm font-bold flex gap-2 items-start">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <span>{overlapWarning}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!!overlapWarning}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3.5 px-4 text-sm mt-4 transition-all cursor-pointer disabled:opacity-40"
          >
            Confirm Reservation
          </button>
        </form>
      </Modal>

    </div>
  );
};
