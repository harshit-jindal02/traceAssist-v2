from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from .database import Base

# This is the new model for logging API usage.
class ApiUsageLog(Base):
    __tablename__ = "api_usage_logs"

    id = Column(Integer, primary_key=True, index=True)
    client_repo = Column(String, index=True, nullable=False)
    deployment_name = Column(String, nullable=False)
    changes_made = Column(Boolean, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

# The old Deployment model is no longer used by the new backend,
# but we can leave it here for now or remove it.
class Deployment(Base):
    __tablename__ = "deployments"

    id = Column(Integer, primary_key=True, index=True)
    deployment_name = Column(String, unique=True, index=True, nullable=False)
    # ... other columns from the old model