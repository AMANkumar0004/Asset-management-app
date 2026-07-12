import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { Department } from '../types.js';
import { motion } from 'motion/react';
import { Mail, Lock, User, Building, ArrowRight, ShieldCheck } from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const { login, signup } = useApp();
  const [isLogin, setIsLogin] = useState(true);
  
  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch active departments for signup
    api.getDepartments()
      .then((data) => setDepartments(data.filter((d: Department) => d.status === 'active')))
      .catch((err) => console.error('Failed to load departments', err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (isLogin) {
        await login({ email, password });
      } else {
        await signup({ name, email, password, departmentId: departmentId || null });
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = () => {
    setIsLogin(!isLogin);
    setError(null);
    setEmail('');
    setPassword('');
    setName('');
    setDepartmentId('');
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 bg-blue-600 rounded-2xl items-center justify-center shadow-md mb-3">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="font-display font-bold text-3xl text-gray-900 tracking-tight">
            Asset<span className="text-blue-600">Flow</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Enterprise Asset & Resource Management System
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 animate-fade-in">
          <h2 className="font-display font-bold text-xl text-gray-900 mb-6 text-center">
            {isLogin ? 'Sign in to ERP Console' : 'Register ERP Employee Account'}
          </h2>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-6">
              <p className="text-red-700 text-xs sm:text-sm text-center font-bold">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-450">
                    <User className="w-5 h-5" />
                  </span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 pl-11 pr-4 text-sm outline-none transition-all"
                    placeholder="Alice Smith"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Work Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-450">
                  <Mail className="w-5 h-5" />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 pl-11 pr-4 text-sm outline-none transition-all"
                  placeholder="name@organization.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-450">
                  <Lock className="w-5 h-5" />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 pl-11 pr-4 text-sm outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {!isLogin && (
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Department Assign
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-450">
                    <Building className="w-5 h-5" />
                  </span>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 rounded-xl py-3 pl-11 pr-4 text-sm outline-none transition-all appearance-none"
                  >
                    <option value="">Unassigned (None)</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3.5 px-4 text-sm transition-all flex items-center justify-center gap-2 mt-6 cursor-pointer disabled:opacity-50 shadow-xs"
            >
              <span>{submitting ? 'Authenticating...' : isLogin ? 'Sign In' : 'Create Account'}</span>
              {!submitting && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          {/* Quick Info for Demo Credentials */}
          {isLogin && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-gray-500 text-[11px] space-y-1 font-mono">
                <span className="text-blue-600 font-bold block uppercase tracking-wider text-[9px] mb-1">Demo Logins (Password: "password")</span>
                <div>Admin: <span className="text-gray-700">admin@assetflow.com</span></div>
                <div>Manager: <span className="text-gray-700">manager@assetflow.com</span></div>
                <div>Head: <span className="text-gray-700">charlie@assetflow.com</span></div>
                <div>Employee: <span className="text-gray-700">diane@assetflow.com</span></div>
              </div>
            </div>
          )}

          {/* Bottom Switch */}
          <div className="mt-6 text-center">
            <button
              onClick={handleToggle}
              className="text-sm text-blue-600 hover:text-blue-700 font-bold bg-transparent border-none cursor-pointer"
            >
              {isLogin ? "Don't have an account? Sign Up" : 'Already registered? Sign In'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
