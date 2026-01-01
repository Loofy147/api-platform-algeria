# API Platform - Business OS for Algeria

A high-performance, scalable, and modular API infrastructure designed for the Algerian market. This platform provides a unified core for multiple business services including Invoicing, CRM, Inventory, and more.

## 🚀 Features

- **High Performance**: Built with FastAPI and asynchronous database drivers.
- **Scalable Architecture**: Multi-tenant design with data isolation.
- **Powerful DB Schema**: Optimized PostgreSQL schema for business operations.
- **Modular Design**: 12+ modules that can be enabled/disabled per tenant.
- **Localized**: Support for Arabic, French, and English; Algerian VAT and compliance.
- **Secure**: JWT-based authentication, RBAC, and API key management.
- **Developer Friendly**: Comprehensive OpenAPI documentation and SDK-ready.

## 🏗️ Architecture

The platform follows a layered architecture:
1. **API Gateway**: Entry point for all requests with rate limiting and security.
2. **Core Services**: Shared services for Identity, Billing, Notifications, and Storage.
3. **Functional Modules**: Business logic for Invoicing, CRM, Inventory, etc.
4. **Data Layer**: Multi-tenant PostgreSQL with Redis caching.

## 🛠️ Tech Stack

- **Backend**: Python 3.11, FastAPI
- **Database**: PostgreSQL 15, SQLAlchemy 2.0 (Async)
- **Cache**: Redis 7
- **Containerization**: Docker, Docker Compose
- **Security**: JWT, Bcrypt, OAuth2

## 🚦 Getting Started

### Prerequisites
- Docker and Docker Compose
- Python 3.11+ (for local development)

### Local Development
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd api-platform
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   ```

3. Start the infrastructure using Docker Compose:
   ```bash
   docker-compose up -d
   ```

4. Access the API documentation:
   - Swagger UI: `http://localhost:8000/docs`
   - ReDoc: `http://localhost:8000/redoc`

## 📂 Project Structure

```
api-platform/
├── api/                # API route handlers
│   └── routes/         # Endpoint definitions
├── core/               # Core infrastructure (DB, Cache, Security)
├── models/             # Database models (SQLAlchemy)
├── schemas/            # Pydantic schemas for validation
├── services/           # Business logic layer
├── tests/              # Unit and integration tests
├── config.py           # Configuration management
├── main.py             # Application entry point
└── requirements.txt    # Python dependencies
```

## 📄 License
Proprietary - All Rights Reserved.
