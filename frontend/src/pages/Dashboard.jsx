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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Section B: My Pending Tasks (Mock Data) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col min-h-[400px]">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center">
              <AlertCircle className="w-5 h-5 mr-2 text-amber-500" />
              待我處理
            </h3>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">Mock Data</span>
          </div>

          <div className="flex-1 overflow-auto">
            <div className="space-y-3">
              {[
                { id: 1, title: '產品規格書(草案)', doc_number: 'SPEC-2026-001', status: 'draft', updated_at: '2026-04-05T08:30:00Z' },
                { id: 2, title: '風險管理計畫', doc_number: 'RMP-2026-004', status: 'reviewing', updated_at: '2026-04-04T15:20:00Z' },
                { id: 3, title: '不合格品處理單', doc_number: 'NC-2026-012', status: 'draft', updated_at: '2026-04-03T10:15:00Z' }
              ].map(task => (
                <div key={task.id} className="p-3 border border-slate-100 rounded-xl hover:border-primary-200 hover:bg-primary-50/30 transition-all group cursor-pointer">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="text-sm font-semibold text-slate-800 group-hover:text-primary-700">{task.title}</h4>
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500">
                    <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{task.doc_number}</span>
                    <div className="flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      {format(new Date(task.updated_at), 'MM-dd HH:mm')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Section C: My Reserved Numbers (Mock Data) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col min-h-[400px]">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center">
              <FileText className="w-5 h-5 mr-2 text-blue-500" />
              我的預約編號
            </h3>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">Mock Data</span>
          </div>

          <div className="flex-1 overflow-auto">
            <div className="space-y-3">
              {[
                { id: 1, doc_number: 'SOP-2026-089', title: '（測試流程文件）', category: 'SOP', reserved_at: '2026-04-05T09:00:00Z' },
                { id: 2, doc_number: 'FORM-2026-102', title: '（新進員工報到單）', category: 'FORM', reserved_at: '2026-04-04T16:45:00Z' }
              ].map(doc => (
                <div key={doc.id} className="p-3 border border-slate-100 rounded-xl flex items-center hover:bg-slate-50 transition cursor-pointer">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mr-4 shrink-0">
                    <span className="text-blue-600 font-bold text-sm">NO</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-mono text-sm font-bold text-slate-800 truncate">{doc.doc_number}</span>
                      <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{doc.category}</span>
                    </div>
                    <div className="text-xs text-slate-500 truncate">{doc.title}</div>
                  </div>
                  <div className="text-xs text-slate-400 shrink-0 ml-4 flex flex-col items-end">
                    <span>預約於</span>
                    <span>{format(new Date(doc.reserved_at), 'MM-dd')}</span>
                  </div>
                </div>
              ))}
              
              <button className="w-full mt-4 py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 hover:text-primary-600 hover:border-primary-300 hover:bg-primary-50 transition flex items-center justify-center text-sm font-medium">
                <Plus className="w-4 h-4 mr-2" /> 立即預約新編號
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
