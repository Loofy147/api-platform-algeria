# Deployment Guide: API Platform - Business OS for Algeria

This guide provides instructions for deploying the API Platform to a production environment, focusing on scalability, security, and cost-effectiveness.

## 1. Prerequisites

Before deployment, ensure you have the following:

- **Cloud Provider Account**: AWS, Azure, GCP, or a dedicated server environment.
- **Domain Name**: Configured with DNS records pointing to your load balancer/server.
- **Container Registry**: Docker Hub, AWS ECR, or similar for storing the built Docker image.
- **Secrets Manager**: AWS Secrets Manager, HashiCorp Vault, or environment variables for sensitive data.

## 2. Deployment Architecture (Recommended)

The recommended production architecture utilizes a microservices approach with container orchestration.

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **API Gateway** | Nginx / AWS API Gateway | Load balancing, SSL termination, WAF, rate limiting. |
| **Application** | Docker / Kubernetes (EKS/GKE/AKS) | Container orchestration for scaling the FastAPI application. |
| **Database** | AWS RDS (PostgreSQL) / Neon / Supabase | Managed, highly available, and scalable multi-tenant database. |
| **Cache** | AWS ElastiCache (Redis) / Redis Cloud | High-speed caching for tokens, sessions, and frequently accessed data. |
| **Storage** | AWS S3 / MinIO | Encrypted, durable storage for documents and backups. |

## 3. Building the Docker Image

The project includes a `Dockerfile` for a multi-stage build, resulting in a small, secure production image.

1. **Build the image:**
   ```bash
   docker build -t api-platform:latest .
   ```

2. **Tag and push to your registry:**
   ```bash
   docker tag api-platform:latest your-registry/api-platform:v1.0.0
   docker push your-registry/api-platform:v1.0.0
   ```

## 4. Environment Configuration

All sensitive and environment-specific settings must be passed to the container at runtime.

| Variable | Description | Example Value |
| :--- | :--- | :--- |
| `ENVIRONMENT` | Set to `production` | `production` |
| `DEBUG` | Should be `False` in production | `False` |
| `SECRET_KEY` | **CRITICAL**: A long, random, and secret string. | `os.urandom(32).hex()` |
| `DATABASE_URL` | Connection string for the PostgreSQL database. | `postgresql://user:pass@host:port/db` |
| `REDIS_URL` | Connection string for the Redis instance. | `redis://host:port/0` |
| `CORS_ORIGINS` | List of allowed front-end domains. | `["https://app.yourdomain.com"]` |

## 5. Database Setup

### 5.1. Multi-Tenancy Strategy

The platform uses a **Shared Database, Separate Schema** approach for multi-tenancy.

- **Global Schema**: Contains `users`, `tenants`, `modules`, and `tenant_modules` tables (defined in `models/core.py`).
- **Tenant Schemas**: Each tenant's business data (invoices, products, customers) should reside in a separate schema within the same database, named after the tenant's ID or slug.

### 5.2. Migrations (Alembic)

The project uses **Alembic** for database migrations.

1. **Install Alembic (if not using Docker):**
   ```bash
   pip install alembic
   ```

2. **Initialize Alembic (one-time):**
   ```bash
   alembic init -t async migrations
   ```
   *(Note: This step is typically done during development)*

3. **Configure `alembic.ini` and `env.py`** with the production `DATABASE_URL`.

4. **Generate a new migration:**
   ```bash
   alembic revision --autogenerate -m "Initial core and business models"
   ```

5. **Apply migrations to the production database:**
   ```bash
   alembic upgrade head
   ```

## 6. Running the Application

The `Dockerfile` uses `gunicorn` with `uvicorn` workers for production-grade performance and stability.

```bash
# Example command run by the Docker container
gunicorn --bind 0.0.0.0:8000 \
         --workers 4 \
         --worker-class uvicorn.workers.UvicornWorker \
         --timeout 120 \
         main:app
```

**Note on Scaling**: Monitor CPU usage and latency. Scale the number of Gunicorn workers (`--workers`) or the number of container replicas based on your traffic load. FastAPI's asynchronous nature allows for high concurrency with fewer workers compared to traditional frameworks.
