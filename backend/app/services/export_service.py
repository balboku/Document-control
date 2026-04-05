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


def generate_mdf_excel(project: dict, links_data: list) -> bytes:
    """Generate an Excel file for an MDF project checklist."""
    import xlsxwriter
    from datetime import datetime

    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output)
    worksheet = workbook.add_worksheet("MDF CheckList")

    # Formats
    title_format = workbook.add_format({
        "bold": True,
        "font_size": 16,
        "align": "left",
    })
    
    info_format = workbook.add_format({
        "font_size": 12,
        "align": "left",
    })

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
    
    center_cell_format = workbook.add_format({
        "border": 1,
        "text_wrap": True,
        "align": "center",
        "valign": "top",
    })

    # Project Info
    worksheet.write(0, 0, f"MDF 醫療器材檔案檢查表", title_format)
    worksheet.write(2, 0, f"專案名稱：{project.get('product_name', '')}", info_format)
    worksheet.write(3, 0, f"專案編號：{project.get('project_no', '')}", info_format)
    worksheet.write(4, 0, f"分級分類：{project.get('classification', '')}", info_format)
    worksheet.write(5, 0, f"匯出時間：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", info_format)

    # Headers for items
    headers = [
        "項次", "文件編號", "文件名稱", "版本", "狀態", "類別", "製定人"
    ]
    col_widths = [10, 20, 40, 10, 15, 15, 15]

    row_idx = 7
    for col, (header, width) in enumerate(zip(headers, col_widths)):
        worksheet.set_column(col, col, width)
        worksheet.write(row_idx, col, header, header_format)

    # Map existing links
    link_map = {link["item_no"]: link for link in links_data}

    # Fill 1~18 items
    row_idx += 1
    for item_no in range(1, 19):
        link = link_map.get(item_no)
        worksheet.write(row_idx, 0, str(item_no), center_cell_format)
        
        if link:
            worksheet.write(row_idx, 1, link.get("doc_number", ""), cell_format)
            worksheet.write(row_idx, 2, link.get("title", ""), cell_format)
            worksheet.write(row_idx, 3, link.get("current_version", ""), center_cell_format)
            worksheet.write(row_idx, 4, link.get("status", ""), center_cell_format)
            worksheet.write(row_idx, 5, link.get("category_name", ""), cell_format)
            worksheet.write(row_idx, 6, link.get("author_name", ""), center_cell_format)
        else:
            worksheet.write(row_idx, 1, "", cell_format)
            worksheet.write(row_idx, 2, "尚未綁定文件", cell_format)
            worksheet.write(row_idx, 3, "", cell_format)
            worksheet.write(row_idx, 4, "", cell_format)
            worksheet.write(row_idx, 5, "", cell_format)
            worksheet.write(row_idx, 6, "", cell_format)
            
        row_idx += 1

    workbook.close()
    output.seek(0)
    return output.getvalue()

