# ---- Stage 1: build the frontend ----
FROM node:22-slim AS frontend
WORKDIR /build
# package.json only (no lockfile): a lockfile made on Windows can miss Linux binaries
COPY Frontend/package.json ./
RUN npm install
COPY Frontend/ ./
RUN npm run build

# ---- Stage 2: backend, plus the built frontend ----
FROM python:3.12-slim
WORKDIR /app/Backend
COPY Backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY Backend/ ./
COPY --from=frontend /build/dist ./static
ENV PORT=8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]