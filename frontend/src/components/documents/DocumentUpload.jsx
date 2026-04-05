import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  uploadFileExtract,
  confirmDocument,
  getSettingsUsers,
  getSettingsCategories,
} from '../../services/api';
import {
  X, UploadCloud, FileText, Sparkles, Loader2,
  CheckCircle2, AlertCircle, ChevronRight, Tag,
  User, Layers, RefreshCcw, FileCheck2, ArrowLeft,
} from 'lucide-react';

/* ─────────────────────────────────────────────── */
/* Helpers                                          */
/* ─────────────────────────────────────────────── */
const ALLOWED_EXTS = ['.pdf', '.doc', '.docx', '.xlsx', '.xls', '.txt'];
const ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

function isAllowed(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return ALLOWED_EXTS.includes(ext) || ALLOWED_MIME.includes(file.type);
}

function formatBytes(b) {
  if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
  return (b / 1024).toFixed(0) + ' KB';
}

function FileTypeIcon({ name }) {
  const ext = name?.split('.').pop()?.toLowerCase() ?? '';
  const map = {
    pdf:  { bg: 'bg-red-50',    text: 'text-red-500',    label: 'PDF' },
    doc:  { bg: 'bg-blue-50',   text: 'text-blue-500',   label: 'DOC' },
    docx: { bg: 'bg-blue-50',   text: 'text-blue-500',   label: 'DOCX' },
    xlsx: { bg: 'bg-emerald-50', text: 'text-emerald-500', label: 'XLSX' },
    xls:  { bg: 'bg-emerald-50', text: 'text-emerald-500', label: 'XLS' },
    txt:  { bg: 'bg-slate-100', text: 'text-slate-500',  label: 'TXT' },
  };
  const t = map[ext] ?? { bg: 'bg-slate-100', text: 'text-slate-500', label: ext.toUpperCase() };
  return (
    <div className={`w-12 h-12 ${t.bg} ${t.text} rounded-2xl flex items-center justify-center font-black text-xs shrink-0`}>
      {t.label}
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* Stage 1 — Dropzone                              */
/* ─────────────────────────────────────────────── */
function Dropzone({ onFile }) {
  const [dragging, setDragging] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef();

  const handleFiles = useCallback((files) => {
    setErr('');
    const f = files[0];
    if (!f) return;
    if (!isAllowed(f)) {
      setErr(`不支援的檔案格式。請上傳 ${ALLOWED_EXTS.join(', ')}`);
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setErr('檔案超過 50 MB 限制。');
      return;
    }
    onFile(f);
  }, [onFile]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  return (
    <div className="flex flex-col items-center justify-center py-4 px-6 space-y-6">
      {/* Drop Area */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`
          relative w-full rounded-3xl border-2 border-dashed cursor-pointer
          transition-all duration-300 overflow-hidden
          ${dragging
            ? 'border-primary-500 bg-primary-50 scale-[1.01]'
            : 'border-slate-200 bg-slate-50/60 hover:border-primary-300 hover:bg-primary-50/30'}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ALLOWED_EXTS.join(',')}
          onChange={(e) => handleFiles(e.target.files)}
        />

        {/* Animated BG rings when dragging */}
        {dragging && (
          <>
            <div className="absolute inset-0 rounded-3xl bg-primary-500/5 animate-pulse" />
            <div className="absolute -inset-4 rounded-full border border-primary-300/30 animate-ping" />
          </>
        )}

        <div className="relative z-10 flex flex-col items-center justify-center py-16 px-8 text-center">
          <div className={`
            w-20 h-20 rounded-3xl flex items-center justify-center mb-6 transition-all duration-300
            ${dragging ? 'bg-primary-500 shadow-xl shadow-primary-200 scale-110' : 'bg-white border border-slate-200 shadow-sm'}
          `}>
            <UploadCloud className={`w-9 h-9 transition-colors ${dragging ? 'text-white' : 'text-slate-400'}`} />
          </div>

          <h3 className={`text-lg font-black mb-2 transition-colors ${dragging ? 'text-primary-600' : 'text-slate-700'}`}>
            {dragging ? '放開以上傳檔案' : '拖曳檔案至此處'}
          </h3>
          <p className="text-sm text-slate-400 mb-6">
            或點擊選擇檔案 &bull; PDF、Word、Excel、TXT
          </p>

          <div className="flex flex-wrap gap-2 justify-center">
            {ALLOWED_EXTS.map((ext) => (
              <span key={ext} className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 uppercase">
                {ext.replace('.', '')}
              </span>
            ))}
            <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-400 uppercase">Max 50 MB</span>
          </div>
        </div>
      </div>

      {err && (
        <div className="w-full flex items-center p-4 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600 font-medium">
          <AlertCircle className="w-4 h-4 mr-3 shrink-0" />
          {err}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* Stage 2 — Extracting                            */
/* ─────────────────────────────────────────────── */
function ExtractingStage({ file }) {
  const steps = ['上傳並解析檔案內容...', 'AI 分析文件標題與類別...', '準備自動填入表單...'];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s < steps.length - 1 ? s + 1 : s)), 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-16 px-8">
      {/* Pulsing file icon */}
      <div className="relative mb-10">
        <div className="w-24 h-24 bg-primary-50 rounded-3xl flex items-center justify-center shadow-lg shadow-primary-100">
          <FileText className="w-12 h-12 text-primary-500" />
        </div>
        <div className="absolute -inset-3 rounded-[2rem] border-2 border-primary-200/50 animate-ping" />
        <div className="absolute -inset-6 rounded-[2.5rem] border border-primary-100/40 animate-ping animation-delay-300" />

        {/* Sparkle badge */}
        <div className="absolute -bottom-3 -right-3 w-10 h-10 bg-gradient-to-br from-primary-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
      </div>

      <h3 className="text-xl font-black text-slate-800 mb-2">AI 正在分析文件</h3>
      <p className="text-sm text-slate-500 mb-8">{file.name}</p>

      {/* Step indicators */}
      <div className="w-full max-w-sm space-y-3">
        {steps.map((s, i) => (
          <div key={i} className={`flex items-center text-sm transition-all duration-500
            ${i < step ? 'text-emerald-600' : i === step ? 'text-primary-600 font-bold' : 'text-slate-300'}
          `}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 shrink-0 transition-all
              ${i < step ? 'bg-emerald-100' : i === step ? 'bg-primary-100' : 'bg-slate-100'}
            `}>
              {i < step
                ? <CheckCircle2 className="w-4 h-4" />
                : i === step
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <span className="w-1.5 h-1.5 bg-slate-300 rounded-full" />
              }
            </div>
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* Stage 3 — Confirm Form                          */
/* ─────────────────────────────────────────────── */
function ConfirmForm({ file, uploadResult, users, categories, onSubmit, onReset, submitting }) {
  const aiMeta = uploadResult?.ai_metadata ?? {};

  // Auto-match category name → id
  const guessCategory = () => {
    if (!aiMeta.category) return '';
    const match = categories.find(
      (c) => c.name.toLowerCase() === aiMeta.category.toLowerCase()
    );
    return match?.id ?? '';
  };

  const [form, setForm] = useState({
    title: aiMeta.title ?? '',
    version: aiMeta.version ?? 'v1.0',
    authorId: '',
    categoryId: guessCategory(),
    keywords: Array.isArray(aiMeta.keywords) ? aiMeta.keywords.join(', ') : '',
    notes: aiMeta.summary ?? '',
    docNumber: '',
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return alert('請輸入文件標題');
    onSubmit({
      file_id: uploadResult.file_id,
      title: form.title.trim(),
      version: form.version.trim() || 'v1.0',
      author_id: form.authorId || null,
      category_id: form.categoryId || null,
      keywords: form.keywords.split(',').map((k) => k.trim()).filter(Boolean),
      notes: form.notes || null,
      doc_number: form.docNumber || null,
      file_hash: uploadResult.file_hash ?? null,
    });
  };

  const aiFields = [
    aiMeta.title && '標題',
    aiMeta.category && '類別',
    aiMeta.keywords?.length && '關鍵字',
    aiMeta.version && '版本',
  ].filter(Boolean);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      {/* File info ribbon */}
      <div className="flex items-center px-8 py-5 bg-gradient-to-r from-slate-50 to-primary-50/30 border-b border-slate-100">
        <FileTypeIcon name={file.name} />
        <div className="ml-4 min-w-0 flex-1">
          <p className="font-bold text-slate-800 text-sm truncate">{file.name}</p>
          <p className="text-xs text-slate-400 mt-0.5">{formatBytes(file.size)}</p>
        </div>

        {/* AI Auto-filled badge */}
        {aiFields.length > 0 && (
          <div className="flex items-center ml-4 px-3 py-1.5 bg-primary-50 border border-primary-100 rounded-xl text-xs font-bold text-primary-600 shrink-0">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            AI 已自動填入 {aiFields.join('、')}
          </div>
        )}
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">

        {/* Title */}
        <div>
          <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
            文件標題 <span className="text-red-400">*</span>
            {aiMeta.title && <AiBadge />}
          </label>
          <input
            type="text"
            required
            value={form.title}
            onChange={set('title')}
            placeholder="輸入文件名稱或標題"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 focus:border-primary-300 transition-all text-sm font-medium outline-none"
          />
        </div>

        {/* Version + Doc Number */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
              版本號
              {aiMeta.version && <AiBadge />}
            </label>
            <input
              type="text"
              value={form.version}
              onChange={set('version')}
              placeholder="v1.0"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 focus:border-primary-300 transition-all text-sm font-mono outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
              指定文件編號 <span className="text-slate-300 font-normal normal-case">(選填)</span>
            </label>
            <input
              type="text"
              value={form.docNumber}
              onChange={set('docNumber')}
              placeholder="留空則自動生成"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 focus:border-primary-300 transition-all text-sm font-mono outline-none"
            />
          </div>
        </div>

        {/* Author + Category */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
              <User className="inline w-3 h-3 mr-1 mb-0.5" />製定人員
            </label>
            <select
              value={form.authorId}
              onChange={set('authorId')}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 transition-all text-sm font-medium outline-none"
            >
              <option value="">(未指定)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
              <Layers className="inline w-3 h-3 mr-1 mb-0.5" />文件類別
              {aiMeta.category && <AiBadge />}
            </label>
            <select
              value={form.categoryId}
              onChange={set('categoryId')}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 transition-all text-sm font-medium outline-none"
            >
              <option value="">(未分類)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Keywords */}
        <div>
          <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
            <Tag className="inline w-3 h-3 mr-1 mb-0.5" />關鍵字
            {aiMeta.keywords?.length > 0 && <AiBadge />}
          </label>
          <input
            type="text"
            value={form.keywords}
            onChange={set('keywords')}
            placeholder="以逗號分隔，例如：規範, 製程, QC"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 focus:border-primary-300 transition-all text-sm outline-none"
          />
          {/* Tag preview */}
          {form.keywords && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {form.keywords.split(',').map((k) => k.trim()).filter(Boolean).map((k, i) => (
                <span key={i} className="px-2.5 py-1 bg-primary-50 text-primary-600 border border-primary-100 rounded-lg text-[11px] font-bold">
                  #{k}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Notes / Summary */}
        <div>
          <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
            備註
            {aiMeta.summary && <AiBadge />}
          </label>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={3}
            placeholder="對此文件的描述或相關備註..."
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary-100 focus:border-primary-300 transition-all text-sm leading-relaxed outline-none resize-none"
          />
        </div>

        {/* Extracted text preview */}
        {uploadResult?.extracted_text_preview && (
          <details className="group">
            <summary className="cursor-pointer text-xs font-bold text-slate-400 hover:text-slate-600 flex items-center select-none">
              <ChevronRight className="w-3.5 h-3.5 mr-1 group-open:rotate-90 transition-transform" />
              查看擷取的文字預覽
            </summary>
            <div className="mt-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs text-slate-600 leading-relaxed font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
              {uploadResult.extracted_text_preview}
            </div>
          </details>
        )}
      </div>

      {/* Footer */}
      <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-4 shrink-0">
        <button
          type="button"
          onClick={onReset}
          disabled={submitting}
          className="flex items-center text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40 px-3 py-2 rounded-xl hover:bg-slate-100"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          重新選擇
        </button>

        <button
          type="submit"
          disabled={submitting || !form.title.trim()}
          className="flex items-center px-8 py-3 bg-primary-600 text-white font-black rounded-2xl
            hover:bg-primary-700 disabled:opacity-50 transition-all shadow-lg shadow-primary-200
            hover:shadow-xl hover:shadow-primary-200 hover:-translate-y-0.5 active:translate-y-0 text-sm"
        >
          {submitting
            ? <><Loader2 className="w-4 h-4 mr-2.5 animate-spin" />上傳中...</>
            : <><FileCheck2 className="w-4 h-4 mr-2.5" />確認上傳文件</>
          }
        </button>
      </div>
    </form>
  );
}

function AiBadge() {
  return (
    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 bg-primary-50 text-primary-500 rounded text-[9px] font-black uppercase tracking-wider border border-primary-100">
      <Sparkles className="w-2.5 h-2.5 mr-1" />AI
    </span>
  );
}

/* ─────────────────────────────────────────────── */
/* Stage 4 — Success                               */
/* ─────────────────────────────────────────────── */
function SuccessStage({ doc, onClose }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="relative mb-8">
        <div className="w-24 h-24 bg-emerald-50 rounded-3xl flex items-center justify-center">
          <CheckCircle2 className="w-14 h-14 text-emerald-500" />
        </div>
        <div className="absolute -inset-2 rounded-[2rem] border-2 border-emerald-200/40 animate-ping" />
      </div>

      <h3 className="text-2xl font-black text-slate-800 mb-2">文件已成功上傳！</h3>
      <p className="text-sm text-slate-500 mb-2">
        AI 正在背景進行 Embedding 與語意索引建立。
      </p>
      <p className="text-xs text-slate-400 mb-8">
        文件編號 <span className="font-mono font-bold text-slate-600">{doc?.doc_number}</span>
      </p>

      {/* AI processing notice */}
      <div className="w-full max-w-sm flex items-start p-4 bg-amber-50 border border-amber-100 rounded-2xl text-left mb-8">
        <Loader2 className="w-4 h-4 mr-3 text-amber-500 animate-spin mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-bold text-amber-700">AI 解析進行中</p>
          <p className="text-xs text-amber-600 mt-0.5">
            Embedding 與 Metadata 將於背景完成，您可繼續使用系統。
          </p>
        </div>
      </div>

      <button
        onClick={onClose}
        className="px-8 py-3 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all text-sm shadow-lg hover:-translate-y-0.5 active:translate-y-0"
      >
        完成，返回清單
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* Main Component                                  */
/* ─────────────────────────────────────────────── */
const STAGES = { IDLE: 'idle', EXTRACTING: 'extracting', FORM: 'form', SUCCESS: 'success' };

export default function DocumentUpload({ onClose, onSuccess }) {
  const [stage, setStage]           = useState(STAGES.IDLE);
  const [file, setFile]             = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdDoc, setCreatedDoc] = useState(null);

  const [users, setUsers]           = useState([]);
  const [categories, setCategories] = useState([]);

  // Fetch users and categories upfront
  useEffect(() => {
    Promise.all([getSettingsUsers(true), getSettingsCategories(true)])
      .then(([u, c]) => { setUsers(u); setCategories(c); })
      .catch(console.error);
  }, []);

  // When a file is dropped/selected → Stage EXTRACTING
  const handleFile = useCallback(async (f) => {
    setFile(f);
    setError('');
    setStage(STAGES.EXTRACTING);

    try {
      const result = await uploadFileExtract(f);   // POST /documents/upload
      setUploadResult(result);
      setStage(STAGES.FORM);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail ?? '檔案上傳失敗，請重試。');
      setStage(STAGES.IDLE);
    }
  }, []);

  // Final confirm
  const handleConfirm = useCallback(async (payload) => {
    setSubmitting(true);
    setError('');
    try {
      const doc = await confirmDocument(payload);  // POST /documents/confirm
      setCreatedDoc(doc);
      setStage(STAGES.SUCCESS);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail ?? '確認上傳失敗，請重試。');
    } finally {
      setSubmitting(false);
    }
  }, []);

  const handleReset = () => {
    setFile(null);
    setUploadResult(null);
    setError('');
    setStage(STAGES.IDLE);
  };

  const handleClose = () => {
    if (stage === STAGES.SUCCESS) onSuccess?.();
    else onClose?.();
  };

  /* ─── Titles per stage ─── */
  const titles = {
    [STAGES.IDLE]:       { title: '上傳新文件',      sub: '拖曳或選取檔案，AI 將自動預填表單' },
    [STAGES.EXTRACTING]: { title: 'AI 解析中...',    sub: '正在擷取文字與預測 Metadata' },
    [STAGES.FORM]:       { title: '確認文件資訊',    sub: 'AI 已自動填入建議，請確認後送出' },
    [STAGES.SUCCESS]:    { title: '上傳成功',         sub: '' },
  };
  const { title, sub } = titles[stage];

  const modalHeight = stage === STAGES.FORM ? 'max-h-[92vh]' : 'max-h-[75vh]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`bg-white w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col overflow-hidden ${modalHeight} animate-in slide-in-from-bottom-6 duration-300`}>

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-8 pt-7 pb-5 border-b border-slate-100 shrink-0">
          <div>
            {/* Step dots */}
            <div className="flex items-center space-x-1.5 mb-3">
              {Object.values(STAGES).filter(s => s !== STAGES.EXTRACTING).map((s, i, arr) => {
                const stageOrder = [STAGES.IDLE, STAGES.FORM, STAGES.SUCCESS];
                const current = stageOrder.indexOf(stage === STAGES.EXTRACTING ? STAGES.FORM : stage);
                const dot = stageOrder.indexOf(s);
                return (
                  <div key={s} className="flex items-center">
                    <div className={`w-2 h-2 rounded-full transition-all ${dot <= current ? 'bg-primary-500' : 'bg-slate-200'}`} />
                    {i < arr.length - 1 && <div className={`w-8 h-0.5 mx-0.5 ${dot < current ? 'bg-primary-300' : 'bg-slate-100'}`} />}
                  </div>
                );
              })}
            </div>
            <h2 className="text-xl font-black text-slate-900">{title}</h2>
            {sub && <p className="text-sm text-slate-400 mt-1">{sub}</p>}
          </div>
          <button
            onClick={handleClose}
            className="p-2.5 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-2xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className="mx-6 mt-4 flex items-center p-4 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600 font-medium">
            <AlertCircle className="w-4 h-4 mr-3 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {stage === STAGES.IDLE && (
            <Dropzone onFile={handleFile} />
          )}
          {stage === STAGES.EXTRACTING && (
            <ExtractingStage file={file} />
          )}
          {stage === STAGES.FORM && (
            <ConfirmForm
              file={file}
              uploadResult={uploadResult}
              users={users}
              categories={categories}
              onSubmit={handleConfirm}
              onReset={handleReset}
              submitting={submitting}
            />
          )}
          {stage === STAGES.SUCCESS && (
            <SuccessStage doc={createdDoc} onClose={handleClose} />
          )}
        </div>
      </div>
    </div>
  );
}
