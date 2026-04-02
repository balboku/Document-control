import React, { useState, useEffect } from 'react';
import { getSettingsCategories, createSettingsCategory, updateSettingsCategory } from '../../services/api';
import { Layers, Save, Check } from 'lucide-react';
import LoadingSpinner from '../common/LoadingSpinner';

export default function CategoryManagement() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ name: '', description: '' });

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    
    try {
      await createSettingsCategory({ ...formData, sort_order: categories.length });
      setFormData({ name: '', description: '' });
      fetchCategories();
    } catch (error) {
      alert(error.response?.data?.detail || 'Add category failed');
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

  if (loading) return <div className="p-8"><LoadingSpinner /></div>;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-bold text-slate-800">文件類別設定</h3>
        <p className="text-sm text-slate-500 mt-1">設定系統支援的文件類別選項供 AI 分類與操作者選擇</p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-4 items-end bg-slate-50 p-6 rounded-xl border border-slate-200">
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-700 mb-1">類別名稱 *</label>
          <input 
            type="text" required
            value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
            placeholder="例如: SOP (標準作業程序)"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-700 mb-1">描述 (可選)</label>
          <input 
            type="text"
            value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
            placeholder="此類別的簡單說明"
          />
        </div>
        <button type="submit" className="flex items-center justify-center px-6 py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition shadow-sm h-[42px]">
          <Layers className="w-4 h-4 mr-2" /> 新增類別
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map(cat => (
          <div key={cat.id} className={`p-5 rounded-xl border ${cat.is_active ? 'border-primary-100 bg-white shadow-sm ring-1 ring-primary-500/5' : 'border-slate-200 bg-slate-50 opacity-60'} flex items-start justify-between transition-all`}>
            <div>
              <h4 className={`font-semibold ${cat.is_active ? 'text-slate-800' : 'text-slate-500'}`}>{cat.name}</h4>
              <p className="text-sm text-slate-500 mt-1">{cat.description || '無描述'}</p>
            </div>
            <button 
              onClick={() => handleToggle(cat)}
              className={`p-2 rounded-lg transition-colors ${cat.is_active ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-200'}`}
              title={cat.is_active ? "點擊停用" : "點擊啟用"}
            >
              {cat.is_active ? <Check className="w-5 h-5" /> : <div className="w-5 h-5 border-2 border-current rounded" />}
            </button>
          </div>
        ))}
        {categories.length === 0 && (
          <div className="col-span-2 py-12 text-center text-slate-500 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
            尚未設定任何文件類別
          </div>
        )}
      </div>
    </div>
  );
}
