import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, Search, Settings, Library, Cog } from 'lucide-react';

import clsx from 'clsx';

const navItems = [
  { icon: LayoutDashboard, label: '儀表板', path: '/' },
  { icon: FileText, label: '文件清單', path: '/documents' },
  { icon: Search, label: '語意搜尋', path: '/search' },
  { icon: Library, label: 'MDF 管理', path: '/mdf' },
  { icon: Cog, label: '零件承認管理', path: '/parts' },  // 新增零件 PPAP 模組
  { icon: Settings, label: '系統設定', path: '/settings' },
];



export default function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 bg-white w-64 border-r border-slate-200 overflow-y-auto">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-primary-600 tracking-tight">docAI</h1>
        <p className="text-xs text-slate-500 mt-1">AI 驅動文件管理系統</p>
      </div>

      <nav className="mt-6 px-4">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                state={{ clearListCache: true }}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center px-4 py-3 rounded-xl transition-colors duration-200',
                    isActive 
                      ? 'bg-primary-50 text-primary-700 font-medium' 
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  )
                }
              >
                <item.icon className="w-5 h-5 mr-3" strokeWidth={2} />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      
      <div className="absolute bottom-0 w-full p-4 border-t border-slate-100">
        <div className="bg-slate-50 rounded-lg p-4 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-slate-900">版本</span>
            <span className="text-xs text-slate-500">v1.0.0-beta</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
