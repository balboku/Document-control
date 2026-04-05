import React, { useState, useEffect } from 'react';
import { 
  getDocumentDetail, analyzeRelations, updateDocument, 
  uploadNewVersion, getSettingsUsers, getSettingsCategories,
  retryAiProcessing
} from '../../services/api';
import StatusBadge from '../common/StatusBadge';
import LoadingSpinner from '../common/LoadingSpinner';
import { format } from 'date-fns';
import { 
  X, Layers, User, Calendar, FileText, Sparkles, 
  Loader2, GitMerge, ChevronRight, Edit3, Save, Upload, AlertCircle 
} from 'lucide-react';

export default function DocumentDetailModal({ docId, onClose }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Tabs: 'details', 'history', 'relations'
  const [activeTab, setActiveTab] = useState('details');
  const [history, setHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // AI Relations
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  // Edit Mode
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);

  // File Mounting
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [mountVersion, setMountVersion] = useState('');

  useEffect(() => {
    fetchDetail();
    fetchOptions();
  }, [docId]);

  const fetchDetail = async () => {
    try {
      const data = await getDocumentDetail(docId);
      setDoc(data);
      setEditForm({
        title: data.title || '',
        author_id: data.author_id || '',
        category_id: data.category_id || '',
        notes: data.notes || '',
        status: data.status || 'draft',
        keywords: data.keywords || []
      });
      setMountVersion(data.current_version ? '' : 'v1.0');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const [u, c] = await Promise.all([getSettingsUsers(true), getSettingsCategories(true)]);
      setUsers(u);
      setCategories(c);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDocument(docId, {
        title: editForm.title,
        author_id: editForm.author_id || null,
        category_id: editForm.category_id || null,
        notes: editForm.notes,
        status: editForm.status,
        keywords: editForm.keywords
      });
      setIsEditing(false);
      fetchDetail();
    } catch (err) {
      console.error(err);
      alert("儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleMountFile = async () => {
    if (!selectedFile) return alert("請選擇檔案");
    if (!mountVersion) return alert("請輸入版本號");
    
    // We need an actor_id for audit logs, usually we'd have a logged in user.
    // For now, we'll use the author_id or the first user in the list as a fallback.
    const actorId = editForm.author_id || (users.length > 0 ? users[0].id : null);
    
    setUploading(true);
    try {
      await uploadNewVersion(docId, mountVersion, actorId, selectedFile);
      setSelectedFile(null);
      fetchDetail();
      alert("檔案掛載成功");
    } catch (err) {
      console.error(err);
      alert("上傳失敗: " + (err.response?.data?.detail || "未知錯誤"));
    } finally {
      setUploading(false);
    }
  };

  const handleRetryAI = async (versionId) => {
    try {
      await retryAiProcessing(docId, versionId);
      // Refresh to show pending status
      fetchDetail();
    } catch (err) {
      console.error(err);
      alert("重試失敗: " + (err.response?.data?.detail || "未知錯誤"));
    }
  };

  const fetchHistory = async () => {
    if (history) return;
    setLoadingHistory(true);
    try {
      const { getDocumentAuditLogs } = await import('../../services/api');
      const logs = await getDocumentAuditLogs(docId);
      setHistory(logs);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleAnalyze = async (force = false) => {
    setAnalyzing(true);
    if (force) setAnalysisResult(null);
    try {
      const result = await analyzeRelations(docId, force);
      setAnalysisResult(result);
    } catch (error) {
      console.error(error);
      setAnalysisResult({ analysis_text: '分析失敗，無法取得關聯資料。', related_documents: [] });
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center fade-in">
        <LoadingSpinner size="lg" className="text-white" />
      </div>
    );
  }

  if (!doc) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 fade-in">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden slide-in-bottom">
        
        {/* Header */}
        <div className="flex justify-between items-start p-8 border-b border-slate-100 bg-white sticky top-0 z-10">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-3">
              <StatusBadge status={doc.status} />
              <span className="text-xs font-mono font-bold text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1 rounded-full uppercase tracking-wider">
                {doc.doc_number || "未編號"}
              </span>
              {doc.current_version && (
                <span className="text-xs font-bold text-primary-600 bg-primary-50 border border-primary-100 px-3 py-1 rounded-full uppercase tracking-wider">
                  {doc.current_version}
                </span>
              )}
              {doc.ai_processing_status === 'pending' && (
                <div className="flex items-center text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-100">
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  AI 處理中...
                </div>
              )}
              {doc.ai_processing_status === 'failed' && (
                <div className="flex items-center text-xs font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-100">
                  <AlertCircle className="w-3 h-3 mr-1.5" />
                  AI 解析失敗
                </div>
              )}
            </div>
            {isEditing ? (
              <input 
                type="text" 
                value={editForm.title} 
                onChange={e => setEditForm({...editForm, title: e.target.value})}
                className="text-3xl font-extrabold text-slate-900 tracking-tight border-b-2 border-primary-500 w-full focus:outline-none bg-primary-50/10 px-2 py-1 rounded"
              />
            ) : (
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">{doc.title || "（無標題）"}</h2>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {!isEditing ? (
              <button 
                onClick={() => setIsEditing(true)}
                className="flex items-center px-4 py-2 text-sm font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all"
              >
                <Edit3 className="w-4 h-4 mr-2" /> 編輯資料
              </button>
            ) : (
              <div className="flex space-x-2">
                <button 
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700"
                >
                  取消
                </button>
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center px-4 py-2 text-sm font-bold text-white bg-primary-600 rounded-xl hover:bg-primary-700 shadow-lg disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  儲存變更
                </button>
              </div>
            )}
            <button 
              onClick={onClose}
              className="p-3 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-2xl transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex px-8 bg-white border-b border-slate-100 space-x-8">
          {[
            { id: 'details', label: '基本資訊', icon: FileText },
            { id: 'history', label: '歷史軌跡', icon: GitMerge, action: fetchHistory },
            { id: 'relations', label: '關聯文件', icon: Sparkles }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.action) tab.action();
              }}
              className={`flex items-center py-4 text-sm font-bold border-b-2 transition-all relative
                ${activeTab === tab.id ? 'text-primary-600 border-primary-600' : 'text-slate-400 border-transparent hover:text-slate-600'}
              `}
            >
              <tab.icon className={`w-4 h-4 mr-2 ${activeTab === tab.id ? 'animate-pulse' : ''}`} />
              {tab.label}
              {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 rounded-full blur-[2px] opacity-30" />}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30">
          
          {activeTab === 'details' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Left Column: Metadata */}
              <div className="md:col-span-2 space-y-8">
                <div className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mr-3" />
                    詳細規格
                  </h3>
                  
                  {isEditing ? (
                    <div className="grid grid-cols-2 gap-y-6 gap-x-8">
                      <div className="flex flex-col col-span-2 sm:col-span-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1">製定人員</label>
                        <select 
                          value={editForm.author_id} 
                          onChange={e => setEditForm({...editForm, author_id: e.target.value})}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm"
                        >
                          <option value="">(未指定)</option>
                          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col col-span-2 sm:col-span-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1">文件類別</label>
                        <select 
                          value={editForm.category_id} 
                          onChange={e => setEditForm({...editForm, category_id: e.target.value})}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm"
                        >
                          <option value="">(未指定)</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1">索引關鍵字 (逗號分隔)</label>
                        <input 
                          type="text" 
                          value={editForm.keywords?.join(', ')} 
                          onChange={e => setEditForm({...editForm, keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k)})}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-y-8 gap-x-12">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">製定人員</span>
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mr-3 font-bold text-xs">
                            {(doc.author_name || "U")[0]}
                          </div>
                          <span className="font-bold text-slate-800">{doc.author_name || "未指定"}</span>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">文件類別</span>
                        <span className="font-bold text-slate-800 flex items-center">
                          <Layers className="w-4 h-4 mr-2 text-primary-400" />
                          {doc.category_name || "未分類"}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">建立時間</span>
                        <span className="font-bold text-slate-800 flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-slate-400" />
                          {format(new Date(doc.created_at), 'yyyy-MM-dd')}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">最後更新</span>
                        <span className="font-bold text-slate-800 flex items-center">
                          <Loader2 className="w-4 h-4 mr-2 text-slate-400" />
                          {doc.updated_at ? format(new Date(doc.updated_at), 'yyyy-MM-dd') : "-"}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {!isEditing && doc.keywords && doc.keywords.length > 0 && (
                    <div className="mt-10 pt-8 border-t border-slate-50">
                      <span className="text-[10px] font-bold text-slate-400 uppercase mb-3 block">索引關鍵字</span>
                      <div className="flex flex-wrap gap-2">
                        {doc.keywords.map((k, i) => (
                          <span key={i} className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg border border-slate-200/50">#{k}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-3" />
                    備註內容
                  </h3>
                  {isEditing ? (
                    <textarea 
                      value={editForm.notes} 
                      onChange={e => setEditForm({...editForm, notes: e.target.value})}
                      rows="4"
                      className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white text-sm leading-relaxed"
                    />
                  ) : (
                    <p className="text-sm text-slate-700 leading-relaxed bg-slate-50/50 p-6 rounded-2xl border border-slate-100 font-medium whitespace-pre-wrap">
                      {doc.notes || "無詳細備註。"}
                    </p>
                  )}
                </div>
              </div>

              {/* Right Column: Versions & File Mount */}
              <div className="space-y-8">
                {/* File Attachment / Version Update Section */}
                <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-md relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-4 opacity-10">
                      <Upload className="w-12 h-12" />
                   </div>
                   <h3 className="text-xs font-black text-primary-600 uppercase tracking-[0.2em] mb-6 flex items-center">
                    {doc.current_version ? "更新檔案版本" : "掛載實體檔案"}
                  </h3>
                  
                  <div className="space-y-4">
                    {!doc.current_version && (
                      <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-xs text-amber-700 flex items-start mb-4">
                        <AlertCircle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                        此卡片目前尚未掛載任何檔案，請上傳檔案以開始 AI 解析與版本控制。
                      </div>
                    )}
                    
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">設定版本號</label>
                        <input 
                          type="text" 
                          value={mountVersion}
                          onChange={e => setMountVersion(e.target.value)}
                          placeholder="例如: v1.0, v2.0"
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono"
                        />
                      </div>
                      
                      <div 
                        className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
                          selectedFile ? 'border-primary-400 bg-primary-50' : 'border-slate-100 hover:border-slate-200 bg-slate-50/50'
                        }`}
                        onClick={() => document.getElementById('file-mount-input').click()}
                      >
                        <input 
                          id="file-mount-input"
                          type="file" 
                          className="hidden" 
                          onChange={e => setSelectedFile(e.target.files[0])}
                        />
                        {selectedFile ? (
                          <div className="flex flex-col items-center">
                            <FileText className="w-8 h-8 text-primary-600 mb-2" />
                            <p className="text-xs font-bold text-slate-800 truncate max-w-full">{selectedFile.name}</p>
                            <p className="text-[10px] text-slate-400 mt-1">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <Upload className="w-8 h-8 text-slate-300 mb-2" />
                            <p className="text-xs text-slate-500">點擊選取或拖曳檔案</p>
                            <p className="text-[10px] text-slate-400 mt-1">PDF, Word, Excel, TXT</p>
                          </div>
                        )}
                      </div>
                      
                      <button 
                        onClick={handleMountFile}
                        disabled={uploading || !selectedFile || !mountVersion}
                        className="w-full py-3 bg-primary-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-primary-100 hover:bg-primary-700 transition disabled:opacity-50 flex items-center justify-center"
                      >
                        {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                        {doc.current_version ? "上傳新版本" : "確認掛載至卡片"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6">版本流水線</h3>
                  <div className="space-y-3">
                    {doc.versions?.length > 0 ? (
                      doc.versions.map(v => (
                        <div key={v.id} className={`group flex items-center justify-between p-4 rounded-2xl border transition-all
                          ${v.is_current ? 'bg-primary-50/50 border-primary-100 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-200'}
                        `}>
                          <div className="flex items-center space-x-3 overflow-hidden">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                              ${v.is_current ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}
                            `}>
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="overflow-hidden">
                              <p className="text-xs font-bold text-slate-800 truncate">{v.version_number} - {v.file_name}</p>
                              <div className="flex items-center mt-0.5 space-x-2">
                                <p className="text-[10px] text-slate-400">{format(new Date(v.uploaded_at), 'MM/dd HH:mm')}</p>
                                {v.ai_processing_status === 'pending' && (
                                  <span className="flex items-center text-[9px] text-amber-500 font-bold uppercase">
                                    <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" /> processing
                                  </span>
                                )}
                                {v.ai_processing_status === 'failed' && (
                                  <span className="flex items-center text-[9px] text-red-500 font-bold uppercase">
                                    <AlertCircle className="w-2.5 h-2.5 mr-1" /> failed
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 shrink-0">
                            {v.ai_processing_status === 'failed' && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleRetryAI(v.id); }}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-red-100"
                                title="重試 AI 解析"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {v.is_current && <span className="text-[8px] font-black tracking-tighter bg-primary-600 text-white px-2 py-0.5 rounded shadow-sm">LATEST</span>}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 italic text-center py-4">無歷史版本</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
              {loadingHistory ? (
                <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin mb-4" />
                  <p className="text-sm font-bold">載入稽核紀錄中...</p>
                </div>
              ) : history?.length > 0 ? (
                <div className="relative pl-8 border-l-2 border-slate-100 space-y-10 py-4">
                  {history.map((log, idx) => (
                    <div key={log.id} className="relative">
                      {/* Timeline Dot */}
                      <div className={`absolute -left-[41px] w-5 h-5 rounded-full border-4 border-white shadow-sm transition-transform hover:scale-125
                        ${log.action === 'STATUS_CHANGE' ? 'bg-blue-500' : 
                          log.action === 'UPLOAD' ? 'bg-emerald-500' : 
                          log.action === 'DOWNLOAD' ? 'bg-amber-500' : 'bg-slate-400'}
                      `} />
                      
                      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-3">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none">
                            {format(new Date(log.created_at), 'yyyy/MM/dd HH:mm:ss')}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                            ${log.action === 'STATUS_CHANGE' || log.action === 'STATUS_CHANGE' ? 'bg-blue-50 text-blue-600' : 
                              log.action === 'UPLOAD' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'}
                          `}>
                            {log.action}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 flex items-center">
                          <User className="w-3.5 h-3.5 mr-2 text-slate-400" />
                          {log.actor_name || "系統自動"} 
                          {log.action === 'STATUS_CHANGE' ? '變更了文件狀態' : 
                           log.action === 'UPLOAD' ? '上傳了檔案/版本' : 
                           log.action === 'UPDATE' ? '更新了文件資訊' : '執行了操作'}
                        </h4>
                        {log.details && (
                          <div className="mt-4 p-3 bg-slate-50 rounded-xl text-xs text-slate-600 font-medium overflow-hidden">
                            {log.action === 'STATUS_CHANGE' ? (
                               <p>由 <span className="font-bold">{log.details.from}</span> 轉為 <span className="text-primary-600 font-bold">{log.details.to}</span></p>
                             ) : log.action === 'UPLOAD' || log.action === 'UPDATE' ? (
                               <p>描述: <span className="font-bold">{log.details.version || '無'}</span> ({log.details.file_name || '中繼資料更新'})</p>
                             ) : (
                               <pre className="whitespace-pre-wrap">{JSON.stringify(log.details, null, 2)}</pre>
                             )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="absolute -bottom-1 -left-[9px] w-4 h-4 bg-slate-50 rounded-full border-2 border-slate-100" />
                </div>
              ) : (
                <div className="py-20 text-center text-slate-400">
                  <GitMerge className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p className="font-bold">尚無變更紀錄</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'relations' && (
            <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-gradient-to-br from-primary-600 to-indigo-700 rounded-[2.5rem] p-10 text-white shadow-xl shadow-primary-100 relative overflow-hidden group">
                 <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />
                 <div className="relative z-10">
                    <div className="flex items-center mb-6">
                      <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mr-5">
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-2xl font-black tracking-tight">AI 文件關聯洞察</h3>
                    </div>
                    {!analysisResult && !analyzing ? (
                      <div>
                        <p className="text-primary-50/80 mb-8 max-w-xl leading-relaxed font-medium">
                          Gemma 3 會透過向量搜尋分析數千份文件，找出業務邏輯上最相關的內容，並自動歸納它們之間的關係。
                        </p>
                        <button 
                          onClick={handleAnalyze}
                          disabled={!doc.current_version}
                          className="px-8 py-4 bg-white text-primary-600 hover:bg-primary-50 font-black rounded-2xl shadow-lg transition-all transform hover:-translate-y-1 active:translate-y-0 text-sm flex items-center disabled:opacity-50 disabled:transform-none"
                        >
                          {!doc.current_version ? "請先掛載檔案以進行分析" : "開始語意分析"} 
                          <ChevronRight className="w-5 h-5 ml-2" />
                        </button>
                      </div>
                    ) : analyzing ? (
                      <div className="py-8 flex flex-col items-center">
                        <div className="relative w-20 h-20 mb-6">
                          <div className="absolute inset-0 bg-white/10 rounded-full animate-ping" />
                          <div className="absolute inset-4 bg-white/30 rounded-full animate-pulse" />
                          <Loader2 className="absolute inset-6 w-8 h-8 animate-spin text-white" />
                        </div>
                        <p className="font-bold text-lg animate-pulse">正在穿梭於向量庫中尋找連結...</p>
                      </div>
                    ) : (
                      <div className="space-y-8 animate-in fade-in duration-700">
                        <div className="flex justify-between items-center bg-white/10 backdrop-blur-md rounded-t-[2rem] px-8 py-4 border-b border-white/10">
                          <div className="flex items-center space-x-2">
                             <div className={`w-2 h-2 rounded-full ${analysisResult.cached ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                             <span className="text-xs font-bold text-primary-50 uppercase tracking-wider">
                               {analysisResult.cached ? '已讀取存檔' : '全新分析'}
                             </span>
                          </div>
                          <button 
                            onClick={() => handleAnalyze(true)}
                            className="text-xs font-black text-white/60 hover:text-white flex items-center transition-colors px-4 py-2 hover:bg-white/10 rounded-xl"
                          >
                            <Loader2 className={`w-3.5 h-3.5 mr-2 ${analyzing ? 'animate-spin' : ''}`} />
                            重新生成洞察
                          </button>
                        </div>
                        <div className="bg-white/10 backdrop-blur-md rounded-b-[2rem] p-8 leading-relaxed font-medium">
                          {analysisResult.analysis_text.split('\n').map((line, i) => (
                            <p key={i} className="mb-4 last:mb-0 text-primary-50">{line}</p>
                          ))}
                        </div>
                      </div>
                    )}
                 </div>
              </div>

              {analysisResult?.related_documents?.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {analysisResult.related_documents.map(rd => (
                    <button 
                      key={rd.document_id}
                      className="group bg-white p-6 rounded-[2rem] border border-slate-100 hover:border-primary-200 hover:shadow-xl hover:shadow-primary-50 transition-all text-left flex items-start"
                    >
                      <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mr-5 shrink-0 group-hover:bg-primary-50 group-hover:text-primary-600 transition-colors">
                        <GitMerge className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{rd.doc_number}</span>
                          {rd.similarity_score && (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                              {(rd.similarity_score * 100).toFixed(0)}% Match
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-slate-800 truncate mb-2 group-hover:text-primary-600 transition-colors">{rd.title}</h4>
                        <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                          {rd.chunk_content || "自動分析出的相關文件段落..."}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}
