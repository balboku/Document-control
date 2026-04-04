import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, FileText, Link as LinkIcon, Trash2, Plus, 
  Search, X, Check, ExternalLink, Library, LayoutGrid, List as ListIcon
} from 'lucide-react';
import { getMdfProject, getDocuments, linkDocumentToMdf, unlinkDocumentFromMdf } from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import StatusBadge from '../components/common/StatusBadge';
import { clsx } from 'clsx';

const MDF_ITEMS = [
  "產品規格", "QC工程表", "生產標準", "檢驗標準", "作業環境", 
  "相關設備", "供應商資料", "工程圖", "原物料組成", "部品規格書", 
  "滅菌要求", "隨附文件", "標籤文件", "包裝標準", "儲存標準", 
  "搬運標準", "運銷標準", "其他"
];

export default function MdfDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Link Document Modal
  const [showPicker, setShowPicker] = useState(false);
  const [currentItemNo, setCurrentItemNo] = useState(null);
  const [availableDocs, setAvailableDocs] = useState([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerLoading, setPickerLoading] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    fetchProject();
  }, [id]);

  const fetchProject = async () => {
    setLoading(true);
    try {
      const data = await getMdfProject(id);
      setProject(data);
    } catch (e) {
      console.error('Fetch MDF project failed', e);
    } finally {
      setLoading(false);
    }
  };

  const openPicker = async (itemNo) => {
    setCurrentItemNo(itemNo);
    setShowPicker(true);
    fetchDocs();
  };

  const fetchDocs = async () => {
    setPickerLoading(true);
    try {
      const data = await getDocuments({ search: pickerSearch || undefined, page_size: 50 });
      setAvailableDocs(data.items);
    } catch (e) {
      console.error('Fetch available docs failed', e);
    } finally {
      setPickerLoading(false);
    }
  };

  const handleLink = async (docId) => {
    setLinking(true);
    try {
      await linkDocumentToMdf(id, currentItemNo, docId);
      setShowPicker(false);
      setPickerSearch('');
      fetchProject();
    } catch (e) {
      alert(e.response?.data?.detail || '綁定失敗');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (linkId) => {
    console.log('Unlinking linkId:', linkId);
    if (!window.confirm('確定要移除此文件的連結嗎？ (文件本身不會被刪除)')) return;
    try {
      await unlinkDocumentFromMdf(linkId);
      console.log('Unlink success');
      fetchProject();
    } catch (e) {
      console.error('Unlink failed', e);
      alert('解除連結失敗');
    }
  };


  if (loading) return <div className="h-full flex items-center justify-center"><LoadingSpinner /></div>;
  if (!project) return (
    <div className="flex flex-col items-center justify-center p-20 text-slate-500">
      <X className="w-16 h-16 mb-4 text-red-200" />
      <h3 className="text-xl font-bold text-slate-900">找不到此 MDF 專案</h3>
      <button onClick={() => navigate('/mdf')} className="mt-4 text-primary-600 font-medium">返回列表</button>
    </div>
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 pb-20">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center space-x-5">
          <button 
            onClick={() => navigate('/mdf')}
            className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all hover:scale-105 active:scale-95"
          >
            <ArrowLeft className="w-6 h-6 text-slate-600" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{project.product_name}</h1>
              <StatusBadge status="active" className="h-fit" />
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-2">
              <div className="flex items-center text-slate-500 text-sm">
                <span className="font-semibold text-slate-900 mr-2">專案編號:</span>
                <span className="font-mono bg-slate-50 border border-slate-100 px-2 rounded">{project.project_no}</span>
              </div>
              <div className="flex items-center text-slate-500 text-sm">
                <span className="font-semibold text-slate-900 mr-2">分級分類:</span>
                <span>{project.classification || '未標註'}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3 p-1.5 bg-slate-50 rounded-xl border border-slate-100 self-start md:self-center">
          <div className="flex items-center px-3 py-1.5 bg-white rounded-lg shadow-sm">
            <Library className="w-4 h-4 text-primary-600 mr-2" />
            <span className="text-sm font-bold text-slate-700">{project.linked_documents.length} 份關聯文件</span>
          </div>
        </div>
      </div>

      {/* Grid of 18 sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {MDF_ITEMS.map((itemName, index) => {
          const itemNo = index + 1;
          const links = project.linked_documents.filter(l => l.item_no === itemNo);
          
          return (
            <div 
              key={itemNo} 
              className={clsx(
                "group bg-white rounded-2xl border transition-all duration-300 relative flex flex-col min-h-[160px]",
                links.length > 0 ? "border-primary-100 shadow-sm shadow-primary-50/50" : "border-slate-200 hover:border-slate-300 shadow-none hover:shadow-lg hover:shadow-slate-200/40"
              )}
            >
              {/* Card Header */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/30 rounded-t-2xl flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-6 h-6 text-[10px] font-black bg-slate-900 text-white rounded-lg">
                    {itemNo}
                  </span>
                  <h3 className="font-bold text-slate-800 text-sm tracking-wide">{itemName}</h3>
                </div>
                
                {links.length === 0 && (
                  <button 
                    onClick={() => openPicker(itemNo)}
                    className="p-1.5 bg-white border border-slate-200 text-primary-600 rounded-lg hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all shadow-sm"
                    title="綁定文件"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Card Content */}
              <div className="p-4 flex-1">
                {links.length > 0 ? (
                  <div className="space-y-3">
                    {links.map(link => (
                      <div key={link.id} className="relative bg-primary-50/50 border border-primary-100 p-3 rounded-xl group/doc animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-start">
                          <div className="mt-0.5 p-1.5 bg-white rounded-lg border border-primary-100 shadow-xs mr-3">
                             <FileText className="w-4 h-4 text-primary-700" />
                          </div>
                          <div className="flex-1 min-w-0 pr-6">
                            <div className="text-sm font-bold text-slate-900 truncate tracking-tight">{link.document.title}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-mono text-slate-500 bg-white border border-slate-100 px-1 rounded uppercase">{link.document.doc_number}</span>
                              <span className="text-[10px] font-bold text-primary-600 bg-white border border-primary-100 px-1 rounded">V{link.document.current_version || '1.0'}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover/doc:opacity-100 transition-opacity z-10">
                          <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               handleUnlink(link.id);
                             }}
                             className="p-1.5 bg-white border border-red-100 text-red-500 rounded-lg hover:bg-red-500 hover:text-white hover:border-red-500 transition-all shadow-sm pointer-events-auto"
                             title="移除連結"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-4 space-y-2 opacity-40 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => openPicker(itemNo)}>
                     <div className="w-10 h-10 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center">
                        <LinkIcon className="w-4 h-4 text-slate-400" />
                     </div>
                     <span className="text-xs font-medium text-slate-400">尚未綁定文件</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Picker Modal */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowPicker(false)} />
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center">
                    <LinkIcon className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-900">綁定文件 (項次 {currentItemNo})</h3>
                    <p className="text-sm text-slate-500 font-medium">{MDF_ITEMS[currentItemNo-1]}</p>
                  </div>
                </div>
                <button onClick={() => setShowPicker(false)} className="p-2 hover:bg-slate-50 text-slate-400 rounded-xl transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="relative">
                <Search className="w-5 h-5 absolute left-4 top-3.5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="搜尋文件標題或編號..." 
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-base focus:ring-2 focus:ring-primary-500 outline-none transition-all placeholder:text-slate-400"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  onKeyUp={(e) => e.key === 'Enter' && fetchDocs()}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/30">
              {pickerLoading ? (
                <div className="flex justify-center p-20"><LoadingSpinner /></div>
              ) : availableDocs.length === 0 ? (
                <div className="p-20 flex flex-col items-center text-center">
                  <FileText className="w-16 h-16 text-slate-200 mb-4" />
                  <p className="text-slate-400 font-medium">找不到匹配的文件</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {availableDocs.map(doc => {
                    // Check if already linked to this item (ui-side only for visual feedback)
                    const isLinkedHere = project.linked_documents.some(l => l.document_id === doc.id && l.item_no === currentItemNo);
                    
                    return (
                      <div 
                        key={doc.id} 
                        className={clsx(
                          "group flex items-center justify-between p-4 bg-white border rounded-2xl transition-all duration-200",
                          isLinkedHere ? "border-primary-500 bg-primary-50/30" : "border-slate-100 hover:border-primary-200 hover:shadow-md hover:shadow-primary-100/30"
                        )}
                      >
                        <div className="flex items-center flex-1 min-w-0">
                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 mr-4 group-hover:bg-primary-50 group-hover:border-primary-100 transition-colors">
                             <FileText className="w-5 h-5 text-slate-400 group-hover:text-primary-600" />
                          </div>
                          <div className="min-w-0 pr-4">
                            <div className="text-base font-bold text-slate-800 group-hover:text-primary-700 truncate transition-colors">{doc.title}</div>
                            <div className="flex items-center gap-3 mt-1 font-mono text-[11px]">
                              <span className="text-slate-500 tracking-tight">{doc.doc_number}</span>
                              <span className="w-1 h-1 bg-slate-300 rounded-full" />
                              <span className="text-primary-600 font-bold">V{doc.current_version || '1.0'}</span>
                            </div>
                          </div>
                        </div>
                        
                        {isLinkedHere ? (
                          <div className="flex items-center text-primary-600 font-bold text-sm bg-white px-3 py-1.5 rounded-xl border border-primary-100">
                            <Check className="w-4 h-4 mr-2" /> 已連結
                          </div>
                        ) : (
                          <button 
                            disabled={linking}
                            onClick={() => handleLink(doc.id)}
                            className="px-5 py-2.5 bg-primary-600 text-white text-sm font-bold rounded-xl hover:bg-primary-700 active:scale-95 disabled:opacity-50 shadow-lg shadow-primary-200 transition-all"
                          >
                            選定
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
               <button 
                  onClick={() => setShowPicker(false)}
                  className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-white rounded-xl transition-all"
               >
                  關閉
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
