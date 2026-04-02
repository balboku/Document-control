import React, { useState, useEffect } from 'react';
import { getNumberFormat, updateNumberFormat } from '../../services/api';
import { FileDigit, Save } from 'lucide-react';
import LoadingSpinner from '../common/LoadingSpinner';

export default function NumberFormatSetting() {
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
    fetchFormat();
  }, []);

  const fetchFormat = async () => {
    try {
      const data = await getNumberFormat();
      setFormat(data);
      setPrefix(data.prefix);
      setSeparator(data.separator);
      setYearFormat(data.year_format);
      setDigits(data.sequence_digits);
      setPreview(data.example);
    } catch (error) {
      console.error('Failed to fetch format:', error);
    } finally {
      setLoading(false);
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
      const data = await updateNumberFormat({
        prefix, separator, year_format: yearFormat, sequence_digits: digits
      });
      setFormat(data);
      alert('設定已儲存成功！');
    } catch (error) {
      console.error('Failed to save format', error);
      alert('儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8"><LoadingSpinner /></div>;

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h3 className="text-xl font-bold text-slate-800">文件編號格式設定</h3>
        <p className="text-sm text-slate-500 mt-1">自訂歸檔文件的流水號產生規則。系統啟動時會從目前的流水號繼續累加，年份改變時會自動歸零重算。</p>
      </div>

      {/* Preview Card */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-2xl p-8 text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 text-primary-500/30">
          <FileDigit className="w-40 h-40" />
        </div>
        <div className="relative z-10">
          <p className="text-primary-100 font-medium text-sm mb-2 uppercase tracking-wider">預覽格式 (PREVIEW FORMAT)</p>
          <div className="text-4xl md:text-5xl font-mono font-bold tracking-tight">
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
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500"
              placeholder="DOC"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">分隔符號 (Separator)</label>
            <input 
              type="text" value={separator} onChange={e => setSeparator(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500"
              placeholder="-"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">年份格式</label>
            <select 
              value={yearFormat} onChange={e => setYearFormat(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500"
            >
              <option value="YYYY">西元年 4碼 (YYYY)</option>
              <option value="YY">西元年 2碼 (YY)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">流水號位數</label>
            <select 
              value={digits} onChange={e => setDigits(Number(e.target.value))}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500"
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
            className="flex items-center px-6 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition shadow-sm font-medium disabled:opacity-50"
          >
            {saving ? <LoadingSpinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {saving ? '儲存中...' : '儲存設定'}
          </button>
        </div>
      </div>
    </div>
  );
}
