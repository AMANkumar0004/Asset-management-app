import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import {
  Department,
  AssetCategory,
  Employee,
  Asset,
  AssetStateTransitionLog,
  Allocation,
  TransferRequest,
  Booking,
  MaintenanceRequest,
  AuditCycle,
  AuditAssignment,
  AuditFinding,
  Notification,
  ActivityLog,
  AssetStatus,
  AllocationStatus,
  TransferRequestStatus,
  BookingStatus,
  MaintenanceStatus,
  AuditCycleStatus,
  AssetCondition
} from '../src/types.js';

const DB_FILE = path.join(process.cwd(), 'data.json');

export interface DatabaseSchema {
  departments: Department[];
  categories: AssetCategory[];
  employees: Employee[];
  assets: Asset[];
  transitionLogs: AssetStateTransitionLog[];
  allocations: Allocation[];
  transfers: TransferRequest[];
  bookings: Booking[];
  maintenance: MaintenanceRequest[];
  audits: AuditCycle[];
  auditAssignments: AuditAssignment[];
  auditFindings: AuditFinding[];
  notifications: Notification[];
  activityLogs: ActivityLog[];
}

let dbCache: DatabaseSchema | null = null;
let fileWritePromise: Promise<void> = Promise.resolve();

// Lock mechanism for atomic concurrent writes
async function acquireWriteLock(fn: () => DatabaseSchema): Promise<DatabaseSchema> {
  const currentPromise = fileWritePromise;
  let resolveLock: () => void;
  const nextPromise = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  fileWritePromise = currentPromise.then(() => nextPromise);

  await currentPromise;
  try {
    const updatedDb = fn();
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(updatedDb, null, 2));
    fs.renameSync(tempFile, DB_FILE);
    dbCache = updatedDb;
    return updatedDb;
  } finally {
    resolveLock!();
  }
}

export function readDb(): DatabaseSchema {
  if (dbCache) return dbCache;

  if (!fs.existsSync(DB_FILE)) {
    const initial = seedDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    dbCache = initial;
    return initial;
  }

  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    dbCache = JSON.parse(data);
    return dbCache!;
  } catch (err) {
    console.error('Failed to read database, resetting to seed...', err);
    const initial = seedDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    dbCache = initial;
    return initial;
  }
}

export async function writeDb(updater: (db: DatabaseSchema) => void): Promise<DatabaseSchema> {
  return acquireWriteLock(() => {
    const db = readDb();
    updater(db);
    return db;
  });
}

// -------------------------------------------------------------
// SEEDING DATA DEFINITIONS
// -------------------------------------------------------------
function seedDatabase(): DatabaseSchema {
  console.log('Seeding initial database...');
  // Password is "password" for all seed users
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync('password', salt);

  const employees: Employee[] = [
    { id: 'emp-1', name: 'Alice Miller', email: 'admin@assetflow.com', passwordHash, departmentId: 'dept-1', role: 'Admin', status: 'active' },
    { id: 'emp-2', name: 'Bob Carter', email: 'manager@assetflow.com', passwordHash, departmentId: 'dept-2', role: 'AssetManager', status: 'active' },
    { id: 'emp-3', name: 'Charlie Davis', email: 'charlie@assetflow.com', passwordHash, departmentId: 'dept-3', role: 'DepartmentHead', status: 'active' },
    { id: 'emp-4', name: 'Diane Evans', email: 'diane@assetflow.com', passwordHash, departmentId: 'dept-4', role: 'Employee', status: 'active' },
    { id: 'emp-5', name: 'Edward Foster', email: 'edward@assetflow.com', passwordHash, departmentId: 'dept-3', role: 'Employee', status: 'active' },
    { id: 'emp-6', name: 'Fiona Garcia', email: 'fiona@assetflow.com', passwordHash, departmentId: 'dept-1', role: 'Employee', status: 'active' },
  ];

  const departments: Department[] = [
    { id: 'dept-1', name: 'Administration & Finance', parentDepartmentId: null, headEmployeeId: 'emp-1', status: 'active' },
    { id: 'dept-2', name: 'IT Infrastructure & Ops', parentDepartmentId: 'dept-1', headEmployeeId: 'emp-2', status: 'active' },
    { id: 'dept-3', name: 'Research & Development', parentDepartmentId: 'dept-1', headEmployeeId: 'emp-3', status: 'active' },
    { id: 'dept-4', name: 'Customer Success', parentDepartmentId: 'dept-1', headEmployeeId: 'emp-4', status: 'active' },
  ];

  const categories: AssetCategory[] = [
    { id: 'cat-1', name: 'Laptops & Workstations', customFields: { warrantyPeriodMonths: 'number', ramGb: 'number', storageGb: 'number' } },
    { id: 'cat-2', name: 'Smartphones & Tablets', customFields: { operatingSystem: 'string', cellularEnabled: 'boolean' } },
    { id: 'cat-3', name: 'Office Furniture', customFields: { material: 'string', ergonomicCertified: 'boolean' } },
    { id: 'cat-4', name: 'Conference Rooms', customFields: { seatingCapacity: 'number', videoHardware: 'string' } },
    { id: 'cat-5', name: 'Lab Equipment', customFields: { calibrationIntervalMonths: 'number', operatingVoltage: 'string' } },
  ];

  // Helper to generate sequential asset tag
  const makeTag = (num: number) => `AF-${num.toString().padStart(4, '0')}`;

  const assets: Asset[] = [];
  
  // IT Assets
  for (let i = 1; i <= 15; i++) {
    const tagNum = i;
    let status: AssetStatus = 'Available';
    let isBookable = false;
    let condition: AssetCondition = 'Excellent';
    
    if (i === 1) status = 'Allocated';
    if (i === 2) status = 'Allocated';
    if (i === 3) status = 'Reserved';
    if (i === 4) status = 'UnderMaintenance';
    if (i === 5) status = 'Lost';
    if (i === 6) status = 'Retired';
    if (i === 11) status = 'Allocated'; // Will use as Overdue
    
    if (i % 3 === 0) condition = 'Good';
    if (i % 7 === 0) condition = 'Fair';

    assets.push({
      id: `asset-${tagNum}`,
      assetTag: makeTag(tagNum),
      name: `MacBook Pro 16" (M3 Max, No. ${i})`,
      categoryId: 'cat-1',
      serialNumber: `SN-MBP-9832${i}`,
      acquisitionDate: '2025-01-15',
      acquisitionCost: 2499,
      condition,
      location: i <= 8 ? 'HQ - Room 402' : 'R&D Labs - Floor 2',
      photoUrls: [],
      isBookable,
      status,
      customFieldValues: { warrantyPeriodMonths: 36, ramGb: 32, storageGb: 1000 },
    });
  }

  // Smartphones
  for (let i = 16; i <= 25; i++) {
    const tagNum = i;
    let status: AssetStatus = 'Available';
    if (i === 16) status = 'Allocated';
    if (i === 17) status = 'Reserved';

    assets.push({
      id: `asset-${tagNum}`,
      assetTag: makeTag(tagNum),
      name: `iPhone 15 Pro Max - ${i - 15}G`,
      categoryId: 'cat-2',
      serialNumber: `SN-IPH-0219${i}`,
      acquisitionDate: '2025-05-10',
      acquisitionCost: 1199,
      condition: 'Excellent',
      location: 'IT Storage Cabinet B',
      photoUrls: [],
      isBookable: false,
      status,
      customFieldValues: { operatingSystem: 'iOS', cellularEnabled: true },
    });
  }

  // Furniture
  for (let i = 26; i <= 32; i++) {
    const tagNum = i;
    let status: AssetStatus = 'Available';
    if (i === 26) status = 'Allocated';

    assets.push({
      id: `asset-${tagNum}`,
      assetTag: makeTag(tagNum),
      name: `Ergonomic Task Chair Model Z-${i - 25}`,
      categoryId: 'cat-3',
      serialNumber: `SN-FUR-776${i}`,
      acquisitionDate: '2024-08-20',
      acquisitionCost: 450,
      condition: 'Good',
      location: 'Main Workspace - Row C',
      photoUrls: [],
      isBookable: false,
      status,
      customFieldValues: { material: 'Mesh & Steel', ergonomicCertified: true },
    });
  }

  // Bookable Conference Rooms / AV Shared resources
  for (let i = 33; i <= 37; i++) {
    const tagNum = i;
    assets.push({
      id: `asset-${tagNum}`,
      assetTag: makeTag(tagNum),
      name: `Conference Room ${100 + i}`,
      categoryId: 'cat-4',
      serialNumber: `N/A - ROOM-${100 + i}`,
      acquisitionDate: '2023-01-01',
      acquisitionCost: 0,
      condition: 'Excellent',
      location: `Floor ${i - 32}`,
      photoUrls: [],
      isBookable: true,
      status: 'Available',
      customFieldValues: { seatingCapacity: i === 33 ? 6 : 14, videoHardware: 'Cisco Webex Bar' },
    });
  }

  // Lab Equipment
  for (let i = 38; i <= 40; i++) {
    const tagNum = i;
    assets.push({
      id: `asset-${tagNum}`,
      assetTag: makeTag(tagNum),
      name: `Keysight Digital Oscilloscope 100MHz (Model ${i})`,
      categoryId: 'cat-5',
      serialNumber: `SN-KEY-441${i}`,
      acquisitionDate: '2024-11-12',
      acquisitionCost: 1850,
      condition: 'Excellent',
      location: 'R&D Labs - Workbench A',
      photoUrls: [],
      isBookable: true,
      status: 'Available',
      customFieldValues: { calibrationIntervalMonths: 12, operatingVoltage: '110V' },
    });
  }

  // Transition logs
  const transitionLogs: AssetStateTransitionLog[] = [
    { id: 'log-1', assetId: 'asset-1', fromStatus: 'Available', toStatus: 'Allocated', changedBy: 'emp-2', changedAt: '2025-06-01T10:00:00Z', reason: 'Initial department onboarding' },
    { id: 'log-2', assetId: 'asset-2', fromStatus: 'Available', toStatus: 'Allocated', changedBy: 'emp-2', changedAt: '2025-06-05T14:30:00Z', reason: 'Staff upgrade request' },
    { id: 'log-3', assetId: 'asset-4', fromStatus: 'Available', toStatus: 'UnderMaintenance', changedBy: 'emp-2', changedAt: '2025-06-10T09:00:00Z', reason: 'Screen flicker diagnostics approved' },
  ];

  // Allocations
  const allocations: Allocation[] = [
    {
      id: 'alloc-1',
      assetId: 'asset-1',
      employeeId: 'emp-3',
      departmentId: null,
      allocatedBy: 'emp-2',
      allocatedAt: '2025-06-01T10:00:00Z',
      expectedReturnDate: '2026-06-01T10:00:00Z',
      actualReturnDate: null,
      conditionCheckinNotes: null,
      status: 'Active',
    },
    {
      id: 'alloc-2',
      assetId: 'asset-2',
      employeeId: 'emp-4',
      departmentId: null,
      allocatedBy: 'emp-2',
      allocatedAt: '2025-06-05T14:30:00Z',
      expectedReturnDate: '2025-12-05T14:30:00Z',
      actualReturnDate: null,
      conditionCheckinNotes: null,
      status: 'Active',
    },
    // Overdue Allocation
    {
      id: 'alloc-overdue',
      assetId: 'asset-11',
      employeeId: 'emp-5',
      departmentId: null,
      allocatedBy: 'emp-2',
      allocatedAt: '2025-11-01T08:00:00Z',
      expectedReturnDate: '2026-01-01T17:00:00Z', // Past current local time 2026-07-11
      actualReturnDate: null,
      conditionCheckinNotes: null,
      status: 'Overdue',
    },
    // Returned Allocation
    {
      id: 'alloc-returned',
      assetId: 'asset-7',
      employeeId: 'emp-6',
      departmentId: null,
      allocatedBy: 'emp-2',
      allocatedAt: '2025-02-01T09:00:00Z',
      expectedReturnDate: '2025-04-01T09:00:00Z',
      actualReturnDate: '2025-03-28T15:00:00Z',
      conditionCheckinNotes: 'Slight cosmetic scuffing on base, overall good condition.',
      status: 'Returned',
    },
  ];

  // Active Transfer Request
  const transfers: TransferRequest[] = [
    {
      id: 'trans-1',
      allocationId: 'alloc-2', // asset-2 currently held by emp-4 (Customer Success)
      requestedBy: 'emp-5', // emp-5 (R&D) wants it
      currentHolderId: 'emp-4',
      requestedAt: '2026-07-10T12:00:00Z',
      status: 'Requested',
      approvedBy: null,
      approvedAt: null,
    },
  ];

  // Bookings - let's seed some for Room 101/102 (asset-33, asset-34)
  const bookings: Booking[] = [
    {
      id: 'book-1',
      resourceId: 'asset-33', // Conf Room 133
      bookedBy: 'emp-4',
      startTime: '2026-07-12T10:00:00', // Tomorrow relative to 2026-07-11
      endTime: '2026-07-12T11:30:00',
      status: 'Upcoming',
    },
    {
      id: 'book-2',
      resourceId: 'asset-33',
      bookedBy: 'emp-5',
      startTime: '2026-07-12T13:00:00',
      endTime: '2026-07-12T14:00:00',
      status: 'Upcoming',
    },
    {
      id: 'book-3',
      resourceId: 'asset-34', // Conf Room 134
      bookedBy: 'emp-3',
      startTime: '2026-07-11T22:00:00', // Started an hour ago
      endTime: '2026-07-11T23:59:00',
      status: 'Ongoing',
    }
  ];

  // Maintenance Requests
  const maintenance: MaintenanceRequest[] = [
    {
      id: 'maint-1',
      assetId: 'asset-4', // Laptop 4 is in UnderMaintenance
      raisedBy: 'emp-4',
      issueDescription: 'Screen keeps flickering and goes black after 5 minutes of usage.',
      priority: 'High',
      photoUrl: null,
      status: 'InProgress',
      assignedTechnician: 'TechSupport - Liam',
      approvedBy: 'emp-2',
      resolvedAt: null,
    },
    {
      id: 'maint-2',
      assetId: 'asset-8', // Available
      raisedBy: 'emp-5',
      issueDescription: 'Battery drops from 100% to 20% in an hour. Needs calibration or replacement.',
      priority: 'Medium',
      photoUrl: null,
      status: 'Pending',
      assignedTechnician: null,
      approvedBy: null,
      resolvedAt: null,
    },
  ];

  // Audit Cycles
  const audits: AuditCycle[] = [
    {
      id: 'audit-1',
      scopeType: 'department',
      scopeValue: 'dept-3', // Research & Development
      dateRangeStart: '2026-07-05',
      dateRangeEnd: '2026-07-15',
      status: 'Active',
    }
  ];

  const auditAssignments: AuditAssignment[] = [
    { id: 'assign-1', auditCycleId: 'audit-1', auditorId: 'emp-2' },
  ];

  const auditFindings: AuditFinding[] = [
    { id: 'find-1', auditCycleId: 'audit-1', assetId: 'asset-1', result: 'Verified', notes: 'In perfect working condition and on Alice\'s desk.', recordedBy: 'emp-2', recordedAt: '2026-07-08T11:00:00Z' },
    { id: 'find-2', auditCycleId: 'audit-1', assetId: 'asset-5', result: 'Missing', notes: 'Desk is empty, employee Charlie hasn\'t seen it in 2 weeks.', recordedBy: 'emp-2', recordedAt: '2026-07-08T11:15:00Z' },
  ];

  const notifications: Notification[] = [
    { id: 'not-1', userId: 'emp-2', type: 'warning', message: 'Asset AF-0011 (MacBook Pro) allocated to Edward Foster is OVERDUE for check-in.', relatedEntityId: 'alloc-overdue', isRead: false, createdAt: '2026-07-10T08:00:00Z' },
    { id: 'not-2', userId: 'emp-4', type: 'info', message: 'Edward Foster requested a transfer for asset AF-0002 held by you.', relatedEntityId: 'trans-1', isRead: false, createdAt: '2026-07-10T12:00:00Z' },
  ];

  const activityLogs: ActivityLog[] = [
    { id: 'act-1', actorId: 'emp-1', action: 'Initialize System', entityType: 'System', entityId: 'system', timestamp: '2025-01-01T00:00:00Z', metadata: {} },
    { id: 'act-2', actorId: 'emp-2', action: 'Register Asset', entityType: 'Asset', entityId: 'asset-1', timestamp: '2025-01-15T10:00:00Z', metadata: { assetTag: 'AF-0001' } },
    { id: 'act-3', actorId: 'emp-2', action: 'Allocate Asset', entityType: 'Allocation', entityId: 'alloc-1', timestamp: '2025-06-01T10:00:00Z', metadata: { assetId: 'asset-1', employeeId: 'emp-3' } },
  ];

  return {
    departments,
    categories,
    employees,
    assets,
    transitionLogs,
    allocations,
    transfers,
    bookings,
    maintenance,
    audits,
    auditAssignments,
    auditFindings,
    notifications,
    activityLogs,
  };
}

// -------------------------------------------------------------
// BUSINESS RULES ENGINE
// -------------------------------------------------------------

export const VALID_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  'Available': ['Allocated', 'Reserved', 'UnderMaintenance', 'Retired'],
  'Allocated': ['Available', 'UnderMaintenance', 'Lost'],
  'Reserved': ['Available', 'UnderMaintenance'],
  'UnderMaintenance': ['Available'],
  'Lost': ['Available'], // If found, can go back to available
  'Retired': ['Disposed'],
  'Disposed': [],
};

export function isValidTransition(from: AssetStatus, to: AssetStatus, isAuditClosure: boolean = false): boolean {
  if (from === to) return true;
  
  // Any non-Disposed state can go to Retired
  if (to === 'Retired') {
    return from !== 'Disposed';
  }
  
  // Retired can go to Disposed (terminal)
  if (to === 'Disposed') {
    return from === 'Retired';
  }
  
  // Available/Allocated -> Lost (only via audit closure)
  if (to === 'Lost') {
    return isAuditClosure && (from === 'Available' || from === 'Allocated');
  }

  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

// Check for Booking overlapping
export function checkBookingOverlap(db: DatabaseSchema, resourceId: string, startTime: string, endTime: string, excludeBookingId?: string): { overlaps: boolean; currentBooking?: Booking } {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  for (const b of db.bookings) {
    if (b.resourceId === resourceId && b.status !== 'Cancelled') {
      if (excludeBookingId && b.id === excludeBookingId) continue;
      
      const bStart = new Date(b.startTime).getTime();
      const bEnd = new Date(b.endTime).getTime();

      // STRICT range overlap (start1 < end2 AND start2 < end1)
      if (start < bEnd && bStart < end) {
        return { overlaps: true, currentBooking: b };
      }
    }
  }

  return { overlaps: false };
}

// Overdue scans & updates (run dynamically on reads or status check)
export function runOverdueScan(db: DatabaseSchema): boolean {
  const now = new Date();
  let modified = false;

  // 1. Scan allocations
  for (const alloc of db.allocations) {
    if (alloc.status === 'Active' && new Date(alloc.expectedReturnDate) < now) {
      alloc.status = 'Overdue';
      modified = true;

      // Check if a notification already exists
      const hasNotification = db.notifications.some(
        (n) => n.relatedEntityId === alloc.id && n.type === 'warning'
      );

      if (!hasNotification) {
        db.notifications.push({
          id: `not-auto-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          userId: alloc.allocatedBy, // Asset manager or assigner
          type: 'warning',
          message: `Asset allocation of ID ${alloc.id} is overdue. Expected return was ${new Date(alloc.expectedReturnDate).toLocaleDateString()}.`,
          relatedEntityId: alloc.id,
          isRead: false,
          createdAt: now.toISOString(),
        });
      }
    }
  }

  // 2. Scan bookings
  for (const booking of db.bookings) {
    if (booking.status === 'Upcoming' && new Date(booking.startTime) <= now && new Date(booking.endTime) > now) {
      booking.status = 'Ongoing';
      modified = true;
    } else if (booking.status === 'Ongoing' && new Date(booking.endTime) <= now) {
      booking.status = 'Completed';
      modified = true;
    }
  }

  return modified;
}
