import React, { useState, useEffect } from 'react';
import { getStats } from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import FileIcon from '../components/common/FileIcon';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { format } from 'date-fns';
import { FileText, Clock, AlertCircle, Plus } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const data = await getStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-slate-500">
        <AlertCircle className="w-12 h-12 text-slate-300 mb-4" />
        <p className="text-lg font-medium">無法載入系統資料</p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">系統概覽</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { title: '啟用文件', value: stats.active_count, color: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200' },
          { title: '草稿/待確認', value: stats.draft_count, color: 'bg-amber-50 text-amber-700', border: 'border-amber-200' },
          { title: '預約編號', value: stats.reserved_count, color: 'bg-blue-50 text-blue-700', border: 'border-blue-200' },
          { title: '今日上傳', value: stats.today_upload_count, color: 'bg-indigo-50 text-indigo-700', border: 'border-indigo-200' },
        ].map((stat, i) => (
          <div key={i} className={`p-6 rounded-2xl border bg-white shadow-sm flex flex-col`}>
            <span className="text-sm font-medium text-slate-500">{stat.title}</span>
            <span className="text-3xl font-bold text-slate-800 mt-2">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Section B: Recent Documents (Replaced Mock Data) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col min-h-[400px]">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center">
              <Clock className="w-5 h-5 mr-2 text-indigo-500" />
              最近更新文件
            </h3>
            <span className="text-xs text-indigo-500 bg-indigo-50 px-2 py-1 rounded font-medium">Real-time</span>
          </div>

          <div className="flex-1 overflow-auto">
            {stats.recent_documents && stats.recent_documents.length > 0 ? (
              <div className="space-y-3">
                {stats.recent_documents.map(doc => (
                  <div key={doc.id} className="p-3 border border-slate-100 rounded-xl hover:border-primary-200 hover:bg-primary-50/30 transition-all group cursor-pointer" 
                       onClick={() => window.location.href = `/documents/${doc.id}`}>
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="text-sm font-semibold text-slate-800 group-hover:text-primary-700 truncate pr-4">{doc.title || '無標題'}</h4>
                      <StatusBadge status={doc.status} />
                    </div>
                    <div className="flex justify-between items-center text-xs text-slate-500">
                      <div className="flex items-center">
                        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded mr-2">{doc.doc_number}</span>
                        {doc.category_name && <span className="text-slate-400">{doc.category_name}</span>}
                      </div>
                      <div className="flex items-center text-slate-400">
                        <Clock className="w-3 h-3 mr-1" />
                        {doc.updated_at ? format(new Date(doc.updated_at), 'MM-dd HH:mm') : 'N/A'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 py-10">
                <FileText className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-sm">尚無任何文件記錄</p>
              </div>
            )}
          </div>
        </div>

        {/* Section C: System Integration Status (Refined placeholder) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col min-h-[400px]">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center">
              <AlertCircle className="w-5 h-5 mr-2 text-amber-500" />
              智能關聯提示
            </h3>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">Gemma 3 Powered</span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mb-4">
              <Plus className="w-8 h-8 text-amber-500 opacity-50" />
            </div>
            <h4 className="text-slate-800 font-semibold mb-2">待開發功能：工作流程模組</h4>
            <p className="text-sm text-slate-500 max-w-[280px]">
              系統將根據文件屬性與 ISO 稽核規範，自動提醒您待完成的法規關聯性。目前此功能開發中。
            </p>
            <button className="mt-6 px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 transition">
              查看開發路線圖
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
