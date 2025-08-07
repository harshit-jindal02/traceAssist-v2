import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yaml

# --- Basic Setup ---
app = FastAPI(
    title="TraceAssist Instrumentation Service",
    description="An API service to automatically instrument Kubernetes manifests for CI/CD workflows.",
    version="6.0.0"
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

class InstrumentResponse(BaseModel):
    modified_manifest_content: str
    changes_made: bool

# --- Core Instrumentation Logic (Refactored from original project) ---
def modify_kubernetes_manifest(yaml_content: str, app_id: str):
    """
    Parses a YAML string, injects TraceAssist annotations, and returns the modified YAML string.
    This version is simplified to only handle instrumentation, not image names or other deployment specifics.
    """
    try:
        docs = list(yaml.safe_load_all(yaml_content))
        modified_docs = []
        any_changes_made = False
        
        for doc in docs:
            if not isinstance(doc, dict):
                modified_docs.append(doc)
                continue

            kind = doc.get("kind")
            if kind == "Deployment":
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
        logger.error(f"Failed to modify Kubernetes manifest: {e}")
        # Re-raise as a generic exception to be caught by the endpoint handler
        raise e

# --- New CI/CD Workflow Endpoint ---
@app.post("/workflow/instrument", response_model=InstrumentResponse)
async def instrument_manifest_for_workflow(request: InstrumentRequest):
    """
    Accepts a Kubernetes manifest, injects observability annotations,
    and returns the modified manifest. Designed for CI/CD workflows.
    """
    logger.info(f"Received instrumentation request for deployment: {request.deployment_name}")
    try:
        modified_content, changes_made = modify_kubernetes_manifest(
            yaml_content=request.manifest_content,
            app_id=request.deployment_name
        )
        
        logger.info(f"Instrumentation complete for {request.deployment_name}. Changes made: {changes_made}")
        return InstrumentResponse(
            modified_manifest_content=modified_content,
            changes_made=changes_made
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process manifest: {str(e)}")

# Health check endpoint
@app.get("/health")
def health_check():
    return {"status": "ok"}