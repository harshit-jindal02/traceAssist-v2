import os
import logging
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yaml
from sqlalchemy.orm import Session

# Import the database components
from database import crud, models
from database.database import engine, get_db

# This line ensures the 'api_usage_logs' table is created if it doesn't exist
models.Base.metadata.create_all(bind=engine)

# --- Basic Setup ---
app = FastAPI(
    title="TraceAssist Instrumentation Service",
    description="An API service to automatically instrument Kubernetes manifests for CI/CD workflows.",
    version="6.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow public access for GitHub Actions
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper(), format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# --- Pydantic Models for the New Endpoint ---
class InstrumentRequest(BaseModel):
    manifest_content: str
    deployment_name: str
    client_repo: str # New field to identify the client

class InstrumentResponse(BaseModel):
    modified_manifest_content: str
    changes_made: bool

# --- Core Instrumentation Logic ---
def modify_kubernetes_manifest(yaml_content: str):
    """
    Parses a YAML string, injects TraceAssist annotations, and returns the modified YAML string.
    """
    try:
        docs = list(yaml.safe_load_all(yaml_content))
        modified_docs = []
        any_changes_made = False
        
        for doc in docs:
            if not isinstance(doc, dict):
                modified_docs.append(doc)
                continue

            if doc.get("kind") == "Deployment":
                template = doc.setdefault('spec', {}).setdefault('template', {})
                annotations = template.setdefault('metadata', {}).setdefault('annotations', {})
                pod_spec = template.setdefault('spec', {})

                # Change 1: Inject the OpenTelemetry injection annotation
                if annotations.get("instrumentation.opentelemetry.io/inject") != "true":
                    annotations["instrumentation.opentelemetry.io/inject"] = "true"
                    any_changes_made = True

                # Change 2: Ensure the Service Account Name is set
                if pod_spec.get('serviceAccountName') != 'traceassist-sa':
                    pod_spec['serviceAccountName'] = 'traceassist-sa'
                    any_changes_made = True

            modified_docs.append(doc)
            
        return yaml.dump_all(modified_docs, sort_keys=False), any_changes_made
        
    except Exception as e:
        # Re-raise as a generic exception to be caught by the endpoint handler
        raise e

# --- New CI/CD Workflow Endpoint ---
@app.post("/workflow/instrument", response_model=InstrumentResponse)
async def instrument_manifest_for_workflow(request: InstrumentRequest, db: Session = Depends(get_db)):
    """
    Accepts a Kubernetes manifest, injects observability annotations,
    and returns the modified manifest. Designed for CI/CD workflows.
    """
    logger.info(f"Received request from '{request.client_repo}' for deployment '{request.deployment_name}'")
    try:
        modified_content, changes_made = modify_kubernetes_manifest(
            yaml_content=request.manifest_content
        )
        
        # Log the successful API call to the database
        crud.create_api_log(
            db=db,
            client_repo=request.client_repo,
            deployment_name=request.deployment_name,
            changes_made=changes_made
        )
        
        logger.info(f"Successfully processed and logged request for '{request.client_repo}'")
        return InstrumentResponse(
            modified_manifest_content=modified_content,
            changes_made=changes_made
        )
    except Exception as e:
        logger.error(f"Failed to process manifest for '{request.client_repo}': {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process manifest: {str(e)}")

# Health check endpoint
@app.get("/health")
def health_check():
    return {"status": "ok"}
