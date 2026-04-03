import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Library, Search, ChevronRight, X } from 'lucide-react';
import { getMdfProjects, createMdfProject } from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function MdfList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // New Project Form
  const [formData, setFormData] = useState({
    product_name: '',
    project_no: '',
    classification: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const data = await getMdfProjects();
      setProjects(data);
    } catch (e) {
      console.error('Fetch MDF projects failed', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createMdfProject(formData);
      setShowModal(false);
      setFormData({ product_name: '', project_no: '', classification: '' });
      fetchProjects();
    } catch (err) {
      setError(err.response?.data?.detail || '建立專案失敗');
    } finally {
      setSaving(false);
    }
  };

  const filteredProjects = projects.filter(p => 
    p.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.project_no.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">醫療器材檔案 (MDF) 管理</h1>
          <p className="text-slate-500 mt-1">管理各項次醫療器材標準文件與技術文件 (Technical File)</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center justify-center px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-all duration-200 shadow-sm font-medium"
        >
          <Plus className="w-5 h-5 mr-2" />
          新增 MDF 專案
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input 
              type="text" 
              placeholder="搜尋產品名稱或專案編號..." 
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-shadow"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-x-auto">
          {loading ? (
            <div className="p-20 flex justify-center"><LoadingSpinner /></div>
          ) : filteredProjects.length === 0 ? (
            <div className="p-20 flex flex-col items-center text-center">
              <Library className="w-16 h-16 text-slate-200 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900">尚無專案</h3>
              <p className="text-slate-500 max-w-sm mt-1">目前還沒有建立任何醫療器材檔案專案。請點擊「新增 MDF 專案」開始。</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">產品資訊</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">專案編號</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">分級分類</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">建立日期</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-widest text-transparent">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredProjects.map((project) => (
                  <tr 
                    key={project.id} 
                    className="hover:bg-primary-50/30 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/mdf/${project.id}`)}
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center mr-3 group-hover:scale-110 transition-transform">
                          <Library className="w-5 h-5 text-primary-700" />
                        </div>
                        <div className="text-sm font-bold text-slate-900">{project.product_name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-xs font-mono bg-slate-100 px-2.5 py-1 rounded-md text-slate-700">{project.project_no}</span>
                    </td>
                    <td className="px-6 py-5 text-sm text-slate-600">
                      {project.classification || '-'}
                    </td>
                    <td className="px-6 py-5 text-sm text-slate-500">
                      {new Date(project.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <ChevronRight className="w-5 h-5 ml-auto text-slate-300 group-hover:text-primary-500 transform group-hover:translate-x-1 transition-all" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative z-10 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-900">新增 MDF 專案</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleCreate} className="p-6 space-y-5">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 font-medium">
                  {error}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">產品名稱 <span className="text-red-500">*</span></label>
                <input 
                  type="text" required
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                  placeholder="例如：Disposable Infusion Pump"
                  value={formData.product_name}
                  onChange={e => setFormData({...formData, product_name: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">專案編號 <span className="text-red-500">*</span></label>
                <input 
                  type="text" required
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                  placeholder="例如：MDF-2024-001"
                  value={formData.project_no}
                  onChange={e => setFormData({...formData, project_no: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">分級分類</label>
                <input 
                  type="text"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                  placeholder="例如：Class II, Rule 9"
                  value={formData.classification}
                  onChange={e => setFormData({...formData, classification: e.target.value})}
                />
              </div>

              <div className="pt-2 flex space-x-3">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors font-medium"
                >
                  取消
                </button>
                <button 
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-all font-medium shadow-sm"
                >
                  {saving ? '處理中...' : '確認建立'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
