"""Export service for generating CSV and Excel files."""
import io
import csv
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Document


def generate_csv(documents: list) -> bytes:
    """Generate a CSV file from document data."""
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        "文件編號", "文件名稱", "狀態", "版本",
        "製定人", "類別", "備註", "建立日期", "更新日期"
    ])
    
    for doc in documents:
        writer.writerow([
            doc.get("doc_number", ""),
            doc.get("title", ""),
            doc.get("status", ""),
            doc.get("current_version", ""),
            doc.get("author_name", ""),
            doc.get("category_name", ""),
            doc.get("notes", ""),
            doc.get("created_at", ""),
            doc.get("updated_at", ""),
        ])
    
    return output.getvalue().encode("utf-8-sig")


def generate_xlsx(documents: list) -> bytes:
    """Generate an Excel file from document data."""
    import xlsxwriter
    
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output)
    worksheet = workbook.add_worksheet("文件清單")
    
    # Header format
    header_format = workbook.add_format({
        "bold": True,
        "font_size": 12,
        "bg_color": "#1e3a5f",
        "font_color": "#ffffff",
        "border": 1,
        "align": "center",
    })
    
    cell_format = workbook.add_format({
        "border": 1,
        "text_wrap": True,
        "valign": "top",
    })
    
    headers = [
        "文件編號", "文件名稱", "狀態", "版本",
        "製定人", "類別", "備註", "建立日期", "更新日期"
    ]
    
    col_widths = [18, 35, 10, 10, 15, 15, 25, 20, 20]
    
    for col, (header, width) in enumerate(zip(headers, col_widths)):
        worksheet.set_column(col, col, width)
        worksheet.write(0, col, header, header_format)
    
    for row_idx, doc in enumerate(documents, start=1):
        worksheet.write(row_idx, 0, doc.get("doc_number", ""), cell_format)
        worksheet.write(row_idx, 1, doc.get("title", ""), cell_format)
        worksheet.write(row_idx, 2, doc.get("status", ""), cell_format)
        worksheet.write(row_idx, 3, doc.get("current_version", ""), cell_format)
        worksheet.write(row_idx, 4, doc.get("author_name", ""), cell_format)
        worksheet.write(row_idx, 5, doc.get("category_name", ""), cell_format)
        worksheet.write(row_idx, 6, doc.get("notes", ""), cell_format)
        worksheet.write(row_idx, 7, str(doc.get("created_at", "")), cell_format)
        worksheet.write(row_idx, 8, str(doc.get("updated_at", "")), cell_format)
    
    workbook.close()
    output.seek(0)
    return output.getvalue()
