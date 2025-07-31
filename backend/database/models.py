from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text
from sqlalchemy.sql import func
from .database import Base

class Deployment(Base):
    __tablename__ = "deployments"

    id = Column(Integer, primary_key=True, index=True)
    deployment_name = Column(String, unique=True, index=True, nullable=False)
    repo_url = Column(String, nullable=False)
    
    encrypted_pat_token = Column(String, nullable=True) 
    language = Column(String, nullable=True) 
    
    status = Column(String, default="Created")
    
    push_enabled = Column(Boolean, nullable=False, server_default='true')

    # NEW: Field to store Grafana panel URLs as a JSON string
    grafana_panel_links = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_updated = Column(DateTime(timezone=True), onupdate=func.now())
