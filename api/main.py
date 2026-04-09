from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import settings
from api.routes.agents import router as agents_router
from api.routes.approvals import router as approvals_router
from api.routes.onboarding import router as onboarding_router

app = FastAPI(title="Rubicon API", version="0.4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents_router, prefix="/api")
app.include_router(approvals_router, prefix="/api")
app.include_router(onboarding_router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.4.0"}
