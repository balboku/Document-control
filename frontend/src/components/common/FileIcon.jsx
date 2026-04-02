import React from 'react';
import { FileText, FileSpreadsheet, FileIcon as FilePdf, FileQuestion } from 'lucide-react';

export default function FileIcon({ type, className = "w-6 h-6", strokeWidth = 1.5 }) {
  if (!type) return <FileQuestion className={`text-slate-400 ${className}`} strokeWidth={strokeWidth} />;
  
  const t = type.toLowerCase();
  
  if (t === 'pdf') {
    return <FilePdf className={`text-rose-500 ${className}`} strokeWidth={strokeWidth} />;
  }
  
  if (t === 'xlsx' || t === 'xls' || t === 'csv') {
    return <FileSpreadsheet className={`text-emerald-500 ${className}`} strokeWidth={strokeWidth} />;
  }
  
  if (t === 'docx' || t === 'doc') {
    return <FileText className={`text-blue-500 ${className}`} strokeWidth={strokeWidth} />;
  }
  
  return <FileText className={`text-slate-400 ${className}`} strokeWidth={strokeWidth} />;
}
