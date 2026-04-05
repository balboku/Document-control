"""Settings management router - Users, Categories, Number Format."""
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.database import get_db
from app.models import User, Category, NumberFormat
from app.schemas import (
    UserCreate, UserUpdate, UserResponse,
    CategoryCreate, CategoryUpdate, CategoryResponse,
    NumberFormatUpdate, NumberFormatResponse,
)
from fastapi import BackgroundTasks
from app.services.document_service import purge_old_audit_logs

router = APIRouter(prefix="/api/settings", tags=["settings"])


# ============ Users ============

@router.get("/users", response_model=List[UserResponse])
async def get_users(
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
):
    query = select(User).order_by(User.name)
    if active_only:
        query = query.where(User.is_active == True)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/users", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    user = User(name=user_data.name, department=user_data.department)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = user_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)
    
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}")
async def delete_user(user_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete a user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.delete(user)
    await db.commit()
    return {"status": "success", "message": f"User {user.name} deleted."}


# ============ Categories ============

@router.get("/categories", response_model=List[CategoryResponse])
async def get_categories(
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
):
    query = select(Category).order_by(Category.sort_order, Category.name)
    if active_only:
        query = query.where(Category.is_active == True)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/categories", response_model=CategoryResponse)
async def create_category(
    cat_data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
):
    # Check unique name
    existing = await db.execute(select(Category).where(Category.name == cat_data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Category name already exists")
    
    cat = Category(
        name=cat_data.name,
        description=cat_data.description,
        sort_order=cat_data.sort_order or 0,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.put("/categories/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: UUID,
    cat_data: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Category).where(Category.id == category_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    
    update_data = cat_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(cat, key, value)
    
    await db.commit()
    await db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}")
async def delete_category(category_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete a category."""
    result = await db.execute(select(Category).where(Category.id == category_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    
    await db.delete(cat)
    await db.commit()
    return {"status": "success", "message": f"Category {cat.name} deleted."}


# ============ Number Format ============

@router.get("/number-format", response_model=NumberFormatResponse)
async def get_number_format(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(NumberFormat).where(NumberFormat.id == 1))
    fmt = result.scalar_one_or_none()
    
    if not fmt:
        fmt = NumberFormat(
            id=1, prefix="DOC", separator="-",
            year_format="YYYY", sequence_digits=4,
            current_sequence=0, current_year=datetime.now().year,
        )
        db.add(fmt)
        await db.commit()
        await db.refresh(fmt)
    
    # Generate example
    if fmt.year_format == "YY":
        year_str = str(fmt.current_year)[-2:]
    else:
        year_str = str(fmt.current_year)
    
    example = f"{fmt.prefix}{fmt.separator}{year_str}{fmt.separator}{'0' * (fmt.sequence_digits - 1)}1"
    
    return NumberFormatResponse(
        id=fmt.id,
        prefix=fmt.prefix,
        separator=fmt.separator,
        year_format=fmt.year_format,
        sequence_digits=fmt.sequence_digits,
        current_sequence=fmt.current_sequence,
        current_year=fmt.current_year,
        example=example,
        updated_at=fmt.updated_at,
    )


@router.put("/number-format", response_model=NumberFormatResponse)
async def update_number_format(
    fmt_data: NumberFormatUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(NumberFormat).where(NumberFormat.id == 1))
    fmt = result.scalar_one_or_none()
    
    if not fmt:
        fmt = NumberFormat(id=1)
        db.add(fmt)
        await db.flush()
    
    update_data = fmt_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(fmt, key, value)
    
    fmt.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(fmt)
    
    # Generate example
    if fmt.year_format == "YY":
        year_str = str(fmt.current_year)[-2:]
    else:
        year_str = str(fmt.current_year)
    
    example = f"{fmt.prefix}{fmt.separator}{year_str}{fmt.separator}{'0' * (fmt.sequence_digits - 1)}1"
    
    return NumberFormatResponse(
        id=fmt.id,
        prefix=fmt.prefix,
        separator=fmt.separator,
        year_format=fmt.year_format,
        sequence_digits=fmt.sequence_digits,
        current_sequence=fmt.current_sequence,
        current_year=fmt.current_year,
        example=example,
        updated_at=fmt.updated_at,
    )


# ============ Audit Log Management ============

@router.post("/audit/purge")
async def trigger_audit_purge(
    background_tasks: BackgroundTasks,
    retain_days: int = 365,
    dry_run: bool = False,
    async_mode: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """
    手動觸發稽核日誌清理作業。
    
    - retain_days: 保留天數（預設 365 天）
    - dry_run: 僅統計不實際刪除
    - async_mode: 是否在後台異步執行（預設 True）
    """
    if async_mode:
        background_tasks.add_task(purge_old_audit_logs, db, retain_days, dry_run)
        return {
            "status": "accepted",
            "message": f"Audit log purge task (retain_days={retain_days}) has been queued in background.",
            "dry_run": dry_run
        }
    else:
        # 即刻執行並等待結果（適合小規模手動測試）
        result = await purge_old_audit_logs(db, retain_days, dry_run)
        return result

