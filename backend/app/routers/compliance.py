
"""Router for Compliance Insights."""
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.compliance_service import get_compliance_insights

router = APIRouter(prefix="/api/compliance", tags=["compliance"])

@router.get("/insights")
async def fetch_insights(
    force_refresh: bool = Query(False),
    db: AsyncSession = Depends(get_db)
):
    """
    Get AI-generated compliance insights and gap analysis for the Dashboard.
    """
    try:
        insights = await get_compliance_insights(db, force_refresh=force_refresh)
        return insights
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate insights: {str(e)}")

@router.post("/analyze")
async def trigger_analysis(db: AsyncSession = Depends(get_db)):
    """
    Force a full compliance scan.
    """
    try:
        insights = await get_compliance_insights(db, force_refresh=True)
        return {"status": "success", "count": len(insights), "insights": insights}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
