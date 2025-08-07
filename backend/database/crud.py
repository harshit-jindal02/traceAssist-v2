from sqlalchemy.orm import Session
from . import models

# This is the new function to log an API call.
def create_api_log(db: Session, client_repo: str, deployment_name: str, changes_made: bool):
    """
    Logs a single API usage event to the database.
    """
    db_log_entry = models.ApiUsageLog(
        client_repo=client_repo,
        deployment_name=deployment_name,
        changes_made=changes_made
    )
    db.add(db_log_entry)
    db.commit()
    db.refresh(db_log_entry)
    return db_log_entry

# The rest of the CRUD functions are no longer used, but can be kept or removed.