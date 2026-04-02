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
