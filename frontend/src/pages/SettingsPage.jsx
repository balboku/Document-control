import React, { useState } from 'react';
import UserManagement from '../components/settings/UserManagement';
import CategoryManagement from '../components/settings/CategoryManagement';
import NumberFormatSetting from '../components/settings/NumberFormatSetting';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('users');
  
  const tabs = [
    { id: 'users', label: '使用者管理' },
    { id: 'categories', label: '類別與編號格式設定' },
  ];

  return (
    <div className="animate-in fade-in duration-500 max-w-5xl mx-auto pb-12">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">系統設定</h2>
      
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex min-h-[700px] overflow-hidden">
        {/* Settings Sidebar */}
        <div className="w-64 bg-slate-50 border-r border-slate-200 p-4 shrink-0">
          <ul className="space-y-1 sticky top-4">
            {tabs.map(tab => (
              <li key={tab.id}>
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl font-medium text-sm transition-colors ${
                    activeTab === tab.id 
                      ? 'bg-white text-primary-700 shadow-sm ring-1 ring-slate-200/50' 
                      : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
        
        {/* Settings Content */}
        <div className="flex-1 p-8 overflow-y-auto">
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'categories' && (
            <div className="space-y-16">
               <CategoryManagement />
               <div className="border-t border-slate-200 pt-8">
                  <NumberFormatSetting />
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
