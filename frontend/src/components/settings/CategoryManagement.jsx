import React, { useState, useEffect } from 'react';
import { 
  getSettingsCategories, createSettingsCategory, updateSettingsCategory, deleteSettingsCategory 
} from '../../services/api';
import { Layers, Save, Check, Edit2, Trash2, X, PlusCircle } from 'lucide-react';
import LoadingSpinner from '../common/LoadingSpinner';
import { clsx } from 'clsx';

export default function CategoryManagement() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState('create');
  const [editingCatId, setEditingCatId] = useState(null);
  
  const [formData, setFormData] = useState({ name: '', description: '', is_active: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const data = await getSettingsCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setMode('create');
    setFormData({ name: '', description: '', is_active: true });
    setShowForm(true);
  };

  const handleOpenEdit = (cat) => {
    setMode('edit');
    setEditingCatId(cat.id);
    setFormData({ 
      name: cat.name, 
      description: cat.description || '',
      is_active: cat.is_active
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    
    setSaving(true);
    try {
      if (mode === 'create') {
        await createSettingsCategory({ ...formData, sort_order: categories.length });
      } else {
        await updateSettingsCategory(editingCatId, formData);
      }
      setFormData({ name: '', description: '', is_active: true });
      setShowForm(false);
      fetchCategories();
    } catch (error) {
      alert(error.response?.data?.detail || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat) => {
    if (!window.confirm(`確定要刪除類別「${cat.name}」嗎？\n以此類別分類的文件可能會失去分類屬性。`)) return;
    
    try {
      await deleteSettingsCategory(cat.id);
      fetchCategories();
    } catch (error) {
      alert(error.response?.data?.detail || '刪除失敗');
    }
  };

  const handleToggle = async (cat) => {
    try {
      await updateSettingsCategory(cat.id, { is_active: !cat.is_active });
      fetchCategories();
    } catch (error) {
      console.error('Failed to toggle category:', error);
    }
  };

  if (loading) return <div className="p-8 flex justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-slate-800 tracking-tight">文件類別設定</h3>
          <p className="text-sm text-slate-500 mt-1 font-medium">供 AI 分類與操作者選擇的文件標準分類系統</p>
        </div>
        {!showForm && (
          <button 
            onClick={handleOpenAdd}
            className="flex items-center px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition shadow-sm text-sm font-bold active:scale-95"
          >
            <PlusCircle className="w-4 h-4 mr-2" /> 新增類別
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border-2 border-primary-100 shadow-xl shadow-primary-500/5 animate-in slide-in-from-top-2 duration-200">
           <div className="flex items-center justify-between mb-5">
             <h4 className="font-bold text-slate-800 text-lg">{mode === 'create' ? '新增類別' : '編輯類別'}</h4>
             <button type="button" onClick={() => setShowForm(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-5 h-5" />
             </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="flex-1">
              <label className="block text-sm font-bold text-slate-700 mb-1.5">類別名稱 <span className="text-red-500">*</span></label>
              <input 
                type="text" required
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                placeholder="例如: SOP (標準作業程序)"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-bold text-slate-700 mb-1.5">描述 (可選)</label>
              <input 
                type="text"
                value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                placeholder="此類別的簡單說明"
              />
            </div>
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
                   {formData.is_active && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
                <span className="text-sm font-bold text-slate-700">啟用此類別</span>
             </label>
          </div>

           <div className="mt-6 flex justify-end space-x-3">
            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-bold transition">取消</button>
            <button 
               type="submit" 
               disabled={saving}
               className="flex items-center px-6 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-sm font-bold transition-all shadow-lg shadow-slate-200 active:scale-95 disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" /> 儲存變更
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {categories.map(cat => (
          <div key={cat.id} className={clsx(
            "group p-5 rounded-2xl border-2 transition-all duration-300 relative overflow-hidden",
            cat.is_active 
              ? "border-primary-50 bg-white shadow-sm shadow-primary-100 hover:shadow-xl hover:shadow-primary-500/10 hover:border-primary-200" 
              : "border-slate-100 bg-slate-50 opacity-60"
          )}>
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0 pr-12">
                <div className="flex items-center space-x-2">
                   <Layers className={clsx("w-4 h-4", cat.is_active ? "text-primary-600" : "text-slate-400")} />
                   <h4 className="font-extrabold text-slate-800 truncate">{cat.name}</h4>
                </div>
                <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">{cat.description || '無詳細描述內容'}</p>
              </div>
              
              <div className="absolute top-4 right-4 flex flex-col space-y-2 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button 
                  onClick={() => handleToggle(cat)}
                  className={clsx(
                    "p-2 rounded-lg transition-all shadow-sm border",
                    cat.is_active ? "text-emerald-600 bg-white border-emerald-50 hover:bg-emerald-600 hover:text-white" : "text-slate-400 bg-white border-slate-100 hover:bg-primary-600 hover:text-white"
                  )}
                  title={cat.is_active ? "點擊停用" : "點擊啟用"}
                >
                  <Check className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleOpenEdit(cat)}
                  className="p-2 bg-white text-slate-400 hover:text-primary-600 border border-slate-100 rounded-lg hover:border-primary-100 shadow-sm transition-all"
                  title="編輯"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDelete(cat)}
                  className="p-2 bg-white text-slate-400 hover:text-red-500 border border-slate-100 rounded-lg hover:border-red-100 shadow-sm transition-all"
                  title="徹底刪除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {categories.length === 0 && (
          <div className="col-span-2 py-20 text-center text-slate-400 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200 animate-pulse">
            <Layers className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <span className="font-bold">尚未設定任何文件類別系統</span>
          </div>
        )}
      </div>
    </div>
  );
}
