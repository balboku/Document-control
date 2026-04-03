"""MDF (Medical Device File) management router."""
from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, delete
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import MDFProject, MDFDocumentLink, Document
from app.schemas import (
    MDFProjectCreate, MDFProjectResponse,
    MDFDocumentLinkCreate, MDFDocumentLinkResponse
)

router = APIRouter(prefix="/api/mdf", tags=["MDF"])


@router.get("", response_model=List[MDFProjectResponse])
async def get_mdf_projects(db: AsyncSession = Depends(get_db)):
    """Get all MDF projects."""
    result = await db.execute(
        select(MDFProject).order_by(MDFProject.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=MDFProjectResponse)
async def create_mdf_project(
    data: MDFProjectCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new MDF project."""
    # Check if project_no already exists
    stmt = select(MDFProject).where(MDFProject.project_no == data.project_no)
    existing = await db.execute(stmt)
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Project number already exists")

    new_project = MDFProject(**data.model_dump())
    db.add(new_project)
    await db.commit()
    await db.refresh(new_project)
    return new_project


@router.get("/{project_id}", response_model=MDFProjectResponse)
async def get_mdf_project_detail(
    project_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get MDF project detail with all linked documents."""
    stmt = (
        select(MDFProject)
        .options(
            joinedload(MDFProject.linked_documents)
            .joinedload(MDFDocumentLink.document)
            .joinedload(Document.author),
            joinedload(MDFProject.linked_documents)
            .joinedload(MDFDocumentLink.document)
            .joinedload(Document.category)
        )
        .where(MDFProject.id == project_id)
    )
    result = await db.execute(stmt)
    project = result.unique().scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="MDF Project not found")
    
    return project


@router.post("/{project_id}/links", response_model=MDFDocumentLinkResponse)
async def link_document_to_mdf(
    project_id: UUID,
    data: MDFDocumentLinkCreate,
    db: AsyncSession = Depends(get_db)
):
    """Link a document to an MDF project item (1-18)."""
    # Check if project exists
    result = await db.execute(select(MDFProject).where(MDFProject.id == project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="MDF Project not found")
    
    # Check if document exists
    doc_result = await db.execute(select(Document).where(Document.id == data.document_id))
    if not doc_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Document not found")

    # Check if this item_no already has a link for this project
    link_stmt = select(MDFDocumentLink).where(
        MDFDocumentLink.mdf_project_id == project_id,
        MDFDocumentLink.item_no == data.item_no
    )
    link_result = await db.execute(link_stmt)
    if link_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Item No {data.item_no} already has a linked document")

    new_link = MDFDocumentLink(
        mdf_project_id=project_id,
        item_no=data.item_no,
        document_id=data.document_id
    )
    db.add(new_link)
    await db.commit()
    
    # Refresh to get document details for response
    stmt = (
        select(MDFDocumentLink)
        .options(joinedload(MDFDocumentLink.document))
        .where(MDFDocumentLink.id == new_link.id)
    )
    result = await db.execute(stmt)
    return result.scalar_one()


@router.delete("/links/{link_id}")
async def unlink_document_from_mdf(
    link_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Remove a link between a document and an MDF project."""
    stmt = delete(MDFDocumentLink).where(MDFDocumentLink.id == link_id)
    result = await db.execute(stmt)
    await db.commit()
    
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Link not found")
    
    return {"status": "success", "message": "Document unlinked successfully"}
