import React, { useState, useEffect } from 'react';
import { 
  getSettingsUsers, createSettingsUser, updateSettingsUser, deleteSettingsUser 
} from '../../services/api';
import { UserPlus, Save, X, Edit2, Trash2, CheckCircle, XCircle } from 'lucide-react';
import LoadingSpinner from '../common/LoadingSpinner';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState('create'); // 'create' or 'edit'
  const [editingUserId, setEditingUserId] = useState(null);
  
  const [formData, setFormData] = useState({ name: '', department: '', is_active: true, role: 'editor' });
  const [saving, setSaving] = useState(false);

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

  const handleOpenAdd = () => {
    setMode('create');
    setFormData({ name: '', department: '', is_active: true, role: 'editor' });
    setShowForm(true);
  };

  const handleOpenEdit = (user) => {
    setMode('edit');
    setEditingUserId(user.id);
    setFormData({ 
      name: user.name, 
      department: user.department || '',
      is_active: user.is_active,
      role: user.role || 'editor'
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    
    setSaving(true);
    try {
      if (mode === 'create') {
        await createSettingsUser(formData);
      } else {
        await updateSettingsUser(editingUserId, formData);
      }
      setFormData({ name: '', department: '', is_active: true, role: 'editor' });
      setShowForm(false);
      fetchUsers();
    } catch (error) {
      alert(error.response?.data?.detail || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`確定要刪除使用者「${user.name}」嗎？`)) return;
    
    try {
      await deleteSettingsUser(user.id);
      fetchUsers();
    } catch (error) {
      alert(error.response?.data?.detail || '刪除失敗');
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

  if (loading) return <div className="p-8 flex justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-slate-800 tracking-tight">使用者管理</h3>
          <p className="text-sm text-slate-500 mt-1 font-medium">管理可執行文件操作與歸檔人員清單</p>
        </div>
        {!showForm && (
          <button 
            onClick={handleOpenAdd}
            className="flex items-center px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-all shadow-sm text-sm font-bold active:scale-95"
          >
            <UserPlus className="w-4 h-4 mr-2" /> 新增使用者
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border-2 border-primary-100 shadow-xl shadow-primary-500/5 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-5">
             <h4 className="font-bold text-slate-800 text-lg">{mode === 'create' ? '新增使用者' : '編輯使用者'}</h4>
             <button type="button" onClick={() => setShowForm(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-5 h-5" />
             </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">姓名 <span className="text-red-500">*</span></label>
              <input 
                type="text" required
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                placeholder="例如: 王小明"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">部門</label>
              <input 
                type="text"
                value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                placeholder="例如: 品質保證部"
              />
            </div>
          </div>

          <div className="mt-5">
            <label className="block text-sm font-bold text-slate-700 mb-1.5">權限角色 <span className="text-red-500">*</span></label>
            <select 
              value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}
              className="w-full md:w-1/2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
            >
              <option value="admin">系統管理員 (Admin)</option>
              <option value="editor">編輯人員 (Editor)</option>
              <option value="viewer">檢視人員 (Viewer)</option>
            </select>
          </div>
          
          <div className="mt-5 flex items-center">
             <label className="flex items-center cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={formData.is_active} 
                  onChange={e => setFormData({...formData, is_active: e.target.checked})}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded-md border-2 mr-2 flex items-center justify-center transition-all ${formData.is_active ? 'bg-primary-600 border-primary-600' : 'border-slate-300 group-hover:border-primary-500'}`}>
                   {formData.is_active && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                </div>
                <span className="text-sm font-bold text-slate-700">帳號啟用中</span>
             </label>
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-bold transition">取消</button>
            <button 
               type="submit" 
               disabled={saving}
               className="flex items-center px-6 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-sm font-bold transition-all shadow-lg shadow-slate-200 active:scale-95 disabled:opacity-50"
            >
              {saving ? '儲存中...' : (
                <><Save className="w-4 h-4 mr-2" /> 儲存變更</>
              )}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50/50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">姓名</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">部門</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">角色</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">狀態</th>
              <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-widest">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {users.length === 0 ? (
              <tr><td colSpan="4" className="px-6 py-12 text-center text-slate-400 font-medium">尚無使用者紀錄</td></tr>
            ) : users.map(user => (
              <tr key={user.id} className="hover:bg-primary-50/20 transition-colors group">
                <td className="px-6 py-5 whitespace-nowrap">
                   <div className="text-sm font-bold text-slate-900">{user.name}</div>
                </td>
                <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-slate-500">{user.department || '-'}</td>
                <td className="px-6 py-5 whitespace-nowrap">
                  {user.role === 'admin' && <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-700">管理員</span>}
                  {user.role === 'editor' && <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-700">編輯員</span>}
                  {user.role === 'viewer' && <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600">檢視員</span>}
                </td>
                <td className="px-6 py-5 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${user.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {user.is_active ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                    {user.is_active ? '啟用中' : '已停用'}
                  </span>
                </td>
                <td className="px-6 py-5 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => handleOpenEdit(user)} 
                      className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                      title="編輯"
                    >
                       <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleToggleActive(user)} 
                      className={`p-2 transition-colors rounded-lg font-bold ${user.is_active ? 'text-rose-400 hover:text-rose-600 hover:bg-rose-50' : 'text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                      title={user.is_active ? '停用' : '啟用'}
                    >
                       {user.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                    </button>
                    <button 
                       onClick={() => handleDelete(user)}
                       className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                       title="徹底刪除"
                    >
                       <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
