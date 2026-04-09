import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  semanticSearch,
  hybridSearch,
  getSettingsCategories,
  getApiErrorMessage,
  isRequestCanceled,
} from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import {
  Search, Sparkles, AlertCircle, Zap, FileText,
  ChevronLeft, ChevronRight, Loader2, LayoutGrid,
} from 'lucide-react';

/* ─────────────────────────────────────── */
/* Keyword Highlight Helper                */
/* ─────────────────────────────────────── */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits `text` on every occurrence of each token in `query` (case-insensitive)
 * and returns a React node array with matching parts wrapped in a highlight span.
 */
function HighlightedText({ text, query }) {
  if (!text || !query?.trim()) {
    return <span>{text}</span>;
  }

  // Build a combined regex from all non-empty tokens
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegex);

  if (tokens.length === 0) return <span>{text}</span>;

  const pattern = new RegExp(`(${tokens.join('|')})`, 'gi');
  const parts = text.split(pattern);

  return (
    <span>
      {parts.map((part, i) =>
        pattern.test(part) ? (
          <mark
            key={i}
            className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5 font-semibold not-italic"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

/* ─────────────────────────────────────── */
/* Pagination Component                    */
/* ─────────────────────────────────────── */
function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const buildPages = () => {
    const pages = [];
    const delta = 1; // siblings on each side

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 || i === totalPages ||
        (i >= page - delta && i <= page + delta)
      ) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }
    return pages;
  };

  return (
    <div className="flex items-center justify-center space-x-1.5 py-6">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500
          hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {buildPages().map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="w-9 text-center text-slate-400 text-sm">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`w-9 h-9 rounded-xl text-sm font-bold transition-all
              ${p === page
                ? 'bg-primary-600 text-white shadow-md shadow-primary-200'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500
          hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ─────────────────────────────────────── */
/* Score Badge                             */
/* ─────────────────────────────────────── */
function ScoreBadge({ score, mode }) {
  const pct = (score * 100).toFixed(1);
  const isRrf = mode === 'hybrid';
  // RRF scores are very small floats; convert to a % of 0.033 (1/60 max)
  const displayPct = isRrf
    ? Math.min((score / 0.033) * 100, 100).toFixed(1)
    : pct;
  const color = parseFloat(displayPct) >= 70
    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
    : parseFloat(displayPct) >= 40
      ? 'bg-amber-50 text-amber-700 border-amber-100'
      : 'bg-slate-50 text-slate-500 border-slate-100';

  return (
    <div className={`text-[10px] font-black px-2 py-1 rounded-lg border ${color} flex items-center`}>
      {isRrf ? <Zap className="w-2.5 h-2.5 mr-1" /> : <Sparkles className="w-2.5 h-2.5 mr-1" />}
      {displayPct}%
    </div>
  );
}

/* ─────────────────────────────────────── */
/* Result Card                             */
/* ─────────────────────────────────────── */
function ResultCard({ item, query, mode, index }) {
  return (
    <div className="p-6 md:p-8 hover:bg-primary-50/20 transition-colors group border-b border-slate-100 last:border-0 animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          {/* Rank badge */}
          <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 text-xs font-black flex items-center justify-center shrink-0 mt-0.5">
            {index + 1}
          </div>
          <div className="min-w-0">
            <h4 className="text-base font-bold text-slate-900 group-hover:text-primary-600 transition-colors truncate">
              <HighlightedText text={item.title ?? '（無標題）'} query={query} />
            </h4>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{item.doc_number}</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusBadge status={item.status} />
          <ScoreBadge score={item.similarity_score} mode={mode} />
        </div>
      </div>

      {/* Chunk content with highlight */}
      <div className="relative pl-3 ml-10">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary-200 rounded-full" />
        <p className="text-sm text-slate-600 leading-relaxed italic line-clamp-4">
          "…{' '}
          <HighlightedText text={item.chunk_content} query={query} />
          {' '}…"
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────── */
/* Empty / Loading States                  */
/* ─────────────────────────────────────── */
function SearchingState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
      <div className="relative w-16 h-16 mb-6">
        <div className="absolute inset-0 rounded-full bg-primary-100 animate-ping" />
        <div className="absolute inset-2 rounded-full bg-primary-200 animate-pulse" />
        <Loader2 className="absolute inset-3 w-10 h-10 text-primary-500 animate-spin" />
      </div>
      <p className="font-bold text-slate-600">Gemini 正在分析語意並比對向量庫...</p>
      <p className="text-sm mt-1">這可能需要數秒鐘</p>
    </div>
  );
}

function EmptyState({ hasSearched }) {
  if (!hasSearched) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-300">
        <div className="w-20 h-20 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-6">
          <Search className="w-10 h-10" />
        </div>
        <p className="font-bold text-slate-400">輸入關鍵字開始搜尋</p>
        <p className="text-sm text-slate-300 mt-1">支援自然語言描述，例如「品質管制相關規範」</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <AlertCircle className="w-14 h-14 text-slate-200 mb-5" />
      <p className="text-lg font-bold text-slate-500">找不到相關文件</p>
      <p className="text-sm text-slate-400 mt-1">請嘗試不同的關鍵字，或切換搜尋模式</p>
    </div>
  );
}

/* ─────────────────────────────────────── */
/* Main Page                               */
/* ─────────────────────────────────────── */
const PAGE_SIZE = 10;

export default function SearchPage() {
  /* Search state */
  const [query, setQuery]           = useState('');
  const [activeQuery, setActiveQuery] = useState(''); // the query used for current results
  const [mode, setMode]             = useState('hybrid'); // 'hybrid' | 'semantic'
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus]         = useState('');

  /* Results state */
  const [results, setResults]       = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage]             = useState(1);

  /* UI state */
  const [loading, setLoading]       = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [categories, setCategories] = useState([]);
  const [searchError, setSearchError] = useState('');

  const inputRef = useRef(null);
  const requestRef = useRef({ controller: null, requestId: 0 });

  useEffect(() => {
    getSettingsCategories()
      .then(setCategories)
      .catch(console.error);
  }, []);

  useEffect(() => {
    return () => {
      requestRef.current.controller?.abort();
    };
  }, []);

  /* ── Core search executor ── */
  const executeSearch = useCallback(async (searchQuery, pageNum, searchMode) => {
    if (!searchQuery.trim()) return;

    requestRef.current.controller?.abort();
    const controller = new AbortController();
    const requestId = requestRef.current.requestId + 1;
    requestRef.current = { controller, requestId };

    setLoading(true);
    setHasSearched(true);
    setSearchError('');

    const skip = (pageNum - 1) * PAGE_SIZE;
    const payload = {
      query: searchQuery,
      limit: PAGE_SIZE,
      skip,
      ...(categoryId && { category_id: categoryId }),
      ...(status && { status }),
    };

    try {
      const fn = searchMode === 'hybrid' ? hybridSearch : semanticSearch;
      const data = await fn(payload, { signal: controller.signal });

      if (requestRef.current.requestId !== requestId) {
        return;
      }

      setResults(data.results ?? []);
      setTotalCount(data.total_count ?? data.results?.length ?? 0);
      setTotalPages(data.total_pages ?? 1);
      setActiveQuery(searchQuery);
    } catch (err) {
      if (isRequestCanceled(err)) {
        return;
      }

      if (requestRef.current.requestId !== requestId) {
        return;
      }

      console.error('Search error', err);
      setResults([]);
      setTotalCount(0);
      setTotalPages(1);
      setSearchError(getApiErrorMessage(err, '搜尋失敗，請稍後再試。'));
    } finally {
      if (requestRef.current.requestId === requestId) {
        setLoading(false);
      }
    }
  }, [categoryId, status]);

  /* ── Form submit ── */
  const handleSearch = (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setPage(1);
    executeSearch(query, 1, mode);
  };

  /* ── Page change ── */
  const handlePageChange = (newPage) => {
    setPage(newPage);
    executeSearch(activeQuery, newPage, mode);
    // Scroll back to results
    document.getElementById('search-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ── Mode switch (re-search if already searched) ── */
  const handleModeSwitch = (newMode) => {
    setMode(newMode);
    if (hasSearched && activeQuery) {
      setPage(1);
      executeSearch(activeQuery, 1, newMode);
    }
  };

  return (
    <div className="animate-in fade-in duration-500 max-w-4xl mx-auto py-8 px-4">

      {/* ── Hero Header ── */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-primary-50 to-indigo-50 border border-primary-100 rounded-full text-sm font-bold text-primary-600 mb-5">
          <Sparkles className="w-4 h-4 mr-2" />
          Gemini Embedding 2 · pgvector HNSW · RRF Fusion
        </div>
        <h1 className="text-3xl font-black text-slate-900 mb-3 bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-indigo-600">
          智慧語意搜尋
        </h1>
        <p className="text-slate-500 max-w-xl mx-auto">
          使用自然語言描述您想找的文件內容，AI 將透過向量分析為您找出最相關的段落。
        </p>
      </div>

      {/* ── Search Box ── */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="relative mb-0">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例如：產品退貨處理流程、品質管制規範、風險評估報告..."
            className="w-full pl-14 pr-36 py-5 text-base border-2 border-slate-200 rounded-t-2xl shadow-sm
              focus:outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10
              transition-all bg-white"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="absolute right-3 top-1/2 -translate-y-1/2 px-6 py-2.5
              bg-slate-900 text-white rounded-xl font-bold text-sm
              hover:bg-slate-700 transition-colors shadow-sm disabled:opacity-40
              flex items-center"
          >
            {loading
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Search className="w-4 h-4 mr-2" />}
            搜尋
          </button>
        </div>

        {/* ── Filter Bar ── */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3.5
          bg-slate-50 border-x-2 border-b-2 border-slate-200 rounded-b-2xl">

          {/* Mode toggle */}
          <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1">
            {[
              { id: 'hybrid',   icon: Zap,      label: '混合搜尋' },
              { id: 'semantic', icon: Sparkles,  label: '語意搜尋' },
            ].map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleModeSwitch(id)}
                className={`flex items-center px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                  ${mode === id
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100'}`}
              >
                <Icon className="w-3 h-3 mr-1.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium
                focus:outline-none focus:ring-2 focus:ring-primary-400 transition-all"
            >
              <option value="">全部類別</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium
                focus:outline-none focus:ring-2 focus:ring-primary-400 transition-all"
            >
              <option value="">全部狀態</option>
              <option value="active">已歸檔</option>
              <option value="draft">草稿</option>
              <option value="reserved">預約中</option>
              <option value="archived">已封存</option>
            </select>
          </div>
        </div>
      </form>

      {/* ── Results Panel ── */}
      <div id="search-results" className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Results Header */}
        {hasSearched && !loading && results.length > 0 && (
          <div className="flex items-center justify-between px-8 py-4 bg-slate-50/80 border-b border-slate-100">
            <div className="flex items-center space-x-3">
              <LayoutGrid className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-bold text-slate-700">
                共{' '}
                <span className="text-primary-600">{totalCount}</span>
                {' '}筆結果
                {totalPages > 1 && (
                  <span className="text-slate-400 font-normal ml-1.5">
                    · 第 {page} / {totalPages} 頁
                  </span>
                )}
              </span>
              <span className="text-xs px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-slate-500 font-medium">
                {mode === 'hybrid' ? '⚡ RRF 混合' : '✨ 語意向量'}
              </span>
            </div>
            {activeQuery && (
              <span className="text-xs text-slate-400">
                "{activeQuery}"
              </span>
            )}
          </div>
        )}

        {/* Body */}
        {loading ? (
          <SearchingState />
        ) : searchError ? (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
            <AlertCircle className="w-14 h-14 text-red-300 mb-5" />
            <p className="text-lg font-bold text-slate-700">搜尋暫時失敗</p>
            <p className="text-sm text-slate-500 mt-2 max-w-md">{searchError}</p>
            <button
              onClick={() => executeSearch(activeQuery || query, page, mode)}
              className="mt-6 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors"
            >
              重新搜尋
            </button>
          </div>
        ) : results.length > 0 ? (
          <>
            <div className="divide-y divide-slate-100">
              {results.map((item, i) => (
                <ResultCard
                  key={`${item.document_id}-${i}`}
                  item={item}
                  query={activeQuery}
                  mode={mode}
                  index={(page - 1) * PAGE_SIZE + i}
                />
              ))}
            </div>
            <div className="border-t border-slate-100 bg-slate-50/40">
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </div>
          </>
        ) : (
          <EmptyState hasSearched={hasSearched} />
        )}
      </div>

      {/* ── Mode description tooltip ── */}
      {!hasSearched && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              title: '⚡ 混合搜尋 (推薦)',
              desc: '同時使用關鍵字比對 (tsvector) 與向量語意 (pgvector)，透過 RRF 演算法融合排序，查準率最高。',
              active: mode === 'hybrid',
            },
            {
              title: '✨ 純語意搜尋',
              desc: '完全依靠 Gemini Embedding 向量相似度比對，適合語意層次的自然語言查詢。',
              active: mode === 'semantic',
            },
          ].map((card) => (
            <div
              key={card.title}
              className={`p-5 rounded-2xl border transition-all text-sm
                ${card.active
                  ? 'bg-primary-50 border-primary-200 text-primary-700'
                  : 'bg-slate-50 border-slate-200 text-slate-500 opacity-60'}`}
            >
              <p className="font-bold mb-1">{card.title}</p>
              <p className="leading-relaxed text-xs">{card.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
