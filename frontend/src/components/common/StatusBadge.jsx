import React from 'react';
import clsx from 'clsx';

export default function StatusBadge({ status, className }) {
  const styles = {
    active: "bg-emerald-100 text-emerald-800",
    draft: "bg-amber-100 text-amber-800",
    reserved: "bg-blue-100 text-blue-800",
    archived: "bg-slate-100 text-slate-800",
  };
  
  const labels = {
    active: "已歸檔",
    draft: "草稿",
    reserved: "預約中",
    archived: "封存",
  };

  const style = styles[status] || styles.draft;
  const label = labels[status] || status;

  return (
    <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", style, className)}>
      {label}
    </span>
  );
}
