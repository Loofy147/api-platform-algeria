# API Documentation: Business OS for Algeria

This document serves as a guide for external developers and internal teams on how to integrate with the core API platform.

## 1. Authentication and Authorization

The API uses **JSON Web Tokens (JWT)** for authentication and **API Keys** for external service access.

### 1.1. User Authentication (JWT)

1. **Login**: Send a `POST` request to `/api/v1/auth/login` with user credentials (`email`, `password`).
2. **Receive Tokens**: The response will contain an `access_token` (short-lived) and a `refresh_token` (long-lived).
3. **Access API**: Include the `access_token` in the `Authorization` header for all subsequent requests:
   ```
   Authorization: Bearer <access_token>
   ```
4. **Token Refresh**: When the access token expires, use the `refresh_token` in a `POST` request to `/api/v1/auth/refresh` to obtain a new access token.

### 1.2. External API Key Access

For machine-to-machine communication (e.g., a partner system integrating with your Invoicing module), use a dedicated API Key.

- **Header**: Include the API Key in the `X-API-Key` header.
  ```
  X-API-Key: <your_long_secret_api_key>
  ```

## 2. Multi-Tenancy and Isolation

The platform is multi-tenant. All requests that interact with business data (Invoices, Customers, Products) **must** include the tenant context.

- **Tenant ID**: The unique identifier for the business/organization.
- **Context Header**: Include the tenant ID in the `X-Tenant-ID` header.
  ```
  X-Tenant-ID: 550e8400-e29b-41d4-a716-446655440000
  ```
- **Note**: User authentication (JWT) is handled globally, but data access is strictly isolated by the `X-Tenant-ID`.

## 3. Core API Endpoints (v1)

### 3.1. Health and Status

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/health/live` | `GET` | Liveness check (Is the process running?) |
| `/api/v1/health/ready` | `GET` | Readiness check (Is the process ready to serve traffic? Checks DB/Cache) |
| `/api/v1/health/detailed` | `GET` | Detailed status of all core services. |

### 3.2. Tenant Management

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/tenants` | `POST` | Create a new tenant (organization). |
| `/api/v1/tenants/{tenant_id}` | `GET` | Retrieve tenant details. |
| `/api/v1/tenants/{tenant_id}/modules` | `GET` | List active modules for the tenant. |
| `/api/v1/tenants/{tenant_id}/modules/{module_id}` | `POST` | Activate a specific module (e.g., `invoicing`). |

## 4. Functional Module APIs (Examples)

Functional modules are exposed under their own prefixes.

### 4.1. Invoicing Module (`/api/v1/invoicing`)

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/invoicing/invoices` | `POST` | Create a new invoice for the current tenant. |
| `/api/v1/invoicing/invoices/{invoice_id}` | `GET` | Retrieve a specific invoice. |
| `/api/v1/invoicing/invoices/{invoice_id}/pdf` | `GET` | Generate and download the invoice PDF (localized). |

### 4.2. CRM Module (`/api/v1/crm`)

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/crm/customers` | `POST` | Create a new customer record. |
| `/api/v1/crm/customers` | `GET` | List customers with pagination. |
| `/api/v1/crm/customers/{customer_id}` | `PUT` | Update customer details (including NIF/RC). |

## 5. Localization and Compliance

- **Language**: Use the `Accept-Language` header (`ar`, `fr`, `en`) to request localized responses (e.g., error messages, date formats).
- **Financials**: All financial endpoints automatically handle **Algerian VAT (19%)** and use the **DZD** currency by default. Business models include fields for **NIF, RC, and AI** to ensure compliance with Algerian regulations.
