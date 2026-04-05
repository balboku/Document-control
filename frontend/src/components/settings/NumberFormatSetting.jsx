import React, { useState, useEffect } from 'react';
import { getNumberFormat, updateNumberFormat, getSettingsCategories } from '../../services/api';
import { FileDigit, Save, Layers } from 'lucide-react';
import LoadingSpinner from '../common/LoadingSpinner';

export default function NumberFormatSetting() {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  
  const [format, setFormat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState('');

  // Form states
  const [prefix, setPrefix] = useState('');
  const [separator, setSeparator] = useState('');
  const [yearFormat, setYearFormat] = useState('');
  const [digits, setDigits] = useState(4);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (!loading) {
      fetchFormat(selectedCategory);
    }
  }, [selectedCategory]);

  const fetchInitialData = async () => {
    try {
      const cats = await getSettingsCategories(true); // Active only
      setCategories(cats);
      await fetchFormat('');
    } catch (error) {
      console.error('Failed to fetch initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFormat = async (categoryId) => {
    try {
      const data = await getNumberFormat(categoryId || null);
      setFormat(data);
      setPrefix(data.prefix);
      setSeparator(data.separator);
      setYearFormat(data.year_format);
      setDigits(data.sequence_digits);
      setPreview(data.example);
    } catch (error) {
      console.error('Failed to fetch format:', error);
    }
  };

  // Live preview update
  useEffect(() => {
    if (loading) return;
    const yearStr = yearFormat === 'YY' ? new Date().getFullYear().toString().slice(-2) : new Date().getFullYear().toString();
    const seq = "1".padStart(digits, '0');
    setPreview(`${prefix}${separator}${yearStr}${separator}${seq}`);
  }, [prefix, separator, yearFormat, digits, loading]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        prefix, 
        separator, 
        year_format: yearFormat, 
        sequence_digits: digits,
        category_id: selectedCategory || null
      };
      const data = await updateNumberFormat(payload);
      setFormat(data);
      alert('設定已儲存成功！');
    } catch (error) {
      console.error('Failed to save format', error);
      alert('儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 flex justify-center"><LoadingSpinner /></div>;

  return (
    <div className="max-w-2xl space-y-8 animate-in fade-in duration-300">
      <div>
        <h3 className="text-xl font-bold text-slate-800 tracking-tight">文件編號格式設定</h3>
        <p className="text-sm text-slate-500 mt-1 font-medium">自訂歸檔文件的流水號產生規則。系統啟動時會從目前的流水號繼續累加，年份改變時會自動歸零重算。</p>
      </div>

      {/* Category Selector */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
        <div className="p-3 bg-primary-50 rounded-xl">
           <Layers className="w-5 h-5 text-primary-600" />
        </div>
        <div className="flex-1">
           <label className="block text-sm font-bold text-slate-700 mb-1">目標分類格式</label>
           <select 
              value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500 font-medium"
           >
              <option value="">🌍 全域預設格式 (Global Default)</option>
              {categories.map(c => (
                 <option key={c.id} value={c.id}>📁 {c.name}</option>
              ))}
           </select>
        </div>
      </div>

      {/* Preview Card */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-2xl p-8 text-white shadow-lg shadow-primary-500/20 relative overflow-hidden transition-all duration-300">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 text-primary-500/30">
          <FileDigit className="w-40 h-40" />
        </div>
        <div className="relative z-10">
          <p className="text-primary-100 font-bold text-sm mb-2 uppercase tracking-widest">
             {selectedCategory ? '專屬分類預覽格式' : '預覽格式 (PREVIEW FORMAT)'}
          </p>
          <div className="text-4xl md:text-5xl font-mono font-bold tracking-tight drop-shadow-md">
            {preview}
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">前綴 (Prefix)</label>
            <input 
              type="text" value={prefix} onChange={e => setPrefix(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500 font-mono font-semibold text-lg"
              placeholder="DOC"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">分隔符號 (Separator)</label>
            <input 
              type="text" value={separator} onChange={e => setSeparator(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500 font-mono font-bold text-lg text-center"
              placeholder="-"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">年份格式</label>
            <select 
              value={yearFormat} onChange={e => setYearFormat(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500 font-medium"
            >
              <option value="YYYY">西元年 4碼 (YYYY)</option>
              <option value="YY">西元年 2碼 (YY)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">流水號位數</label>
            <select 
              value={digits} onChange={e => setDigits(Number(e.target.value))}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500 font-medium"
            >
              <option value={3}>3位數 (001~999)</option>
              <option value={4}>4位數 (0001~9999)</option>
              <option value={5}>5位數 (00001~99999)</option>
            </select>
          </div>
        </div>
        
        <div className="pt-6 border-t border-slate-100 flex justify-end">
          <button 
            onClick={handleSave} disabled={saving}
            className="flex items-center px-6 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-bold shadow-lg shadow-slate-200 active:scale-95 disabled:opacity-50"
          >
            {saving ? <LoadingSpinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {saving ? '儲存中...' : '儲存設定'}
          </button>
        </div>
      </div>
    </div>
  );
}
