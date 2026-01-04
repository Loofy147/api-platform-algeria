# REST API Design & Feature Implementation Guide
## Stage 1 - Production-Ready Endpoints

---

## 🎯 API DESIGN PRINCIPLES

1. **RESTful** - Standard HTTP methods (GET, POST, PUT, DELETE)
2. **Versioned** - `/api/v1/...` for future compatibility
3. **Authenticated** - JWT tokens for auth
4. **Paginated** - All list endpoints support pagination
5. **Filtered** - Query parameters for filtering
6. **Error Handling** - Consistent error response format
7. **Rate Limited** - Prevent abuse
8. **Documented** - OpenAPI/Swagger spec

---

## 🔐 AUTHENTICATION

### POST `/api/v1/auth/login`
**Purpose:** User authentication

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "organizationId": "uuid" // Optional - select organization
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "fullName": "Ahmed Benali",
      "role": "owner"
    },
    "organization": {
      "id": "uuid",
      "name": "Épicerie Benali",
      "businessType": "retail_general"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "...",
    "expiresAt": "2025-01-01T12:00:00Z"
  }
}
```

### POST `/api/v1/auth/login/pin`
**Purpose:** Quick POS login with PIN code

**Request:**
```json
{
  "pinCode": "1234",
  "organizationId": "uuid"
}
```

---

## 🏪 ORGANIZATION & LOCATIONS

### GET `/api/v1/organizations/current`
**Purpose:** Get current organization details

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Épicerie Benali",
    "businessType": "retail_general",
    "currency": "DZD",
    "settings": {
      "taxRate": 19.00,
      "lowStockThreshold": 10,
      "language": "ar"
    },
    "subscriptionStatus": "active",
    "locations": [
      {
        "id": "uuid",
        "name": "Main Store",
        "city": "Blida",
        "isActive": true
      }
    ]
  }
}
```

### GET `/api/v1/locations`
**Purpose:** List all locations

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20)
- `isActive` (true/false)

---

## 📦 PRODUCTS & INVENTORY

### GET `/api/v1/products`
**Purpose:** List products with search

**Query Parameters:**
- `search` - Full-text search (name, SKU, barcode)
- `categoryId` - Filter by category
- `isActive` - Active products only
- `trackInventory` - Products with inventory tracking
- `page`, `limit`

**Response:**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "uuid",
        "name": "Coca Cola 1.5L",
        "sku": "COCA-1.5",
        "barcode": "6111012345678",
        "sellPrice": 150.00,
        "costPrice": 120.00,
        "taxRate": 19.00,
        "category": {
          "id": "uuid",
          "name": "Boissons"
        },
        "stock": {
          "quantityAvailable": 45,
          "reorderLevel": 10
        },
        "imageUrl": "https://..."
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 156,
      "totalPages": 8
    }
  }
}
```

### POST `/api/v1/products`
**Purpose:** Create new product

**Request:**
```json
{
  "name": "Pain Blanc",
  "nameAr": "خبز أبيض",
  "nameFr": "Pain Blanc",
  "categoryId": "uuid",
  "sku": "PAIN-001",
  "barcode": "2100000000001",
  "sellPrice": 35.00,
  "costPrice": 25.00,
  "taxRate": 19.00,
  "taxIncluded": true,
  "trackInventory": true,
  "reorderLevel": 50,
  "reorderQuantity": 200,
  "unitOfMeasure": "unit"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Pain Blanc",
    "createdAt": "2025-01-01T10:00:00Z"
  }
}
```

### GET `/api/v1/products/:id`
**Purpose:** Get single product with full details

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Coca Cola 1.5L",
    "sku": "COCA-1.5",
    "barcode": "6111012345678",
    "sellPrice": 150.00,
    "costPrice": 120.00,
    "markupPercentage": 25.00,
    "taxRate": 19.00,
    "category": {
      "id": "uuid",
      "name": "Boissons"
    },
    "stockByLocation": [
      {
        "locationId": "uuid",
        "locationName": "Main Store",
        "quantityOnHand": 45,
        "quantityReserved": 0,
        "quantityAvailable": 45
      }
    ],
    "salesStats": {
      "last30Days": {
        "quantitySold": 120,
        "revenue": 18000.00,
        "timesOrdered": 65
      }
    }
  }
}
```

### PUT `/api/v1/products/:id`
**Purpose:** Update product

### DELETE `/api/v1/products/:id`
**Purpose:** Soft delete product (sets deleted_at)

### GET `/api/v1/inventory/stock-levels`
**Purpose:** Get stock levels across locations

**Query Parameters:**
- `locationId` - Filter by location
- `lowStock` - Only show low stock items (true/false)
- `productId` - Specific product

**Response:**
```json
{
  "success": true,
  "data": {
    "stockLevels": [
      {
        "product": {
          "id": "uuid",
          "name": "Pain Blanc",
          "sku": "PAIN-001"
        },
        "location": {
          "id": "uuid",
          "name": "Main Store"
        },
        "quantityOnHand": 8,
        "quantityReserved": 0,
        "quantityAvailable": 8,
        "reorderLevel": 50,
        "needsReorder": true
      }
    ]
  }
}
```

### POST `/api/v1/inventory/adjust`
**Purpose:** Manual stock adjustment

**Request:**
```json
{
  "locationId": "uuid",
  "productId": "uuid",
  "quantity": -5,
  "movementType": "damage",
  "reason": "Expired products removed"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "movementId": "uuid",
    "newQuantity": 40
  }
}
```

### POST `/api/v1/inventory/transfer`
**Purpose:** Transfer stock between locations

**Request:**
```json
{
  "fromLocationId": "uuid",
  "toLocationId": "uuid",
  "productId": "uuid",
  "quantity": 20,
  "notes": "Weekly stock rebalancing"
}
```

### GET `/api/v1/inventory/reorder-list`
**Purpose:** Get products needing reorder

**Response:**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "productId": "uuid",
        "productName": "Pain Blanc",
        "sku": "PAIN-001",
        "currentStock": 8,
        "reorderLevel": 50,
        "suggestedQuantity": 200,
        "location": "Main Store"
      }
    ],
    "totalItems": 5
  }
}
```

---

## 💰 SALES (POS Core)

### POST `/api/v1/sales`
**Purpose:** Create a sale (checkout)

**Request:**
```json
{
  "locationId": "uuid",
  "items": [
    {
      "productId": "uuid",
      "variantId": null,
      "quantity": 2,
      "unitPrice": 150.00,
      "discountAmount": 0
    },
    {
      "productId": "uuid2",
      "quantity": 1,
      "unitPrice": 500.00,
      "discountAmount": 50.00
    }
  ],
  "paymentMethod": "cash",
  "amountPaid": 800.00,
  "customerName": "Mohamed",
  "customerPhone": "+213551234567",
  "shiftId": "uuid",
  "notes": ""
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sale": {
      "id": "uuid",
      "saleNumber": "SAL-20250101-0042",
      "subtotal": 750.00,
      "taxAmount": 110.34,
      "discountAmount": 50.00,
      "total": 700.00,
      "amountPaid": 800.00,
      "amountChange": 100.00,
      "paymentMethod": "cash",
      "completedAt": "2025-01-01T14:30:00Z"
    },
    "receiptUrl": "https://api.../receipts/uuid.pdf"
  }
}
```

### GET `/api/v1/sales`
**Purpose:** List sales with filters

**Query Parameters:**
- `locationId`
- `startDate` (ISO 8601)
- `endDate`
- `paymentMethod`
- `status`
- `completedBy` (user ID)
- `page`, `limit`

**Response:**
```json
{
  "success": true,
  "data": {
    "sales": [
      {
        "id": "uuid",
        "saleNumber": "SAL-20250101-0042",
        "total": 700.00,
        "paymentMethod": "cash",
        "completedAt": "2025-01-01T14:30:00Z",
        "completedBy": {
          "id": "uuid",
          "name": "Ahmed"
        },
        "itemCount": 3
      }
    ],
    "summary": {
      "totalSales": 45600.00,
      "totalTransactions": 87,
      "averageTransaction": 524.14
    },
    "pagination": { ... }
  }
}
```

### GET `/api/v1/sales/:id`
**Purpose:** Get sale details with items

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "saleNumber": "SAL-20250101-0042",
    "locationId": "uuid",
    "subtotal": 750.00,
    "taxAmount": 110.34,
    "discountAmount": 50.00,
    "total": 700.00,
    "paymentMethod": "cash",
    "completedAt": "2025-01-01T14:30:00Z",
    "completedBy": {
      "id": "uuid",
      "name": "Ahmed",
      "role": "staff"
    },
    "items": [
      {
        "productId": "uuid",
        "productName": "Coca Cola 1.5L",
        "quantity": 2,
        "unitPrice": 150.00,
        "lineTotal": 300.00,
        "profit": 60.00
      }
    ]
  }
}
```

### POST `/api/v1/sales/:id/void`
**Purpose:** Void a sale (requires permission)

**Request:**
```json
{
  "reason": "Customer request - wrong items"
}
```

### POST `/api/v1/sales/:id/refund`
**Purpose:** Full or partial refund

**Request:**
```json
{
  "amount": 700.00,
  "reason": "Defective product",
  "refundMethod": "cash"
}
```

---

## 👥 STAFF & SHIFTS

### GET `/api/v1/staff`
**Purpose:** List organization members

**Response:**
```json
{
  "success": true,
  "data": {
    "staff": [
      {
        "id": "uuid",
        "fullName": "Ahmed Benali",
        "email": "ahmed@example.com",
        "phone": "+213551234567",
        "role": "manager",
        "assignedLocation": {
          "id": "uuid",
          "name": "Main Store"
        },
        "isActive": true,
        "lastLogin": "2025-01-01T08:00:00Z"
      }
    ]
  }
}
```

### POST `/api/v1/staff/invite`
**Purpose:** Invite new staff member

**Request:**
```json
{
  "email": "newstaff@example.com",
  "fullName": "Fatima Zahra",
  "phone": "+213551234568",
  "role": "staff",
  "assignedLocationId": "uuid",
  "permissions": {
    "pos.access": true,
    "pos.discount": false,
    "inventory.view": true
  }
}
```

### POST `/api/v1/shifts/open`
**Purpose:** Start a work shift

**Request:**
```json
{
  "locationId": "uuid",
  "openingCash": 5000.00
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "shiftId": "uuid",
    "startedAt": "2025-01-01T08:00:00Z",
    "openingCash": 5000.00,
    "status": "open"
  }
}
```

### POST `/api/v1/shifts/:id/close`
**Purpose:** End shift with cash reconciliation

**Request:**
```json
{
  "closingCash": 18500.00,
  "notes": "Successful shift, no issues"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "shiftId": "uuid",
    "startedAt": "2025-01-01T08:00:00Z",
    "endedAt": "2025-01-01T16:00:00Z",
    "openingCash": 5000.00,
    "closingCash": 18500.00,
    "expectedCash": 18200.00,
    "cashDifference": 300.00,
    "totalSales": 45600.00,
    "totalTransactions": 87,
    "cashSales": 13200.00,
    "cardSales": 32400.00,
    "averageTransactionValue": 524.14,
    "hoursWorked": 8.0
  }
}
```

### GET `/api/v1/shifts/current`
**Purpose:** Get user's current open shift

### GET `/api/v1/shifts`
**Purpose:** List all shifts (with filters)

**Query Parameters:**
- `userId`
- `locationId`
- `startDate`, `endDate`
- `status`

---

## 📊 ANALYTICS & REPORTS

### GET `/api/v1/analytics/dashboard`
**Purpose:** Main dashboard overview

**Query Parameters:**
- `locationId` (optional)
- `date` (default: today)

**Response:**
```json
{
  "success": true,
  "data": {
    "today": {
      "sales": 45600.00,
      "transactions": 87,
      "averageTransaction": 524.14,
      "profit": 12400.00,
      "profitMargin": 27.19
    },
    "thisMonth": {
      "sales": 456000.00,
      "transactions": 1240,
      "growth": 15.5
    },
    "lowStockCount": 5,
    "activeShifts": 2,
    "topProducts": [
      {
        "name": "Coca Cola 1.5L",
        "quantitySold": 45,
        "revenue": 6750.00
      }
    ],
    "salesByHour": [
      { "hour": 8, "sales": 2400.00 },
      { "hour": 9, "sales": 4800.00 }
    ]
  }
}
```

### GET `/api/v1/analytics/sales-summary`
**Purpose:** Detailed sales analytics

**Query Parameters:**
- `startDate`, `endDate` (required)
- `locationId`
- `groupBy` (hour/day/week/month)

**Response:**
```json
{
  "success": true,
  "data": {
    "period": {
      "startDate": "2025-01-01",
      "endDate": "2025-01-31"
    },
    "totals": {
      "sales": 456000.00,
      "transactions": 1240,
      "itemsSold": 3450,
      "customers": 890,
      "averageTransaction": 367.74,
      "cost": 310000.00,
      "profit": 146000.00,
      "profitMargin": 32.02
    },
    "byPaymentMethod": {
      "cash": 156000.00,
      "card": 280000.00,
      "other": 20000.00
    },
    "byDay": [
      {
        "date": "2025-01-01",
        "sales": 15200.00,
        "transactions": 42,
        "profit": 4100.00
      }
    ]
  }
}
```

### GET `/api/v1/analytics/top-products`
**Purpose:** Best selling products

**Query Parameters:**
- `startDate`, `endDate`
- `locationId`
- `limit` (default: 10)
- `orderBy` (revenue/quantity/profit)

### GET `/api/v1/analytics/staff-performance`
**Purpose:** Staff performance metrics

**Response:**
```json
{
  "success": true,
  "data": {
    "period": { "startDate": "...", "endDate": "..." },
    "staff": [
      {
        "userId": "uuid",
        "name": "Ahmed",
        "totalSales": 125000.00,
        "transactions": 340,
        "averageTransaction": 367.65,
        "hoursWorked": 160.0,
        "salesPerHour": 781.25,
        "voidCount": 2,
        "refundCount": 1
      }
    ]
  }
}
```

### GET `/api/v1/analytics/inventory-report`
**Purpose:** Inventory valuation and movement

**Response:**
```json
{
  "success": true,
  "data": {
    "totalValue": 450000.00,
    "productCount": 234,
    "lowStockItems": 5,
    "outOfStockItems": 2,
    "topMovers": [
      {
        "productName": "Coca Cola 1.5L",
        "quantitySold": 450,
        "revenue": 67500.00,
        "currentStock": 45
      }
    ],
    "slowMovers": [...]
  }
}
```

### POST `/api/v1/reports/export`
**Purpose:** Export report (CSV/PDF)

**Request:**
```json
{
  "reportType": "sales_summary",
  "format": "csv",
  "startDate": "2025-01-01",
  "endDate": "2025-01-31",
  "filters": {
    "locationId": "uuid"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "exportId": "uuid",
    "downloadUrl": "https://api.../exports/uuid.csv",
    "expiresAt": "2025-01-02T10:00:00Z"
  }
}
```

---

## 🔔 NOTIFICATIONS & ALERTS

### GET `/api/v1/notifications`
**Purpose:** Get user notifications

**Response:**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "uuid",
        "type": "low_stock",
        "title": "Low Stock Alert",
        "message": "Pain Blanc is below reorder level (8 remaining)",
        "priority": "high",
        "isRead": false,
        "createdAt": "2025-01-01T10:00:00Z"
      }
    ],
    "unreadCount": 3
  }
}
```

### POST `/api/v1/notifications/:id/read`
**Purpose:** Mark notification as read

---

## 🎨 CATEGORIES

### GET `/api/v1/categories`
**Purpose:** List product categories

**Response:**
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": "uuid",
        "name": "Boissons",
        "nameAr": "مشروبات",
        "color": "#3B82F6",
        "icon": "drink",
        "productCount": 45,
        "children": []
      }
    ]
  }
}
```

### POST `/api/v1/categories`
**Purpose:** Create category

---

## 🛠️ SETTINGS

### GET `/api/v1/settings`
**Purpose:** Get organization settings

### PUT `/api/v1/settings`
**Purpose:** Update settings

**Request:**
```json
{
  "taxRate": 19.00,
  "lowStockThreshold": 15,
  "language": "ar",
  "receiptFooter": "شكراً لزيارتكم",
  "autoReorder": true
}
```

---

## ❌ ERROR RESPONSE FORMAT

All errors follow this structure:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Product 'Pain Blanc' has insufficient stock. Available: 5, Requested: 10",
    "details": {
      "productId": "uuid",
      "available": 5,
      "requested": 10
    }
  }
}
```

### Common Error Codes:
- `UNAUTHORIZED` - Invalid or expired token
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid input data
- `INSUFFICIENT_STOCK` - Not enough inventory
- `SHIFT_ALREADY_OPEN` - User has open shift
- `PAYMENT_INSUFFICIENT` - Payment amount less than total
- `DUPLICATE_ENTRY` - SKU/barcode already exists
- `BUSINESS_RULE_VIOLATION` - Custom business rule failed

---

## 🚀 IMPLEMENTATION PRIORITIES

### Week 1-2: Core Authentication & Setup
- [ ] Auth endpoints (login, token refresh)
- [ ] Organization/location CRUD
- [ ] User management
- [ ] Permission system

### Week 3-4: Product Catalog
- [ ] Product CRUD with search
- [ ] Categories
- [ ] Barcode scanning support
- [ ] Image upload

### Week 5-6: POS & Sales
- [ ] Sale creation endpoint
- [ ] Sale listing with filters
- [ ] Receipt generation (PDF)
- [ ] Void/refund logic

### Week 7-8: Inventory
- [ ] Stock levels tracking
- [ ] Stock adjustments
- [ ] Transfer between locations
- [ ] Reorder list

### Week 9-10: Staff & Analytics
- [ ] Shift management
- [ ] Staff performance tracking
- [ ] Dashboard analytics
- [ ] Report exports

---

## 🎯 FEATURE-SPECIFIC LOGIC

### 1. BARCODE SCANNING (Client-Side Integration)

```typescript
// Mobile/Web barcode scanner integration
class BarcodeScanner {
  async scan(): Promise<string> {
    // Use device camera or USB scanner
    // Returns barcode string
  }
  
  async lookupProduct(barcode: string): Promise<Product> {
    const response = await fetch(`/api/v1/products?barcode=${barcode}`);
    const data = await response.json();
    return data.data.products[0];
  }
}
```

### 2. OFFLINE CART (Local Storage)

```typescript
// POS cart stored locally, synced on sale completion
interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  discount: number;
}

class POSCart {
  private items: CartItem[] = [];
  
  addItem(product: Product, quantity: number) {
    const existing = this.items.find(i => i.product.id === product.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.items.push({
        product,
        quantity,
        unitPrice: product.sellPrice,
        discount: 0
      });
    }
    this.saveToLocalStorage();
  }
  
  calculateTotals() {
    // Use SaleProcessor.calculateSaleTotals() logic
  }
  
  async checkout(paymentMethod: string, amountPaid: number) {
    const saleData = {
      items: this.items.map(i => ({
        productId: i.product.id,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountAmount: i.discount
      })),
      paymentMethod,
      amountPaid
    };
    
    // Try to submit immediately
    try {
      const response = await fetch('/api/v1/sales', {
        method: 'POST',
        body: JSON.stringify(saleData)
      });
      
      if (response.ok) {
        this.clear();
        return await response.json();
      }
    } catch (error) {
      // Offline - add to sync queue
      syncEngine.addToQueue('sale', saleData);
    }
  }
}
```

### 3. REAL-TIME STOCK UPDATES (WebSocket)

```typescript
// Optional: Real-time stock updates across devices
const ws = new WebSocket('wss://api.../ws');

ws.on('message', (data) => {
  const event = JSON.parse(data);
  
  if (event.type === 'stock.updated') {
    // Update local stock display
    updateStockDisplay(event.data.productId, event.data.newQuantity);
  }
  
  if (event.type === 'sale.completed') {
    // Refresh sales list
    refreshSalesList();
  }
});
```

### 4. RECEIPT PRINTING (Thermal Printers)

```typescript
// Generate ESC/POS commands for thermal printers
class ReceiptPrinter {
  generateReceipt(sale: Sale): string {
    let receipt = '';
    receipt += this.center('Épicerie Benali\n');
    receipt += this.center('Blida, Algeria\n');
    receipt += this.center('Tel: +213 551 234 567\n');
    receipt += '\n';
    receipt += this.line();
    receipt += `Receipt: ${sale.saleNumber}\n`;
    receipt += `Date: ${sale.completedAt}\n`;
    receipt += this.line();
    
    for (const item of sale.items) {
      receipt += `${item.productName}\n`;
      receipt += `  ${item.quantity} x ${item.unitPrice} DA = ${item.lineTotal} DA\n`;
    }
    
    receipt += this.line();
    receipt += this.rightAlign(`Subtotal: ${sale.subtotal} DA\n`);
    receipt += this.rightAlign(`Tax (19%): ${sale.taxAmount} DA\n`);
    receipt += this.bold(this.rightAlign(`Total: ${sale.total} DA\n`));
    receipt += this.rightAlign(`Paid: ${sale.amountPaid} DA\n`);
    receipt += this.rightAlign(`Change: ${sale.amountChange} DA\n`);
    receipt += '\n';
    receipt += this.center('Thank You!\n');
    receipt += this.center('شكراً لزيارتكم\n');
    receipt += this.cut();
    
    return receipt;
  }
}
```

---

## 🎨 UI/UX KEY SCREENS

### 1. POS Screen (Main Interface)
- **Left:** Product grid (9-12 quick access buttons)
- **Center:** Cart items list
- **Right:** Total, payment, checkout
- **Bottom:** Category filters, search, barcode scan

### 2. Dashboard (Owner/Manager)
- **Top:** Today's metrics (sales, transactions, profit)
- **Middle:** Sales chart (last 7 days)
- **Bottom:** Quick actions (low stock, open shifts, top products)

### 3. Product Management
- **List view:** Searchable table with quick edit
- **Detail view:** Full product info, stock levels, sales history
- **Bulk actions:** Import CSV, bulk edit, export

### 4. Shift Close Screen
- **Cash counting interface:** Denomination breakdown
- **Summary:** Expected vs actual cash
- **Performance:** Sales, transactions, hourly rate

---

This API design provides everything needed for Stage 1. Focus on building incrementally, testing each endpoint thoroughly before moving to the next feature.

Ready to implement! 🚀