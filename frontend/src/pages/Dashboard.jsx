import React, { useState, useEffect } from 'react';
import { getStats, getComplianceInsights, triggerComplianceAnalysis } from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import FileIcon from '../components/common/FileIcon';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { format } from 'date-fns';
import { FileText, Clock, AlertCircle, Plus, RefreshCw, CheckCircle, Info } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [statsData, insightsData] = await Promise.all([
        getStats(),
        getComplianceInsights()
      ]);
      setStats(statsData);
      setInsights(insightsData || []);
    } catch (error) {
      console.error('Failed to fetch dashboard data', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshInsights = async () => {
    setInsightsLoading(true);
    try {
      const data = await triggerComplianceAnalysis();
      if (data.status === 'success') {
        setInsights(data.insights || []);
      }
    } catch (error) {
      console.error('Failed to analyze compliance', error);
    } finally {
      setInsightsLoading(false);
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
        
        {/* Section B: Recent Documents */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col min-h-[400px]">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center">
              <Clock className="w-5 h-5 mr-2 text-indigo-500" />
              最近更新文件
            </h3>
            <span className="text-xs text-indigo-500 bg-indigo-50 px-2 py-1 rounded font-medium">Real-time</span>
          </div>

          <div className="flex-1 overflow-auto overflow-x-hidden pr-2">
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

        {/* Section C: Compliance Insights (REPLACED PLACEHOLDER) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col min-h-[400px]">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center">
              <AlertCircle className="w-5 h-5 mr-2 text-rose-500" />
              智能法規提示
            </h3>
            <button 
              onClick={handleRefreshInsights}
              disabled={insightsLoading}
              className={`p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors ${insightsLoading ? 'animate-spin' : ''}`}
              title="重新執行法規分析"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-auto pr-2">
            {insightsLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <LoadingSpinner size="md" />
                <p className="text-xs mt-4 animate-pulse">Gemma 3 正在分析合規缺漏...</p>
              </div>
            ) : insights.length > 0 ? (
              <div className="space-y-4">
                {insights.map((insight, idx) => (
                  <div key={idx} className={`p-4 rounded-xl border flex gap-3 ${
                    insight.severity === 'warning' ? 'bg-amber-50/50 border-amber-100' : 
                    insight.severity === 'critical' ? 'bg-rose-50/50 border-rose-100' : 
                    'bg-blue-50/30 border-blue-100'
                  }`}>
                    <div className="shrink-0 mt-0.5">
                      {insight.type === 'MISSING_DOC' ? (
                        <AlertCircle className="w-5 h-5 text-amber-500" />
                      ) : insight.type === 'RELEVANT_CLAUSE' ? (
                        <Info className="w-5 h-5 text-blue-500" />
                      ) : (
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 mb-1">{insight.title}</h4>
                      <p className="text-xs text-slate-600 leading-relaxed">{insight.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 py-10">
                <CheckCircle className="w-10 h-10 mb-2 opacity-20 text-emerald-500" />
                <p className="text-sm">法規狀況良好</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
