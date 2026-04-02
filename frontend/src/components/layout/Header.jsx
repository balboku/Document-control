import React from 'react';
import { Bell, Search, UserCircle } from 'lucide-react';

export default function Header() {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="flex items-center justify-between px-8 py-4">
        
        {/* Left: Global Search (placeholder) */}
        <div className="flex-1 max-w-lg">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </div>
            <input 
              type="text" 
              className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 sm:text-sm transition-colors duration-200" 
              placeholder="快速搜尋文件名稱、編號..." 
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-6 ml-6">
          <button className="text-slate-400 hover:text-slate-600 relative transition-colors duration-200">
            <Bell className="h-6 w-6" />
            <span className="absolute top-0 right-0 block h-2.5 w-2.5 rounded-full bg-red-400 ring-2 ring-white"></span>
          </button>
          
          <div className="flex items-center border-l border-slate-200 pl-6 cursor-pointer">
            <UserCircle className="h-8 w-8 text-slate-300" />
            <div className="ml-3">
              <p className="text-sm font-medium text-slate-700 group-hover:text-slate-900">目前操作者未指定</p>
              <p className="text-xs text-slate-500">請至設定區設定</p>
            </div>
          </div>
        </div>
        
      </div>
    </header>
  );
}
