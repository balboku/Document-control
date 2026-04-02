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

export const getNumberFormat = async () => {
  const { data } = await api.get('/settings/number-format');
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

export const confirmDocument = async (confirmData) => {
  const { data } = await api.post('/documents/confirm', confirmData);
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

export const uploadNewVersion = async (id, versionNumber, actorId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post(`/documents/${id}/upload-version?version_number=${versionNumber}&actor_id=${actorId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return data;
};

export const getAuditLog = async (id) => {
  const { data } = await api.get(`/documents/${id}/audit-log`);
  return data;
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

export default api;
