import express from 'express';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer } from 'ws';
import {
  readDb,
  writeDb,
  isValidTransition,
  checkBookingOverlap,
  runOverdueScan,
  DatabaseSchema
} from './server/db.js';
import {
  Asset,
  Allocation,
  Booking,
  MaintenanceRequest,
  AuditFinding,
  AuditCycle,
  Employee,
  Department,
  AssetCategory,
  Notification,
  ActivityLog,
  AssetStatus,
  Role,
  AssetCondition,
  TransferRequest,
  TransferRequestStatus,
  MaintenanceStatus
} from './src/types.js';

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'assetflow_jwt_secret_key_987123';

app.use(express.json());

// -------------------------------------------------------------
// WEBSOCKET REAL-TIME ARCHITECTURE
// -------------------------------------------------------------
interface AuthenticatedSocket {
  ws: any;
  userId: string;
  role: string;
  departmentId: string | null;
}

const activeSockets = new Set<AuthenticatedSocket>();

function broadcastWsEvent(event: { type: string; [key: string]: any }, roleFilter?: string[], userIdFilter?: string[]) {
  activeSockets.forEach((client) => {
    if (client.ws.readyState !== 1 /* WebSocket.OPEN */) {
      activeSockets.delete(client);
      return;
    }
    if (roleFilter && !roleFilter.includes(client.role)) {
      return;
    }
    if (userIdFilter && !userIdFilter.includes(client.userId)) {
      return;
    }
    try {
      client.ws.send(JSON.stringify(event));
    } catch (e) {
      console.error('Failed to send WS message', e);
    }
  });
}

function onDatabaseMutation(options: { dashboard?: boolean; assets?: boolean; allocations?: boolean; bookings?: boolean; maintenance?: boolean; audits?: boolean }) {
  if (options.dashboard) {
    broadcastWsEvent({ type: 'invalidate_dashboard' });
  }
  if (options.assets) {
    broadcastWsEvent({ type: 'invalidate_assets' });
  }
  if (options.allocations) {
    broadcastWsEvent({ type: 'invalidate_allocations' });
  }
  if (options.bookings) {
    broadcastWsEvent({ type: 'invalidate_bookings' });
  }
  if (options.maintenance) {
    broadcastWsEvent({ type: 'invalidate_maintenance' });
  }
  if (options.audits) {
    broadcastWsEvent({ type: 'invalidate_audits' });
  }
}

// -------------------------------------------------------------
// HELPER MIDDLEWARES
// -------------------------------------------------------------
function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Session expired or invalid token' });
    }
    req.user = decoded;
    next();
  });
}

function requireRole(roles: Role[]) {
  return (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }
    if (!roles.includes(req.user.role as Role)) {
      return res.status(403).json({
        error: `Access Denied: Requires one of these roles: ${roles.join(', ')}`
      });
    }
    next();
  };
}

// Log actions helper
function logActivity(
  db: DatabaseSchema,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: any = {}
) {
  const log = {
    id: `act-${Date.now()}-${Math.floor(Math.random() * 1005)}`,
    actorId,
    action,
    entityType,
    entityId,
    timestamp: new Date().toISOString(),
    metadata
  };
  db.activityLogs.push(log);
  
  // Real-time log invalidation for admins/managers
  broadcastWsEvent({ type: 'invalidate_logs' }, ['Admin', 'AssetManager']);
  return log;
}

// Notify helper
function notifyUser(
  db: DatabaseSchema,
  userId: string,
  type: 'info' | 'warning' | 'alert',
  message: string,
  relatedEntityId: string | null = null
) {
  const n = {
    id: `not-${Date.now()}-${Math.floor(Math.random() * 1005)}`,
    userId,
    type,
    message,
    relatedEntityId,
    isRead: false,
    createdAt: new Date().toISOString()
  };
  db.notifications.push(n);

  // Real-time notification invalidation for this specific user
  broadcastWsEvent({ type: 'invalidate_notifications', userId }, undefined, [userId]);
  return n;
}

// -------------------------------------------------------------
// AUTH ENDPOINTS
// -------------------------------------------------------------
app.post('/api/auth/signup', async (req: any, res: any) => {
  const { name, email, password, departmentId } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  const db = readDb();
  const exists = db.employees.some((e) => e.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: 'An account with this email already exists' });
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const newEmployee: Employee = {
    id: `emp-${Date.now()}`,
    name,
    email: email.toLowerCase(),
    passwordHash,
    departmentId: departmentId || null,
    role: 'Employee', // STRICT constraint: always Employee on signup
    status: 'active'
  };

  await writeDb((database) => {
    database.employees.push(newEmployee);
    logActivity(database, newEmployee.id, 'Employee Signup', 'Employee', newEmployee.id, { email: newEmployee.email });
    notifyUser(database, newEmployee.id, 'info', 'Welcome to AssetFlow! Your account has been registered successfully.');
  });

  const { passwordHash: _, ...userWithoutPassword } = newEmployee;
  const token = jwt.sign(userWithoutPassword, JWT_SECRET, { expiresIn: '24h' });

  res.status(201).json({ user: userWithoutPassword, token });
});

app.post('/api/auth/login', async (req: any, res: any) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const db = readDb();
  const employee = db.employees.find((e) => e.email.toLowerCase() === email.toLowerCase());

  if (!employee || employee.status === 'inactive') {
    return res.status(401).json({ error: 'Invalid email or inactive account' });
  }

  const valid = await bcrypt.compare(password, employee.passwordHash || '');
  if (!valid) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const { passwordHash: _, ...userWithoutPassword } = employee;
  const token = jwt.sign(userWithoutPassword, JWT_SECRET, { expiresIn: '24h' });

  res.json({ user: userWithoutPassword, token });
});

app.get('/api/auth/me', authenticateToken, (req: any, res: any) => {
  const db = readDb();
  const employee = db.employees.find((e) => e.id === req.user.id);
  if (!employee) {
    return res.status(404).json({ error: 'User not found' });
  }
  const { passwordHash: _, ...userWithoutPassword } = employee;
  res.json({ user: userWithoutPassword });
});

// -------------------------------------------------------------
// DASHBOARD & ANALYTICS
// -------------------------------------------------------------
app.get('/api/dashboard/kpis', authenticateToken, async (req: any, res: any) => {
  // Overdue status check trigger
  let db = readDb();
  const wasOverdueUpdated = runOverdueScan(db);
  if (wasOverdueUpdated) {
    await writeDb(() => {}); // Trigger cache file write
    db = readDb();
  }

  const role = req.user.role as Role;
  const deptId = req.user.departmentId;
  const userId = req.user.id;

  let filteredAssets = db.assets;
  let filteredAllocations = db.allocations;
  let filteredBookings = db.bookings;
  let filteredMaintenance = db.maintenance;
  let filteredTransfers = db.transfers;

  // If Employee, restrict what they see to personal
  const isManagerOrAdmin = role === 'Admin' || role === 'AssetManager';
  const isDeptHead = role === 'DepartmentHead';

  if (!isManagerOrAdmin) {
    if (isDeptHead && deptId) {
      // Dept head can see items in their department
      // Let's find employees in department
      const deptEmpIds = db.employees.filter((e) => e.departmentId === deptId).map((e) => e.id);
      filteredAllocations = db.allocations.filter((a) => a.employeeId && deptEmpIds.includes(a.employeeId));
      filteredBookings = db.bookings.filter((b) => b.bookedBy && deptEmpIds.includes(b.bookedBy));
      filteredMaintenance = db.maintenance.filter((m) => m.raisedBy && deptEmpIds.includes(m.raisedBy));
    } else {
      // General Employee sees only own
      filteredAllocations = db.allocations.filter((a) => a.employeeId === userId);
      filteredBookings = db.bookings.filter((b) => b.bookedBy === userId);
      filteredMaintenance = db.maintenance.filter((m) => m.raisedBy === userId);
    }
  }

  const totalAssets = filteredAssets.length;
  const availableCount = filteredAssets.filter((a) => a.status === 'Available').length;
  const allocatedCount = filteredAssets.filter((a) => a.status === 'Allocated').length;
  const reservedCount = filteredAssets.filter((a) => a.status === 'Reserved').length;
  const maintenanceCount = filteredAssets.filter((a) => a.status === 'UnderMaintenance').length;
  const lostCount = filteredAssets.filter((a) => a.status === 'Lost').length;

  const activeAllocationsCount = filteredAllocations.filter((a) => a.status === 'Active').length;
  const overdueAllocationsCount = filteredAllocations.filter((a) => a.status === 'Overdue').length;

  const activeBookingsCount = filteredBookings.filter((b) => b.status === 'Ongoing' || b.status === 'Upcoming').length;
  const pendingTransfersCount = filteredTransfers.filter((t) => t.status === 'Requested').length;

  const urgentMaintenanceCount = filteredMaintenance.filter(
    (m) => (m.status === 'Pending' || m.status === 'InProgress' || m.status === 'TechnicianAssigned') && (m.priority === 'High' || m.priority === 'Critical')
  ).length;

  // Overdue detail listing
  const overdueList = filteredAllocations
    .filter((a) => a.status === 'Overdue')
    .map((a) => {
      const asset = db.assets.find((ast) => ast.id === a.assetId);
      const emp = db.employees.find((e) => e.id === a.employeeId);
      return {
        allocationId: a.id,
        assetTag: asset?.assetTag || 'Unknown',
        assetName: asset?.name || 'Unknown',
        holderName: emp?.name || 'Department Allocation',
        expectedReturnDate: a.expectedReturnDate,
        daysOverdue: Math.floor((Date.now() - new Date(a.expectedReturnDate).getTime()) / (1000 * 60 * 60 * 24))
      };
    });

  res.json({
    kpis: {
      totalAssets,
      available: availableCount,
      allocated: allocatedCount,
      reserved: reservedCount,
      maintenance: maintenanceCount,
      lost: lostCount,
      activeAllocations: activeAllocationsCount,
      overdueAllocations: overdueAllocationsCount,
      activeBookings: activeBookingsCount,
      pendingTransfers: pendingTransfersCount,
      urgentMaintenance: urgentMaintenanceCount
    },
    overdueList
  });
});

app.get('/api/analytics/trends', authenticateToken, (req: any, res: any) => {
  const db = readDb();

  // Category distribution
  const categoryData = db.categories.map((cat) => {
    const count = db.assets.filter((a) => a.categoryId === cat.id).length;
    const value = db.assets
      .filter((a) => a.categoryId === cat.id)
      .reduce((sum, a) => sum + (a.acquisitionCost || 0), 0);
    return { name: cat.name, count, value };
  });

  // Department Allocation summary
  const departmentData = db.departments.map((dept) => {
    // Find employee ids in this dept
    const empIds = db.employees.filter((e) => e.departmentId === dept.id).map((e) => e.id);
    const activeAllocCount = db.allocations.filter(
      (a) => (a.status === 'Active' || a.status === 'Overdue') && a.employeeId && empIds.includes(a.employeeId)
    ).length;

    return {
      name: dept.name,
      allocations: activeAllocCount
    };
  });

  // Condition summary
  const conditions = ['Excellent', 'Good', 'Fair', 'Poor', 'Broken'];
  const conditionData = conditions.map((cond) => {
    return {
      name: cond,
      count: db.assets.filter((a) => a.condition === cond).length
    };
  });

  // Status breakdown
  const statuses = ['Available', 'Allocated', 'Reserved', 'UnderMaintenance', 'Lost', 'Retired', 'Disposed'];
  const statusData = statuses.map((st) => {
    return {
      name: st,
      count: db.assets.filter((a) => a.status === st).length
    };
  });

  // Maintenance statistics by priority
  const priorities = ['Low', 'Medium', 'High', 'Critical'];
  const maintenancePriorityData = priorities.map((p) => {
    return {
      name: p,
      count: db.maintenance.filter((m) => m.priority === p).length
    };
  });

  // Upcoming Retirement & calibration
  const upcomingRetirements = db.assets
    .filter((a) => a.status !== 'Retired' && a.status !== 'Disposed')
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      assetTag: a.assetTag,
      name: a.name,
      acquisitionDate: a.acquisitionDate,
      cost: a.acquisitionCost,
      condition: a.condition
    }));

  res.json({
    categoryData,
    departmentData,
    conditionData,
    statusData,
    maintenancePriorityData,
    upcomingRetirements
  });
});

// -------------------------------------------------------------
// DEPARTMENT MANAGEMENT (Admin Only)
// -------------------------------------------------------------
app.get('/api/departments', authenticateToken, (req: any, res: any) => {
  const db = readDb();
  res.json(db.departments);
});

app.post('/api/departments', authenticateToken, requireRole(['Admin']), async (req: any, res: any) => {
  const { name, parentDepartmentId, headEmployeeId } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Department name is required' });
  }

  const newDept: Department = {
    id: `dept-${Date.now()}`,
    name,
    parentDepartmentId: parentDepartmentId || null,
    headEmployeeId: headEmployeeId || null,
    status: 'active'
  };

  await writeDb((db) => {
    db.departments.push(newDept);
    logActivity(db, req.user.id, 'Create Department', 'Department', newDept.id, { name: newDept.name });
  });

  res.status(201).json(newDept);
});

app.put('/api/departments/:id', authenticateToken, requireRole(['Admin']), async (req: any, res: any) => {
  const { id } = req.params;
  const { name, parentDepartmentId, headEmployeeId, status } = req.body;

  let updatedDept: Department | null = null;

  await writeDb((db) => {
    const deptIndex = db.departments.findIndex((d) => d.id === id);
    if (deptIndex !== -1) {
      db.departments[deptIndex] = {
        ...db.departments[deptIndex],
        name: name !== undefined ? name : db.departments[deptIndex].name,
        parentDepartmentId: parentDepartmentId !== undefined ? parentDepartmentId : db.departments[deptIndex].parentDepartmentId,
        headEmployeeId: headEmployeeId !== undefined ? headEmployeeId : db.departments[deptIndex].headEmployeeId,
        status: status !== undefined ? status : db.departments[deptIndex].status
      };
      updatedDept = db.departments[deptIndex];

      // If headEmployeeId changed, let's auto-promote that employee to DepartmentHead role if they are an Employee
      if (headEmployeeId) {
        const emp = db.employees.find((e) => e.id === headEmployeeId);
        if (emp && emp.role === 'Employee') {
          emp.role = 'DepartmentHead';
          notifyUser(db, emp.id, 'info', `You have been promoted to Department Head for ${updatedDept!.name}.`);
        }
      }

      logActivity(db, req.user.id, 'Update Department', 'Department', id, { name: updatedDept!.name });
    }
  });

  if (!updatedDept) {
    return res.status(404).json({ error: 'Department not found' });
  }

  res.json(updatedDept);
});

app.delete('/api/departments/:id', authenticateToken, requireRole(['Admin']), async (req: any, res: any) => {
  const { id } = req.params;
  let success = false;

  await writeDb((db) => {
    const hasChildren = db.departments.some((d) => d.parentDepartmentId === id);
    if (hasChildren) {
      return; // Can't delete parent
    }

    const index = db.departments.findIndex((d) => d.id === id);
    if (index !== -1) {
      const deptName = db.departments[index].name;
      db.departments.splice(index, 1);
      logActivity(db, req.user.id, 'Delete Department', 'Department', id, { name: deptName });
      success = true;
    }
  });

  if (!success) {
    return res.status(400).json({ error: 'Cannot delete department. Make sure it has no sub-departments.' });
  }

  res.json({ message: 'Department deleted successfully' });
});

// -------------------------------------------------------------
// ASSET CATEGORY MANAGEMENT
// -------------------------------------------------------------
app.get('/api/categories', authenticateToken, (req: any, res: any) => {
  const db = readDb();
  res.json(db.categories);
});

app.post('/api/categories', authenticateToken, requireRole(['Admin', 'AssetManager']), async (req: any, res: any) => {
  const { name, customFields } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  const newCat: AssetCategory = {
    id: `cat-${Date.now()}`,
    name,
    customFields: customFields || {}
  };

  await writeDb((db) => {
    db.categories.push(newCat);
    logActivity(db, req.user.id, 'Create Asset Category', 'AssetCategory', newCat.id, { name: newCat.name });
  });

  res.status(201).json(newCat);
});

app.put('/api/categories/:id', authenticateToken, requireRole(['Admin', 'AssetManager']), async (req: any, res: any) => {
  const { id } = req.params;
  const { name, customFields } = req.body;

  let updatedCat: AssetCategory | null = null;

  await writeDb((db) => {
    const idx = db.categories.findIndex((c) => c.id === id);
    if (idx !== -1) {
      db.categories[idx] = {
        ...db.categories[idx],
        name: name !== undefined ? name : db.categories[idx].name,
        customFields: customFields !== undefined ? customFields : db.categories[idx].customFields
      };
      updatedCat = db.categories[idx];
      logActivity(db, req.user.id, 'Update Asset Category', 'AssetCategory', id, { name: updatedCat!.name });
    }
  });

  if (!updatedCat) {
    return res.status(404).json({ error: 'Category not found' });
  }

  res.json(updatedCat);
});

// -------------------------------------------------------------
// EMPLOYEE DIRECTORY & PROMOTIONS
// -------------------------------------------------------------
app.get('/api/employees', authenticateToken, (req: any, res: any) => {
  const db = readDb();
  // Strip password hashes from response
  const sanitized = db.employees.map(({ passwordHash: _, ...rest }) => rest);
  res.json(sanitized);
});

app.put('/api/employees/:id/role', authenticateToken, requireRole(['Admin']), async (req: any, res: any) => {
  const { id } = req.params;
  const { role } = req.body;

  const validRoles: Role[] = ['Employee', 'DepartmentHead', 'AssetManager', 'Admin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  let updatedEmp: any = null;

  await writeDb((db) => {
    const idx = db.employees.findIndex((e) => e.id === id);
    if (idx !== -1) {
      const oldRole = db.employees[idx].role;
      db.employees[idx].role = role;
      const { passwordHash: _, ...sanitized } = db.employees[idx];
      updatedEmp = sanitized;

      logActivity(db, req.user.id, 'Promote Employee', 'Employee', id, { oldRole, newRole: role, name: updatedEmp.name });
      notifyUser(db, id, 'info', `Your user role has been changed from ${oldRole} to ${role} by Admin.`);
    }
  });

  if (!updatedEmp) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  res.json(updatedEmp);
});

app.put('/api/employees/:id/status', authenticateToken, requireRole(['Admin']), async (req: any, res: any) => {
  const { id } = req.params;
  const { status } = req.body;

  if (status !== 'active' && status !== 'inactive') {
    return res.status(400).json({ error: 'Invalid status' });
  }

  let updatedEmp: any = null;

  await writeDb((db) => {
    const idx = db.employees.findIndex((e) => e.id === id);
    if (idx !== -1) {
      db.employees[idx].status = status;
      const { passwordHash: _, ...sanitized } = db.employees[idx];
      updatedEmp = sanitized;

      logActivity(db, req.user.id, 'Update Employee Status', 'Employee', id, { status });
    }
  });

  if (!updatedEmp) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  res.json(updatedEmp);
});

// -------------------------------------------------------------
// ASSETS CRUD & DIRECTORY
// -------------------------------------------------------------
app.get('/api/assets', authenticateToken, (req: any, res: any) => {
  const db = readDb();
  let filtered = [...db.assets];

  // Filters
  const { search, categoryId, status, condition, location, isBookable, limit = '20', offset = '0' } = req.query;

  if (search) {
    const s = (search as string).toLowerCase();
    filtered = filtered.filter(
      (a) =>
        a.name.toLowerCase().includes(s) ||
        a.assetTag.toLowerCase().includes(s) ||
        a.serialNumber.toLowerCase().includes(s)
    );
  }

  if (categoryId) {
    filtered = filtered.filter((a) => a.categoryId === categoryId);
  }

  if (status) {
    filtered = filtered.filter((a) => a.status === status);
  }

  if (condition) {
    filtered = filtered.filter((a) => a.condition === condition);
  }

  if (location) {
    filtered = filtered.filter((a) => a.location.toLowerCase().includes((location as string).toLowerCase()));
  }

  if (isBookable !== undefined) {
    filtered = filtered.filter((a) => a.isBookable === (isBookable === 'true'));
  }

  const total = filtered.length;
  const l = parseInt(limit as string, 10);
  const o = parseInt(offset as string, 10);

  // Paginate list
  const paginated = filtered.slice(o, o + l);

  res.json({
    total,
    limit: l,
    offset: o,
    assets: paginated
  });
});

app.get('/api/assets/:id', authenticateToken, (req: any, res: any) => {
  const { id } = req.params;
  const db = readDb();

  const asset = db.assets.find((a) => a.id === id);
  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  // Find historical timelines
  const timeline = db.transitionLogs
    .filter((log) => log.assetId === id)
    .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());

  const allocationsHistory = db.allocations
    .filter((a) => a.assetId === id)
    .sort((a, b) => new Date(b.allocatedAt).getTime() - new Date(a.allocatedAt).getTime())
    .map((alloc) => {
      const emp = db.employees.find((e) => e.id === alloc.employeeId);
      const dept = db.departments.find((d) => d.id === alloc.departmentId);
      const allocator = db.employees.find((e) => e.id === alloc.allocatedBy);
      return {
        ...alloc,
        holderName: emp ? emp.name : (dept ? dept.name : 'Unknown'),
        allocatorName: allocator ? allocator.name : 'System'
      };
    });

  const maintenanceHistory = db.maintenance
    .filter((m) => m.assetId === id)
    .sort((a, b) => {
      const aTime = a.resolvedAt ? new Date(a.resolvedAt).getTime() : Date.now();
      const bTime = b.resolvedAt ? new Date(b.resolvedAt).getTime() : Date.now();
      return bTime - aTime;
    });

  const bookingsHistory = db.bookings
    .filter((b) => b.resourceId === id)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .map((book) => {
      const emp = db.employees.find((e) => e.id === book.bookedBy);
      return {
        ...book,
        bookerName: emp ? emp.name : 'Unknown'
      };
    });

  res.json({
    asset,
    timeline,
    allocationsHistory,
    maintenanceHistory,
    bookingsHistory
  });
});

app.post('/api/assets', authenticateToken, requireRole(['Admin', 'AssetManager']), async (req: any, res: any) => {
  const { name, categoryId, serialNumber, acquisitionDate, acquisitionCost, condition, location, isBookable, customFieldValues } = req.body;

  if (!name || !categoryId || !serialNumber) {
    return res.status(400).json({ error: 'Name, Category, and Serial Number are required' });
  }

  let createdAsset: Asset | null = null;

  await writeDb((db) => {
    // Generate sequential tag: e.g. AF-0041
    const totalAssetsRegistered = db.assets.length;
    let nextNum = totalAssetsRegistered + 1;
    let tag = `AF-${nextNum.toString().padStart(4, '0')}`;

    // Make sure tag is unique just in case
    while (db.assets.some((a) => a.assetTag === tag)) {
      nextNum++;
      tag = `AF-${nextNum.toString().padStart(4, '0')}`;
    }

    createdAsset = {
      id: `asset-${Date.now()}`,
      assetTag: tag,
      name,
      categoryId,
      serialNumber,
      acquisitionDate: acquisitionDate || new Date().toISOString().split('T')[0],
      acquisitionCost: Number(acquisitionCost) || 0,
      condition: condition || 'Excellent',
      location: location || 'Storage Room',
      photoUrls: [],
      isBookable: !!isBookable,
      status: 'Available',
      customFieldValues: customFieldValues || {}
    };

    db.assets.push(createdAsset);

    // Initial state transition log
    db.transitionLogs.push({
      id: `translog-${Date.now()}`,
      assetId: createdAsset.id,
      fromStatus: 'Available', // Initial
      toStatus: 'Available',
      changedBy: req.user.id,
      changedAt: new Date().toISOString(),
      reason: 'Asset registered in database'
    });

    logActivity(db, req.user.id, 'Register Asset', 'Asset', createdAsset.id, { assetTag: tag, name });
  });

  onDatabaseMutation({ dashboard: true, assets: true });
  res.status(201).json(createdAsset);
});

app.put('/api/assets/:id', authenticateToken, requireRole(['Admin', 'AssetManager']), async (req: any, res: any) => {
  const { id } = req.params;
  const { name, serialNumber, acquisitionDate, acquisitionCost, condition, location, isBookable, status, customFieldValues } = req.body;

  let updatedAsset: Asset | null = null;
  let transitionError: string | null = null;

  await writeDb((db) => {
    const idx = db.assets.findIndex((a) => a.id === id);
    if (idx === -1) return;

    const currentAsset = db.assets[idx];

    // If status changed, enforce State Machine rule
    if (status && status !== currentAsset.status) {
      if (!isValidTransition(currentAsset.status, status, false)) {
        transitionError = `Illegal transition from ${currentAsset.status} to ${status}`;
        return;
      }

      // Log the legal transition
      db.transitionLogs.push({
        id: `translog-${Date.now()}-${Math.floor(Math.random() * 100)}`,
        assetId: id,
        fromStatus: currentAsset.status,
        toStatus: status,
        changedBy: req.user.id,
        changedAt: new Date().toISOString(),
        reason: 'Asset status updated manually'
      });
    }

    db.assets[idx] = {
      ...currentAsset,
      name: name !== undefined ? name : currentAsset.name,
      serialNumber: serialNumber !== undefined ? serialNumber : currentAsset.serialNumber,
      acquisitionDate: acquisitionDate !== undefined ? acquisitionDate : currentAsset.acquisitionDate,
      acquisitionCost: acquisitionCost !== undefined ? Number(acquisitionCost) : currentAsset.acquisitionCost,
      condition: condition !== undefined ? condition : currentAsset.condition,
      location: location !== undefined ? location : currentAsset.location,
      isBookable: isBookable !== undefined ? !!isBookable : currentAsset.isBookable,
      status: status !== undefined && !transitionError ? status : currentAsset.status,
      customFieldValues: customFieldValues !== undefined ? customFieldValues : currentAsset.customFieldValues
    };

    updatedAsset = db.assets[idx];
    logActivity(db, req.user.id, 'Update Asset Info', 'Asset', id, { assetTag: updatedAsset.assetTag });
  });

  if (transitionError) {
    return res.status(400).json({ error: transitionError });
  }

  if (!updatedAsset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  onDatabaseMutation({ dashboard: true, assets: true });
  res.json(updatedAsset);
});

// -------------------------------------------------------------
// ALLOCATIONS & TRANSFERS
// -------------------------------------------------------------
app.get('/api/allocations', authenticateToken, (req: any, res: any) => {
  const db = readDb();
  const enriched = db.allocations.map((alloc) => {
    const asset = db.assets.find((a) => a.id === alloc.assetId);
    const emp = db.employees.find((e) => e.id === alloc.employeeId);
    const dept = db.departments.find((d) => d.id === alloc.departmentId);
    const allocator = db.employees.find((e) => e.id === alloc.allocatedBy);
    return {
      ...alloc,
      assetTag: asset?.assetTag,
      assetName: asset?.name,
      holderName: emp ? emp.name : (dept ? dept.name : 'Unknown Department'),
      allocatorName: allocator ? allocator.name : 'System'
    };
  });
  res.json(enriched);
});

app.post('/api/allocations', authenticateToken, requireRole(['Admin', 'AssetManager']), async (req: any, res: any) => {
  const { assetId, employeeId, departmentId, expectedReturnDate } = req.body;

  if (!assetId || (!employeeId && !departmentId)) {
    return res.status(400).json({ error: 'Asset ID and recipient (Employee or Department) are required' });
  }

  let newAlloc: Allocation | null = null;
  let errorResponse: any = null;

  await writeDb((db) => {
    const asset = db.assets.find((a) => a.id === assetId);
    if (!asset) {
      errorResponse = { status: 404, error: 'Asset not found' };
      return;
    }

    if (asset.status === 'Retired' || asset.status === 'Disposed' || asset.status === 'Lost' || asset.status === 'UnderMaintenance') {
      errorResponse = { status: 400, error: `Cannot allocate asset. Current status is ${asset.status}` };
      return;
    }

    // UNIQUE Active allocation / conflict check
    const activeAlloc = db.allocations.find((a) => a.assetId === assetId && a.status === 'Active');
    if (activeAlloc || asset.status === 'Allocated') {
      const currentHolder = activeAlloc
        ? (db.employees.find((e) => e.id === activeAlloc.employeeId)?.name || db.departments.find((d) => d.id === activeAlloc.departmentId)?.name || 'Someone')
        : 'Someone';

      errorResponse = {
        status: 409,
        error: `Asset is already allocated to ${currentHolder}.`,
        allocationId: activeAlloc?.id,
        currentHolderName: currentHolder
      };
      return;
    }

    // Transition Asset to Allocated State
    if (!isValidTransition(asset.status, 'Allocated', false)) {
      errorResponse = { status: 400, error: `Asset state transition from ${asset.status} to Allocated is forbidden.` };
      return;
    }

    asset.status = 'Allocated';

    // Transition Log
    db.transitionLogs.push({
      id: `translog-${Date.now()}`,
      assetId,
      fromStatus: 'Available',
      toStatus: 'Allocated',
      changedBy: req.user.id,
      changedAt: new Date().toISOString(),
      reason: 'Allocated to worker/department'
    });

    newAlloc = {
      id: `alloc-${Date.now()}`,
      assetId,
      employeeId: employeeId || null,
      departmentId: departmentId || null,
      allocatedBy: req.user.id,
      allocatedAt: new Date().toISOString(),
      expectedReturnDate: expectedReturnDate || new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(), // 180 days default
      actualReturnDate: null,
      conditionCheckinNotes: null,
      status: 'Active'
    };

    db.allocations.push(newAlloc);

    // Notify user
    if (employeeId) {
      notifyUser(db, employeeId, 'info', `Asset ${asset.assetTag} (${asset.name}) has been allocated to you. Expected return: ${new Date(newAlloc.expectedReturnDate).toLocaleDateString()}`, newAlloc.id);
    }

    logActivity(db, req.user.id, 'Allocate Asset', 'Allocation', newAlloc.id, { assetTag: asset.assetTag, employeeId, departmentId });
  });

  if (errorResponse) {
    return res.status(errorResponse.status).json({ error: errorResponse.error, allocationId: errorResponse.allocationId, currentHolderName: errorResponse.currentHolderName });
  }

  onDatabaseMutation({ dashboard: true, allocations: true, assets: true });
  res.status(201).json(newAlloc);
});

app.post('/api/allocations/:id/return', authenticateToken, requireRole(['Admin', 'AssetManager']), async (req: any, res: any) => {
  const { id } = req.params;
  const { conditionCheckinNotes, condition } = req.body;

  let returnedAlloc: Allocation | null = null;
  let errorResponse: any = null;

  await writeDb((db) => {
    const alloc = db.allocations.find((a) => a.id === id);
    if (!alloc) {
      errorResponse = { status: 404, error: 'Allocation not found' };
      return;
    }

    if (alloc.status === 'Returned') {
      errorResponse = { status: 400, error: 'Asset has already been returned for this allocation' };
      return;
    }

    const asset = db.assets.find((a) => a.id === alloc.assetId);
    if (!asset) {
      errorResponse = { status: 404, error: 'Associated asset not found' };
      return;
    }

    // State transition Check
    if (!isValidTransition(asset.status, 'Available', false)) {
      errorResponse = { status: 400, error: `Transition from ${asset.status} to Available on return is illegal.` };
      return;
    }

    // Perform Return
    alloc.actualReturnDate = new Date().toISOString();
    alloc.conditionCheckinNotes = conditionCheckinNotes || 'Returned in normal condition.';
    alloc.status = 'Returned';

    asset.status = 'Available';
    if (condition) {
      asset.condition = condition as AssetCondition;
    }

    // Transition Log
    db.transitionLogs.push({
      id: `translog-${Date.now()}`,
      assetId: asset.id,
      fromStatus: 'Allocated',
      toStatus: 'Available',
      changedBy: req.user.id,
      changedAt: new Date().toISOString(),
      reason: 'Returned to storage inventory'
    });

    if (alloc.employeeId) {
      notifyUser(db, alloc.employeeId, 'info', `Asset ${asset.assetTag} (${asset.name}) check-in was approved.`, alloc.id);
    }

    logActivity(db, req.user.id, 'Return Asset Check-in', 'Allocation', id, { assetTag: asset.assetTag, condition });
    returnedAlloc = alloc;
  });

  if (errorResponse) {
    return res.status(errorResponse.status).json({ error: errorResponse.error });
  }

  onDatabaseMutation({ dashboard: true, allocations: true, assets: true });
  res.json(returnedAlloc);
});

// -------------------------------------------------------------
// TRANSFER REQUESTS
// -------------------------------------------------------------
app.get('/api/transfers', authenticateToken, (req: any, res: any) => {
  const db = readDb();
  const enriched = db.transfers.map((t) => {
    const alloc = db.allocations.find((a) => a.id === t.allocationId);
    const asset = alloc ? db.assets.find((ast) => ast.id === alloc.assetId) : null;
    const requester = db.employees.find((e) => e.id === t.requestedBy);
    const holder = db.employees.find((e) => e.id === t.currentHolderId);
    return {
      ...t,
      assetTag: asset?.assetTag,
      assetName: asset?.name,
      requesterName: requester?.name,
      holderName: holder?.name
    };
  });
  res.json(enriched);
});

app.post('/api/transfers', authenticateToken, async (req: any, res: any) => {
  const { allocationId } = req.body;

  if (!allocationId) {
    return res.status(400).json({ error: 'Allocation ID is required to initiate a transfer.' });
  }

  let transfer: TransferRequest | null = null;
  let errorResponse: any = null;

  await writeDb((db) => {
    const alloc = db.allocations.find((a) => a.id === allocationId);
    if (!alloc || alloc.status !== 'Active') {
      errorResponse = { status: 400, error: 'Allocation is not active or not found' };
      return;
    }

    if (alloc.employeeId === req.user.id) {
      errorResponse = { status: 400, error: 'You are already the current holder of this asset' };
      return;
    }

    // Check if there is already a pending transfer
    const exists = db.transfers.some((t) => t.allocationId === allocationId && t.status === 'Requested');
    if (exists) {
      errorResponse = { status: 409, error: 'A pending transfer request already exists for this allocation' };
      return;
    }

    transfer = {
      id: `trans-${Date.now()}`,
      allocationId,
      requestedBy: req.user.id,
      currentHolderId: alloc.employeeId || 'dept',
      requestedAt: new Date().toISOString(),
      status: 'Requested',
      approvedBy: null,
      approvedAt: null
    };

    db.transfers.push(transfer);

    // Notify current holder
    if (alloc.employeeId) {
      notifyUser(db, alloc.employeeId, 'warning', `${req.user.name} has requested a transfer for asset assigned to you.`, transfer.id);
    }

    // Notify managers
    const managers = db.employees.filter((e) => e.role === 'AssetManager' || e.role === 'Admin');
    managers.forEach((mgr) => {
      notifyUser(db, mgr.id, 'info', `New asset transfer requested by ${req.user.name}.`, transfer!.id);
    });

    logActivity(db, req.user.id, 'Request Transfer', 'TransferRequest', transfer.id, { allocationId });
  });

  if (errorResponse) {
    return res.status(errorResponse.status).json({ error: errorResponse.error });
  }

  onDatabaseMutation({ dashboard: true, allocations: true });
  res.status(201).json(transfer);
});

app.post('/api/transfers/:id/respond', authenticateToken, requireRole(['Admin', 'AssetManager']), async (req: any, res: any) => {
  const { id } = req.params;
  const { action } = req.body; // 'Approved' or 'Rejected'

  if (action !== 'Approved' && action !== 'Rejected') {
    return res.status(400).json({ error: 'Action must be Approved or Rejected' });
  }

  let finalTransfer: TransferRequest | null = null;
  let errorResponse: any = null;

  await writeDb((db) => {
    const transferIndex = db.transfers.findIndex((t) => t.id === id);
    if (transferIndex === -1) {
      errorResponse = { status: 404, error: 'Transfer request not found' };
      return;
    }

    const trans = db.transfers[transferIndex];
    if (trans.status !== 'Requested') {
      errorResponse = { status: 400, error: 'Transfer request has already been processed' };
      return;
    }

    trans.status = action as TransferRequestStatus;
    trans.approvedBy = req.user.id;
    trans.approvedAt = new Date().toISOString();

    const alloc = db.allocations.find((a) => a.id === trans.allocationId);
    if (!alloc) {
      errorResponse = { status: 404, error: 'Associated allocation not found' };
      return;
    }

    const asset = db.assets.find((a) => a.id === alloc.assetId);
    if (!asset) {
      errorResponse = { status: 404, error: 'Associated asset not found' };
      return;
    }

    if (action === 'Approved') {
      // ATOMIC TRANSACTION: Complete previous allocation, create a new allocation for the requester, update asset allocation
      alloc.actualReturnDate = new Date().toISOString();
      alloc.conditionCheckinNotes = `Transferred directly to requester of request ID ${trans.id}`;
      alloc.status = 'Returned';

      const newAlloc: Allocation = {
        id: `alloc-${Date.now()}`,
        assetId: alloc.assetId,
        employeeId: trans.requestedBy,
        departmentId: null,
        allocatedBy: req.user.id,
        allocatedAt: new Date().toISOString(),
        expectedReturnDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        actualReturnDate: null,
        conditionCheckinNotes: null,
        status: 'Active'
      };

      db.allocations.push(newAlloc);

      // Keep asset status as 'Allocated'
      asset.status = 'Allocated';

      notifyUser(db, trans.requestedBy, 'info', `Your transfer request for ${asset.name} was APPROVED and has been allocated to you.`, newAlloc.id);
      if (trans.currentHolderId !== 'dept') {
        notifyUser(db, trans.currentHolderId, 'info', `Transfer request for your assigned asset ${asset.assetTag} was approved. It is now checked-out to the requester.`, trans.id);
      }

      logActivity(db, req.user.id, 'Approve Transfer', 'TransferRequest', trans.id, { allocationId: alloc.id, newAllocationId: newAlloc.id });
    } else {
      // Rejected
      notifyUser(db, trans.requestedBy, 'warning', `Your transfer request for asset ${asset.name} was REJECTED.`, trans.id);
      logActivity(db, req.user.id, 'Reject Transfer', 'TransferRequest', trans.id, { allocationId: alloc.id });
    }

    finalTransfer = trans;
  });

  if (errorResponse) {
    return res.status(errorResponse.status).json({ error: errorResponse.error });
  }

  onDatabaseMutation({ dashboard: true, allocations: true, assets: true });
  res.json(finalTransfer);
});

// -------------------------------------------------------------
// RESOURCE BOOKINGS
// -------------------------------------------------------------
app.get('/api/bookings', authenticateToken, (req: any, res: any) => {
  const db = readDb();
  const enriched = db.bookings.map((b) => {
    const resource = db.assets.find((a) => a.id === b.resourceId);
    const booker = db.employees.find((e) => e.id === b.bookedBy);
    return {
      ...b,
      resourceName: resource?.name,
      resourceTag: resource?.assetTag,
      resourceLocation: resource?.location,
      bookerName: booker?.name
    };
  });
  res.json(enriched);
});

app.post('/api/bookings', authenticateToken, async (req: any, res: any) => {
  const { resourceId, startTime, endTime } = req.body;

  if (!resourceId || !startTime || !endTime) {
    return res.status(400).json({ error: 'Resource, Start Time, and End Time are required' });
  }

  const sTime = new Date(startTime);
  const eTime = new Date(endTime);

  if (sTime >= eTime) {
    return res.status(400).json({ error: 'Start time must be before end time' });
  }

  let newBooking: Booking | null = null;
  let errorResponse: any = null;

  await writeDb((db) => {
    const asset = db.assets.find((a) => a.id === resourceId);
    if (!asset || !asset.isBookable) {
      errorResponse = { status: 400, error: 'Resource is either not found or not registered as bookable.' };
      return;
    }

    if (asset.status === 'Retired' || asset.status === 'Disposed' || asset.status === 'Lost') {
      errorResponse = { status: 400, error: `Resource is unavailable due to status: ${asset.status}` };
      return;
    }

    // OVERLAP CONSTRAINT - PREVENT CONCURRENT overlaps at database-level lock
    const overlapCheck = checkBookingOverlap(db, resourceId, startTime, endTime);
    if (overlapCheck.overlaps) {
      const currentBooker = db.employees.find((e) => e.id === overlapCheck.currentBooking?.bookedBy)?.name || 'Another employee';
      errorResponse = {
        status: 409,
        error: `Booking conflict: This resource is already booked by ${currentBooker} during this period (${new Date(overlapCheck.currentBooking!.startTime).toLocaleTimeString()} - ${new Date(overlapCheck.currentBooking!.endTime).toLocaleTimeString()}).`
      };
      return;
    }

    newBooking = {
      id: `book-${Date.now()}`,
      resourceId,
      bookedBy: req.user.id,
      startTime,
      endTime,
      status: 'Upcoming'
    };

    db.bookings.push(newBooking);
    logActivity(db, req.user.id, 'Create Booking', 'Booking', newBooking.id, { resourceId, startTime, endTime });
    notifyUser(db, req.user.id, 'info', `Your booking for ${asset.name} is confirmed for ${sTime.toLocaleString()}`, newBooking.id);
  });

  if (errorResponse) {
    return res.status(errorResponse.status).json({ error: errorResponse.error });
  }

  onDatabaseMutation({ dashboard: true, bookings: true });
  res.status(201).json(newBooking);
});

app.post('/api/bookings/:id/cancel', authenticateToken, async (req: any, res: any) => {
  const { id } = req.params;
  let successBooking: Booking | null = null;
  let errorResponse: any = null;

  await writeDb((db) => {
    const bookingIndex = db.bookings.findIndex((b) => b.id === id);
    if (bookingIndex === -1) {
      errorResponse = { status: 404, error: 'Booking not found' };
      return;
    }

    const b = db.bookings[bookingIndex];
    if (b.status === 'Cancelled' || b.status === 'Completed') {
      errorResponse = { status: 400, error: `Booking cannot be cancelled. It is already ${b.status}.` };
      return;
    }

    // Employee can only cancel their own, Admins/Managers can cancel any
    const isOwner = b.bookedBy === req.user.id;
    const isManager = req.user.role === 'Admin' || req.user.role === 'AssetManager';
    if (!isOwner && !isManager) {
      errorResponse = { status: 403, error: 'Permission denied: Cannot cancel another employee\'s booking' };
      return;
    }

    b.status = 'Cancelled';
    successBooking = b;

    const asset = db.assets.find((a) => a.id === b.resourceId);
    logActivity(db, req.user.id, 'Cancel Booking', 'Booking', id, { resourceName: asset?.name });
    notifyUser(db, b.bookedBy, 'warning', `Your booking for ${asset?.name || 'resource'} has been CANCELLED.`, id);
  });

  if (errorResponse) {
    return res.status(errorResponse.status).json({ error: errorResponse.error });
  }

  onDatabaseMutation({ dashboard: true, bookings: true });
  res.json(successBooking);
});

// -------------------------------------------------------------
// MAINTENANCE MANAGEMENT
// -------------------------------------------------------------
app.get('/api/maintenance', authenticateToken, (req: any, res: any) => {
  const db = readDb();
  const enriched = db.maintenance.map((m) => {
    const asset = db.assets.find((a) => a.id === m.assetId);
    const creator = db.employees.find((e) => e.id === m.raisedBy);
    const assignee = db.employees.find((e) => e.id === m.assignedTechnician);
    return {
      ...m,
      assetTag: asset?.assetTag,
      assetName: asset?.name,
      assetLocation: asset?.location,
      creatorName: creator?.name,
      assigneeName: assignee ? assignee.name : m.assignedTechnician // fallback to raw string tech if not employee
    };
  });
  res.json(enriched);
});

app.post('/api/maintenance', authenticateToken, async (req: any, res: any) => {
  const { assetId, issueDescription, priority } = req.body;

  if (!assetId || !issueDescription) {
    return res.status(400).json({ error: 'Asset ID and Issue Description are required' });
  }

  let maint: MaintenanceRequest | null = null;
  let errorResponse: any = null;

  await writeDb((db) => {
    const asset = db.assets.find((a) => a.id === assetId);
    if (!asset) {
      errorResponse = { status: 404, error: 'Asset not found' };
      return;
    }

    if (asset.status === 'Retired' || asset.status === 'Disposed') {
      errorResponse = { status: 400, error: 'Cannot raise maintenance on retired or disposed assets' };
      return;
    }

    maint = {
      id: `maint-${Date.now()}`,
      assetId,
      raisedBy: req.user.id,
      issueDescription,
      priority: priority || 'Medium',
      photoUrl: null,
      status: 'Pending', // Initial status is ALWAYS Pending (Approved/Resolved handles asset status)
      assignedTechnician: null,
      approvedBy: null,
      resolvedAt: null
    };

    db.maintenance.push(maint);

    // Notify Asset Managers
    const managers = db.employees.filter((e) => e.role === 'AssetManager' || e.role === 'Admin');
    managers.forEach((m) => {
      notifyUser(db, m.id, 'info', `New maintenance request raised for ${asset.assetTag} (${asset.name}) by ${req.user.name}.`, maint!.id);
    });

    logActivity(db, req.user.id, 'Raise Maintenance Request', 'MaintenanceRequest', maint.id, { assetTag: asset.assetTag });
  });

  if (errorResponse) {
    return res.status(errorResponse.status).json({ error: errorResponse.error });
  }

  onDatabaseMutation({ dashboard: true, maintenance: true });
  res.status(201).json(maint);
});

app.put('/api/maintenance/:id/status', authenticateToken, requireRole(['Admin', 'AssetManager']), async (req: any, res: any) => {
  const { id } = req.params;
  const { status, assignedTechnician } = req.body;

  const validStatuses: MaintenanceStatus[] = ['Pending', 'Approved', 'Rejected', 'TechnicianAssigned', 'InProgress', 'Resolved'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid maintenance status' });
  }

  let updatedMaint: MaintenanceRequest | null = null;
  let transitionError: string | null = null;

  await writeDb((db) => {
    const mIdx = db.maintenance.findIndex((m) => m.id === id);
    if (mIdx === -1) return;

    const request = db.maintenance[mIdx];
    const asset = db.assets.find((a) => a.id === request.assetId);

    if (!asset) {
      transitionError = 'Associated asset not found';
      return;
    }

    const previousStatus = request.status;

    // RULE 4: MAINTENANCE APPROVAL GATE
    // Asset status only flips to UnderMaintenance when a request is Approved (not on raise)
    // Status reverts to Available only on Resolved.
    let targetAssetStatus: AssetStatus | null = null;

    if (previousStatus === 'Pending' && (status === 'Approved' || status === 'TechnicianAssigned' || status === 'InProgress')) {
      targetAssetStatus = 'UnderMaintenance';
    } else if (status === 'Resolved') {
      targetAssetStatus = 'Available';
      request.resolvedAt = new Date().toISOString();
    } else if (status === 'Rejected') {
      // If rejected, does not change asset status unless it was somehow changed
      targetAssetStatus = 'Available';
    }

    if (targetAssetStatus && targetAssetStatus !== asset.status) {
      // Validate transition on Asset State Machine
      if (!isValidTransition(asset.status, targetAssetStatus, false)) {
        transitionError = `Asset state machine forbids transition from ${asset.status} to ${targetAssetStatus}. Update asset manually first or check active allocations.`;
        return;
      }

      // Record Asset transition
      db.transitionLogs.push({
        id: `translog-${Date.now()}`,
        assetId: asset.id,
        fromStatus: asset.status,
        toStatus: targetAssetStatus,
        changedBy: req.user.id,
        changedAt: new Date().toISOString(),
        reason: `Maintenance Request ${id} changed to ${status}`
      });

      asset.status = targetAssetStatus;
    }

    // Apply updates to request
    request.status = status;
    if (assignedTechnician !== undefined) {
      request.assignedTechnician = assignedTechnician;
    }
    if (status === 'Approved' && !request.approvedBy) {
      request.approvedBy = req.user.id;
    }

    db.maintenance[mIdx] = request;
    updatedMaint = request;

    // Notify original raiser
    notifyUser(db, request.raisedBy, 'info', `Your maintenance request for ${asset.name} status updated: ${status}`, request.id);

    logActivity(db, req.user.id, 'Update Maintenance Status', 'MaintenanceRequest', id, { previousStatus, nextStatus: status });
  });

  if (transitionError) {
    return res.status(400).json({ error: transitionError });
  }

  if (!updatedMaint) {
    return res.status(404).json({ error: 'Maintenance request not found' });
  }

  onDatabaseMutation({ dashboard: true, maintenance: true, assets: true });
  res.json(updatedMaint);
});

// -------------------------------------------------------------
// ASSET AUDITS
// -------------------------------------------------------------
app.get('/api/audits', authenticateToken, (req: any, res: any) => {
  const db = readDb();
  res.json(db.audits);
});

app.post('/api/audits', authenticateToken, requireRole(['Admin', 'AssetManager']), async (req: any, res: any) => {
  const { scopeType, scopeValue, dateRangeStart, dateRangeEnd, auditorIds } = req.body;

  if (!scopeType || !scopeValue || !dateRangeStart || !dateRangeEnd) {
    return res.status(400).json({ error: 'Scope, start date, and end date are required' });
  }

  let createdAudit: AuditCycle | null = null;

  await writeDb((db) => {
    // Check if there's already an active cycle
    const active = db.audits.find((a) => a.status === 'Active');
    if (active) {
      // Just auto draft or warn, but let's allow multi if different scope or just support standard
    }

    createdAudit = {
      id: `audit-${Date.now()}`,
      scopeType,
      scopeValue,
      dateRangeStart,
      dateRangeEnd,
      status: 'Active' // Starts as Active immediately
    };

    db.audits.push(createdAudit);

    // Create assignments
    if (auditorIds && Array.isArray(auditorIds)) {
      auditorIds.forEach((audId) => {
        db.auditAssignments.push({
          id: `assign-${Date.now()}-${Math.floor(Math.random() * 100)}`,
          auditCycleId: createdAudit!.id,
          auditorId: audId
        });
        notifyUser(db, audId, 'warning', `You have been assigned as an auditor for Audit Cycle ${createdAudit!.id}. Scope: ${scopeValue}`, createdAudit!.id);
      });
    }

    logActivity(db, req.user.id, 'Create Audit Cycle', 'AuditCycle', createdAudit.id, { scopeValue });
  });

  onDatabaseMutation({ audits: true });
  res.status(201).json(createdAudit);
});

app.get('/api/audits/:id/findings', authenticateToken, (req: any, res: any) => {
  const { id } = req.params;
  const db = readDb();

  const audit = db.audits.find((a) => a.id === id);
  if (!audit) {
    return res.status(404).json({ error: 'Audit cycle not found' });
  }

  const findings = db.auditFindings.filter((f) => f.auditCycleId === id);
  const assignments = db.auditAssignments.filter((a) => a.auditCycleId === id);

  // Enriched list of assets matching the scope to show in the checklist
  let scopedAssets = db.assets;
  if (audit.scopeType === 'department') {
    // Find allocations/employees in dept
    const empIds = db.employees.filter((e) => e.departmentId === audit.scopeValue).map((e) => e.id);
    const allocAssetIds = db.allocations
      .filter((a) => a.status === 'Active' && a.employeeId && empIds.includes(a.employeeId))
      .map((a) => a.assetId);

    scopedAssets = db.assets.filter((a) => allocAssetIds.includes(a.id));
  } else if (audit.scopeType === 'location') {
    scopedAssets = db.assets.filter((a) => a.location.toLowerCase().includes(audit.scopeValue.toLowerCase()));
  }

  const checklist = scopedAssets.map((asset) => {
    const finding = findings.find((f) => f.assetId === asset.id);
    return {
      assetId: asset.id,
      assetTag: asset.assetTag,
      name: asset.name,
      serialNumber: asset.serialNumber,
      location: asset.location,
      currentStatus: asset.status,
      condition: asset.condition,
      finding: finding
        ? {
            id: finding.id,
            result: finding.result,
            notes: finding.notes,
            recordedAt: finding.recordedAt,
            recordedByName: db.employees.find((e) => e.id === finding.recordedBy)?.name || 'Auditor'
          }
        : null
    };
  });

  res.json({
    audit,
    assignments,
    checklist,
    findingsCount: findings.length,
    totalCount: scopedAssets.length
  });
});

app.post('/api/audits/:id/findings', authenticateToken, async (req: any, res: any) => {
  const { id } = req.params;
  const { assetId, result, notes } = req.body; // result: Verified, Missing, Damaged

  if (!assetId || !result) {
    return res.status(400).json({ error: 'Asset ID and Finding Result are required' });
  }

  let finding: AuditFinding | null = null;
  let errorResponse: any = null;

  await writeDb((db) => {
    const audit = db.audits.find((a) => a.id === id);
    if (!audit) {
      errorResponse = { status: 404, error: 'Audit cycle not found' };
      return;
    }

    if (audit.status === 'Closed') {
      errorResponse = { status: 400, error: 'Cannot record findings on a closed audit cycle' };
      return;
    }

    // Check if auditor is assigned (optional fallback but good integrity)
    const isAssigned = db.auditAssignments.some((a) => a.auditCycleId === id && a.auditorId === req.user.id);
    const isManager = req.user.role === 'Admin' || req.user.role === 'AssetManager';
    if (!isAssigned && !isManager) {
      errorResponse = { status: 403, error: 'You are not assigned as an auditor for this cycle' };
      return;
    }

    const asset = db.assets.find((a) => a.id === assetId);
    if (!asset) {
      errorResponse = { status: 404, error: 'Asset not found' };
      return;
    }

    // Upsert finding
    const findIdx = db.auditFindings.findIndex((f) => f.auditCycleId === id && f.assetId === assetId);
    const nowStr = new Date().toISOString();

    if (findIdx !== -1) {
      db.auditFindings[findIdx] = {
        ...db.auditFindings[findIdx],
        result,
        notes: notes || '',
        recordedBy: req.user.id,
        recordedAt: nowStr
      };
      finding = db.auditFindings[findIdx];
    } else {
      finding = {
        id: `find-${Date.now()}-${Math.floor(Math.random() * 100)}`,
        auditCycleId: id,
        assetId,
        result,
        notes: notes || '',
        recordedBy: req.user.id,
        recordedAt: nowStr
      };
      db.auditFindings.push(finding);
    }

    logActivity(db, req.user.id, 'Record Audit Finding', 'AuditFinding', finding.id, { assetTag: asset.assetTag, result });
  });

  if (errorResponse) {
    return res.status(errorResponse.status).json({ error: errorResponse.error });
  }

  onDatabaseMutation({ audits: true });
  res.json(finding);
});

app.post('/api/audits/:id/close', authenticateToken, requireRole(['Admin', 'AssetManager']), async (req: any, res: any) => {
  const { id } = req.params;
  let closedAudit: AuditCycle | null = null;
  let discrepancySummary: any = null;
  let errorResponse: any = null;

  await writeDb((db) => {
    const aIdx = db.audits.findIndex((a) => a.id === id);
    if (aIdx === -1) {
      errorResponse = { status: 404, error: 'Audit cycle not found' };
      return;
    }

    const audit = db.audits[aIdx];
    if (audit.status === 'Closed') {
      errorResponse = { status: 400, error: 'Audit cycle is already closed' };
      return;
    }

    // --------------------------------════════════════════════════
    // RULE 6: AUDIT CLOSURE CASCADE - LOCKED FINDINGS AND AUTOMATIC LOST TRANSITIONS
    // CONFIRMED-MISSING ASSETS FLIP TO LOST (ATOMICALLY)
    // --------------------------------════════════════════════════
    const findings = db.auditFindings.filter((f) => f.auditCycleId === id);
    let missingAssetsCount = 0;
    let damagedAssetsCount = 0;
    let verifiedCount = 0;

    findings.forEach((finding) => {
      const asset = db.assets.find((a) => a.id === finding.assetId);
      if (!asset) return;

      if (finding.result === 'Missing') {
        missingAssetsCount++;
        const oldStatus = asset.status;
        
        // Check state transition using isAuditClosure = true!
        if (isValidTransition(oldStatus, 'Lost', true)) {
          asset.status = 'Lost';

          // transition log
          db.transitionLogs.push({
            id: `translog-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            assetId: asset.id,
            fromStatus: oldStatus,
            toStatus: 'Lost',
            changedBy: req.user.id,
            changedAt: new Date().toISOString(),
            reason: `Audit Cycle ${id} closure: asset confirmed Missing`
          });

          // Terminate active allocations if they exist
          const activeAlloc = db.allocations.find((al) => al.assetId === asset.id && al.status === 'Active');
          if (activeAlloc) {
            activeAlloc.status = 'Overdue'; // Keep historical trace of failure
            activeAlloc.actualReturnDate = new Date().toISOString();
            activeAlloc.conditionCheckinNotes = `Lost status determined during Audit Cycle ${id}`;
          }
        }
      } else if (finding.result === 'Damaged') {
        damagedAssetsCount++;
        asset.condition = 'Poor'; // Degrade condition automatically
        
        // Auto raise maintenance request if not already exists!
        const existingMaint = db.maintenance.some((m) => m.assetId === asset.id && m.status !== 'Resolved');
        if (!existingMaint) {
          const newMaint: MaintenanceRequest = {
            id: `maint-auto-${Date.now()}`,
            assetId: asset.id,
            raisedBy: req.user.id,
            issueDescription: `Auto-generated from Audit Cycle ${id} - Damaged asset finding: ${finding.notes}`,
            priority: 'High',
            photoUrl: null,
            status: 'Pending',
            assignedTechnician: null,
            approvedBy: null,
            resolvedAt: null
          };
          db.maintenance.push(newMaint);
        }
      } else if (finding.result === 'Verified') {
        verifiedCount++;
      }
    });

    audit.status = 'Closed';
    closedAudit = audit;

    discrepancySummary = {
      verified: verifiedCount,
      missing: missingAssetsCount,
      damaged: damagedAssetsCount
    };

    logActivity(db, req.user.id, 'Close Audit Cycle', 'AuditCycle', id, discrepancySummary);

    // Notify all system admins/managers
    const managers = db.employees.filter((e) => e.role === 'AssetManager' || e.role === 'Admin');
    managers.forEach((m) => {
      notifyUser(db, m.id, 'alert', `Audit Cycle ${id} CLOSED. Findings locked: ${missingAssetsCount} assets marked LOST.`, id);
    });
  });

  if (errorResponse) {
    return res.status(errorResponse.status).json({ error: errorResponse.error });
  }

  onDatabaseMutation({ dashboard: true, audits: true, assets: true });
  res.json({ audit: closedAudit, summary: discrepancySummary });
});

// -------------------------------------------------------------
// NOTIFICATIONS & ACTIVITY LOGS
// -------------------------------------------------------------
app.get('/api/notifications', authenticateToken, (req: any, res: any) => {
  const db = readDb();
  // Filter notifications for the authenticated user
  const userNotifications = db.notifications
    .filter((n) => n.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(userNotifications);
});

app.put('/api/notifications/read', authenticateToken, async (req: any, res: any) => {
  await writeDb((db) => {
    db.notifications.forEach((n) => {
      if (n.userId === req.user.id) {
        n.isRead = true;
      }
    });
  });
  res.json({ message: 'Notifications marked as read' });
});

app.get('/api/activity-logs', authenticateToken, requireRole(['Admin', 'AssetManager']), (req: any, res: any) => {
  const db = readDb();
  const enriched = db.activityLogs
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .map((log) => {
      const actor = db.employees.find((e) => e.id === log.actorId);
      return {
        ...log,
        actorName: actor ? actor.name : 'System'
      };
    });
  res.json(enriched);
});

// -------------------------------------------------------------
// MAIN BOOTSTRAP & VITE MIDDLEWARE
// -------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // Configure Vite dev server in middleware mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // Serve static compiled assets in production
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: any, res: any) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let authClient: AuthenticatedSocket | null = null;

    ws.on('message', (data: any) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.type === 'auth') {
          const { token } = payload;
          jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
            if (err) {
              ws.close(4000, 'Invalid token');
              return;
            }
            authClient = {
              ws,
              userId: decoded.id,
              role: decoded.role,
              departmentId: decoded.departmentId
            };
            activeSockets.add(authClient);
            ws.send(JSON.stringify({ type: 'auth_success' }));
          });
        }
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    });

    ws.on('close', () => {
      if (authClient) {
        activeSockets.delete(authClient);
      }
    });

    ws.on('error', () => {
      if (authClient) {
        activeSockets.delete(authClient);
      }
    });
  });
}

startServer();
