from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from .database import Base

# This is the definitive model for logging API usage.
class ApiUsageLog(Base):
    __tablename__ = "api_usage_logs"

    # FIX: Added index=True to the primary key column.
    id = Column(Integer, primary_key=True, index=True)
    client_repo = Column(String, index=True, nullable=False)
    deployment_name = Column(String, nullable=False)
    changes_made = Column(Boolean, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

# The old Deployment model has been removed to avoid confusion.

