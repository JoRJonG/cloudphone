# Build React Frontend
FROM node:20-alpine AS build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Setup Python Backend
FROM python:3.10-slim
WORKDIR /app

# Install Docker CLI and dependencies for redroid-script
RUN apt-get update && apt-get install -y docker.io lzip curl && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy built frontend
COPY --from=build /app/frontend/dist ./frontend/dist/

# Run uvicorn
EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
