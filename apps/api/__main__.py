import uvicorn

uvicorn.run("apps.api.server:app", host="0.0.0.0", port=3000, reload=True)
