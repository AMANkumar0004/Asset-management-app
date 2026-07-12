import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { Department, AssetCategory, Employee } from '../types.js';
import { 
  Building, 
  Settings2, 
  Users, 
  Plus, 
  Trash2, 
  Edit2, 
  ShieldAlert, 
  CheckCircle, 
  XCircle,
  Hash
} from 'lucide-react';
import { Modal } from '../components/Modal.jsx';

export const OrganizationScreen: React.FC = () => {
  const { user, triggerToast } = useApp();
  const [activeTab, setActiveTab] = useState<'departments' | 'categories' | 'employees'>('departments');
  const [loading, setLoading] = useState(true);

  // Database lists
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Modal controls
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editDeptId, setEditDeptId] = useState<string | null>(null);
  const [deptName, setDeptName] = useState('');
  const [deptParentId, setDeptParentId] = useState('');
  const [deptHeadId, setDeptHeadId] = useState('');

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [catName, setCatName] = useState('');
  const [catFields, setCatFields] = useState<Array<{ name: string; type: 'string' | 'number' | 'boolean' }>>([]);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<'string' | 'number' | 'boolean'>('string');

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [deptData, catData, empData] = await Promise.all([
        api.getDepartments(),
        api.getCategories(),
        api.getEmployees(),
      ]);
      setDepartments(deptData);
      setCategories(catData);
      setEmployees(empData);
    } catch (err: any) {
      triggerToast(err.message || 'Failed to fetch directory data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'Admin') {
      loadAllData();
    }
  }, [user]);

  if (user?.role !== 'Admin') {
    return (
      <div className="bg-red-50 border border-red-200 p-6 rounded-2xl max-w-lg mx-auto text-center mt-12 shadow-sm">
        <ShieldAlert className="w-12 h-12 text-red-600 mx-auto mb-3 animate-pulse" />
        <h3 className="font-display font-bold text-lg text-red-950">Access Unauthorized</h3>
        <p className="text-red-800 text-sm mt-1 font-medium">
          Only system Administrators have structural configuration and promotion permissions.
          Please request help from organization directors to audit permissions.
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------
  // DEPARTMENTS HANDLERS
  // -------------------------------------------------------------
  const handleOpenDeptModal = (dept?: Department) => {
    if (dept) {
      setEditDeptId(dept.id);
      setDeptName(dept.name);
      setDeptParentId(dept.parentDepartmentId || '');
      setDeptHeadId(dept.headEmployeeId || '');
    } else {
      setEditDeptId(null);
      setDeptName('');
      setDeptParentId('');
      setDeptHeadId('');
    }
    setDeptModalOpen(true);
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName) return;

    try {
      const payload = {
        name: deptName,
        parentDepartmentId: deptParentId || null,
        headEmployeeId: deptHeadId || null,
      };

      if (editDeptId) {
        await api.updateDepartment(editDeptId, payload);
        triggerToast('Department updated successfully', 'success');
      } else {
        await api.createDepartment(payload);
        triggerToast('Department created successfully', 'success');
      }
      setDeptModalOpen(false);
      loadAllData();
    } catch (err: any) {
      triggerToast(err.message || 'Error saving department', 'error');
    }
  };

  const handleDeleteDept = async (id: string) => {
    if (!confirm('Are you sure you want to delete this department?')) return;
    try {
      await api.deleteDepartment(id);
      triggerToast('Department deleted', 'success');
      loadAllData();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to delete department. Does it have sub-departments?', 'error');
    }
  };

  // -------------------------------------------------------------
  // CATEGORIES HANDLERS
  // -------------------------------------------------------------
  const handleOpenCatModal = (cat?: AssetCategory) => {
    if (cat) {
      setEditCatId(cat.id);
      setCatName(cat.name);
      // Map customFields record to local helper array
      const mapped = Object.entries(cat.customFields || {}).map(([name, type]) => ({
        name,
        type: type as 'string' | 'number' | 'boolean',
      }));
      setCatFields(mapped);
    } else {
      setEditCatId(null);
      setCatName('');
      setCatFields([]);
    }
    setCatModalOpen(true);
  };

  const handleAddField = () => {
    if (!newFieldName.trim()) return;
    const formattedName = newFieldName.trim().replace(/\s+/g, ''); // no spaces in JSON key
    if (catFields.some((f) => f.name.toLowerCase() === formattedName.toLowerCase())) {
      triggerToast('Field name already exists', 'error');
      return;
    }
    setCatFields([...catFields, { name: formattedName, type: newFieldType }]);
    setNewFieldName('');
  };

  const handleRemoveField = (index: number) => {
    setCatFields(catFields.filter((_, i) => i !== index));
  };

  const handleSaveCat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName) return;

    // Convert local field list to standard Record<string, string> schema
    const schema: Record<string, string> = {};
    catFields.forEach((f) => {
      schema[f.name] = f.type;
    });

    try {
      if (editCatId) {
        await api.updateCategory(editCatId, { name: catName, customFields: schema });
        triggerToast('Category schema updated', 'success');
      } else {
        await api.createCategory({ name: catName, customFields: schema });
        triggerToast('Category registered', 'success');
      }
      setCatModalOpen(false);
      loadAllData();
    } catch (err: any) {
      triggerToast(err.message || 'Error saving category', 'error');
    }
  };

  // -------------------------------------------------------------
  // EMPLOYEE SECTOR & ROLE CHANGE
  // -------------------------------------------------------------
  const handleUpdateRole = async (empId: string, role: string) => {
    try {
      await api.updateEmployeeRole(empId, role);
      triggerToast('Employee role changed successfully', 'success');
      loadAllData();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to update employee role', 'error');
    }
  };

  const handleToggleEmpStatus = async (empId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await api.updateEmployeeStatus(empId, nextStatus);
      triggerToast(`Employee status toggled to ${nextStatus}`, 'success');
      loadAllData();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to toggle employee status', 'error');
    }
  };

  return (
    <div className="space-y-6 pt-2 animate-fade-in">
      {/* Tab Selectors */}
      <div className="flex border-b border-gray-200 gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('departments')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'departments'
              ? 'border-blue-600 text-blue-600 bg-blue-50/20'
              : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/50'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Department Management</span>
        </button>

        <button
          onClick={() => setActiveTab('categories')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'categories'
              ? 'border-blue-600 text-blue-600 bg-blue-50/20'
              : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/50'
          }`}
        >
          <Settings2 className="w-4 h-4" />
          <span>Category & Custom Fields</span>
        </button>

        <button
          onClick={() => setActiveTab('employees')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'employees'
              ? 'border-blue-600 text-blue-600 bg-blue-50/20'
              : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Employee Directory & Roles</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden p-6 shadow-sm">
          
          {/* TAB 1: DEPARTMENTS */}
          {activeTab === 'departments' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-gray-100">
                <div>
                  <h3 className="font-display font-bold text-lg text-gray-900">Department Hierarchy</h3>
                  <p className="text-sm text-gray-500">Construct departments, establish nesting relationships, and nominate department leaders.</p>
                </div>
                <button
                  onClick={() => handleOpenDeptModal()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Department</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Department Name</th>
                      <th className="py-3 px-4">Parent Scope</th>
                      <th className="py-3 px-4">Department Head</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {departments.map((dept) => {
                      const parent = departments.find((d) => d.id === dept.parentDepartmentId);
                      const head = employees.find((e) => e.id === dept.headEmployeeId);
                      return (
                        <tr key={dept.id} className="hover:bg-gray-55/50 text-gray-700 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-gray-900">{dept.name}</td>
                          <td className="py-3.5 px-4 text-gray-500 font-medium">{parent ? parent.name : <span className="text-gray-400 font-mono text-xs">Org Root</span>}</td>
                          <td className="py-3.5 px-4 text-gray-500 font-medium">{head ? head.name : <span className="text-gray-450 italic">No head assigned</span>}</td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                              dept.status === 'active' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                : 'bg-gray-100 text-gray-500 border-gray-200'
                            }`}>
                              {dept.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => handleOpenDeptModal(dept)}
                                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-gray-200"
                                title="Edit Department"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteDept(dept.id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-red-100"
                                title="Delete Department"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: CATEGORIES */}
          {activeTab === 'categories' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-gray-100">
                <div>
                  <h3 className="font-display font-bold text-lg text-gray-900">Asset Category Specifications</h3>
                  <p className="text-sm text-gray-500">Configure classification categories and define dynamic JSON attributes captured on asset registration.</p>
                </div>
                <button
                  onClick={() => handleOpenCatModal()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Asset Category</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories.map((cat) => (
                  <div key={cat.id} className="border border-gray-200 bg-gray-50/40 rounded-xl p-5 hover:border-gray-350 hover:bg-gray-50 transition-all flex flex-col justify-between shadow-2xs">
                    <div>
                      <div className="flex justify-between items-start">
                        <h4 className="font-display font-bold text-gray-900 text-base">{cat.name}</h4>
                        <button
                          onClick={() => handleOpenCatModal(cat)}
                          className="p-1.5 text-gray-400 hover:text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-all cursor-pointer shadow-3xs"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="mt-4 space-y-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Custom Fields Attribute Schema:</span>
                        {Object.entries(cat.customFields || {}).length === 0 ? (
                          <span className="text-xs text-gray-405 italic block">No custom attributes assigned (Standard catalog parameters only)</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {Object.entries(cat.customFields || {}).map(([key, type]) => (
                              <span key={key} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-200 rounded-md text-xs font-mono text-gray-700 shadow-3xs">
                                <span className="font-bold text-blue-600">{key}:</span>
                                <span className="text-gray-400 text-[10px] font-bold">{type as string}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: EMPLOYEES */}
          {activeTab === 'employees' && (
            <div className="space-y-4">
              <div className="pb-4 border-b border-gray-100">
                <h3 className="font-display font-bold text-lg text-gray-900">Employee Directory & Role Authorizations</h3>
                <p className="text-sm text-gray-500">Only from here can employee ranks be promoted to heads, asset managers, or system administrators.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4">Primary Department</th>
                      <th className="py-3 px-4">Authorization Role Rank</th>
                      <th className="py-3 px-4">Account Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {employees.map((emp) => {
                      const dept = departments.find((d) => d.id === emp.departmentId);
                      return (
                        <tr key={emp.id} className="hover:bg-gray-55/50 text-gray-700 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-gray-900">{emp.name}</td>
                          <td className="py-3.5 px-4 text-gray-500 font-mono text-xs">{emp.email}</td>
                          <td className="py-3.5 px-4 text-gray-500 font-medium">{dept ? dept.name : <span className="text-gray-400 italic">No department assigned</span>}</td>
                          <td className="py-3.5 px-4">
                            {emp.id === user.id ? (
                              <span className="text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg font-mono">
                                {emp.role} (You)
                              </span>
                            ) : (
                              <select
                                value={emp.role}
                                onChange={(e) => handleUpdateRole(emp.id, e.target.value)}
                                className="bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-lg px-2.5 py-1.5 text-xs outline-none font-mono cursor-pointer transition-all"
                              >
                                <option value="Employee">Employee</option>
                                <option value="DepartmentHead">DepartmentHead</option>
                                <option value="AssetManager">AssetManager</option>
                                <option value="Admin">Admin</option>
                              </select>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <button
                              disabled={emp.id === user.id}
                              onClick={() => handleToggleEmpStatus(emp.id, emp.status)}
                              className={`inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer py-1.5 px-3 rounded-lg border transition-colors ${
                                emp.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-250 hover:bg-emerald-100'
                                  : 'bg-red-50 text-red-700 border-red-250 hover:bg-red-100'
                              } disabled:opacity-40`}
                            >
                              {emp.status === 'active' ? (
                                <>
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Active</span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-3.5 h-3.5 text-red-600" />
                                  <span>Inactive</span>
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DEPARTMENT MODAL */}
      <Modal
        isOpen={deptModalOpen}
        onClose={() => setDeptModalOpen(false)}
        title={editDeptId ? 'Modify Department Configuration' : 'Establish New Department'}
      >
        <form onSubmit={handleSaveDept} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Department Name
            </label>
            <input
              type="text"
              required
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              placeholder="e.g. Research & Development"
              className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Parent Nesting Scope (Hierarchical Structure)
            </label>
            <select
              value={deptParentId}
              onChange={(e) => setDeptParentId(e.target.value)}
              className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
            >
              <option value="">None (Organization Root)</option>
              {departments
                .filter((d) => d.id !== editDeptId) // prevent self-referencing hierarchy loops
                .map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Nominated Department Head
            </label>
            <select
              value={deptHeadId}
              onChange={(e) => setDeptHeadId(e.target.value)}
              className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
            >
              <option value="">Unassigned</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.email})</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3 px-4 text-sm mt-4 transition-all shadow-xs"
          >
            {editDeptId ? 'Apply Update' : 'Generate Department'}
          </button>
        </form>
      </Modal>

      {/* CATEGORY MODAL */}
      <Modal
        isOpen={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title={editCatId ? 'Edit Catalog Classification' : 'Add New Category Catalog'}
        size="lg"
      >
        <form onSubmit={handleSaveCat} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Category Label Name
            </label>
            <input
              type="text"
              required
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="e.g. Workstations"
              className="w-full bg-gray-55 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 px-4 text-sm outline-none transition-all"
            />
          </div>

          {/* Dynamic Field Config section */}
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50">
            <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              Configure Custom Catalog Attributes:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end mb-4">
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Attribute Key Name (No Spaces)
                </label>
                <input
                  type="text"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder="e.g. warrantyInMonths"
                  className="w-full bg-white border border-gray-200 focus:border-blue-500 text-gray-900 rounded-lg py-2 px-3 text-xs outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Value Type Format
                </label>
                <div className="flex gap-2">
                  <select
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value as any)}
                    className="flex-1 bg-white border border-gray-200 focus:border-blue-500 text-gray-900 rounded-lg py-2 px-2 text-xs outline-none cursor-pointer"
                  >
                    <option value="string">Text (String)</option>
                    <option value="number">Numeric (Number)</option>
                    <option value="boolean">Toggle (Boolean)</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddField}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Fields list */}
            <div className="space-y-1.5">
              {catFields.length === 0 ? (
                <span className="text-xs text-gray-400 italic block text-center py-4 bg-white border border-dashed border-gray-200 rounded-lg font-medium">
                  No custom fields cataloged yet. Asset records will only store standard serial, tagging, and location fields.
                </span>
              ) : (
                <div className="divide-y divide-gray-100 bg-white border border-gray-200 rounded-lg overflow-hidden shadow-2xs">
                  {catFields.map((field, index) => (
                    <div key={index} className="flex justify-between items-center px-4 py-2.5 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <Hash className="w-3.5 h-3.5 text-gray-400" />
                        <span className="font-mono text-xs text-gray-800 font-bold">{field.name}</span>
                        <span className="text-[10px] bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded-md font-mono font-bold uppercase">{field.type}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveField(index)}
                        className="text-gray-400 hover:text-red-600 text-xs font-bold transition-colors cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3 px-4 text-sm transition-all shadow-xs"
          >
            {editCatId ? 'Save Schema Specification' : 'Register Catalog Classification'}
          </button>
        </form>
      </Modal>

    </div>
  );
};
