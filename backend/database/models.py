from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from .database import Base

class Deployment(Base):
    __tablename__ = "deployments"

    id = Column(Integer, primary_key=True, index=True)
    # The user-provided deployment name, which is our app_id
    deployment_name = Column(String, unique=True, index=True, nullable=False)
    repo_url = Column(String, nullable=False)
    # We store a boolean indicating if a token was used, not the token itself
    pat_token_provided = Column(Boolean, default=False)
    status = Column(String, default="Cloned") # e.g., Cloned, Instrumented, Failed
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_updated = Column(DateTime(timezone=True), onupdate=func.now())
