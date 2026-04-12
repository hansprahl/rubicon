import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import settings
from api.routes.agents import router as agents_router
from api.routes.feedback import router as feedback_router
from api.routes.anatomy import router as anatomy_router
from api.routes.approvals import router as approvals_router
from api.routes.graph import router as graph_router
from api.routes.milestones import router as milestones_router
from api.routes.notifications import router as notifications_router
from api.routes.onboarding import router as onboarding_router
from api.routes.tool_repository import router as tools_router
from api.routes.agent_repository import router as agent_repo_router
from api.routes.north_star import router as north_star_router
from api.routes.workspaces import router as workspaces_router
from api.routes.intelligence import router as intelligence_router
from api.routes.admin import router as admin_router
from api.routes.dm import router as dm_router
from api.runtime.inter_agent import register_default_handlers
from api.runtime.task_queue import run_task_queue


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Register inter-agent event handlers on startup
    register_default_handlers()
    # Start background task queue worker
    task_queue_task = asyncio.create_task(run_task_queue())
    yield
    # Shutdown: cancel the task queue
    task_queue_task.cancel()
    try:
        await task_queue_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Rubicon API", version="0.8.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents_router, prefix="/api")
app.include_router(anatomy_router, prefix="/api")
app.include_router(approvals_router, prefix="/api")
app.include_router(graph_router, prefix="/api")
app.include_router(milestones_router, prefix="/api")
app.include_router(north_star_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")
app.include_router(onboarding_router, prefix="/api")
app.include_router(tools_router, prefix="/api")
app.include_router(agent_repo_router, prefix="/api")
app.include_router(workspaces_router, prefix="/api")
app.include_router(intelligence_router, prefix="/api")
app.include_router(feedback_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(dm_router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.8.0"}
