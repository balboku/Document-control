import React, { useState, useEffect } from 'react';
import { createDocumentCard, getSettingsUsers, getSettingsCategories } from '../../services/api';
import { X, FileText, CheckCircle, Sparkles, Loader2, Save } from 'lucide-react';

export default function DocumentUpload({ onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);

  const [formData, setFormData] = useState({
    title: '',
    authorId: '',
    categoryId: '',
    keywords: [],
    notes: '',
    status: 'draft'
  });

  useEffect(() => {
    async function fetchOptions() {
      setLoading(true);
      try {
        const [u, c] = await Promise.all([getSettingsUsers(true), getSettingsCategories(true)]);
        setUsers(u);
        setCategories(c);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchOptions();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title) return alert("請輸入文件名稱");
    
    setSubmitting(true);
    try {
      await createDocumentCard({
        title: formData.title,
        author_id: formData.authorId || null,
        category_id: formData.categoryId || null,
        keywords: formData.keywords,
        notes: formData.notes,
        status: formData.status
      });
      onSuccess();
    } catch (err) {
      console.error(err);
      alert("建立失敗: " + (err.response?.data?.detail || "未知錯誤"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden transition-all duration-500">
        
        {/* Header */}
        <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600 mr-3">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">建立新文件卡片</h2>
              <p className="text-sm text-slate-500 mt-1">先建立文件資訊，稍後再掛載檔案</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6">
          {loading ? (
            <div className="py-20 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">文件標題 *</label>
                <input 
                  type="text" 
                  required
                  value={formData.title} 
                  onChange={e => setFormData({...formData, title: e.target.value})} 
                  placeholder="輸入文件名稱或標題"
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 transition-all font-medium" 
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">製定人 (Author)</label>
                  <select 
                    value={formData.authorId} 
                    onChange={e => setFormData({...formData, authorId: e.target.value})} 
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 transition-all font-medium"
                  >
                    <option value="">(未指定)</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">檔案類別</label>
                  <select 
                    value={formData.categoryId} 
                    onChange={e => setFormData({...formData, categoryId: e.target.value})} 
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 transition-all font-medium"
                  >
                    <option value="">(未指定)</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">關鍵字 (逗號分隔)</label>
                <input 
                  type="text" 
                  value={formData.keywords.join(', ')} 
                  onChange={e => setFormData({...formData, keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k)})} 
                  placeholder="例如: 規範, 製程, QC"
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 transition-all text-sm font-medium" 
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">文件摘要/備註</label>
                <textarea 
                  value={formData.notes} 
                  onChange={e => setFormData({...formData, notes: e.target.value})} 
                  rows="4" 
                  placeholder="對此文件的描述或相關備註..."
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 transition-all text-sm leading-relaxed" 
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">初始狀態</label>
                <div className="flex space-x-4">
                  {['draft', 'reserved'].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFormData({...formData, status: s})}
                      className={`px-6 py-2 rounded-xl text-sm font-bold border transition-all ${
                        formData.status === s ? 'bg-primary-50 border-primary-200 text-primary-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {s === 'draft' ? '草稿 (Draft)' : '預約 (Reserved)'}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </form>

        <div className="px-8 py-6 border-t border-slate-100 flex justify-end items-center bg-slate-50/50">
           <div className="flex space-x-3">
              <button 
                onClick={onClose}
                className="px-6 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-2xl transition"
              >
                取消
              </button>
              <button 
                onClick={handleSubmit}
                disabled={submitting || loading}
                className="px-10 py-3 bg-primary-600 text-white font-bold rounded-2xl hover:bg-primary-700 transition shadow-lg hover:shadow-primary-200 transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 flex items-center"
              >
                {submitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                建立卡片
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}
