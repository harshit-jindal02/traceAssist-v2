import os
import shutil
import subprocess
import logging
import re
import json
from urllib.parse import urlparse, urlunparse, quote
from pathlib import Path
import httpx
import tempfile
from typing import List
from datetime import datetime


from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator, ConfigDict
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

ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
if not ENCRYPTION_KEY:
    raise ValueError("ENCRYPTION_KEY environment variable not set.")
fernet = Fernet(ENCRYPTION_KEY.encode())

app = FastAPI(title="TraceAssist API", version="5.1.2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper(), format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
BASE_DIR = "user-apps"
K8S_OUTPUT_DIR = "k8s-generated"

# Updated Grafana Configuration
GRAFANA_API_URL = os.getenv("GRAFANA_API_URL")
GRAFANA_PUBLIC_URL = os.getenv("GRAFANA_PUBLIC_URL")
GRAFANA_API_TOKEN = os.getenv("GRAFANA_API_TOKEN")

# Ensure directories exist at startup
os.makedirs(BASE_DIR, exist_ok=True)
os.makedirs(K8S_OUTPUT_DIR, exist_ok=True)

# --- Pydantic Models ---
class DeploymentBase(BaseModel):
    deployment_name: str
    repo_url: str
    language: Optional[str] = None
    status: str
    encrypted_pat_token: Optional[str] = None
    created_at: datetime
    last_updated: Optional[datetime] = None
    push_enabled: bool = True
    grafana_panel_links: Optional[str] = None

class Deployment(DeploymentBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class AnalyzeRequest(BaseModel):
    repo_url: str
    pat_token: Optional[str] = None

class AnalyzeResponse(BaseModel):
    is_public: bool
    push_required: bool

class DeploymentCreate(BaseModel):
    repo_url: str
    deployment_name: str
    pat_token: Optional[str] = None
    push_to_git: bool = True

# --- Helper Functions ---
async def verify_pat(token: str) -> bool:
    if not token: return False
    headers = {"Authorization": f"token {token}"}
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get("https://api.github.com/user", headers=headers)
            return response.status_code == 200
        except httpx.RequestError:
            return False

def check_push_permissions(repo_url: str, pat_token: str) -> bool:
    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            parsed_url = urlparse(repo_url)
            encoded_token = quote(pat_token, safe='')
            netloc_with_token = f"{encoded_token}@{parsed_url.hostname}"
            clone_url = urlunparse((parsed_url.scheme, netloc_with_token, parsed_url.path, "", "", ""))
            
            repo = Repo.clone_from(clone_url, temp_dir, depth=1)
            repo.git.push("--dry-run")
            return True
        except GitCommandError as e:
            logger.error(f"Push permission check failed: {e.stderr}")
            return False
        except Exception as e:
            logger.error(f"An unexpected error occurred during push permission check: {e}")
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
        any_changes_made = False
        instrumentation_changes_made = False
        for doc in docs:
            if not isinstance(doc, dict):
                modified_docs.append(doc)
                continue
            kind = doc.get("kind")
            original_app_label = doc.get('metadata', {}).get('labels', {}).get('app')
            if kind == "Deployment":
                if doc['metadata'].get('name') != f"{app_id}-deployment":
                    doc['metadata']['name'] = f"{app_id}-deployment"
                    any_changes_made = True
                labels = doc['metadata'].setdefault('labels', {})
                if labels.get('app') != app_id:
                    labels['app'] = app_id
                    any_changes_made = True
                spec = doc.setdefault('spec', {})
                if spec.setdefault('selector', {}).setdefault('matchLabels', {}).get('app') != app_id:
                    spec['selector']['matchLabels']['app'] = app_id
                    any_changes_made = True
                template = spec.setdefault('template', {})
                if template.setdefault('metadata', {}).setdefault('labels', {}).get('app') != app_id:
                    template['metadata']['labels']['app'] = app_id
                    any_changes_made = True
                pod_spec = template.setdefault('spec', {})
                containers = pod_spec.setdefault('containers', [])
                if containers:
                    container_to_modify = next((c for c in containers if c.get('name') == original_app_label), containers[0])
                    if container_to_modify.get('image') != image_name:
                        container_to_modify['image'] = image_name
                        any_changes_made = True
                    if container_to_modify.get('imagePullPolicy') != 'Never':
                        container_to_modify['imagePullPolicy'] = 'Never'
                        any_changes_made = True
                annotations = template.setdefault('metadata', {}).setdefault('annotations', {})
                if annotations.get("instrumentation.opentelemetry.io/inject") != "true":
                    annotations["instrumentation.opentelemetry.io/inject"] = "true"
                    any_changes_made = True
                    instrumentation_changes_made = True
                if language != "unknown" and annotations.get(f"instrumentation.opentelemetry.io/inject-{language}") != "true":
                     annotations[f"instrumentation.opentelemetry.io/inject-{language}"] = "true"
                     any_changes_made = True
                     instrumentation_changes_made = True
                if pod_spec.get('serviceAccountName') != 'traceassist-sa':
                    pod_spec['serviceAccountName'] = 'traceassist-sa'
                    any_changes_made = True
                    instrumentation_changes_made = True
            elif kind == "Service":
                spec = doc.setdefault('spec', {})
                if spec.setdefault('selector', {}).get('app') != app_id:
                    spec['selector']['app'] = app_id
                    any_changes_made = True
            modified_docs.append(doc)
        return yaml.dump_all(modified_docs, sort_keys=False), any_changes_made, instrumentation_changes_made
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to modify Kubernetes manifest: {e}")

# --- Grafana Helper Function ---
async def generate_and_upload_grafana_dashboard(deployment_name: str) -> list:
    dashboard_title = f"{deployment_name} Metrics"
    dashboard_uid = f"traceassist-{deployment_name}"
    
    # --- CORRECTED: Panel Definitions using Regex to Match Pod Names ---
    # We construct a regex pattern to match pod names that start with the deployment name.
    # The deployment resource is named "{deployment_name}-deployment" by the script.
    pod_name_pattern = f"{deployment_name}-deployment-.*"

    panel_definitions = [
        {
            "id": 1, 
            "title": "CPU Usage (Cores)", 
            "expr": 'sum(rate(container_cpu_usage_seconds_total{pod=~"' + pod_name_pattern + '"}[5m])) by (pod)',
            "format": "short"
        },
        {
            "id": 2, 
            "title": "Memory Usage (MB)", 
            "expr": 'sum(container_memory_working_set_bytes{pod=~"' + pod_name_pattern + '"}) by (pod)',
            "format": "bytes"
        },
        {
            "id": 3, 
            "title": "Network Traffic Received (Bytes/sec)", 
            "expr": 'sum(rate(container_network_receive_bytes_total{pod=~"' + pod_name_pattern + '"}[5m])) by (pod)',
            "format": "bps"
        },
        {
            "id": 4, 
            "title": "Network Traffic Transmitted (Bytes/sec)", 
            "expr": 'sum(rate(container_network_transmit_bytes_total{pod=~"' + pod_name_pattern + '"}[5m])) by (pod)',
            "format": "bps"
        },
    ]

    panels = []
    for i, p_def in enumerate(panel_definitions):
        panel = {
            "id": p_def["id"],
            "title": p_def["title"],
            "type": "timeseries",
            "datasource": {"type": "prometheus", "uid": "prometheus"},
            "targets": [{"expr": p_def["expr"], "legendFormat": "{{pod}}"}],
            "gridPos": {"h": 8, "w": 12, "x": 0 if i % 2 == 0 else 12, "y": (i // 2) * 8},
            "fieldConfig": {
                "defaults": {
                    "color": {"mode": "palette-classic"},
                    "custom": {"lineWidth": 2, "fillOpacity": 10},
                    "unit": p_def["format"]
                }
            }
        }
        panels.append(panel)

    dashboard_json = {
        "dashboard": {
            "id": None,
            "uid": dashboard_uid,
            "title": dashboard_title,
            "panels": panels,
            "time": {"from": "now-1h", "to": "now"},
            "refresh": "10s",
            "schemaVersion": 36,
            "version": 0
        },
        "folderId": 0,
        "overwrite": True
    }

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {GRAFANA_API_TOKEN}"
    }

    try:
        logger.info(f"Attempting to create Grafana dashboard for '{deployment_name}'...")
        logger.info(f"Connecting to Grafana API at: {GRAFANA_API_URL}")
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{GRAFANA_API_URL}/api/dashboards/db", json=dashboard_json, headers=headers)
            
            logger.info(f"Grafana API response status: {response.status_code}")
            logger.debug(f"Grafana API response body: {response.text}")
            
            response.raise_for_status()
            data = response.json()
            
            dashboard_slug = data.get("url", "").split('/')[-1]
            if not dashboard_slug:
                logger.warning("'url' key not found in Grafana API response, cannot generate links.")
                return []

            panel_links = []
            for p_def in panel_definitions:
                link = f"{GRAFANA_PUBLIC_URL}/d-solo/{dashboard_uid}/{dashboard_slug}?orgId=1&refresh=10s&panelId={p_def['id']}"
                panel_links.append(link)
            
            logger.info(f"Successfully generated {len(panel_links)} panel links.")
            return panel_links
            
    except httpx.RequestError as e:
        logger.error(f"Failed to connect to Grafana at {GRAFANA_API_URL}. Check network connectivity from the backend pod. Error: {e}")
        return []
    except httpx.HTTPStatusError as e:
        logger.error(f"Grafana API returned an error: {e.response.status_code} - {e.response.text}")
        return []
    except Exception as e:
        logger.error(f"An unexpected error occurred during Grafana dashboard generation: {e}")
        return []
    
# --- API Endpoints ---
@app.post("/deployments/analyze", response_model=AnalyzeResponse)
async def analyze_repository(request: AnalyzeRequest):
    is_public = False
    push_required = False
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            Repo.clone_from(request.repo_url, temp_dir, depth=1)
            is_public = True
            language = detect_language(temp_dir)
            manifest_path = find_first_file(Path(temp_dir), ["k8s/*.yaml", "deploy/*.yaml", "*.yaml"])
            if manifest_path:
                _, _, instrumentation_changes_needed = modify_kubernetes_manifest(manifest_path.read_text(), "temp-check", "temp-check", language)
                if instrumentation_changes_needed:
                    push_required = True
            return AnalyzeResponse(is_public=is_public, push_required=push_required)
    except GitCommandError:
        if not request.pat_token:
            raise HTTPException(status_code=400, detail="This is a private repository. A PAT token is required for analysis.")
        if not await verify_pat(request.pat_token):
            raise HTTPException(status_code=400, detail="The provided GitHub PAT is invalid or expired.")
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                parsed_url = urlparse(request.repo_url)
                netloc_with_token = f"{quote(request.pat_token, safe='')}@{parsed_url.hostname}"
                clone_url = urlunparse((parsed_url.scheme, netloc_with_token, parsed_url.path, "", "", ""))
                Repo.clone_from(clone_url, temp_dir, depth=1)
                is_public = False
                language = detect_language(temp_dir)
                manifest_path = find_first_file(Path(temp_dir), ["k8s/*.yaml", "deploy/*.yaml", "*.yaml"])
                if manifest_path:
                    _, _, instrumentation_changes_needed = modify_kubernetes_manifest(manifest_path.read_text(), "temp-check", "temp-check", language)
                    if instrumentation_changes_needed:
                        push_required = True
                return AnalyzeResponse(is_public=is_public, push_required=push_required)
        except GitCommandError as e:
            logger.error(f"Failed to clone private repo even with PAT: {e.stderr}")
            raise HTTPException(status_code=400, detail="Failed to clone repository with the provided PAT. Check URL and token permissions.")
    except Exception as e:
        logger.error(f"Unexpected error during analysis: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to analyze repository: {e}")

@app.post("/deployments", status_code=status.HTTP_201_CREATED, response_model=Deployment)
async def create_deployment_final(deployment: DeploymentCreate, db: Session = Depends(get_db)):
    if crud.get_deployment_by_name(db, deployment_name=deployment.deployment_name):
        raise HTTPException(status_code=409, detail="A deployment with this name already exists.")
    if deployment.pat_token:
        if not await verify_pat(deployment.pat_token):
            raise HTTPException(status_code=400, detail="The provided GitHub PAT is invalid or expired.")
        if deployment.push_to_git and not check_push_permissions(deployment.repo_url, deployment.pat_token):
             raise HTTPException(status_code=403, detail="The provided PAT token does not have push permissions for this repository.")
    language = "unknown"
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            clone_url = deployment.repo_url
            if deployment.pat_token:
                parsed_url = urlparse(clone_url)
                netloc_with_token = f"{quote(deployment.pat_token, safe='')}@{parsed_url.hostname}"
                clone_url = urlunparse((parsed_url.scheme, netloc_with_token, parsed_url.path, "", "", ""))
            Repo.clone_from(clone_url, temp_dir, depth=1)
            language = detect_language(temp_dir)
    except GitCommandError:
        raise HTTPException(status_code=400, detail="Failed to clone repository. If it's private, a valid PAT token is required.")
    encrypted_token_str = fernet.encrypt(deployment.pat_token.encode()).decode() if deployment.pat_token else None
    db_deployment = crud.create_deployment(
        db=db,
        deployment_name=deployment.deployment_name,
        repo_url=deployment.repo_url,
        encrypted_pat_token=encrypted_token_str,
        language=language,
        push_enabled=deployment.push_to_git,
        status="Created"
    )
    return db_deployment

@app.get("/deployments", response_model=List[Deployment])
def get_all_deployments(db: Session = Depends(get_db)):
    return crud.get_deployments(db)

@app.get("/deployments/{deployment_name}", response_model=Deployment)
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
            logger.warning(f"No manifest files found for '{deployment_name}' to delete.")
        else:
            for file_path in manifest_files:
                try:
                    subprocess.run(["kubectl", "delete", "-f", str(file_path), "--ignore-not-found"], check=True, capture_output=True, text=True)
                    os.remove(file_path)
                    logger.info(f"Deleted manifest and Kubernetes resource for {file_path}")
                except Exception as e:
                    logger.error(f"Failed to delete resource for {file_path}: {e}")
        app_dir = Path(BASE_DIR) / deployment_name
        if app_dir.exists():
            shutil.rmtree(app_dir)
        crud.delete_deployment_by_name(db, deployment_name=deployment_name)
        return {"message": f"Successfully undeployed and deleted record for '{deployment_name}'."}
    except Exception as e:
        crud.update_deployment_status(db, deployment_name=deployment_name, status="Undeploy Failed")
        detail = e.stderr if hasattr(e, 'stderr') else str(e)
        raise HTTPException(status_code=500, detail=f"An error occurred during undeployment: {detail}")

@app.post("/deployments/{deployment_name}/instrument")
async def instrument_and_deploy(deployment_name: str, db: Session = Depends(get_db)):
    db_deployment = crud.get_deployment_by_name(db, deployment_name)
    if not db_deployment:
        raise HTTPException(status_code=404, detail="Deployment not found.")
    app_dir = Path(BASE_DIR) / deployment_name
    try:
        crud.update_deployment_status(db, deployment_name=deployment_name, status="Cloning repository...")
        pat_token = None
        if db_deployment.encrypted_pat_token:
            pat_token = fernet.decrypt(db_deployment.encrypted_pat_token.encode()).decode()
        effective_clone_url = db_deployment.repo_url
        if pat_token:
            parsed_url = urlparse(db_deployment.repo_url)
            netloc_with_token = f"{quote(pat_token, safe='')}@{parsed_url.hostname}"
            effective_clone_url = urlunparse((parsed_url.scheme, netloc_with_token, parsed_url.path, "", "", ""))
        if app_dir.exists(): shutil.rmtree(app_dir)
        repo = Repo.clone_from(effective_clone_url, str(app_dir))
        crud.update_deployment_status(db, deployment_name=deployment_name, status="Building Docker image...")
        language = db_deployment.language
        dockerfile_path = find_first_file(app_dir, ["Dockerfile", "dockerfile"])
        if not dockerfile_path:
            raise HTTPException(status_code=404, detail="Dockerfile not found in repository.")
        image_name = f"user-app-{deployment_name.lower()}:latest"
        subprocess.run(["docker", "build", "-t", image_name, "."], cwd=str(app_dir), check=True, capture_output=True, text=True)
        crud.update_deployment_status(db, deployment_name=deployment_name, status="Analyzing Kubernetes manifests...")
        search_dirs = [app_dir, app_dir / "k8s", app_dir / "deploy", app_dir / "manifests"]
        found_manifest_paths = [p for d in search_dirs if d.is_dir() for p in d.glob("*.yaml")] + [p for d in search_dirs if d.is_dir() for p in d.glob("*.yml")]
        if not found_manifest_paths:
            raise HTTPException(status_code=404, detail="No Kubernetes YAML manifests found.")
        instrumentation_changes_needed = False
        for manifest_path in found_manifest_paths:
            original_content = manifest_path.read_text()
            modified_content, any_changes_made, instr_changes = modify_kubernetes_manifest(original_content, deployment_name, image_name, language)
            if any_changes_made:
                manifest_path.write_text(modified_content)
            if instr_changes:
                instrumentation_changes_needed = True
        if instrumentation_changes_needed and pat_token and db_deployment.push_enabled:
            crud.update_deployment_status(db, deployment_name=deployment_name, status="Pushing manifest changes to Git...")
            repo.git.add(all=True)
            repo.index.commit("feat: Add OpenTelemetry instrumentation by TraceAssist")
            repo.remotes.origin.push()
        elif not instrumentation_changes_needed:
            crud.update_deployment_status(db, deployment_name=deployment_name, status="Manifests already instrumented.")
        else:
            crud.update_deployment_status(db, deployment_name=deployment_name, status="Proceeding without pushing changes to Git.")
        crud.update_deployment_status(db, deployment_name=deployment_name, status="Deploying to Kubernetes...")
        for manifest_path in found_manifest_paths:
            output_path = Path(K8S_OUTPUT_DIR) / f"{deployment_name}-{manifest_path.name}"
            output_path.write_text(manifest_path.read_text())
            subprocess.run(["kubectl", "apply", "-n", "traceassist", "-f", str(output_path)], check=True, capture_output=True, text=True, timeout=60)
        
        crud.update_deployment_status(db, deployment_name=deployment_name, status="Generating Grafana dashboard...")
        panel_links = await generate_and_upload_grafana_dashboard(deployment_name)
        if panel_links:
            crud.update_deployment_grafana_links(db, deployment_name, json.dumps(panel_links))
            logger.info(f"Successfully created Grafana dashboard for {deployment_name}")
        else:
            logger.warning(f"Could not generate Grafana dashboard for {deployment_name}. Panel links will be null.")

        crud.update_deployment_status(db, deployment_name=deployment_name, status="Deployed")
        return {"message": "Deployment successful."}
    except Exception as e:
        crud.update_deployment_status(db, deployment_name=deployment_name, status="Failed")
        detail = e.stderr if hasattr(e, 'stderr') else str(e)
        raise HTTPException(status_code=500, detail=f"A step in the process failed: {detail[:1000]}...")
