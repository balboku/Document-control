import React, { useState, useCallback, useEffect } from 'react';
import { uploadFileExtract, confirmDocument, getSettingsUsers, getSettingsCategories, createSettingsUser, createSettingsCategory } from '../../services/api';
import { UploadCloud, FileText, CheckCircle, X, Sparkles, AlertCircle, Loader2, ChevronRight, Files } from 'lucide-react';
import LoadingSpinner from '../common/LoadingSpinner';

export default function DocumentUpload({ onClose, onSuccess }) {
  const [filesQueue, setFilesQueue] = useState([]); // { id, file, status, aiResult, metadata, error }
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isDragActive, setIsDragActive] = useState(false);
  
  // Settings lookups
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [uploaderId, setUploaderId] = useState(''); 

  useEffect(() => {
    async function fetchOptions() {
      try {
        const u = await getSettingsUsers(true);
        const c = await getSettingsCategories(true);
        setUsers(u);
        setCategories(c);
        if (u.length > 0 && !uploaderId) {
          setUploaderId(u[0].id); 
        }
      } catch (e) {
        console.error(e);
      }
    }
    fetchOptions();
  }, []);

  const handleDrag = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setIsDragActive(true);
    else if (e.type === "dragleave") setIsDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const processFiles = async (selectedFiles) => {
    const allowed = ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'txt'];
    const newlyAddedItems = selectedFiles.map(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      const isValid = allowed.includes(ext) && f.size <= 50 * 1024 * 1024;
      return {
        id: Math.random().toString(36).substr(2, 9),
        file: f,
        status: isValid ? 'pending' : 'error',
        error: isValid ? '' : (!allowed.includes(ext) ? '不支援格式' : '檔案過大'),
        aiResult: null,
        metadata: { title: f.name, version: 'v1.0', docNumber: '', authorId: '', categoryId: '', notes: '' }
      };
    });

    setFilesQueue(prev => {
      const updatedQueue = [...prev, ...newlyAddedItems];
      if (activeIndex === -1) setActiveIndex(prev.length);
      return updatedQueue;
    });

    // Parallel processing for AI extraction
    newlyAddedItems.forEach(item => {
      if (item.status === 'pending') {
        startExtraction(item.id, item.file);
      }
    });
  };

  const startExtraction = async (itemId, fileObject) => {
    updateItem(itemId, { status: 'extracting' });
    
    try {
      const result = await uploadFileExtract(fileObject);
      
      const meta = {
        title: result.ai_metadata?.title || fileObject.name,
        version: result.ai_metadata?.version || 'v1.0',
        docNumber: result.ai_metadata?.doc_number || '',
        keywords: result.ai_metadata?.keywords || [],
        notes: result.ai_metadata?.summary || '',
        authorId: '',
        categoryId: '',
        unmatchedAuthor: '',
        unmatchedCategory: ''
      };

      // Match Authors/Categories
      if (result.ai_metadata?.author) {
        const match = users.find(u => u.name.includes(result.ai_metadata.author) || result.ai_metadata.author.includes(u.name));
        if (match) meta.authorId = match.id;
        else meta.unmatchedAuthor = result.ai_metadata.author;
      }
      
      if (result.ai_metadata?.category) {
        const match = categories.find(c => c.name.includes(result.ai_metadata.category) || result.ai_metadata.category.includes(c.name));
        if (match) meta.categoryId = match.id;
        else meta.unmatchedCategory = result.ai_metadata.category;
      }

      updateItem(itemId, { 
        status: 'confirming', 
        aiResult: result, 
        metadata: meta,
        duplicateCheck: result.duplicate_check 
      });
    } catch (err) {
      updateItem(itemId, { status: 'error', error: err.response?.data?.detail || '解析失敗' });
    }
  };

  const updateItem = (id, updates) => {
    setFilesQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const updateActiveMetadata = (field, value) => {
    if (activeIndex === -1) return;
    const current = filesQueue[activeIndex];
    const newMeta = { ...current.metadata, [field]: value };
    updateItem(current.id, { metadata: newMeta });
  };

  const currentItem = activeIndex >= 0 ? filesQueue[activeIndex] : null;

  const handleConfirmSingle = async (index) => {
    const item = filesQueue[index];
    if (!uploaderId) return alert("請先選取操作者");
    if (!item.metadata.title) return alert("請輸入文件名稱");

    updateItem(item.id, { status: 'saving' });
    try {
      await confirmDocument({
        file_id: item.aiResult.file_id,
        title: item.metadata.title,
        doc_number: item.metadata.docNumber || null,
        version: item.metadata.version,
        author_id: item.metadata.authorId || null,
        category_id: item.metadata.categoryId || null,
        keywords: item.metadata.keywords || [],
        notes: item.metadata.notes,
        actor_id: uploaderId
      });
      updateItem(item.id, { status: 'success' });
      // If there's a next pending/confirming item, switch to it
      const nextIdx = filesQueue.findIndex((f, i) => i > index && (f.status === 'confirming' || f.status === 'pending'));
      if (nextIdx !== -1) setActiveIndex(nextIdx);
    } catch (err) {
      updateItem(item.id, { status: 'error', error: '歸檔失敗' });
    }
  };

  const handleAddSetting = async (type, name, itemId) => {
    try {
      let newItem;
      if (type === 'author') {
        newItem = await createSettingsUser({ name });
        const u = await getSettingsUsers(true);
        setUsers(u);
        // Update all files that have this unmatched author
        setFilesQueue(prev => prev.map(item => 
          item.metadata.unmatchedAuthor === name ? 
          { ...item, metadata: { ...item.metadata, authorId: newItem.id, unmatchedAuthor: '' } } : item
        ));
      } else {
        newItem = await createSettingsCategory({ name });
        const c = await getSettingsCategories(true);
        setCategories(c);
        setFilesQueue(prev => prev.map(item => 
          item.metadata.unmatchedCategory === name ? 
          { ...item, metadata: { ...item.metadata, categoryId: newItem.id, unmatchedCategory: '' } } : item
        ));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const isAllDone = filesQueue.length > 0 && filesQueue.every(f => f.status === 'success' || f.status === 'error');

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`bg-white rounded-3xl shadow-xl w-full flex flex-col max-h-[90vh] overflow-hidden transition-all duration-500 ${filesQueue.length > 0 ? 'max-w-6xl' : 'max-w-3xl'}`}>
        
        {/* Header */}
        <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
          <div className="flex items-center">
            <Files className="w-6 h-6 mr-3 text-primary-600" />
            <div>
              <h2 className="text-xl font-bold text-slate-800">多檔案解析與歸檔</h2>
              <p className="text-sm text-slate-500 mt-1">選取多個檔案由 AI 同時處理</p>
            </div>
          </div>
          <button onClick={isAllDone ? onSuccess : onClose} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Side: Upload Queue (Only shows if there are files) */}
          {filesQueue.length > 0 && (
            <div className="w-80 border-r border-slate-100 bg-slate-50/50 overflow-y-auto p-4 flex flex-col">
              <div className="mb-4">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">當前操作者</label>
                <select 
                  value={uploaderId} onChange={e => setUploaderId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-primary-500 shadow-sm"
                >
                  <option value="">請選擇...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} {u.department ? `(${u.department})` : ''}</option>)}
                </select>
              </div>

              <div className="flex-1 space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">檔案隊列 ({filesQueue.length})</label>
                {filesQueue.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveIndex(idx)}
                    className={`w-full text-left p-3 rounded-2xl border transition-all flex items-center group
                      ${activeIndex === idx ? 'bg-white border-primary-200 shadow-md ring-1 ring-primary-100' : 'bg-transparent border-transparent hover:bg-white/60 hover:border-slate-200'}
                    `}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mr-3 
                      ${item.status === 'success' ? 'bg-emerald-50 text-emerald-600' : 
                        item.status === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-400'}
                    `}>
                      {item.status === 'extracting' ? <Loader2 className="w-4 h-4 animate-spin" /> : 
                       item.status === 'success' ? <CheckCircle className="w-4 h-4" /> :
                       item.status === 'error' ? <AlertCircle className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-semibold text-slate-800 truncate">{item.file.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {item.status === 'extracting' ? 'AI 解析中...' : 
                         item.status === 'confirming' ? '待確認' :
                         item.status === 'success' ? '歸檔完成' : item.error || '等待中'}
                      </p>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform ${activeIndex === idx ? 'translate-x-1 text-primary-400' : 'opacity-0 group-hover:opacity-100'}`} />
                  </button>
                ))}
              </div>

              <button 
                onClick={() => document.getElementById('file-upload-more').click()}
                className="mt-4 p-3 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-500 hover:border-primary-400 hover:text-primary-600 transition"
              >
                <input id="file-upload-more" type="file" className="hidden" multiple accept=".pdf,.docx,.doc,.xlsx,.xls,.txt" onChange={(e)=>e.target.files && processFiles(Array.from(e.target.files))}/>
                <UploadCloud className="w-4 h-4 mr-2" />
                <span className="text-xs font-bold">繼續選取檔案</span>
              </button>
            </div>
          )}

          {/* Right Side: Main Content Container */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            
            {/* Scrollable Content Area */}
            <div className="flex-1 p-8 overflow-y-auto">
              
              {/* Operator Selection (Only when queue is empty) */}
              {filesQueue.length === 0 && (
                <div className="mb-8 bg-blue-50/50 p-6 rounded-2xl border border-blue-100/50 flex flex-col space-y-4">
                    <div className="flex items-center">
                      <label className="text-sm font-bold text-slate-700 mr-4">當前操作者 (上傳人) *</label>
                      <select 
                        value={uploaderId} onChange={e => setUploaderId(e.target.value)}
                        className="flex-1 px-4 py-2.5 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white font-medium"
                      >
                        <option value="">請選擇上傳人員...</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name} {u.department ? `(${u.department})` : ''}</option>)}
                      </select>
                    </div>
                    {!uploaderId && users.length > 0 && <p className="text-xs text-blue-600 flex items-center"><Sparkles className="w-3 h-3 mr-1" /> 已自動偵測到系統使用者，請確認您的身分。</p>}
                </div>
              )}

              {/* Empty State: Drag & Drop Area */}
              {filesQueue.length === 0 && (
                <div 
                  onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                  className={`border-4 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center text-center p-12 h-full transition-all group
                    ${isDragActive ? 'border-primary-500 bg-primary-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50/50'}
                  `}
                  onClick={() => document.getElementById('file-upload').click()}
                >
                  <input id="file-upload" type="file" className="hidden" multiple accept=".pdf,.docx,.doc,.xlsx,.xls,.txt" onChange={(e)=>e.target.files && processFiles(Array.from(e.target.files))}/>
                  <div className="w-24 h-24 bg-white rounded-full shadow-lg flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
                    <UploadCloud className={`w-12 h-12 ${isDragActive ? 'text-primary-600' : 'text-slate-300'}`} />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-800">開始上傳文件</h3>
                  <p className="text-slate-500 mt-3 max-w-sm">將大量檔案拖拽至此，AI 會自動處理繁瑣的索引錄入工作。</p>
                  <div className="mt-8 flex flex-wrap gap-2 justify-center">
                    {['PDF', 'Word', 'Excel', 'TXT'].map(t => <span key={t} className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-400">{t}</span>)}
                  </div>
                </div>
              )}

              {/* Confirming state for active item */}
              {currentItem && (
                <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                  {/* Status Bar */}
                  <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
                    <div className="flex items-center">
                        <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600 mr-4">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-800 truncate max-w-md">{currentItem.file.name}</h3>
                          <p className="text-xs text-slate-400">{(currentItem.file.size / 1024).toFixed(1)} KB</p>
                        </div>
                    </div>
                    <div className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center 
                        ${currentItem.status === 'extracting' ? 'bg-amber-50 text-amber-600' : 
                          currentItem.status === 'confirming' ? 'bg-blue-50 text-blue-600' : 
                          currentItem.status === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'}`}>
                        {currentItem.status === 'extracting' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        {currentItem.status === 'success' && <CheckCircle className="w-4 h-4 mr-2" />}
                        {currentItem.status === 'extracting' ? 'AI 正在處理中...' : 
                        currentItem.status === 'confirming' ? 'AI 解析完畢，請確認' : 
                        currentItem.status === 'success' ? '文件歸檔成功' : '錯誤'}
                    </div>
                  </div>

                  {currentItem.status === 'extracting' ? (
                    <div className="py-20 flex flex-col items-center justify-center text-center">
                      <div className="relative w-32 h-32 mb-8">
                          <LoadingSpinner size="lg" className="absolute inset-0" />
                          <Sparkles className="w-12 h-12 text-amber-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      </div>
                      <h4 className="text-xl font-bold text-slate-800">深度解析內容...</h4>
                      <p className="text-slate-500 mt-2 max-w-sm">Gemma 模型正在閱讀您的文件，提取編號、版本、作者與摘要...</p>
                    </div>
                  ) : currentItem.status === 'success' ? (
                    <div className="py-20 flex flex-col items-center justify-center text-center animate-in zoom-in-95">
                      <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                          <CheckCircle className="w-12 h-12 text-emerald-600" />
                      </div>
                      <h4 className="text-2xl font-bold text-slate-800">歸檔完成</h4>
                      <p className="text-slate-500 mt-2">該文件已存入資料庫並完成向量化編碼。</p>
                      {activeIndex < filesQueue.length - 1 && (
                        <button onClick={() => setActiveIndex(activeIndex + 1)} className="mt-8 px-6 py-3 bg-primary-600 text-white font-bold rounded-2xl hover:bg-primary-700 transition shadow-lg flex items-center">
                          跳至下一份檔案 <ChevronRight className="w-5 h-5 ml-2" />
                        </button>
                      )}
                    </div>
                  ) : currentItem.status === 'error' ? (
                    <div className="py-20 flex flex-col items-center justify-center text-rose-500">
                      <AlertCircle className="w-20 h-20 mb-6 opacity-30" />
                      <h4 className="text-xl font-bold">發生錯誤</h4>
                      <p className="mt-2 font-medium">{currentItem.error}</p>
                      <button onClick={() => startExtraction(currentItem.id)} className="mt-6 text-sm font-bold underline">重試一次</button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-10">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-bold text-slate-700 mb-2">文件名稱 *</label>
                        <input type="text" value={currentItem.metadata.title} onChange={e=>updateActiveMetadata('title', e.target.value)} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 transition-all font-medium" />
                      </div>

                      <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2 flex justify-between">文件編號 <span className="font-normal text-slate-400">(預設由系統分配)</span></label>
                            <input type="text" value={currentItem.metadata.docNumber} onChange={e=>updateActiveMetadata('docNumber', e.target.value)} placeholder="綁定預約編號" className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 transition-all font-mono" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">版本號</label>
                            <input type="text" value={currentItem.metadata.version} onChange={e=>updateActiveMetadata('version', e.target.value)} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 transition-all" />
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">製定人 (Author)</label>
                            <select value={currentItem.metadata.authorId} onChange={e=>updateActiveMetadata('authorId', e.target.value)} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 transition-all font-medium">
                              <option value="">(未指定)</option>
                              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                            {currentItem.metadata.unmatchedAuthor && (
                              <div className="mt-3 p-3 bg-amber-50 rounded-2xl border border-amber-100 flex items-center justify-between animate-in zoom-in-95">
                                <p className="text-xs text-amber-700 font-medium">AI 建議: <span className="font-bold underline">{currentItem.metadata.unmatchedAuthor}</span></p>
                                <button onClick={() => handleAddSetting('author', currentItem.metadata.unmatchedAuthor, currentItem.id)} className="text-[10px] font-bold bg-amber-200 text-amber-800 px-3 py-1 rounded-full hover:bg-amber-300 transition">一鍵新增</button>
                              </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">檔案類別</label>
                            <select value={currentItem.metadata.categoryId} onChange={e=>updateActiveMetadata('categoryId', e.target.value)} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 transition-all font-medium">
                              <option value="">(未指定)</option>
                              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            {currentItem.metadata.unmatchedCategory && (
                              <div className="mt-3 p-3 bg-amber-50 rounded-2xl border border-amber-100 flex items-center justify-between animate-in zoom-in-95">
                                <p className="text-xs text-amber-700 font-medium">AI 建議: <span className="font-bold underline">{currentItem.metadata.unmatchedCategory}</span></p>
                                <button onClick={() => handleAddSetting('category', currentItem.metadata.unmatchedCategory, currentItem.id)} className="text-[10px] font-bold bg-amber-200 text-amber-800 px-3 py-1 rounded-full hover:bg-amber-300 transition">一鍵新增</button>
                              </div>
                            )}
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-bold text-slate-700 mb-2">關鍵字 (由 AI 萃取，逗號分隔)</label>
                        <input 
                          type="text" 
                          value={currentItem.metadata.keywords.join(', ')} 
                          onChange={e => updateActiveMetadata('keywords', e.target.value.split(',').map(k => k.trim()))} 
                          placeholder="例如: 規範, 製程, QC"
                          className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 transition-all text-sm font-medium" 
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-bold text-slate-700 mb-2">文件摘要 (由 AI 提取)</label>
                        <textarea value={currentItem.metadata.notes} onChange={e=>updateActiveMetadata('notes', e.target.value)} rows="4" className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 transition-all text-sm leading-relaxed" />
                      </div>
                    </div>
                  )}

                  {/* Duplicate Check Warning Overlay */}
                  {currentItem.status === 'confirming' && currentItem.duplicateCheck && (
                    <div className="mt-8 p-6 bg-rose-50 border border-rose-100 rounded-3xl animate-in zoom-in-95">
                      <div className="flex items-start">
                        <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600 mr-4 shrink-0">
                          <AlertCircle className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-lg font-bold text-rose-800">發現重複/高度相似文件</h4>
                          <p className="text-rose-700 mt-1 text-sm leading-relaxed">
                            系統發現庫存中已有與此檔案內容高度相似的文件：
                            <span className="font-bold block mt-2 px-3 py-2 bg-white/50 rounded-xl border border-rose-200/50">
                              「{currentItem.duplicateCheck.duplicate_title}」({currentItem.duplicateCheck.duplicate_doc_number}) <br/>
                              相似度: <span className="text-rose-600 font-mono">{(currentItem.duplicateCheck.similarity_score * 100).toFixed(1)}%</span>
                            </span>
                          </p>
                          <div className="mt-6 flex space-x-4">
                            <button 
                              onClick={() => handleConfirmSingle(activeIndex)}
                              className="px-6 py-2.5 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition shadow-lg shadow-rose-200 text-sm"
                            >
                              確定為新文件並上傳
                            </button>
                            <button 
                              onClick={() => setFilesQueue(prev => prev.filter(i => i.id !== currentItem.id))}
                              className="px-6 py-2.5 bg-white text-rose-600 border border-rose-200 font-bold rounded-xl hover:bg-rose-50 transition text-sm"
                            >
                              取消此檔案
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sticky Footer Action Bar */}
            {currentItem && currentItem.status === 'confirming' && (
              <div className="px-8 py-6 border-t border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <p className="text-xs text-slate-400 font-medium italic">提示: 您可以在左側隨時切換檔案進行確認</p>
                 <div className="flex space-x-3">
                    <button 
                      onClick={() => setFilesQueue(prev => prev.filter(i => i.id !== currentItem.id))}
                      className="px-6 py-3 text-rose-600 font-bold hover:bg-rose-50 rounded-2xl transition"
                    >
                      移除此檔
                    </button>
                    <button 
                      onClick={() => handleConfirmSingle(activeIndex)}
                      className="px-10 py-3 bg-primary-600 text-white font-bold rounded-2xl hover:bg-primary-700 transition shadow-lg hover:shadow-primary-200 transform hover:-translate-y-0.5 active:translate-y-0"
                    >
                      確認歸檔
                    </button>
                 </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
