import React, { useState, useEffect } from 'react';
import { getSettingsUsers, createSettingsUser, updateSettingsUser } from '../../services/api';
import { UserPlus, Save, X, Edit2, ShieldAlert } from 'lucide-react';
import LoadingSpinner from '../common/LoadingSpinner';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({ name: '', department: '' });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await getSettingsUsers();
      setUsers(data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    
    try {
      await createSettingsUser(formData);
      setFormData({ name: '', department: '' });
      setShowAddForm(false);
      fetchUsers();
    } catch (error) {
      console.error('Failed to add user:', error);
    }
  };

  const handleToggleActive = async (user) => {
    try {
      await updateSettingsUser(user.id, { is_active: !user.is_active });
      fetchUsers();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  if (loading) return <div className="p-8"><LoadingSpinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-slate-800">使用者管理</h3>
          <p className="text-sm text-slate-500 mt-1">管理可執行文件操作與歸檔人員清單</p>
        </div>
        <button 
          onClick={() => setShowAddForm(true)}
          className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition shadow-sm text-sm font-medium"
        >
          <UserPlus className="w-4 h-4 mr-2" /> 新增使用者
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddSubmit} className="bg-slate-50 p-6 rounded-xl border border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">姓名 *</label>
              <input 
                type="text" required
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                placeholder="例如: 王小明"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">部門</label>
              <input 
                type="text"
                value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                placeholder="例如: 品質保證部"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end space-x-3">
            <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition">取消</button>
            <button type="submit" className="flex items-center px-4 py-2 bg-slate-800 text-white hover:bg-slate-900 rounded-lg text-sm font-medium transition shadow-sm">
              <Save className="w-4 h-4 mr-2" /> 儲存
            </button>
          </div>
        </form>
      )}

      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">姓名</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">部門</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">狀態</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {users.length === 0 ? (
              <tr><td colSpan="4" className="px-6 py-8 text-center text-slate-400">尚無使用者紀錄</td></tr>
            ) : users.map(user => (
              <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{user.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{user.department || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'}`}>
                    {user.is_active ? '啟用中' : '已停用'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button onClick={() => handleToggleActive(user)} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${user.is_active ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                    {user.is_active ? '停用' : '啟用'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
