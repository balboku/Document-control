"""MDF (Medical Device File) management router."""
from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, delete
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import MDFProject, MDFDocumentLink, Document
from app.schemas import (
    MDFProjectCreate, MDFProjectUpdate, MDFProjectResponse,
    MDFDocumentLinkCreate, MDFDocumentLinkResponse,
    DocumentBriefResponse
)

router = APIRouter(prefix="/api/mdf", tags=["MDF"])


@router.get("", response_model=List[MDFProjectResponse])
async def get_mdf_projects(db: AsyncSession = Depends(get_db)):
    """Get all MDF projects."""
    stmt = (
        select(MDFProject)
        .options(
            selectinload(MDFProject.linked_documents)
            .joinedload(MDFDocumentLink.document)
            .selectinload(Document.author),
            selectinload(MDFProject.linked_documents)
            .joinedload(MDFDocumentLink.document)
            .selectinload(Document.category)
        )
        .order_by(MDFProject.created_at.desc())
    )
    result = await db.execute(stmt)
    projects = result.unique().scalars().all()
    
    # Manual mapping for author/category names in DocumentBriefResponse
    for p in projects:
        for link in p.linked_documents:
            if link.document:
                link.document.author_name = link.document.author.name if link.document.author else None
                link.document.category_name = link.document.category.name if link.document.category else None
                
    return projects




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
    
    # Reload with joinedload to avoid lazy loading error during serialization
    stmt = (
        select(MDFProject)
        .options(joinedload(MDFProject.linked_documents).joinedload(MDFDocumentLink.document))
        .where(MDFProject.id == new_project.id)
    )
    result = await db.execute(stmt)
    return result.unique().scalar_one()




@router.get("/{project_id}", response_model=MDFProjectResponse)
async def get_mdf_project_detail(project_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get single MDF project with all 18 items linked."""
    stmt = (
        select(MDFProject)
        .options(
            selectinload(MDFProject.linked_documents)
            .joinedload(MDFDocumentLink.document)
            .selectinload(Document.author),
            selectinload(MDFProject.linked_documents)
            .joinedload(MDFDocumentLink.document)
            .selectinload(Document.category)
        )
        .where(MDFProject.id == project_id)
    )
    result = await db.execute(stmt)
    project = result.unique().scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="MDF Project not found")
        
    # Manual mapping for author/category names
    for link in project.linked_documents:
        if link.document:
            link.document.author_name = link.document.author.name if link.document.author else None
            link.document.category_name = link.document.category.name if link.document.category else None
            
    return project


@router.put("/{project_id}", response_model=MDFProjectResponse)
async def update_mdf_project(
    project_id: UUID,
    data: MDFProjectUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update an MDF project's metadata."""
    result = await db.execute(select(MDFProject).where(MDFProject.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="MDF Project not found")

    update_data = data.model_dump(exclude_unset=True)
    
    # Check project_no uniqueness if being changed
    if "project_no" in update_data and update_data["project_no"] != project.project_no:
        existing = await db.execute(select(MDFProject).where(MDFProject.project_no == update_data["project_no"]))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Project number already exists")

    for key, value in update_data.items():
        setattr(project, key, value)
    
    await db.commit()
    
    # Reload with relationships
    return await get_mdf_project_detail(project_id, db)


@router.delete("/{project_id}")
async def delete_mdf_project(project_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete an MDF project (Cascade will handle links)."""
    result = await db.execute(select(MDFProject).where(MDFProject.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="MDF Project not found")

    await db.delete(project)
    await db.commit()
    
    return {"status": "success", "message": f"MDF Project {project.project_no} deleted."}


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


@router.post("/{project_id}/duplicate", response_model=MDFProjectResponse)
async def duplicate_mdf_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Deep copy an MDF project including all item links (1~18)."""
    from datetime import datetime

    # Load original project with all links
    stmt = (
        select(MDFProject)
        .options(selectinload(MDFProject.linked_documents))
        .where(MDFProject.id == project_id)
    )
    result = await db.execute(stmt)
    original = result.unique().scalar_one_or_none()

    if not original:
        raise HTTPException(status_code=404, detail="MDF Project not found")

    # Generate a unique project_no suffix using timestamp
    timestamp_suffix = datetime.now().strftime("%m%d%H%M")
    new_project_no = f"{original.project_no}-COPY-{timestamp_suffix}"

    # Ensure uniqueness (edge case: rapid duplicate calls)
    existing = await db.execute(
        select(MDFProject).where(MDFProject.project_no == new_project_no)
    )
    if existing.scalar_one_or_none():
        new_project_no = f"{original.project_no}-COPY-{datetime.now().strftime('%m%d%H%M%S')}"

    # Create new project
    new_project = MDFProject(
        product_name=f"{original.product_name} (複製)",
        project_no=new_project_no,
        classification=original.classification,
    )
    db.add(new_project)
    await db.flush()  # get new project ID before adding links

    # Deep copy all document links
    for link in original.linked_documents:
        new_link = MDFDocumentLink(
            mdf_project_id=new_project.id,
            item_no=link.item_no,
            document_id=link.document_id,
        )
        db.add(new_link)

    await db.commit()

    # Reload with full relationships for response
    stmt = (
        select(MDFProject)
        .options(
            selectinload(MDFProject.linked_documents)
            .joinedload(MDFDocumentLink.document)
            .selectinload(Document.author),
            selectinload(MDFProject.linked_documents)
            .joinedload(MDFDocumentLink.document)
            .selectinload(Document.category),
        )
        .where(MDFProject.id == new_project.id)
    )
    result = await db.execute(stmt)
    new_project_full = result.unique().scalar_one()

    # Manual mapping for author/category names
    for lnk in new_project_full.linked_documents:
        if lnk.document:
            lnk.document.author_name = lnk.document.author.name if lnk.document.author else None
            lnk.document.category_name = lnk.document.category.name if lnk.document.category else None

    return new_project_full

