import httpx
import json
import os
import logging
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.users import User
from app.core.security import get_password_hash
from app.models.core import RegionalOffice

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# data.gov.in API base URL for open datasets
DATA_GOV_API_URL = "https://api.data.gov.in/resource"
API_KEY = os.getenv("DATA_GOV_IN_API_KEY", "DEMO_KEY")

def fetch_regional_offices_and_create_users():
    """
    Simulates fetching public institutional contact data from data.gov.in API
    and uses the official regional office emails to populate the DB with realistic,
    role-based login accounts (e.g., Regional Officers).
    """
    logger.info("Initializing connection to data.gov.in...")
    
    # In a full production scenario, we'd query the specific resource_id 
    # for SPCB / CECB regional offices here:
    # params = {"api-key": API_KEY, "format": "json", "limit": 50, "filters[state]": "Chhattisgarh"}
    # response = httpx.get(f"{DATA_GOV_API_URL}/{RESOURCE_ID}", params=params)
    
    # Simulating the structured JSON response we would get for Chhattisgarh ROs
    simulated_gov_response = {
        "records": [
            {"office_name": "RO Raipur", "official_email": "ro.raipur@cecb.gov.in", "region": "Raipur", "type": "regional_officer"},
            {"office_name": "RO Bhilai", "official_email": "ro.bhilai@cecb.gov.in", "region": "Bhilai", "type": "regional_officer"},
            {"office_name": "RO Bilaspur", "official_email": "ro.bilaspur@cecb.gov.in", "region": "Bilaspur", "type": "regional_officer"},
            {"office_name": "RO Korba", "official_email": "ro.korba@cecb.gov.in", "region": "Korba", "type": "regional_officer"},
            {"office_name": "RO Raigarh", "official_email": "ro.raigarh@cecb.gov.in", "region": "Raigarh", "type": "regional_officer"},
            {"office_name": "CECB Head Office", "official_email": "member-secretary@cecb.gov.in", "region": "Statewide", "type": "super_admin"}
        ]
    }

    db: Session = SessionLocal()
    try:
        created_count = 0
        for record in simulated_gov_response["records"]:
            # Check if user already exists
            existing_user = db.query(User).filter(User.email == record["official_email"]).first()
            if not existing_user:
                new_user = User(
                    email=record["official_email"],
                    hashed_password=get_password_hash("password123"), # Standard default password for RO init
                    full_name=record["office_name"],
                    role=record["type"],
                    is_active=True
                )
                db.add(new_user)
                created_count += 1
                logger.info(f"Created official user from data.gov.in pattern: {record['official_email']}")
            else:
                logger.debug(f"User {record['official_email']} already exists.")
        
        db.commit()
        logger.info(f"Successfully synced {created_count} regional officer accounts to the database.")
    except Exception as e:
        logger.error(f"Failed to populate DB: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    fetch_regional_offices_and_create_users()
