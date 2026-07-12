export type Role = 'Employee' | 'DepartmentHead' | 'AssetManager' | 'Admin';

export type AssetCondition = 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Broken';

export type AssetStatus = 'Available' | 'Allocated' | 'Reserved' | 'UnderMaintenance' | 'Lost' | 'Retired' | 'Disposed';

export type AllocationStatus = 'Active' | 'Returned' | 'Overdue';

export type TransferRequestStatus = 'Requested' | 'Approved' | 'Rejected';

export type BookingStatus = 'Upcoming' | 'Ongoing' | 'Completed' | 'Cancelled';

export type MaintenanceStatus = 'Pending' | 'Approved' | 'Rejected' | 'TechnicianAssigned' | 'InProgress' | 'Resolved';

export type AuditCycleStatus = 'Draft' | 'Active' | 'Closed';

export type AuditResult = 'Verified' | 'Missing' | 'Damaged';

export interface Department {
  id: string;
  name: string;
  parentDepartmentId: string | null;
  headEmployeeId: string | null;
  status: 'active' | 'inactive';
}

export interface AssetCategory {
  id: string;
  name: string;
  customFields: Record<string, string>; // e.g., { warrantyPeriod: "string", powerRating: "string" }
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  passwordHash?: string; // Opted-out in API responses for security
  departmentId: string | null;
  role: Role;
  status: 'active' | 'inactive';
}

export interface Asset {
  id: string;
  assetTag: string; // Sequential, e.g. AF-0001
  name: string;
  categoryId: string;
  serialNumber: string;
  acquisitionDate: string;
  acquisitionCost: number;
  condition: AssetCondition;
  location: string;
  photoUrls: string[];
  isBookable: boolean;
  status: AssetStatus;
  customFieldValues: Record<string, any>;
}

export interface AssetStateTransitionLog {
  id: string;
  assetId: string;
  fromStatus: AssetStatus;
  toStatus: AssetStatus;
  changedBy: string; // EmployeeId
  changedAt: string;
  reason: string;
}

export interface Allocation {
  id: string;
  assetId: string;
  employeeId: string | null;
  departmentId: string | null;
  allocatedBy: string; // EmployeeId
  allocatedAt: string;
  expectedReturnDate: string;
  actualReturnDate: string | null;
  conditionCheckinNotes: string | null;
  status: AllocationStatus;
}

export interface TransferRequest {
  id: string;
  allocationId: string;
  requestedBy: string; // EmployeeId
  currentHolderId: string; // EmployeeId
  requestedAt: string;
  status: TransferRequestStatus;
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface Booking {
  id: string;
  resourceId: string; // AssetId where isBookable = true
  bookedBy: string; // EmployeeId
  startTime: string; // ISO date string
  endTime: string; // ISO date string
  status: BookingStatus;
}

export interface MaintenanceRequest {
  id: string;
  assetId: string;
  raisedBy: string; // EmployeeId
  issueDescription: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  photoUrl: string | null;
  status: MaintenanceStatus;
  assignedTechnician: string | null;
  approvedBy: string | null;
  resolvedAt: string | null;
}

export interface AuditCycle {
  id: string;
  scopeType: 'department' | 'location' | 'organization';
  scopeValue: string; // departmentId or location name or 'organization'
  dateRangeStart: string;
  dateRangeEnd: string;
  status: AuditCycleStatus;
}

export interface AuditAssignment {
  id: string;
  auditCycleId: string;
  auditorId: string; // EmployeeId
}

export interface AuditFinding {
  id: string;
  auditCycleId: string;
  assetId: string;
  result: AuditResult;
  notes: string;
  recordedBy: string; // EmployeeId
  recordedAt: string;
}

export interface Notification {
  id: string;
  userId: string; // EmployeeId
  type: 'info' | 'warning' | 'alert';
  message: string;
  relatedEntityId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  actorId: string; // EmployeeId
  action: string; // e.g. "Create Department", "Register Asset"
  entityType: string; // e.g. "Asset", "Department", "Allocation"
  entityId: string;
  timestamp: string;
  metadata: Record<string, any>;
}
