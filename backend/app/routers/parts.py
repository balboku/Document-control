"""零件承認管理 (Parts Management / PPAP) Router."""
from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import PartProject, PartItem, Document
from app.schemas import (
    PartProjectCreate, PartProjectUpdate, PartProjectResponse,
    PartItemCreate, PartItemResponse,
    DocumentBriefResponse,
)

# 統一前綴 /api/v1/parts，tag 歸類為 Parts
router = APIRouter(prefix="/api/v1/parts", tags=["Parts"])


# ============================================================
# 輔助函式：以 selectinload 方式讀取單一零件專案（含關聯文件）
# ============================================================
async def _get_part_with_items(part_id: UUID, db: AsyncSession) -> PartProject:
    """讀取含 items → document 關聯的零件專案，找不到則拋出 404。"""
    stmt = (
        select(PartProject)
        .options(
            selectinload(PartProject.items)
            .joinedload(PartItem.document)
            .selectinload(Document.author),
            selectinload(PartProject.items)
            .joinedload(PartItem.document)
            .selectinload(Document.category),
        )
        .where(PartProject.id == part_id)
    )
    result = await db.execute(stmt)
    part = result.unique().scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="零件專案不存在")
    return part


def _enrich_item_documents(part: PartProject):
    """手動將 author_name / category_name 注入 document，避免 lazy load 問題。"""
    for item in part.items:
        if item.document:
            item.document.author_name = (
                item.document.author.name if item.document.author else None
            )
            item.document.category_name = (
                item.document.category.name if item.document.category else None
            )


# ============================================================
# GET /api/v1/parts  — 取得所有零件專案清單
# ============================================================
@router.get("", response_model=List[PartProjectResponse])
async def get_parts(db: AsyncSession = Depends(get_db)):
    """取得所有零件專案（附帶已綁定的文件項次）。"""
    stmt = (
        select(PartProject)
        .options(
            selectinload(PartProject.items)
            .joinedload(PartItem.document)
            .selectinload(Document.author),
            selectinload(PartProject.items)
            .joinedload(PartItem.document)
            .selectinload(Document.category),
        )
        .order_by(PartProject.created_at.desc())
    )
    result = await db.execute(stmt)
    parts = result.unique().scalars().all()

    # 補齊 author_name / category_name
    for part in parts:
        _enrich_item_documents(part)

    return [PartProjectResponse.model_validate(p, from_attributes=True) for p in parts]


# ============================================================
# POST /api/v1/parts  — 建立新零件專案
# ============================================================
@router.post("", response_model=PartProjectResponse, status_code=201)
async def create_part(data: PartProjectCreate, db: AsyncSession = Depends(get_db)):
    """建立一個新的零件專案，part_number 不可重複。"""
    # 檢查料號是否已存在
    existing = await db.execute(
        select(PartProject).where(PartProject.part_number == data.part_number)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="料號已存在，請使用其他料號")

    new_part = PartProject(**data.model_dump())
    db.add(new_part)
    await db.commit()

    # Reload 以取得完整關聯（初始 items 為空）
    return await _get_part_with_items(new_part.id, db)


# ============================================================
# GET /api/v1/parts/{part_id}  — 取得單一零件專案詳細資料
# ============================================================
@router.get("/{part_id}", response_model=PartProjectResponse)
async def get_part_detail(part_id: UUID, db: AsyncSession = Depends(get_db)):
    """取得特定零件專案及其所有已綁定文件項次。"""
    part = await _get_part_with_items(part_id, db)
    _enrich_item_documents(part)
    return part


# ============================================================
# PUT /api/v1/parts/{part_id}  — 更新零件專案基本資訊
# ============================================================
@router.put("/{part_id}", response_model=PartProjectResponse)
async def update_part(
    part_id: UUID,
    data: PartProjectUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新零件專案的基本欄位（part_number 不開放修改以保留追溯性）。"""
    result = await db.execute(select(PartProject).where(PartProject.id == part_id))
    part = result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="零件專案不存在")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(part, key, value)

    await db.commit()
    return await _get_part_with_items(part_id, db)


# ============================================================
# DELETE /api/v1/parts/{part_id}  — 刪除零件專案
# ============================================================
@router.delete("/{part_id}")
async def delete_part(part_id: UUID, db: AsyncSession = Depends(get_db)):
    """刪除零件專案（Cascade 自動刪除所有關聯的 PartItem）。"""
    result = await db.execute(select(PartProject).where(PartProject.id == part_id))
    part = result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="零件專案不存在")

    await db.delete(part)
    await db.commit()
    return {"status": "success", "message": f"零件專案 {part.part_number} 已刪除"}


# ============================================================
# POST /api/v1/parts/{part_id}/items  — 將文件綁定到零件項次
# ============================================================
@router.post("/{part_id}/items", response_model=PartItemResponse, status_code=201)
async def bind_part_item(
    part_id: UUID,
    data: PartItemCreate,
    db: AsyncSession = Depends(get_db),
):
    """將現有文件 (document_id) 綁定到指定零件的特定項目代碼 (item_code)。
    同一零件同一 item_code 只允許一份文件（唯一索引保護）。
    """
    # 確認零件專案存在
    part_result = await db.execute(select(PartProject).where(PartProject.id == part_id))
    if not part_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="零件專案不存在")

    # 確認文件存在
    doc_result = await db.execute(select(Document).where(Document.id == data.document_id))
    if not doc_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="指定文件不存在")

    # 檢查此 item_code 是否已有綁定
    existing_link = await db.execute(
        select(PartItem).where(
            PartItem.part_id == part_id,
            PartItem.item_code == data.item_code,
        )
    )
    if existing_link.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"項目代碼 '{data.item_code}' 已綁定文件，請先解除再重新綁定",
        )

    new_item = PartItem(
        part_id=part_id,
        item_code=data.item_code,
        document_id=data.document_id,
        notes=data.notes,
    )
    db.add(new_item)
    await db.commit()

    # Reload with document details for response
    stmt = (
        select(PartItem)
        .options(
            joinedload(PartItem.document)
            .selectinload(Document.author),
            joinedload(PartItem.document)
            .selectinload(Document.category),
        )
        .where(PartItem.id == new_item.id)
    )
    result = await db.execute(stmt)
    item = result.unique().scalar_one()

    # 補齊 author_name / category_name
    if item.document:
        item.document.author_name = (
            item.document.author.name if item.document.author else None
        )
        item.document.category_name = (
            item.document.category.name if item.document.category else None
        )

    return PartItemResponse.model_validate(item, from_attributes=True)


# ============================================================
# DELETE /api/v1/parts/{part_id}/items/{item_id}  — 解除文件綁定
# ============================================================
@router.delete("/{part_id}/items/{item_id}")
async def unbind_part_item(
    part_id: UUID,
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """解除零件與文件的綁定關係（文件本身不會被刪除）。"""
    stmt = delete(PartItem).where(
        PartItem.id == item_id,
        PartItem.part_id == part_id,  # 確保 item 屬於該 part（防止越權）
    )
    result = await db.execute(stmt)
    await db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="找不到此綁定記錄")

    return {"status": "success", "message": "文件綁定已解除"}
