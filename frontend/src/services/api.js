import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Settings API
export const getSettingsUsers = async (activeOnly = false) => {
  const { data } = await api.get(`/settings/users?active_only=${activeOnly}`);
  return data;
};

export const createSettingsUser = async (userData) => {
  const { data } = await api.post('/settings/users', userData);
  return data;
};

export const updateSettingsUser = async (id, userData) => {
  const { data } = await api.put(`/settings/users/${id}`, userData);
  return data;
};

export const deleteSettingsUser = async (id) => {
  const { data } = await api.delete(`/settings/users/${id}`);
  return data;
};

export const getSettingsCategories = async (activeOnly = false) => {
  const { data } = await api.get(`/settings/categories?active_only=${activeOnly}`);
  return data;
};

export const createSettingsCategory = async (catData) => {
  const { data } = await api.post('/settings/categories', catData);
  return data;
};

export const updateSettingsCategory = async (id, catData) => {
  const { data } = await api.put(`/settings/categories/${id}`, catData);
  return data;
};

export const deleteSettingsCategory = async (id) => {
  const { data } = await api.delete(`/settings/categories/${id}`);
  return data;
};

export const getNumberFormat = async (categoryId = null) => {
  const query = categoryId ? `?category_id=${categoryId}` : '';
  const { data } = await api.get(`/settings/number-format${query}`);
  return data;
};

export const updateNumberFormat = async (formatData) => {
  const { data } = await api.put('/settings/number-format', formatData);
  return data;
};

// Documents API
export const uploadFileExtract = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return data;
};

export const extractMetadata = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/documents/extract-metadata', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return data;
};

export const confirmDocument = async (confirmData) => {
  const { data } = await api.post('/documents/confirm', confirmData);
  return data;
};

export const createDocumentCard = async (cardData) => {
  const { data } = await api.post('/documents/card', cardData);
  return data;
};

export const reserveDocumentNumber = async (reserveData) => {
  const { data } = await api.post('/documents/reserve', reserveData);
  return data;
};

export const getDocuments = async (params) => {
  const { data } = await api.get('/documents', { params });
  return data;
};

export const getDocumentDetail = async (id) => {
  const { data } = await api.get(`/documents/${id}`);
  return data;
};

export const updateDocument = async (id, updateData) => {
  const { data } = await api.put(`/documents/${id}`, updateData);
  return data;
};

export const updateDocumentStatus = async (id, status, actorId) => {
  const { data } = await api.patch(`/documents/${id}/status?status=${status}&actor_id=${actorId}`);
  return data;
};

export const batchUpdateStatus = async (documentIds, status) => {
  const { data } = await api.post('/documents/batch-status', { document_ids: documentIds, status });
  return data;
};

export const uploadNewVersion = async (id, versionNumber, actorId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post(`/documents/${id}/upload-version?version_number=${versionNumber}&actor_id=${actorId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return data;
};

export const getDocumentAuditLogs = async (docId) => {
  const { data } = await api.get(`/documents/${docId}/audit-log`);
  return data;
};

export const deleteDocument = async (id) => {
  const { data } = await api.delete(`/documents/${id}`);
  return data;
};

// --- New Endpoints ---
export const retryAiProcessing = async (docId, versionId) => {
  const { data } = await api.post(`/documents/${docId}/versions/${versionId}/retry-ai`);
  return data;
};

export const getStats = async () => {
    const res = await api.get('/documents/stats');
    return res.data;
};

export const analyzeRelations = async (doc_id, forceRefresh = false) => {
    const res = await api.post(`/documents/${doc_id}/analyze-relations?force_refresh=${forceRefresh}`);
    return res.data;
};

// Search API
export const searchDocuments = async (params) => {
  const { data } = await api.get('/search', { params });
  return data;
};

export const semanticSearch = async (queryData) => {
  const { data } = await api.post('/search/semantic', queryData);
  return data;
};

export const hybridSearch = async (queryData) => {
  const { data } = await api.post('/search/hybrid', queryData);
  return data;
};

// Export API
export const exportDocumentListCSV = async (paramsData) => {
  const response = await api.post('/export/list', { ...paramsData, format: 'csv' }, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `documents_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const exportDocumentListExcel = async (paramsData) => {
  const response = await api.post('/export/list', { ...paramsData, format: 'xlsx' }, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `documents_${new Date().toISOString().slice(0,10)}.xlsx`);
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const batchDownload = async (documentIds, actorId) => {
  const response = await api.post(`/documents/batch-download?actor_id=${actorId}`, { document_ids: documentIds }, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `batch_download_${new Date().toISOString().slice(0,10)}.zip`);
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const exportMdfChecklist = async (projectId) => {
  const response = await api.get(`/export/mdf/${projectId}/checklist`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `MDF_Checklist_${projectId}_${new Date().toISOString().slice(0,10)}.xlsx`);
  document.body.appendChild(link);
  link.click();
  link.remove();
};

// MDF API
export const getMdfProjects = async () => {
  const { data } = await api.get('/mdf');
  return data;
};

export const createMdfProject = async (projectData) => {
  const { data } = await api.post('/mdf', projectData);
  return data;
};

export const updateMdfProject = async (id, projectData) => {
  const { data } = await api.put(`/mdf/${id}`, projectData);
  return data;
};

export const deleteMdfProject = async (id) => {
  const { data } = await api.delete(`/mdf/${id}`);
  return data;
};

export const duplicateMdfProject = async (id) => {
  const { data } = await api.post(`/mdf/${id}/duplicate`);
  return data;
};

export const getMdfProject = async (id) => {
  const { data } = await api.get(`/mdf/${id}`);
  return data;
};

export const linkDocumentToMdf = async (projectId, itemNo, documentId) => {
  const { data } = await api.post(`/mdf/${projectId}/links`, { item_no: itemNo, document_id: documentId });
  return data;
};

export const unlinkDocumentFromMdf = async (linkId) => {
  const { data } = await api.delete(`/mdf/links/${linkId}`);
  return data;
};

// Compliance API
export const getComplianceInsights = async (forceRefresh = false) => {
  const { data } = await api.get(`/compliance/insights?force_refresh=${forceRefresh}`);
  return data;
};

export const triggerComplianceAnalysis = async () => {
  const { data } = await api.post('/compliance/analyze');
  return data;
};

// ============================================================
// Parts Management (PPAP) API — 零件承認管理
// ============================================================

/** 取得所有零件專案清單（附帶已綁定文件） */
export const getParts = async () => {
  const { data } = await api.get('/v1/parts');
  return data;
};

/** 建立新零件專案 */
export const createPart = async (partData) => {
  const { data } = await api.post('/v1/parts', partData);
  return data;
};

/** 取得單一零件專案詳細資料（含所有 item 綁定） */
export const getPartDetail = async (partId) => {
  const { data } = await api.get(`/v1/parts/${partId}`);
  return data;
};

/** 更新零件專案基本資訊 */
export const updatePart = async (partId, partData) => {
  const { data } = await api.put(`/v1/parts/${partId}`, partData);
  return data;
};

/** 刪除零件專案 */
export const deletePart = async (partId) => {
  const { data } = await api.delete(`/v1/parts/${partId}`);
  return data;
};

/** 將文件綁定到零件的特定項目 (item_code)
 * @param {string} partId - 零件專案 UUID
 * @param {string} itemCode - 項目代碼，例如 'DRAWING', 'BOM', 'FMEA'
 * @param {string} documentId - 要綁定的文件 UUID
 * @param {string} [notes] - 備註（選填）
 */
export const bindPartItem = async (partId, itemCode, documentId, notes = null) => {
  const { data } = await api.post(`/v1/parts/${partId}/items`, {
    item_code: itemCode,
    document_id: documentId,
    notes,
  });
  return data;
};

/** 解除零件文件綁定
 * @param {string} partId - 零件專案 UUID
 * @param {string} itemId - PartItem UUID
 */
export const unbindPartItem = async (partId, itemId) => {
  const { data } = await api.delete(`/v1/parts/${partId}/items/${itemId}`);
  return data;
};

export default api;

