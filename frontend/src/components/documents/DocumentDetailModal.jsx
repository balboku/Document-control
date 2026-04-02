import React, { useState, useEffect } from 'react';
import { getDocumentDetail, analyzeRelations } from '../../services/api';
import StatusBadge from '../common/StatusBadge';
import LoadingSpinner from '../common/LoadingSpinner';
import { format } from 'date-fns';
import { X, Layers, User, Calendar, FileText, Sparkles, Loader2, GitMerge } from 'lucide-react';

export default function DocumentDetailModal({ docId, onClose }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // AI Relations
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  useEffect(() => {
    fetchDetail();
  }, [docId]);

  const fetchDetail = async () => {
    try {
      const data = await getDocumentDetail(docId);
      setDoc(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const result = await analyzeRelations(docId);
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
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden slide-in-bottom">
        
        {/* Header */}
        <div className="flex justify-between items-start p-6 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <StatusBadge status={doc.status} />
              <span className="text-sm font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                {doc.doc_number || "未編號"}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800">{doc.title || "（無標題）"}</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 flex flex-col md:flex-row gap-6">
          
          {/* Left Column: Metadata & Details */}
          <div className="flex-1 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">基本資訊</h3>
              <div className="space-y-4">
                <div className="flex items-center text-sm">
                  <User className="w-4 h-4 mr-3 text-slate-400" />
                  <span className="text-slate-600 w-24">製定人員</span>
                  <span className="font-medium text-slate-900">{doc.author_name || "-"}</span>
                </div>
                <div className="flex items-center text-sm">
                  <Layers className="w-4 h-4 mr-3 text-slate-400" />
                  <span className="text-slate-600 w-24">文件類別</span>
                  <span className="font-medium text-slate-900">{doc.category_name || "-"}</span>
                </div>
                <div className="flex items-center text-sm">
                  <Calendar className="w-4 h-4 mr-3 text-slate-400" />
                  <span className="text-slate-600 w-24">建立時間</span>
                  <span className="font-medium text-slate-900">{format(new Date(doc.created_at), 'yyyy-MM-dd HH:mm')}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">備註與說明</h3>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {doc.notes || "無備註內容。"}
              </p>
            </div>
          </div>

          {/* Right Column: AI & Versions */}
          <div className="w-full md:w-96 space-y-6">
            <div className="bg-gradient-to-br from-indigo-50 to-primary-50 rounded-xl border border-primary-100 p-5 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wider flex items-center">
                  <Sparkles className="w-4 h-4 mr-2" /> AI 關聯分析
                </h3>
                {!analysisResult && !analyzing && (
                  <button 
                    onClick={handleAnalyze}
                    className="px-3 py-1.5 bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-semibold shadow-sm transition"
                  >
                    開始分析
                  </button>
                )}
              </div>
              
              {analyzing ? (
                <div className="flex flex-col items-center justify-center p-6 text-indigo-600/80">
                  <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-400" />
                  <span className="text-sm font-medium">向量檢索與 Gemma 3 分析中...</span>
                </div>
              ) : analysisResult ? (
                <div className="space-y-4 animate-in fade-in">
                  <div className="bg-white rounded-lg p-3 text-sm text-slate-700 border border-indigo-100 leading-relaxed shadow-sm">
                    {analysisResult.analysis_text.split('\n').map((line, i) => (
                      <p key={i} className="mb-2 last:mb-0">{line}</p>
                    ))}
                  </div>
                  
                  {analysisResult.related_documents && analysisResult.related_documents.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-indigo-800 mb-2 block">參考來源 ({analysisResult.related_documents.length})：</span>
                      <ul className="space-y-2">
                        {analysisResult.related_documents.map(rd => (
                          <li key={rd.document_id} className="text-xs bg-white/60 p-2 rounded border border-indigo-100/50 flex items-start">
                            <GitMerge className="w-3.5 h-3.5 mr-2 mt-0.5 text-indigo-400 shrink-0" />
                            <span className="font-medium text-slate-700">{rd.title} ({rd.doc_number})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-indigo-700/80 leading-relaxed">
                  點擊分析按鈕，系統將自動比對資料庫尋找業務關聯高度相似的文件，並透過 AI 總結彼此關係。
                </p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">文件版本</h3>
              <div className="space-y-3">
                {doc.versions && doc.versions.map(v => (
                  <div key={v.id} className="flex justify-between items-center p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center space-x-3">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">{v.version_number}</span>
                    </div>
                    {v.is_current && (
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded uppercase">Current</span>
                    )}
                  </div>
                ))}
                {(!doc.versions || doc.versions.length === 0) && (
                  <div className="text-sm text-slate-400 text-center py-2">尚無版本紀錄</div>
                )}
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
