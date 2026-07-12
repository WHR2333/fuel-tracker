# Multi-stage Dockerfile — builds both frontend and backend into a single image.
# The Vite config writes to ../static_dist (project root), so in the build
# container that becomes /static_dist (one level above /build).

# --- stage 1: frontend build ---
FROM node:22-slim AS frontend-build
WORKDIR /build
COPY static/package.json static/package-lock.json ./
RUN npm ci
COPY static/ ./
RUN npm run build
# Vite outDir: "../static_dist" → /static_dist in this container

# --- stage 2: production image ---
FROM python:3.12-slim
WORKDIR /app

# Python deps via uv.
COPY pyproject.toml uv.lock ./
RUN pip install --no-cache-dir uv && \
    uv pip install --system --no-cache -r pyproject.toml

# Backend source.
COPY app/ ./app/

# Built frontend assets.
COPY --from=frontend-build /static_dist/ ./static_dist/

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]