import os
import shutil
import subprocess
import logging
import re
from urllib.parse import urlparse, urlunparse, quote
from pathlib import Path
import httpx

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
from typing import Optional

from git import Repo, GitCommandError
from dotenv import load_dotenv
import yaml
from sqlalchemy.orm import Session
from cryptography.fernet import Fernet

# Import database components
from database import crud, models
from database.database import engine, get_db

# Create database tables if they don't exist
models.Base.metadata.create_all(bind=engine)
load_dotenv()

# --- NEW: Encryption Setup ---
# The key is loaded from an environment variable for security.
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
if not ENCRYPTION_KEY:
    raise ValueError("ENCRYPTION_KEY environment variable not set. Please generate one and add it to your secret.")
fernet = Fernet(ENCRYPTION_KEY.encode())

app = FastAPI(title="TraceAssist API", version="4.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper(), format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
BASE_DIR = "user-apps"
K8S_OUTPUT_DIR = "k8s-generated"
TEMP_CLONE_DIR = "temp-clone" # For validation clones
os.makedirs(BASE_DIR, exist_ok=True)
os.makedirs(K8S_OUTPUT_DIR, exist_ok=True)
os.makedirs(TEMP_CLONE_DIR, exist_ok=True)

# --- Pydantic Models ---
class DeploymentCreate(BaseModel):
    repo_url: str
    deployment_name: str
    pat_token: Optional[str] = Field(None, description="Optional GitHub PAT for validation and storage.")
    @validator("deployment_name")
    def validate_deployment_name(cls, v):
        if not re.match(r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", v) or len(v) > 63:
            raise ValueError("Invalid deployment name.")
        return v

class InstrumentRequest(BaseModel):
    # This model is now empty as the token is retrieved from the DB
    pass

# --- Helper Functions ---
async def verify_pat(token: str) -> bool:
    """Makes a test API call to GitHub to verify a PAT."""
    if not token: return False
    headers = {"Authorization": f"token {token}"}
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get("https://api.github.com/user", headers=headers)
            return response.status_code == 200
        except httpx.RequestError:
            return False

def detect_language(app_path: str) -> str:
    has_package_json = False; py_count = 0; java_count = 0
    if not os.path.isdir(app_path): return "unknown"
    excluded_dirs = ['.git', 'node_modules', '__pycache__', 'venv', 'env', '.venv', 'target', 'build', 'dist']
    for root, dirs, files in os.walk(app_path):
        dirs[:] = [d for d in dirs if d not in excluded_dirs]
        if "package.json" in files: has_package_json = True
        for f_name in files:
            if f_name.endswith(".py"): py_count += 1
            if f_name.endswith(".java"): java_count += 1
    if has_package_json: return "nodejs"
    if py_count > java_count: return "python"
    if java_count > 0: return "java"
    if py_count > 0: return "python"
    return "unknown"

def find_first_file(directory: Path, patterns: list):
    for pattern in patterns:
        try: return next(directory.glob(pattern))
        except StopIteration: continue
    return None

def modify_kubernetes_manifest(yaml_content: str, app_id: str, image_name: str, language: str):
    try:
        docs = list(yaml.safe_load_all(yaml_content))
        modified_docs = []
        for doc in docs:
            if not isinstance(doc, dict):
                modified_docs.append(doc)
                continue
            kind = doc.get("kind")
            original_app_label = doc.get('metadata', {}).get('labels', {}).get('app')
            if kind == "Deployment":
                doc['metadata']['name'] = f"{app_id}-deployment"
                doc['metadata'].setdefault('labels', {})['app'] = app_id
                spec = doc.setdefault('spec', {})
                spec.setdefault('selector', {}).setdefault('matchLabels', {})['app'] = app_id
                template = spec.setdefault('template', {})
                template.setdefault('metadata', {}).setdefault('labels', {})['app'] = app_id
                annotations = template.setdefault('metadata', {}).setdefault('annotations', {})
                annotations["instrumentation.opentelemetry.io/inject"] = "true"
                if language != "unknown":
                    annotations[f"instrumentation.opentelemetry.io/inject-{language}"] = "true"
                pod_spec = template.setdefault('spec', {})
                pod_spec['serviceAccountName'] = 'traceassist-sa'
                containers = pod_spec.setdefault('containers', [])
                if containers:
                    container_to_modify = next((c for c in containers if c.get('name') == original_app_label), containers[0])
                    container_to_modify['image'] = image_name
                    container_to_modify['imagePullPolicy'] = 'Never'
                modified_docs.append(doc)
            elif kind == "Service":
                spec = doc.setdefault('spec', {})
                spec.setdefault('selector', {})['app'] = app_id
                modified_docs.append(doc)
            else:
                modified_docs.append(doc)
        return yaml.dump_all(modified_docs, sort_keys=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to modify Kubernetes manifest: {e}")

# --- API Endpoints ---

@app.post("/deployments", status_code=201)
async def create_deployment_entry(deployment: DeploymentCreate, db: Session = Depends(get_db)):
    logger.info(f"Validating new deployment request for '{deployment.deployment_name}'")
    db_deployment = crud.get_deployment_by_name(db, deployment_name=deployment.deployment_name)
    if db_deployment:
        raise HTTPException(status_code=409, detail="A deployment with this name already exists.")

    if deployment.pat_token:
        if not await verify_pat(deployment.pat_token):
            raise HTTPException(status_code=400, detail="The provided GitHub PAT is invalid or expired.")

    temp_dir = Path(TEMP_CLONE_DIR) / deployment.deployment_name
    encrypted_token_str = None
    language = "unknown"
    try:
        effective_clone_url = deployment.repo_url
        if deployment.pat_token:
            try:
                parsed_url = urlparse(deployment.repo_url)
                if "github.com" in parsed_url.hostname.lower():
                    encoded_token = quote(deployment.pat_token, safe='')
                    netloc_with_token = f"{encoded_token}@{parsed_url.hostname}"
                    effective_clone_url = urlunparse((parsed_url.scheme, netloc_with_token, parsed_url.path, "", "", ""))
            except Exception: pass
        
        Repo.clone_from(effective_clone_url, str(temp_dir), depth=1)
        language = detect_language(str(temp_dir))
        
        if deployment.pat_token:
            encrypted_token_str = fernet.encrypt(deployment.pat_token.encode()).decode()

    except GitCommandError as e:
        raise HTTPException(status_code=400, detail=f"Invalid Git URL or insufficient permissions. Please check the URL and PAT. Error: {e.stderr}")
    finally:
        if temp_dir.exists():
            shutil.rmtree(temp_dir)

    return crud.create_deployment(
        db=db,
        deployment_name=deployment.deployment_name,
        repo_url=deployment.repo_url,
        encrypted_pat_token=encrypted_token_str,
        language=language,
        status="Created"
    )

@app.post("/deployments/{deployment_name}/instrument")
async def instrument_and_deploy(deployment_name: str, db: Session = Depends(get_db)):
    db_deployment = crud.get_deployment_by_name(db, deployment_name=deployment_name)
    if not db_deployment:
        raise HTTPException(status_code=404, detail="Deployment not found.")

    app_dir = Path(BASE_DIR) / deployment_name
    
    try:
        crud.update_deployment_status(db, deployment_name=deployment_name, status="Cloning")
        pat_token = None
        if db_deployment.encrypted_pat_token:
            pat_token = fernet.decrypt(db_deployment.encrypted_pat_token.encode()).decode()
        
        effective_clone_url = db_deployment.repo_url
        if pat_token:
            try:
                parsed_url = urlparse(db_deployment.repo_url)
                if "github.com" in parsed_url.hostname.lower():
                    encoded_token = quote(pat_token, safe='')
                    netloc_with_token = f"{encoded_token}@{parsed_url.hostname}"
                    effective_clone_url = urlunparse((parsed_url.scheme, netloc_with_token, parsed_url.path, "", "", ""))
            except Exception: pass
        
        if app_dir.exists(): shutil.rmtree(app_dir)
        Repo.clone_from(effective_clone_url, str(app_dir))

        crud.update_deployment_status(db, deployment_name=deployment_name, status="Building")
        language = db_deployment.language
        dockerfile_path = find_first_file(app_dir, ["Dockerfile", "dockerfile"])
        if not dockerfile_path:
            raise HTTPException(status_code=404, detail="Dockerfile not found in repository.")
        
        image_name = f"user-app-{deployment_name.lower()}:latest"
        subprocess.run(["docker", "build", "-t", image_name, "."], cwd=str(app_dir), check=True, capture_output=True, text=True)

        crud.update_deployment_status(db, deployment_name=deployment_name, status="Deploying")
        search_dirs = [app_dir, app_dir / "k8s", app_dir / "deploy", app_dir / "manifests"]
        found_manifest_paths = [p for d in search_dirs if d.is_dir() for p in d.glob("*.yaml")] + [p for d in search_dirs if d.is_dir() for p in d.glob("*.yml")]
        if not found_manifest_paths:
            raise HTTPException(status_code=404, detail="No Kubernetes YAML manifests found.")
        
        for manifest_path in found_manifest_paths:
            original_content = manifest_path.read_text()
            modified_content = modify_kubernetes_manifest(original_content, deployment_name, image_name, language)
            output_path = Path(K8S_OUTPUT_DIR) / f"{deployment_name}-{manifest_path.name}"
            output_path.write_text(modified_content)
            subprocess.run(["kubectl", "apply", "-n", "traceassist", "-f", str(output_path)], check=True, capture_output=True, text=True, timeout=60)

        crud.update_deployment_status(db, deployment_name=deployment_name, status="Deployed")
        return {"message": "Deployment successful."}

    except Exception as e:
        crud.update_deployment_status(db, deployment_name=deployment_name, status="Failed")
        detail = e.stderr if hasattr(e, 'stderr') else str(e)
        raise HTTPException(status_code=500, detail=f"A step in the process failed: {detail[:1000]}...")

@app.get("/deployments")
def get_all_deployments(db: Session = Depends(get_db)):
    return crud.get_deployments(db)

@app.get("/deployments/{deployment_name}")
def get_deployment_details(deployment_name: str, db: Session = Depends(get_db)):
    db_deployment = crud.get_deployment_by_name(db, deployment_name=deployment_name)
    if not db_deployment:
        raise HTTPException(status_code=404, detail="Deployment not found.")
    return db_deployment

@app.delete("/deployments/{deployment_name}")
async def undeploy_application(deployment_name: str, db: Session = Depends(get_db)):
    db_deployment = crud.get_deployment_by_name(db, deployment_name=deployment_name)
    if not db_deployment:
        raise HTTPException(status_code=404, detail="Deployment not found.")
    try:
        crud.update_deployment_status(db, deployment_name=deployment_name, status="Undeploying")
        manifest_dir = Path(K8S_OUTPUT_DIR)
        manifest_files = list(manifest_dir.glob(f"{deployment_name}-*.yaml"))
        if not manifest_files:
            logger.warning(f"No manifest files found for '{deployment_name}'.")
        else:
            for file_path in manifest_files:
                subprocess.run(["kubectl", "delete", "-f", str(file_path), "--ignore-not-found"], check=True, capture_output=True, text=True)
                os.remove(file_path)
        app_dir = Path(BASE_DIR) / deployment_name
        if app_dir.exists():
            shutil.rmtree(app_dir)
        crud.delete_deployment_by_name(db, deployment_name=deployment_name)
        return {"message": f"Successfully undeployed and deleted record for '{deployment_name}'."}
    except Exception as e:
        crud.update_deployment_status(db, deployment_name=deployment_name, status="Undeploy Failed")
        detail = e.stderr if hasattr(e, 'stderr') else str(e)
        raise HTTPException(status_code=500, detail=f"An error occurred during undeployment: {detail}")
