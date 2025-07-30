from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from .database import Base

class Deployment(Base):
    __tablename__ = "deployments"

    id = Column(Integer, primary_key=True, index=True)
    deployment_name = Column(String, unique=True, index=True, nullable=False)
    repo_url = Column(String, nullable=False)
    
    # Reverted: Store the encrypted token and detected language
    encrypted_pat_token = Column(String, nullable=True) 
    language = Column(String, nullable=True) 
    
    status = Column(String, default="Created") # Reverted to simpler initial status
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_updated = Column(DateTime(timezone=True), onupdate=func.now())