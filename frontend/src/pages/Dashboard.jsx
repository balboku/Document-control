import React from 'react';

export default function Dashboard() {
  return (
    <div className="animate-in fade-in duration-500">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">系統概覽</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { title: '啟用文件', value: '1,234', color: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200' },
          { title: '草稿/待確認', value: '42', color: 'bg-amber-50 text-amber-700', border: 'border-amber-200' },
          { title: '預約編號', value: '18', color: 'bg-blue-50 text-blue-700', border: 'border-blue-200' },
          { title: '今日上傳', value: '7', color: 'bg-purple-50 text-purple-700', border: 'border-purple-200' },
        ].map((stat, i) => (
          <div key={i} className={`p-6 rounded-2xl border bg-white shadow-sm flex flex-col`}>
            <span className="text-sm font-medium text-slate-500">{stat.title}</span>
            <span className="text-3xl font-bold text-slate-800 mt-2">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 min-h-[400px]">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">最近更新</h3>
        <div className="flex items-center justify-center h-64 text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
          近期操作記錄將顯示於此
        </div>
      </div>
    </div>
  );
}
