import React, { useState, useEffect } from 'react';
import { getDocuments, exportDocumentListCSV, exportDocumentListExcel, getSettingsUsers, getSettingsCategories } from '../services/api';
import DocumentUpload from '../components/documents/DocumentUpload';
import DocumentDetailModal from '../components/documents/DocumentDetailModal';
import StatusBadge from '../components/common/StatusBadge';
import FileIcon from '../components/common/FileIcon';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { format } from 'date-fns';
import { Filter, Search, Download, Plus, Layers, User, MoreVertical, FileText } from 'lucide-react';

export default function DocumentList() {
  const [documents, setDocuments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Options
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    fetchOptions();
  }, []);

  useEffect(() => {
    fetchData();
  }, [page, statusFilter, authorFilter, categoryFilter, searchTerm]);

  const fetchOptions = async () => {
    try {
      const [u, c] = await Promise.all([getSettingsUsers(), getSettingsCategories()]);
      setUsers(u);
      setCategories(c);
    } catch (e) { console.error(e); }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getDocuments({
        page, 
        page_size: 10,
        search: searchTerm || undefined,
        status: statusFilter || undefined,
        author_id: authorFilter || undefined,
        category_id: categoryFilter || undefined
      });
      setDocuments(data.items);
      setTotal(data.total);
    } catch (error) {
      console.error('Fetch docs error', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    const filters = { search: searchTerm, status: statusFilter, author_id: authorFilter, category_id: categoryFilter };
    if (format === 'csv') await exportDocumentListCSV({ filters });
    else await exportDocumentListExcel({ filters });
  };

  return (
    <div className="animate-in fade-in duration-500 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800">文件清單</h2>
        <div className="flex space-x-3">
          <div className="relative group">
            <button className="flex items-center px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition shadow-sm font-medium text-sm">
              <Download className="w-4 h-4 mr-2" /> 匯出清單
            </button>
            <div className="absolute right-0 mt-2 w-32 bg-white rounded-xl shadow-lg border border-slate-100 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity z-10">
              <button onClick={() => handleExport('csv')} className="block w-full text-left px-4 py-2 hover:bg-slate-50 text-sm">CSV 格式</button>
              <button onClick={() => handleExport('xlsx')} className="block w-full text-left px-4 py-2 hover:bg-slate-50 text-sm">Excel 格式</button>
            </div>
          </div>
          <button 
            onClick={() => setShowUpload(true)}
            className="flex items-center px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition shadow-sm font-medium text-sm"
          >
            <Plus className="w-4 h-4 mr-2" /> 上傳文件
          </button>
        </div>
      </div>
      
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:flex-row">
        
        {/* Sidebar Filters */}
        <div className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-slate-200 p-6 bg-slate-50/50 shrink-0">
          <h3 className="font-semibold text-slate-800 mb-6 flex items-center">
            <Filter className="w-4 h-4 mr-2" /> 篩選條件
          </h3>
          
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">關鍵字搜尋</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input 
                  type="text" placeholder="名稱、編號..." 
                  value={searchTerm} onChange={e => {setSearchTerm(e.target.value); setPage(1)}}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">狀態</label>
              <select value={statusFilter} onChange={e => {setStatusFilter(e.target.value); setPage(1)}} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500">
                <option value="">全部狀態</option>
                <option value="active">已歸檔</option>
                <option value="draft">草稿</option>
                <option value="reserved">預約中</option>
                <option value="archived">已封存</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">類別</label>
              <select value={categoryFilter} onChange={e => {setCategoryFilter(e.target.value); setPage(1)}} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500">
                <option value="">全部類別</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">製定人</label>
              <select value={authorFilter} onChange={e => {setAuthorFilter(e.target.value); setPage(1)}} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500">
                <option value="">全部人員</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            
            <button 
              onClick={() => { setSearchTerm(''); setStatusFilter(''); setAuthorFilter(''); setCategoryFilter(''); setPage(1); }}
              className="w-full py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-100 transition"
            >
              清除篩選
            </button>
          </div>
        </div>
        
        {/* Main Table Area */}
        <div className="flex-1 flex flex-col relative min-h-[500px]">
          {loading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center">
              <LoadingSpinner />
            </div>
          )}
          
          <div className="flex-1 overflow-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 sticky top-0 z-0">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">文件名稱 / 編號</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">狀態 / 版本</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">屬性</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">更新時間</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {documents.length === 0 && !loading ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-slate-500 text-sm">
                      <div className="flex flex-col items-center">
                        <FileText className="w-12 h-12 text-slate-300 mb-3" />
                        <p>找不到符合條件的文件</p>
                      </div>
                    </td>
                  </tr>
                ) : documents.map(doc => (
                  <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-start">
                        <FileIcon type={doc.current_version ? 'pdf' : 'doc'} className="mt-1 mr-3 shrink-0" />
                        <div>
                          <div 
                            onClick={() => setSelectedDocId(doc.id)}
                            className="text-sm font-semibold text-slate-900 group-hover:text-primary-600 transition-colors cursor-pointer"
                          >
                            {doc.title}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 font-mono">{doc.doc_number || '-'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={doc.status} className="mb-1" />
                      <div className="text-xs text-slate-500 ">{doc.current_version || '無版本'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-xs text-slate-600 mb-1">
                        <Layers className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                        {doc.category_name || '-'}
                      </div>
                      <div className="flex items-center text-xs text-slate-600">
                        <User className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                        {doc.author_name || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {format(new Date(doc.updated_at), 'yyyy-MM-dd HH:mm')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition">
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <span className="text-sm text-slate-500">共 <span className="font-medium text-slate-900">{total}</span> 筆紀錄</span>
            <div className="flex space-x-2">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 bg-white border border-slate-200 rounded shadow-sm text-sm disabled:opacity-50"
              >
                上一頁
              </button>
              <span className="px-3 py-1 text-sm text-slate-600">第 {page} 頁</span>
              <button 
                onClick={() => setPage(p => p + 1)} disabled={documents.length < 10}
                className="px-3 py-1 bg-white border border-slate-200 rounded shadow-sm text-sm disabled:opacity-50"
              >
                下一頁
              </button>
            </div>
          </div>
        </div>
      </div>

      {showUpload && (
        <DocumentUpload 
          onClose={() => setShowUpload(false)} 
          onSuccess={() => { setShowUpload(false); fetchData(); }} 
        />
      )}

      {selectedDocId && (
        <DocumentDetailModal
          docId={selectedDocId}
          onClose={() => setSelectedDocId(null)}
        />
      )}
    </div>
  );
}
