import React, { useState } from 'react';
import { semanticSearch } from '../../services/api';
import StatusBadge from '../common/StatusBadge';
import LoadingSpinner from '../common/LoadingSpinner';
import { Search, Sparkles, AlertCircle } from 'lucide-react';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);
    try {
      const data = await semanticSearch({ query, limit: 10 });
      setResults(data.results);
    } catch (error) {
      console.error('Search error', error);
      alert('搜尋發生錯誤');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500 max-w-4xl mx-auto py-8">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-slate-800 mb-4 bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-indigo-600">
          語意搜尋 <span className="text-sm align-top ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800"><Sparkles className="w-3 h-3 mr-1"/> AI Powered</span>
        </h2>
        <p className="text-slate-500">使用自然語言描述您想找的文件內容，系統將透過 Gemini 向量分析為您找出最相關的文件。</p>
      </div>
      
      <form onSubmit={handleSearch} className="relative mb-12 group">
        <input 
          type="text" 
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full px-6 py-5 text-lg border-2 border-slate-200 rounded-2xl shadow-sm focus:outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all pr-36 bg-white shrink-0"
          placeholder="例如：關於產品退貨的處理流程規範..."
        />
        <button 
          type="submit" disabled={loading || !query.trim()}
          className="absolute right-3 top-3 bottom-3 px-6 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50 flex items-center"
        >
          {loading ? <LoadingSpinner size="sm" className="mr-2" /> : <Search className="w-5 h-5 mr-2" />}
          搜尋
        </button>
      </form>
      
      {hasSearched && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 text-slate-500">
              <LoadingSpinner size="lg" className="mb-4" />
              <p>Gemini 正在分析您的語意，並與資料庫比對中...</p>
            </div>
          ) : results.length > 0 ? (
            <div>
              <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50">
                <h3 className="font-medium text-slate-700">找到 {results.length} 筆最相關的文件</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {results.map((item, index) => (
                  <div key={`${item.document_id}-${index}`} className="p-8 hover:bg-slate-50 transition-colors group">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="text-lg font-bold text-slate-900 group-hover:text-primary-600 transition-colors cursor-pointer">
                          {item.title}
                        </h4>
                        <p className="text-sm text-slate-500 font-mono mt-0.5">{item.doc_number}</p>
                      </div>
                      <div className="flex flex-col items-end">
                        <StatusBadge status={item.status} className="mb-2" />
                        <div className="flex items-center text-xs font-medium text-primary-600 bg-primary-50 px-2 py-1 rounded-lg">
                          相關度: {(item.similarity_score * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100/50 relative">
                      <div className="absolute top-0 left-0 w-1 h-full bg-primary-200 rounded-l-xl"></div>
                      <p className="text-sm text-slate-600 leading-relaxed italic">
                        "... {item.chunk_content} ..."
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-20 text-slate-500">
              <AlertCircle className="w-12 h-12 text-slate-300 mb-4" />
              <p className="text-lg font-medium text-slate-700">找不到相關內容</p>
              <p className="mt-1">請嘗試使用其他關鍵字或更具體的描述</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
