# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /workspace

COPY frontend/package.json frontend/package-lock.json ./frontend/
WORKDIR /workspace/frontend
RUN npm ci --no-audit --no-fund

WORKDIR /workspace
COPY frontend ./frontend
COPY styles.css openapi.json openapi.yaml oas.css oas.html oas.js sandbox.html ./
COPY vendor ./vendor
RUN npm --prefix ./frontend run build

FROM maven:3.9.9-eclipse-temurin-21 AS backend-builder
WORKDIR /workspace

COPY backend ./backend
COPY --from=frontend-builder /workspace/frontend/dist/browser ./frontend/dist/browser

WORKDIR /workspace/backend
RUN --mount=type=cache,target=/root/.m2 mvn -B -DskipTests package

FROM eclipse-temurin:21-jre-jammy AS runtime
WORKDIR /app

ENV QUARKUS_HTTP_HOST=0.0.0.0
ENV QUARKUS_HTTP_PORT=8080

EXPOSE 8080

COPY --from=backend-builder /workspace/backend/target/quarkus-app ./quarkus-app

ENTRYPOINT ["java", "-jar", "/app/quarkus-app/quarkus-run.jar"]
