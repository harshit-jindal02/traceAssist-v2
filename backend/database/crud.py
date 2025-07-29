from sqlalchemy.orm import Session
from . import models

def get_deployment_by_name(db: Session, deployment_name: str):
    return db.query(models.Deployment).filter(models.Deployment.deployment_name == deployment_name).first()

def get_deployments(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Deployment).order_by(models.Deployment.created_at.desc()).offset(skip).limit(limit).all()

def create_deployment(db: Session, deployment_name: str, repo_url: str, pat_token_provided: bool):
    db_deployment = models.Deployment(
        deployment_name=deployment_name,
        repo_url=repo_url,
        pat_token_provided=pat_token_provided,
        status="Cloned"
    )
    db.add(db_deployment)
    db.commit()
    db.refresh(db_deployment)
    return db_deployment

def update_deployment_status(db: Session, deployment_name: str, status: str):
    db_deployment = get_deployment_by_name(db, deployment_name)
    if db_deployment:
        db_deployment.status = status
        db.commit()
        db.refresh(db_deployment)
    return db_deployment
