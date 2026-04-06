import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, FileText, Link as LinkIcon, Trash2, Plus,
  Search, X, Check, Cog, Edit2,
} from 'lucide-react';
import {
  getPartDetail, updatePart, deletePart,
  bindPartItem, unbindPartItem, getDocuments,
} from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import StatusBadge from '../components/common/StatusBadge';
import { clsx } from 'clsx';

// ============================================================
// PPAP 標準項次定義
// 每個項次包含：代碼、中文名稱、描述
// ============================================================
const PART_ITEMS = [
  {
    code: 'DRAWING',
    label: '圖面',
    desc: '工程圖、3D 模型、GD&T 公差標註',
  },
  {
    code: 'BOM',
    label: '物料清單',
    desc: 'BOM Table，包含所有材料、半成品及外購件',
  },
  {
    code: 'SIP',
    label: '檢驗標準',
    desc: 'SIP 進料 / 製程 / 出貨檢驗規範與抽樣計畫',
  },
  {
    code: 'CP',
    label: '管制計畫',
    desc: 'Control Plan，記錄每道製程的管制特性與量測方式',
  },
  {
    code: 'FMEA',
    label: 'FMEA 失效模式分析',
    desc: '設計 DFMEA 或製程 PFMEA 風險分析表',
  },
];

// 狀態顏色對應（與 PartList 一致）
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

export default function PartDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [part, setPart] = useState(null);
  const [loading, setLoading] = useState(true);

  // 編輯 Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    part_name: '', version: '', status: 'active', description: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // 文件選擇器 (Picker) Modal
  const [showPicker, setShowPicker] = useState(false);
  const [currentItemCode, setCurrentItemCode] = useState(null);
  const [availableDocs, setAvailableDocs] = useState([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerLoading, setPickerLoading] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    fetchPart();
  }, [id]);

  // 讀取零件詳細資料
  const fetchPart = async () => {
    setLoading(true);
    try {
      const data = await getPartDetail(id);
      setPart(data);
      setEditForm({
        part_name: data.part_name,
        version: data.version || '',
        status: data.status || 'active',
        description: data.description || '',
      });
    } catch (e) {
      console.error('Fetch part detail failed', e);
    } finally {
      setLoading(false);
    }
  };

  // 儲存編輯
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setSavingEdit(true);
    setEditError('');
    try {
      await updatePart(id, editForm);
      setShowEditModal(false);
      fetchPart();
    } catch (err) {
      setEditError(err.response?.data?.detail || '更新失敗');
    } finally {
      setSavingEdit(false);
    }
  };

  // 刪除整個零件專案
  const handleDeletePart = async () => {
    if (!window.confirm(`確定要刪除零件「${part.part_name}」嗎？\n所有的文件綁定記錄將被移除，此操作不可復原。`)) return;
    try {
      await deletePart(id);
      navigate('/parts');
    } catch (err) {
      alert(err.response?.data?.detail || '刪除專案失敗');
    }
  };

  // 開啟文件選擇器
  const openPicker = async (itemCode) => {
    setCurrentItemCode(itemCode);
    setPickerSearch('');
    setShowPicker(true);
    fetchDocs('');
  };

  // 載入可用文件清單
  const fetchDocs = async (searchVal) => {
    setPickerLoading(true);
    try {
      const data = await getDocuments({ search: searchVal || undefined, page_size: 50 });
      setAvailableDocs(data.items);
    } catch (e) {
      console.error('Fetch docs failed', e);
    } finally {
      setPickerLoading(false);
    }
  };

  // 綁定文件到零件項次
  const handleBind = async (docId) => {
    setLinking(true);
    try {
      await bindPartItem(id, currentItemCode, docId);
      setShowPicker(false);
      fetchPart();
    } catch (e) {
      alert(e.response?.data?.detail || '綁定失敗');
    } finally {
      setLinking(false);
    }
  };

  // 解除文件綁定
  const handleUnbind = async (itemId) => {
    if (!window.confirm('確定要移除此文件的連結嗎？（文件本身不會被刪除）')) return;
    try {
      await unbindPartItem(id, itemId);
      fetchPart();
    } catch (e) {
      alert(e.response?.data?.detail || '解除綁定失敗');
    }
  };

  // 取得某 item_code 已綁定的文件（每個 code 最多 1 份）
  const getBoundItem = (itemCode) =>
    part?.items?.find(i => i.item_code === itemCode) || null;

  // 計算完成度
  const completedCount = PART_ITEMS.filter(pi => getBoundItem(pi.code)).length;

  // ──────────────────────────────────────────────
  if (loading) return <div className="h-full flex items-center justify-center"><LoadingSpinner /></div>;
  if (!part) return (
    <div className="flex flex-col items-center justify-center p-20 text-slate-500">
      <X className="w-16 h-16 mb-4 text-red-200" />
      <h3 className="text-xl font-bold text-slate-900">找不到此零件專案</h3>
      <button onClick={() => navigate('/parts')} className="mt-4 text-primary-600 font-medium">返回列表</button>
    </div>
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 pb-20">
      {/* ===== 頁首資訊卡 ===== */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center space-x-5">
          {/* 返回按鈕 */}
          <button
            onClick={() => navigate('/parts')}
            className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all hover:scale-105 active:scale-95"
          >
            <ArrowLeft className="w-6 h-6 text-slate-600" />
          </button>
          {/* 基本資訊 */}
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{part.part_name}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[part.status] || STATUS_COLORS.active}`}>
                {STATUS_LABELS[part.status] || part.status}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-2">
              <div className="flex items-center text-slate-500 text-sm">
                <span className="font-semibold text-slate-900 mr-2">料號:</span>
                <span className="font-mono bg-slate-50 border border-slate-100 px-2 rounded">{part.part_number}</span>
              </div>
              {part.version && (
                <div className="flex items-center text-slate-500 text-sm">
                  <span className="font-semibold text-slate-900 mr-2">版本:</span>
                  <span>{part.version}</span>
                </div>
              )}
              {part.description && (
                <div className="flex items-center text-slate-500 text-sm">
                  <span className="font-semibold text-slate-900 mr-2">說明:</span>
                  <span className="truncate max-w-xs">{part.description}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右側操作區 */}
        <div className="flex items-center gap-3 self-start md:self-center">
          {/* 完成度 Badge */}
          <div className="flex items-center px-3 py-1.5 bg-violet-50 rounded-lg shadow-sm border border-violet-100">
            <Cog className="w-4 h-4 text-violet-600 mr-2" />
            <span className="text-sm font-bold text-violet-700">{completedCount} / {PART_ITEMS.length} 項完成</span>
          </div>
          {/* 进度条 */}
          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / PART_ITEMS.length) * 100}%` }}
            />
          </div>
          {/* 編輯 / 刪除按鈕 */}
          <button
            onClick={() => { setEditError(''); setShowEditModal(true); }}
            className="p-2.5 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:text-primary-600 hover:border-primary-200 transition-all shadow-sm"
            title="編輯零件資訊"
          >
            <Edit2 className="w-5 h-5" />
          </button>
          <button
            onClick={handleDeletePart}
            className="p-2.5 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all shadow-sm"
            title="刪除零件專案"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ===== PPAP 項次卡片 Grid ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        {PART_ITEMS.map((pi) => {
          const bound = getBoundItem(pi.code);
          return (
            <div
              key={pi.code}
              className={clsx(
                'group bg-white rounded-2xl border transition-all duration-300 relative flex flex-col min-h-[200px]',
                bound
                  ? 'border-violet-100 shadow-sm shadow-violet-50/50'
                  : 'border-slate-200 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/40',
              )}
            >
              {/* 卡片頂部 */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/30 rounded-t-2xl flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-6 h-6 text-[10px] font-black bg-violet-700 text-white rounded-lg">
                    {PART_ITEMS.indexOf(pi) + 1}
                  </span>
                  <h3 className="font-bold text-slate-800 text-sm tracking-wide">{pi.label}</h3>
                </div>
                {/* 若尚未綁定，顯示 + 按鈕 */}
                {!bound && (
                  <button
                    onClick={() => openPicker(pi.code)}
                    className="p-1.5 bg-white border border-slate-200 text-violet-600 rounded-lg hover:bg-violet-600 hover:text-white hover:border-violet-600 transition-all shadow-sm"
                    title="綁定文件"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* 卡片內容 */}
              <div className="p-4 flex-1 flex flex-col">
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">{pi.desc}</p>

                {bound ? (
                  /* 已綁定文件展示 */
                  <div className="relative bg-violet-50/50 border border-violet-100 p-3 rounded-xl group/doc animate-in fade-in zoom-in-95 duration-200 mt-auto">
                    <div className="flex items-start">
                      <div className="mt-0.5 p-1.5 bg-white rounded-lg border border-violet-100 shadow-xs mr-3">
                        <FileText className="w-4 h-4 text-violet-600" />
                      </div>
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="text-sm font-bold text-slate-900 truncate tracking-tight">
                          {bound.document?.title || '(未命名文件)'}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-mono text-slate-500 bg-white border border-slate-100 px-1 rounded uppercase">
                            {bound.document?.doc_number}
                          </span>
                          <span className="text-[10px] font-bold text-violet-600 bg-white border border-violet-100 px-1 rounded">
                            V{bound.document?.current_version || '1.0'}
                          </span>
                        </div>
                        {bound.notes && (
                          <p className="text-[10px] text-slate-400 mt-1 italic truncate">{bound.notes}</p>
                        )}
                      </div>
                    </div>
                    {/* 滑鼠懸浮時顯示刪除按鈕 */}
                    <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover/doc:opacity-100 transition-opacity z-10">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUnbind(bound.id); }}
                        className="p-1.5 bg-white border border-red-100 text-red-500 rounded-lg hover:bg-red-500 hover:text-white hover:border-red-500 transition-all shadow-sm"
                        title="移除連結"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 尚未綁定 */
                  <div
                    className="flex flex-col items-center justify-center flex-1 py-4 space-y-2 opacity-40 group-hover:opacity-100 transition-opacity cursor-pointer"
                    onClick={() => openPicker(pi.code)}
                  >
                    <div className="w-10 h-10 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center">
                      <LinkIcon className="w-4 h-4 text-slate-400" />
                    </div>
                    <span className="text-xs font-medium text-slate-400">尚未綁定文件</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== 編輯 Modal ===== */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowEditModal(false)} />
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative z-10 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-900">編輯零件資訊</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 space-y-5">
              {editError && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 font-medium">{editError}</div>
              )}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">零件名稱 <span className="text-red-500">*</span></label>
                <input type="text" required
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                  value={editForm.part_name}
                  onChange={e => setEditForm({ ...editForm, part_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">版本</label>
                  <input type="text"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                    placeholder="例如：Rev.A"
                    value={editForm.version}
                    onChange={e => setEditForm({ ...editForm, version: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">狀態</label>
                  <select
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                    value={editForm.status}
                    onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                  >
                    <option value="active">進行中</option>
                    <option value="inactive">暫停</option>
                    <option value="archived">已封存</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">說明備註</label>
                <textarea rows={3}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all resize-none"
                  value={editForm.description}
                  onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                />
              </div>
              <div className="pt-2 flex space-x-3">
                <button type="button" onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors font-medium">
                  取消
                </button>
                <button type="submit" disabled={savingEdit}
                  className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-all font-medium shadow-sm">
                  {savingEdit ? '處理中...' : '確認儲存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== 文件選擇器 (Picker) Modal ===== */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowPicker(false)} />
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col">
            {/* Picker Header */}
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
                    <LinkIcon className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-900">
                      綁定文件 — {PART_ITEMS.find(pi => pi.code === currentItemCode)?.label}
                    </h3>
                    <p className="text-sm text-slate-500 font-medium">代碼：{currentItemCode}</p>
                  </div>
                </div>
                <button onClick={() => setShowPicker(false)} className="p-2 hover:bg-slate-50 text-slate-400 rounded-xl transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              {/* 搜尋框 */}
              <div className="relative">
                <Search className="w-5 h-5 absolute left-4 top-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜尋文件標題或編號..."
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-base focus:ring-2 focus:ring-primary-500 outline-none transition-all placeholder:text-slate-400"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  onKeyUp={(e) => e.key === 'Enter' && fetchDocs(pickerSearch)}
                />
              </div>
            </div>

            {/* 文件清單 */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/30">
              {pickerLoading ? (
                <div className="flex justify-center p-20"><LoadingSpinner /></div>
              ) : availableDocs.length === 0 ? (
                <div className="p-20 flex flex-col items-center text-center">
                  <FileText className="w-16 h-16 text-slate-200 mb-4" />
                  <p className="text-slate-400 font-medium">找不到匹配的文件</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {availableDocs.map(doc => {
                    // 已綁定到此項次的文件在 UI 上特別標示
                    const isLinkedHere = part.items?.some(
                      i => i.document_id === doc.id && i.item_code === currentItemCode
                    );
                    return (
                      <div
                        key={doc.id}
                        className={clsx(
                          'group flex items-center justify-between p-4 bg-white border rounded-2xl transition-all duration-200',
                          isLinkedHere
                            ? 'border-violet-400 bg-violet-50/30'
                            : 'border-slate-100 hover:border-violet-200 hover:shadow-md hover:shadow-violet-100/30',
                        )}
                      >
                        <div className="flex items-center flex-1 min-w-0">
                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 mr-4 group-hover:bg-violet-50 group-hover:border-violet-100 transition-colors">
                            <FileText className="w-5 h-5 text-slate-400 group-hover:text-violet-600" />
                          </div>
                          <div className="min-w-0 pr-4">
                            <div className="text-base font-bold text-slate-800 group-hover:text-violet-700 truncate transition-colors">
                              {doc.title || '(未命名)'}
                            </div>
                            <div className="flex items-center gap-3 mt-1 font-mono text-[11px]">
                              <span className="text-slate-500 tracking-tight">{doc.doc_number}</span>
                              <span className="w-1 h-1 bg-slate-300 rounded-full" />
                              <span className="text-violet-600 font-bold">V{doc.current_version || '1.0'}</span>
                            </div>
                          </div>
                        </div>

                        {isLinkedHere ? (
                          <div className="flex items-center text-violet-600 font-bold text-sm bg-white px-3 py-1.5 rounded-xl border border-violet-100">
                            <Check className="w-4 h-4 mr-2" /> 已連結
                          </div>
                        ) : (
                          <button
                            disabled={linking}
                            onClick={() => handleBind(doc.id)}
                            className="px-5 py-2.5 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 active:scale-95 disabled:opacity-50 shadow-lg shadow-violet-200 transition-all"
                          >
                            選定
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Picker Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowPicker(false)}
                className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-white rounded-xl transition-all"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
