# Business OS Algeria - API Platform

Production-grade, multi-tenant business management platform built for the Algerian market.

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL (via Docker)

### Setup

1. **Start infrastructure**
   ```bash
   docker-compose up -d
   ```

2. **Install dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run migrations**
   ```bash
   npm run migrate:latest
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

API will be available at `http://localhost:3000`

## 📁 Project Structure

```
business-os-algeria/
├── infrastructure/     # Database schemas, migrations, configs
├── backend/           # Node.js/TypeScript API
├── ml-engine/         # Python ML microservice (later)
├── docs/              # Documentation
└── scripts/           # Automation scripts
```

## 🧪 Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## 🔒 Security

- JWT authentication with refresh tokens
- Rate limiting (Redis-based)
- Input validation (Zod)
- Security headers (Helmet)
- Multi-tenant data isolation (RLS)

## 📚 Documentation

- API Docs: `/docs/api`
- Architecture: `/docs/architecture`
- Deployment: `/docs/deployment`

## 🏗️ Built With

- **Backend**: Node.js, TypeScript, Express
- **Database**: PostgreSQL, TimescaleDB
- **Cache**: Redis
- **Storage**: MinIO (S3-compatible)
- **Auth**: JWT, bcrypt
- **Validation**: Zod

## 📄 License

Proprietary - All Rights Reserved
