from sqlalchemy.orm import Session
from . import models

def get_deployment_by_id(db: Session, deployment_id: int):
    return db.query(models.Deployment).filter(models.Deployment.id == deployment_id).first()

def get_deployment_by_name(db: Session, deployment_name: str):
    return db.query(models.Deployment).filter(models.Deployment.deployment_name == deployment_name).first()

def get_deployments(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Deployment).order_by(models.Deployment.created_at.desc()).offset(skip).limit(limit).all()

def create_deployment(db: Session, deployment_name: str, repo_url: str, encrypted_pat_token: str | None, language: str, push_enabled: bool, status: str = "Created"):
    db_deployment = models.Deployment(
        deployment_name=deployment_name,
        repo_url=repo_url,
        encrypted_pat_token=encrypted_pat_token,
        language=language,
        push_enabled=push_enabled,
        status=status
    )
    db.add(db_deployment)
    db.commit()
    db.refresh(db_deployment)
    return db_deployment

def update_deployment_grafana_links(db: Session, deployment_name: str, links: str):
    """
    Updates the Grafana panel links for a specific deployment.
    """
    db_deployment = get_deployment_by_name(db, deployment_name)
    if db_deployment:
        db_deployment.grafana_panel_links = links
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

def delete_deployment_by_name(db: Session, deployment_name: str):
    db_deployment = get_deployment_by_name(db, deployment_name)
    if db_deployment:
        db.delete(db_deployment)
        db.commit()
    return db_deployment
