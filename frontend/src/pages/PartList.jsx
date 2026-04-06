import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Cog, Search, ChevronRight, X, Edit2, Trash2 } from 'lucide-react';
import { getParts, createPart, updatePart, deletePart } from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useListStateCache } from '../hooks/useListStateCache';

// 狀態標籤的顏色對應
const STATUS_COLORS = {
  active:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  inactive: 'bg-amber-100 text-amber-700 border-amber-200',
  archived: 'bg-slate-100 text-slate-500 border-slate-200',
};
const STATUS_LABELS = {
  active: '進行中',
  inactive: '暫停',
  archived: '已封存',
};

export default function PartList() {
  const navigate = useNavigate();
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
  const [currentPartId, setCurrentPartId] = useState(null);
  const [searchTerm, setSearchTerm] = useListStateCache('part-list-state', '');

  // 表單資料
  const [formData, setFormData] = useState({
    part_number: '',
    part_name: '',
    version: '',
    status: 'active',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchParts();
  }, []);

  const fetchParts = async () => {
    setLoading(true);
    try {
      const data = await getParts();
      setParts(data);
    } catch (e) {
      console.error('Fetch parts failed', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setModalMode('create');
    setFormData({ part_number: '', part_name: '', version: '', status: 'active', description: '' });
    setError('');
    setShowModal(true);
  };

  const handleOpenEdit = (e, part) => {
    e.stopPropagation();
    setModalMode('edit');
    setCurrentPartId(part.id);
    setFormData({
      part_number: part.part_number,
      part_name: part.part_name,
      version: part.version || '',
      status: part.status || 'active',
      description: part.description || '',
    });
    setError('');
    setShowModal(true);
  };

  const handleDelete = async (e, part) => {
    e.stopPropagation();
    if (!window.confirm(`確定要刪除零件「${part.part_name} (${part.part_number})」嗎？\n所有文件綁定紀錄將一併清除，此操作不可復原。`)) return;
    try {
      await deletePart(part.id);
      fetchParts();
    } catch (err) {
      alert(err.response?.data?.detail || '刪除失敗');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (modalMode === 'create') {
        // 建立時傳送全部欄位
        await createPart(formData);
      } else {
        // 更新時只傳 part_number 以外的欄位（後端不允許修改料號）
        const { part_number, ...updateData } = formData;
        await updatePart(currentPartId, updateData);
      }
      setShowModal(false);
      fetchParts();
    } catch (err) {
      setError(err.response?.data?.detail || (modalMode === 'create' ? '建立失敗' : '更新失敗'));
    } finally {
      setSaving(false);
    }
  };

  // 前端篩選
  const filtered = parts.filter(p =>
    (p.part_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.part_number || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      {/* 頁首 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">零件承認管理 (PPAP)</h1>
          <p className="text-slate-500 mt-1">管理各零件的 PPAP 文件綁定，包含圖面、BOM、FMEA 等核心文件</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center justify-center px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-all duration-200 shadow-sm font-medium"
        >
          <Plus className="w-5 h-5 mr-2" />
          新增零件專案
        </button>
      </div>

      {/* 主要表格卡片 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* 搜尋列 */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="搜尋零件名稱或料號..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-shadow"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* 表格 */}
        <div className="flex-1 overflow-x-auto">
          {loading ? (
            <div className="p-20 flex justify-center"><LoadingSpinner /></div>
          ) : filtered.length === 0 ? (
            <div className="p-20 flex flex-col items-center text-center">
              <Cog className="w-16 h-16 text-slate-200 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900">尚無零件專案</h3>
              <p className="text-slate-500 max-w-sm mt-1">
                {searchTerm ? '找不到符合條件的零件，請嘗試其他關鍵字。' : '請點擊「新增零件專案」開始建立 PPAP 文件清單。'}
              </p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">零件資訊</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">料號</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">版本</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">狀態</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">已綁定文件</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">建立日期</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-widest">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filtered.map((part) => (
                  <tr
                    key={part.id}
                    className="hover:bg-primary-50/30 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/parts/${part.id}`)}
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center mr-3 group-hover:scale-110 transition-transform">
                          <Cog className="w-5 h-5 text-violet-700" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">{part.part_name}</div>
                          {part.description && (
                            <div className="text-xs text-slate-400 mt-0.5 max-w-[200px] truncate">{part.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-xs font-mono bg-slate-100 px-2.5 py-1 rounded-md text-slate-700">{part.part_number}</span>
                    </td>
                    <td className="px-6 py-5 text-sm text-slate-600">
                      {part.version || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[part.status] || STATUS_COLORS.active}`}>
                        {STATUS_LABELS[part.status] || part.status}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-sm text-slate-600">
                      <span className="font-bold text-violet-600">{part.items?.length || 0}</span>
                      <span className="text-slate-400 ml-1">/ 5 項</span>
                    </td>
                    <td className="px-6 py-5 text-sm text-slate-500">
                      {new Date(part.created_at).toLocaleDateString('zh-TW')}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={(e) => handleOpenEdit(e, part)}
                          className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                          title="編輯"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, part)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="刪除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary-500 transform group-hover:translate-x-1 transition-all" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 新增 / 編輯 Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative z-10 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
                  <Cog className="w-5 h-5 text-violet-700" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">
                  {modalMode === 'create' ? '新增零件專案' : '編輯零件專案'}
                </h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="p-6 space-y-5">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 font-medium">
                  {error}
                </div>
              )}

              {/* 料號（建立後不可修改） */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  零件料號 <span className="text-red-500">*</span>
                  {modalMode === 'edit' && <span className="text-xs text-slate-400 font-normal ml-2">（建立後不可修改）</span>}
                </label>
                <input
                  type="text"
                  required
                  disabled={modalMode === 'edit'}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed font-mono"
                  placeholder="例如：PN-2024-001"
                  value={formData.part_number}
                  onChange={e => setFormData({ ...formData, part_number: e.target.value })}
                />
              </div>

              {/* 零件名稱 */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  零件名稱 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                  placeholder="例如：外殼上蓋"
                  value={formData.part_name}
                  onChange={e => setFormData({ ...formData, part_name: e.target.value })}
                />
              </div>

              {/* 版本 & 狀態 並排 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">版本</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                    placeholder="例如：Rev.A"
                    value={formData.version}
                    onChange={e => setFormData({ ...formData, version: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">狀態</label>
                  <select
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="active">進行中</option>
                    <option value="inactive">暫停</option>
                    <option value="archived">已封存</option>
                  </select>
                </div>
              </div>

              {/* 說明 */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">說明備註</label>
                <textarea
                  rows={3}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all resize-none"
                  placeholder="選填，輸入零件說明或 PPAP 層級..."
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              {/* 按鈕 */}
              <div className="pt-2 flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors font-medium"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-all font-medium shadow-sm"
                >
                  {saving ? '處理中...' : '確認儲存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
