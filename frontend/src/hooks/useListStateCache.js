import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * 用於管理清單狀態（如搜尋關鍵字、分頁、排序）的 Hook
 * 並且會在 Sidebar 點選時自動清空緩存狀態以恢復預設值。
 * 
 * @param {string} cacheKey sessionStorage 中的金鑰
 * @param {any} initialState 預設的初始狀態
 * @returns {[any, Function]} 同 useState 回傳的陣列
 */
export function useListStateCache(cacheKey, initialState) {
  const location = useLocation();
  const clearCache = location.state?.clearListCache;

  const [state, setState] = useState(() => {
    // 若為經由 Sidebar 點擊導覽而來，清除快取並使用初始值
    if (clearCache) {
      sessionStorage.removeItem(cacheKey);
      return initialState;
    }

    // 嘗試從 sessionStorage 讀取
    const cachedItem = sessionStorage.getItem(cacheKey);
    if (cachedItem) {
      try {
        return JSON.parse(cachedItem);
      } catch (e) {
        console.error(`解析 sessionStorage key "${cacheKey}" 時發生錯誤:`, e);
      }
    }
    return initialState;
  });

  useEffect(() => {
    sessionStorage.setItem(cacheKey, JSON.stringify(state));
  }, [state, cacheKey]);

  return [state, setState];
}
