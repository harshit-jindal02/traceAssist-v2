import os
import shutil
import subprocess
import logging
import re
from urllib.parse import urlparse, urlunparse, quote
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
from typing import Optional, List

from git import Repo, GitCommandError
from dotenv import load_dotenv
import yaml
from sqlalchemy.orm import Session

# Import database components
from database import crud, models, database
from database.database import engine, get_db

# Create database tables if they don't exist
models.Base.metadata.create_all(bind=engine)

# OpenTelemetry imports
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

load_dotenv()

# --- OpenTelemetry and FastAPI setup ---
OTEL_ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
SERVICE_NAME = "traceassist-backend"

provider = None
if OTEL_ENDPOINT:
    logging.info(f"OpenTelemetry configured with endpoint: {OTEL_ENDPOINT}")
    resource = Resource.create({"service.name": SERVICE_NAME})
    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint=OTEL_ENDPOINT, insecure=True)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
else:
    logging.warning("OTEL_EXPORTER_OTLP_ENDPOINT not found. Tracing disabled.")

app = FastAPI()

if provider:
    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)

# CORS Middleware to allow frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper(),
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

BASE_DIR = "user-apps"
K8S_OUTPUT_DIR = "k8s-generated"
os.makedirs(BASE_DIR, exist_ok=True)
os.makedirs(K8S_OUTPUT_DIR, exist_ok=True)

# --- Pydantic Models ---
class GitCloneRequest(BaseModel):
    repo_url: str = Field(..., description="The HTTPS URL of the repository.")
    deployment_name: str = Field(..., description="Custom name for the deployment and resources.")
    pat_token: Optional[str] = Field(None, description="Optional GitHub Personal Access Token for private repos.")
    branch: Optional[str] = Field(default="main", description="The branch to clone.")

    @validator("deployment_name")
    @classmethod
    def validate_deployment_name(cls, v: str) -> str:
        if not v: raise ValueError("Deployment name cannot be empty.")
        if len(v) > 63: raise ValueError("Deployment name must be 63 characters or less.")
        if not re.match(r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", v):
            raise ValueError("Invalid name. Must contain only lowercase alphanumeric characters or '-', and start and end with an alphanumeric character.")
        return v

class InstrumentRequest(BaseModel):
    app_id: str

# --- Helper Functions ---
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

def find_first_file(directory: Path, patterns: List[str]) -> Optional[Path]:
    for pattern in patterns:
        try: return next(directory.glob(pattern))
        except StopIteration: continue
    return None

def modify_kubernetes_manifest(yaml_content: str, app_id: str, image_name: str, language: str) -> str:
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
                logger.info(f"Modifying Deployment '{doc.get('metadata', {}).get('name', 'N/A')}' for app '{app_id}'")
                
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

                # --- NEW: Inject the Service Account Name ---
                pod_spec = template.setdefault('spec', {})
                pod_spec['serviceAccountName'] = 'traceassist-sa'
                logger.info(f"Injected serviceAccountName 'traceassist-sa' into Deployment.")

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

@app.get("/history")
def read_history(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    deployments = crud.get_deployments(db, skip=skip, limit=limit)
    return deployments

@app.post("/clone")
async def clone_repo(req: GitCloneRequest, db: Session = Depends(get_db)):
    app_id = req.deployment_name
    db_deployment = crud.get_deployment_by_name(db, deployment_name=app_id)
    if db_deployment:
        raise HTTPException(status_code=409, detail=f"A deployment with the name '{app_id}' already exists.")
    app_dir = os.path.join(BASE_DIR, app_id)
    pat_token = req.pat_token or os.getenv("PAT_TOKEN")
    effective_clone_url = req.repo_url
    if pat_token:
        try:
            parsed_url = urlparse(req.repo_url)
            if "github.com" in parsed_url.hostname.lower():
                encoded_token = quote(pat_token, safe='')
                netloc_with_token = f"{encoded_token}@{parsed_url.hostname}"
                effective_clone_url = urlunparse((parsed_url.scheme, netloc_with_token, parsed_url.path, "", "", ""))
        except Exception: pass
    try:
        Repo.clone_from(effective_clone_url, app_dir, branch=req.branch)
    except GitCommandError as e:
        if os.path.exists(app_dir): shutil.rmtree(app_dir)
        raise HTTPException(status_code=400, detail=f"Failed to clone repository. Error: {e.stderr}")
    
    crud.create_deployment(
        db=db,
        deployment_name=app_id,
        repo_url=req.repo_url,
        pat_token_provided=bool(req.pat_token)
    )
    return {"app_id": app_id, "message": "Repository cloned and record created successfully."}

@app.post("/instrument")
async def instrument_app(req: InstrumentRequest, db: Session = Depends(get_db)):
    app_id = req.app_id
    app_dir = Path(BASE_DIR) / app_id
    if not app_dir.is_dir():
        raise HTTPException(status_code=404, detail="App not found.")
    
    try:
        lang = detect_language(str(app_dir))
        dockerfile_path = find_first_file(app_dir, ["Dockerfile", "dockerfile"])
        if not dockerfile_path:
            raise HTTPException(status_code=404, detail="Dockerfile not found.")
        
        image_name = f"user-app-{app_id.lower()}:latest"
        subprocess.run(["docker", "build", "-t", image_name, "."], cwd=str(app_dir), check=True, capture_output=True, text=True)
        
        search_dirs = [app_dir, app_dir / "k8s", app_dir / "deploy", app_dir / "manifests"]
        found_manifest_paths = [p for d in search_dirs if d.is_dir() for p in d.glob("*.yaml")] + [p for d in search_dirs if d.is_dir() for p in d.glob("*.yml")]
        if not found_manifest_paths:
            raise HTTPException(status_code=404, detail="No Kubernetes YAML manifests found.")
        
        manifests_applied = []
        for manifest_path in found_manifest_paths:
            original_content = manifest_path.read_text()
            modified_content = modify_kubernetes_manifest(original_content, app_id, image_name, lang)
            output_path = Path(K8S_OUTPUT_DIR) / f"{app_id}-{manifest_path.name}"
            output_path.write_text(modified_content)
            subprocess.run(["kubectl", "apply", "-n", "traceassist", "-f", str(output_path)], check=True, capture_output=True, text=True, timeout=60)
            manifests_applied.append(manifest_path.name)
        
        if not manifests_applied:
            raise HTTPException(status_code=400, detail="Found YAML files, but none contained a resource to process.")
        
        crud.update_deployment_status(db, deployment_name=app_id, status="Instrumented")
        return {"message": "Application instrumented.", "app_id": app_id, "image_built": image_name, "manifests_applied": manifests_applied}

    except subprocess.CalledProcessError as e:
        crud.update_deployment_status(db, deployment_name=app_id, status="Failed")
        raise HTTPException(status_code=500, detail=f"A step in the process failed: {e.stderr[:1000]}...")
    except Exception as e:
        crud.update_deployment_status(db, deployment_name=app_id, status="Failed")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/run")
async def run_app_status(req: InstrumentRequest):
    return {"message": f"Application {req.app_id} is deploying."}
