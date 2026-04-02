import React, { useState, useCallback, useEffect } from 'react';
import { uploadFileExtract, confirmDocument, getSettingsUsers, getSettingsCategories, createSettingsUser, createSettingsCategory } from '../../services/api';
import { UploadCloud, FileText, CheckCircle, X, Sparkles, AlertCircle } from 'lucide-react';
import LoadingSpinner from '../common/LoadingSpinner';

export default function DocumentUpload({ onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  
  const [status, setStatus] = useState('idle'); // idle, uploading, confirming, success, error
  const [errorMsg, setErrorMsg] = useState("");
  
  const [aiResult, setAiResult] = useState(null);
  const [unmatchedAuthor, setUnmatchedAuthor] = useState('');
  const [unmatchedCategory, setUnmatchedCategory] = useState('');
  
  // Settings lookups
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // Form fields
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('v1.0');
  const [docNumber, setDocNumber] = useState('');
  const [authorId, setAuthorId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const [uploaderId, setUploaderId] = useState(''); // Who is physically uploading this

  useEffect(() => {
    async function fetchOptions() {
      try {
        const u = await getSettingsUsers(true);
        const c = await getSettingsCategories(true);
        setUsers(u);
        setCategories(c);
        if (u.length > 0) {
          setUploaderId(u[0].id); // Default to first active user
        }
      } catch (e) {
        console.error(e);
      }
    }
    fetchOptions();
  }, []);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setIsDragActive(true);
    else if (e.type === "dragleave") setIsDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const processFile = async (selectedFile) => {
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    const allowed = ['pdf', 'docx', 'doc', 'xlsx', 'xls'];
    if (!allowed.includes(ext)) {
      setErrorMsg("不支援的檔案格式，僅支援 PDF, Word, Excel");
      setStatus('error');
      return;
    }
    if (selectedFile.size > 50 * 1024 * 1024) {
      setErrorMsg("檔案過大，請上傳小於 50MB 的檔案");
      setStatus('error');
      return;
    }

    setFile(selectedFile);
    setStatus('uploading');
    
    try {
      const result = await uploadFileExtract(selectedFile);
      setAiResult(result);
      
      // Pre-fill form from AI
      if (result.ai_metadata) {
        setTitle(result.ai_metadata.title || result.file_name);
        setVersion(result.ai_metadata.version || 'v1.0');
        setDocNumber(result.ai_metadata.doc_number || '');
        setNotes(result.ai_metadata.summary || '');
        
        // Try to match author
        if (result.ai_metadata.author) {
          const matchedAuthor = users.find(u => u.name.includes(result.ai_metadata.author) || result.ai_metadata.author.includes(u.name));
          if (matchedAuthor) {
            setAuthorId(matchedAuthor.id);
            setUnmatchedAuthor('');
          } else {
            setUnmatchedAuthor(result.ai_metadata.author);
          }
        }
        
        // Try to match category
        if (result.ai_metadata.category) {
          const matchedCat = categories.find(c => c.name.includes(result.ai_metadata.category) || result.ai_metadata.category.includes(c.name));
          if (matchedCat) {
            setCategoryId(matchedCat.id);
            setUnmatchedCategory('');
          } else {
            setUnmatchedCategory(result.ai_metadata.category);
          }
        }
      } else {
        setTitle(result.file_name);
      }
      
      setStatus('confirming');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.detail || '檔案上傳與解析失敗');
      setStatus('error');
    }
  };

  const handleAddAuthor = async (e) => {
    e.preventDefault();
    try {
      const newUser = await createSettingsUser({ name: unmatchedAuthor });
      const u = await getSettingsUsers(true);
      setUsers(u);
      setAuthorId(newUser.id);
      setUnmatchedAuthor('');
    } catch(e) { console.error('Failed to add author', e); }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    try {
      const newCat = await createSettingsCategory({ name: unmatchedCategory });
      const c = await getSettingsCategories(true);
      setCategories(c);
      setCategoryId(newCat.id);
      setUnmatchedCategory('');
    } catch(e) { console.error('Failed to add category', e); }
  };

  const handleConfirm = async () => {
    if (!uploaderId) {
      alert("請先選擇上方「操作者 (上傳人)」");
      return;
    }
    if (!title) {
      alert("請輸入文件名稱");
      return;
    }
    
    try {
      setStatus('uploading');
      await confirmDocument({
        file_id: aiResult.file_id,
        title,
        doc_number: docNumber || null,
        version,
        author_id: authorId || null,
        category_id: categoryId || null,
        notes,
        actor_id: uploaderId
      });
      setStatus('success');
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 1500);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.detail || '歸檔失敗');
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
          <div>
            <h2 className="text-xl font-bold text-slate-800">上傳文件</h2>
            <p className="text-sm text-slate-500 mt-1">選取檔案後由 AI 自動擷取歸檔資訊</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8">
          
          {/* Uploader selection (Crucial setting) */}
          {status !== 'success' && (
            <div className="mb-8 bg-blue-50/50 p-5 rounded-2xl border border-blue-100/50 flex items-center shadow-sm">
              <label className="text-sm font-semibold text-slate-700 mr-4 whitespace-nowrap">當前操作者(上傳人)</label>
              <select 
                value={uploaderId} onChange={e => setUploaderId(e.target.value)}
                className="flex-1 px-4 py-2 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">請選擇...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} {u.department ? `(${u.department})` : ''}</option>)}
              </select>
            </div>
          )}

          {/* State: Idle / Select File */}
          {(status === 'idle' || status === 'error') && (
            <div 
              onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
              className={`border-2 border-dashed rounded-3xl p-12 text-center transition-colors cursor-pointer
                ${isDragActive ? 'border-primary-500 bg-primary-50' : 'border-slate-200 hover:border-primary-400 hover:bg-slate-50'}
                ${status === 'error' ? 'border-rose-300 bg-rose-50/50' : ''}
              `}
              onClick={() => document.getElementById('file-upload').click()}
            >
              <input 
                id="file-upload" type="file" className="hidden" 
                accept=".pdf,.docx,.doc,.xlsx,.xls"
                onChange={(e) => e.target.files && processFile(e.target.files[0])}
              />
              <div className="mx-auto w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mb-4">
                <UploadCloud className={`w-8 h-8 ${isDragActive ? 'text-primary-600' : 'text-slate-400'}`} />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">拖曳檔案至此，或點擊上傳</h3>
              <p className="text-sm text-slate-500 mt-2">支援格式: PDF, Word, Excel (最大 50MB)</p>
              
              {status === 'error' && (
                <div className="mt-6 flex items-center justify-center text-rose-600 bg-rose-100 px-4 py-2 rounded-lg text-sm font-medium mx-auto max-w-fit">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  {errorMsg}
                </div>
              )}
            </div>
          )}

          {/* State: Uploading / Processing */}
          {status === 'uploading' && (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <LoadingSpinner size="lg" className="mb-6" />
              <h3 className="text-xl font-semibold text-slate-800">處理中...</h3>
              <p className="text-slate-500 mt-2 flex items-center">
                <Sparkles className="w-4 h-4 text-amber-500 mr-2" />
                AI 正在從文件中萃取元資料並建立向量索引
              </p>
            </div>
          )}

          {/* State: AI Confirmation Form */}
          {status === 'confirming' && (
            <div className="animate-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-start bg-amber-50 rounded-2xl p-5 mb-8 border border-amber-100/50 shadow-sm">
                <Sparkles className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div className="ml-3">
                  <h4 className="text-sm font-bold text-amber-800">AI 輔助填入建議</h4>
                  <p className="text-xs text-amber-700/80 mt-1 leading-relaxed">
                    我們已透過 Gemma 模型從 <span className="font-semibold">{aiResult?.file_name}</span> 中為您萃取出以下資訊。請在儲存前確認或修改。
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">文件名稱 *</label>
                  <input type="text" value={title} onChange={e=>setTitle(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500" />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center">
                    文件編號 
                    <span className="ml-2 text-xs font-normal text-slate-400 bg-slate-100 px-1.5 rounded">留空由系統分配</span>
                  </label>
                  <input type="text" value={docNumber} onChange={e=>setDocNumber(e.target.value)} placeholder="綁定預約編號" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500" />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">版本號</label>
                  <input type="text" value={version} onChange={e=>setVersion(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500" />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">製定人 (Author)</label>
                  <select value={authorId} onChange={e=>setAuthorId(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500">
                    <option value="">(未指定)</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  {unmatchedAuthor && (
                    <div className="mt-2 text-xs text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-100 flex items-start justify-between">
                      <div><span className="font-semibold">AI 建議:</span> {unmatchedAuthor} (系統無此人)</div>
                      <button onClick={handleAddAuthor} className="text-amber-700 font-bold hover:underline shrink-0 ml-2">一鍵新增</button>
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">類別</label>
                  <select value={categoryId} onChange={e=>setCategoryId(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500">
                    <option value="">(未指定)</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {unmatchedCategory && (
                    <div className="mt-2 text-xs text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-100 flex items-start justify-between">
                      <div><span className="font-semibold">AI 建議:</span> {unmatchedCategory} (系統無此類別)</div>
                      <button onClick={handleAddCategory} className="text-amber-700 font-bold hover:underline shrink-0 ml-2">一鍵新增</button>
                    </div>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">備註 / 摘要</label>
                  <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows="3" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500"></textarea>
                </div>
              </div>
            </div>
          )}

          {/* State: Success */}
          {status === 'success' && (
            <div className="py-20 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-800">歸檔成功！</h3>
              <p className="text-slate-500 mt-2">文件已經成功存入系統，並完成向量化編碼。</p>
            </div>
          )}
          
        </div>

        {/* Footer Actions */}
        {status === 'confirming' && (
          <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-end space-x-3 mt-auto">
            <button onClick={() => setStatus('idle')} className="px-6 py-2.5 text-slate-600 font-medium hover:bg-slate-200 rounded-xl transition">
              重選檔案
            </button>
            <button onClick={handleConfirm} className="px-8 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition shadow-sm">
              確認歸檔
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
