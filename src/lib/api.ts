// API Client for AssetFlow ERP

const API_BASE = '/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('assetflow_token');
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem('assetflow_token', token);
  } else {
    localStorage.removeItem('assetflow_token');
  }
}

export function getCurrentUser() {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload;
  } catch (e) {
    return null;
  }
}

async function request(endpoint: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP Error ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Auth
  login: (credentials: any) => request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  signup: (data: any) => request('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  getMe: () => request('/auth/me'),

  // Dashboard & Analytics
  getKpis: () => request('/dashboard/kpis'),
  getTrends: () => request('/analytics/trends'),

  // Departments
  getDepartments: () => request('/departments'),
  createDepartment: (data: any) => request('/departments', { method: 'POST', body: JSON.stringify(data) }),
  updateDepartment: (id: string, data: any) => request(`/departments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDepartment: (id: string) => request(`/departments/${id}`, { method: 'DELETE' }),

  // Categories
  getCategories: () => request('/categories'),
  createCategory: (data: any) => request('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: string, data: any) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Employees
  getEmployees: () => request('/employees'),
  updateEmployeeRole: (id: string, role: string) => request(`/employees/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  updateEmployeeStatus: (id: string, status: string) => request(`/employees/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),

  // Assets
  getAssets: (params: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return request(`/assets?${query}`);
  },
  getAsset: (id: string) => request(`/assets/${id}`),
  createAsset: (data: any) => request('/assets', { method: 'POST', body: JSON.stringify(data) }),
  updateAsset: (id: string, data: any) => request(`/assets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Allocations & Returns
  getAllocations: () => request('/allocations'),
  createAllocation: (data: any) => request('/allocations', { method: 'POST', body: JSON.stringify(data) }),
  returnAllocation: (id: string, data: any) => request(`/allocations/${id}/return`, { method: 'POST', body: JSON.stringify(data) }),

  // Transfers
  getTransfers: () => request('/transfers'),
  createTransfer: (data: any) => request('/transfers', { method: 'POST', body: JSON.stringify(data) }),
  respondTransfer: (id: string, action: string) => request(`/transfers/${id}/respond`, { method: 'POST', body: JSON.stringify({ action }) }),

  // Bookings
  getBookings: () => request('/bookings'),
  createBooking: (data: any) => request('/bookings', { method: 'POST', body: JSON.stringify(data) }),
  cancelBooking: (id: string) => request(`/bookings/${id}/cancel`, { method: 'POST' }),

  // Maintenance
  getMaintenance: () => request('/maintenance'),
  createMaintenance: (data: any) => request('/maintenance', { method: 'POST', body: JSON.stringify(data) }),
  updateMaintenanceStatus: (id: string, status: string, additional: any = {}) => 
    request(`/maintenance/${id}/status`, { method: 'PUT', body: JSON.stringify({ status, ...additional }) }),

  // Audits
  getAudits: () => request('/audits'),
  createAudit: (data: any) => request('/audits', { method: 'POST', body: JSON.stringify(data) }),
  getAuditFindings: (id: string) => request(`/audits/${id}/findings`),
  recordAuditFinding: (id: string, data: any) => request(`/audits/${id}/findings`, { method: 'POST', body: JSON.stringify(data) }),
  closeAuditCycle: (id: string) => request(`/audits/${id}/close`, { method: 'POST' }),

  // Notifications & Logs
  getNotifications: () => request('/notifications'),
  markNotificationsAsRead: () => request('/notifications/read', { method: 'PUT' }),
  getActivityLogs: () => request('/activity-logs')
};
