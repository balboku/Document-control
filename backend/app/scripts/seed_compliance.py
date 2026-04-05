
import asyncio
import uuid
import sys
import os

# Add parent directory to path to import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import select
from app.database import get_db, AsyncSessionLocal
from app.models import RegulatoryRequirement
from app.services.embedding_service import generate_embeddings

# ISO 13485:2016 Key Clauses for DMS
ISO_CLAUSES = [
    {
        "clause_no": "4.1",
        "title": "General requirements",
        "requirement_text": "The organization shall document a quality management system and maintain its effectiveness in accordance with the requirements of this International Standard and applicable regulatory requirements."
    },
    {
        "clause_no": "4.2.3",
        "title": "Control of documents",
        "requirement_text": "Documents required by the quality management system shall be controlled. Records are a special type of document and shall be controlled according to the requirements given in 4.2.4."
    },
    {
        "clause_no": "4.2.4",
        "title": "Control of records",
        "requirement_text": "Records shall be established and maintained to provide evidence of conformity to requirements and of the effective operation of the quality management system."
    },
    {
        "clause_no": "7.1",
        "title": "Planning of product realization",
        "requirement_text": "The organization shall plan and develop the processes needed for product realization. Planning of product realization shall be consistent with the requirements of the other processes of the quality management system."
    },
    {
        "clause_no": "7.3.2",
        "title": "Design and development planning",
        "requirement_text": "The organization shall plan and control the design and development of product. As appropriate, design and development planning documents shall be maintained and updated as the design and development progresses."
    },
    {
        "clause_no": "7.3.3",
        "title": "Design and development inputs",
        "requirement_text": "Inputs relating to product requirements shall be determined and records maintained. These inputs shall include functional, performance, usability and safety requirements."
    },
    {
        "clause_no": "7.3.4",
        "title": "Design and development outputs",
        "requirement_text": "Outputs of design and development shall be in a form suitable for verification against the design and development inputs and shall be approved prior to release."
    },
    {
        "clause_no": "7.3.5",
        "title": "Design and development review",
        "requirement_text": "At suitable stages, systematic reviews of design and development shall be performed in accordance with planned and documented arrangements."
    },
    {
        "clause_no": "7.3.6",
        "title": "Design and development verification",
        "requirement_text": "Design and development verification shall be performed in accordance with planned and documented arrangements to ensure that the design and development outputs have met the design and development input requirements."
    },
    {
        "clause_no": "7.3.7",
        "title": "Design and development validation",
        "requirement_text": "Design and development validation shall be performed in accordance with planned and documented arrangements to ensure that the resulting product is capable of meeting the requirements for the specified application or intended use."
    },
    {
        "clause_no": "7.3.9",
        "title": "Control of design and development changes",
        "requirement_text": "The organization shall document procedures to control design and development changes. The organization shall determine the significance of the change to function, performance, usability, safety and applicable regulatory requirements."
    },
    {
        "clause_no": "7.5.1",
        "title": "Control of production and service provision",
        "requirement_text": "Production and service provision shall be planned, carried out, monitored and controlled to ensure that product conforms to specifications."
    },
    {
        "clause_no": "8.2.1",
        "title": "Feedback",
        "requirement_text": "As one of the measurements of the performance of the quality management system, the organization shall gather and monitor information relating to whether the organization has met customer requirements."
    },
    {
        "clause_no": "8.2.2",
        "title": "Complaint handling",
        "requirement_text": "The organization shall document procedures for timely complaint handling in accordance with applicable regulatory requirements."
    }
]

async def seed_compliance():
    print("🌱 Seeding ISO 13485 regulatory requirements...")
    
    # Ensure tables exist
    from app.database import engine
    async with engine.begin() as conn:
        await conn.run_sync(RegulatoryRequirement.metadata.create_all)
    
    async with AsyncSessionLocal() as db:
        # Check if already seeded
        result = await db.execute(select(RegulatoryRequirement).limit(1))
        if result.scalar_one_or_none():
            print("⚠️ Regulatory requirements already seeded. Skipping.")
            return

        texts_to_embed = [f"{c['clause_no']} {c['title']}: {c['requirement_text']}" for c in ISO_CLAUSES]
        
        print(f"📡 Generating embeddings for {len(texts_to_embed)} clauses...")
        embeddings = await generate_embeddings(texts_to_embed)
        
        if not embeddings:
            print("❌ Failed to generate embeddings. Check API key.")
            return

        for i, clause in enumerate(ISO_CLAUSES):
            req = RegulatoryRequirement(
                standard_name="ISO 13485:2016",
                clause_no=clause["clause_no"],
                title=clause["title"],
                requirement_text=clause["requirement_text"],
                embedding=embeddings[i]
            )
            db.add(req)
        
        await db.commit()
        print(f"✅ Successfully seeded {len(ISO_CLAUSES)} ISO 13485 clauses.")

if __name__ == "__main__":
    asyncio.run(seed_compliance())
