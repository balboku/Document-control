import React, { useState, useEffect } from 'react';
import { getStats } from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import FileIcon from '../components/common/FileIcon';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { format } from 'date-fns';
import { FileText, Clock, AlertCircle } from 'lucide-react';

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

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 min-h-[400px]">
        <h3 className="text-lg font-semibold text-slate-800 mb-6 border-b border-slate-100 pb-4 flex items-center">
          <Clock className="w-5 h-5 mr-2 text-slate-400" />
          最近更新
        </h3>
        
        {stats.recent_documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
            <FileText className="w-8 h-8 mb-2 opacity-50" />
            無近期操作記錄
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {stats.recent_documents.map((doc) => (
              <div key={doc.id} className="py-4 flex justify-between items-center group">
                <div className="flex items-start">
                  <FileIcon type={doc.current_version ? 'pdf' : 'doc'} className="mt-1 mr-4 shrink-0" />
                  <div>
                    <h4 className="text-base font-semibold text-slate-900 group-hover:text-primary-600 transition-colors">
                      {doc.title || '（無標題）'}
                    </h4>
                    <div className="flex items-center text-sm text-slate-500 mt-1 space-x-3">
                      <span className="font-mono">{doc.doc_number || '-'}</span>
                      <span>・</span>
                      <span>{doc.author_name || '系統'}</span>
                      {doc.category_name && (
                        <>
                          <span>・</span>
                          <span>{doc.category_name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <StatusBadge status={doc.status} className="mb-2" />
                  <span className="text-xs text-slate-400">
                    {format(new Date(doc.updated_at || doc.created_at), 'yyyy-MM-dd HH:mm')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
