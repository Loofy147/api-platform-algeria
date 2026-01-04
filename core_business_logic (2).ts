/**
 * ============================================================================
 * CORE BUSINESS LOGIC - Stage 1 Implementation
 * Language: TypeScript (Node.js backend)
 * Purpose: Production-ready business rules and algorithms
 * ============================================================================
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Organization {
  id: string;
  name: string;
  settings: {
    taxRate: number;
    lowStockThreshold: number;
    autoReorder: boolean;
  };
}

interface Product {
  id: string;
  organizationId: string;
  name: string;
  sku: string;
  barcode?: string;
  sellPrice: number;
  costPrice: number;
  taxRate: number;
  taxIncluded: boolean;
  trackInventory: boolean;
  reorderLevel: number;
}

interface SaleItem {
  productId: string;
  variantId?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discountAmount: number;
  taxRate: number;
}

interface Sale {
  id: string;
  organizationId: string;
  locationId: string;
  saleNumber: string;
  items: SaleItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  paymentMethod: string;
  completedBy: string;
  completedAt: Date;
  shiftId?: string;
}

interface StockLevel {
  locationId: string;
  productId: string;
  variantId?: string;
  quantityOnHand: number;
  quantityReserved: number;
  averageCost: number;
}

interface Shift {
  id: string;
  organizationId: string;
  locationId: string;
  userId: string;
  startedAt: Date;
  endedAt?: Date;
  openingCash: number;
  closingCash?: number;
  expectedCash?: number;
  totalSales: number;
  totalTransactions: number;
  status: 'open' | 'closed';
}

// ============================================================================
// 1. SALE PROCESSING ENGINE (Core POS Logic)
// ============================================================================

class SaleProcessor {
  /**
   * Calculate sale totals with tax and discounts
   * Business Rule: Tax calculated on (subtotal - discount) if tax not included in price
   */
  static calculateSaleTotals(items: SaleItem[], taxIncludedInPrice: boolean = true): {
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    total: number;
  } {
    // Calculate subtotal and total discount
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    for (const item of items) {
      const itemSubtotal = item.quantity * item.unitPrice;
      subtotal += itemSubtotal;
      totalDiscount += item.discountAmount;

      if (taxIncludedInPrice) {
        // Tax is already in the price - extract it
        // Formula: tax = (price * taxRate) / (100 + taxRate)
        const taxableAmount = itemSubtotal - item.discountAmount;
        const tax = (taxableAmount * item.taxRate) / (100 + item.taxRate);
        totalTax += tax;
      } else {
        // Tax needs to be added
        const taxableAmount = itemSubtotal - item.discountAmount;
        const tax = (taxableAmount * item.taxRate) / 100;
        totalTax += tax;
      }
    }

    const total = taxIncludedInPrice 
      ? subtotal - totalDiscount 
      : subtotal - totalDiscount + totalTax;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      taxAmount: Math.round(totalTax * 100) / 100,
      discountAmount: Math.round(totalDiscount * 100) / 100,
      total: Math.round(total * 100) / 100
    };
  }

  /**
   * Process a complete sale
   * Includes validation, stock checking, and transaction creation
   */
  static async processSale(
    db: any, // Database connection
    saleData: {
      organizationId: string;
      locationId: string;
      items: Array<{
        productId: string;
        variantId?: string;
        quantity: number;
        unitPrice: number;
        discountAmount?: number;
      }>;
      paymentMethod: string;
      amountPaid: number;
      completedBy: string;
      shiftId?: string;
    }
  ): Promise<{ success: boolean; sale?: Sale; error?: string }> {
    const trx = await db.transaction();

    try {
      // 1. Validate stock availability
      const stockValidation = await this.validateStockAvailability(
        trx,
        saleData.locationId,
        saleData.items
      );

      if (!stockValidation.valid) {
        await trx.rollback();
        return { success: false, error: stockValidation.error };
      }

      // 2. Get product details and build sale items
      const saleItems: SaleItem[] = [];
      for (const item of saleData.items) {
        const product = await trx('products')
          .where({ id: item.productId })
          .first();

        if (!product) {
          await trx.rollback();
          return { success: false, error: `Product ${item.productId} not found` };
        }

        saleItems.push({
          productId: item.productId,
          variantId: item.variantId,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costPrice: product.cost_price,
          discountAmount: item.discountAmount || 0,
          taxRate: product.tax_rate
        });
      }

      // 3. Calculate totals
      const totals = this.calculateSaleTotals(saleItems, true);

      // 4. Validate payment
      if (saleData.amountPaid < totals.total) {
        await trx.rollback();
        return { success: false, error: 'Insufficient payment amount' };
      }

      // 5. Generate sale number
      const saleNumber = await this.generateSaleNumber(trx, saleData.organizationId);

      // 6. Create sale record
      const [saleId] = await trx('sales').insert({
        id: uuidv4(),
        organization_id: saleData.organizationId,
        location_id: saleData.locationId,
        sale_number: saleNumber,
        subtotal: totals.subtotal,
        tax_amount: totals.taxAmount,
        discount_amount: totals.discountAmount,
        total: totals.total,
        payment_method: saleData.paymentMethod,
        payment_status: 'completed',
        amount_paid: saleData.amountPaid,
        amount_change: saleData.amountPaid - totals.total,
        completed_by: saleData.completedBy,
        completed_at: new Date(),
        shift_id: saleData.shiftId,
        status: 'completed'
      }).returning('id');

      // 7. Create sale items
      for (const item of saleItems) {
        const lineTotal = (item.quantity * item.unitPrice) - item.discountAmount;
        const taxAmount = (lineTotal * item.taxRate) / (100 + item.taxRate);

        await trx('sale_items').insert({
          id: uuidv4(),
          sale_id: saleId,
          product_id: item.productId,
          variant_id: item.variantId,
          product_name: item.productName,
          product_sku: await this.getProductSKU(trx, item.productId),
          quantity: item.quantity,
          unit_price: item.unitPrice,
          cost_price: item.costPrice,
          discount_amount: item.discountAmount,
          tax_rate: item.taxRate,
          line_total: lineTotal,
          tax_amount: taxAmount
        });
      }

      // 8. Update stock levels (handled by trigger, but can be manual)
      // Stock movements are created automatically via database trigger

      // 9. Update shift totals if applicable
      if (saleData.shiftId) {
        await this.updateShiftTotals(trx, saleData.shiftId, totals.total);
      }

      await trx.commit();

      return {
        success: true,
        sale: {
          id: saleId,
          saleNumber,
          ...saleData,
          items: saleItems,
          ...totals
        } as any
      };
    } catch (error) {
      await trx.rollback();
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Validate stock availability for all items
   */
  private static async validateStockAvailability(
    db: any,
    locationId: string,
    items: Array<{ productId: string; variantId?: string; quantity: number }>
  ): Promise<{ valid: boolean; error?: string }> {
    for (const item of items) {
      const stock = await db('stock_levels')
        .where({
          location_id: locationId,
          product_id: item.productId,
          variant_id: item.variantId || null
        })
        .first();

      if (!stock) {
        return {
          valid: false,
          error: `No stock record found for product ${item.productId}`
        };
      }

      const available = stock.quantity_on_hand - stock.quantity_reserved;
      if (available < item.quantity) {
        return {
          valid: false,
          error: `Insufficient stock for product ${item.productId}. Available: ${available}, Requested: ${item.quantity}`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Generate unique sale number
   * Format: LOC-YYYYMMDD-NNNN
   */
  private static async generateSaleNumber(db: any, organizationId: string): Promise<string> {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const prefix = `SAL-${today}`;

    const lastSale = await db('sales')
      .where('organization_id', organizationId)
      .where('sale_number', 'like', `${prefix}%`)
      .orderBy('created_at', 'desc')
      .first();

    let sequence = 1;
    if (lastSale) {
      const lastSequence = parseInt(lastSale.sale_number.split('-').pop() || '0');
      sequence = lastSequence + 1;
    }

    return `${prefix}-${sequence.toString().padStart(4, '0')}`;
  }

  private static async getProductSKU(db: any, productId: string): Promise<string | null> {
    const product = await db('products').where({ id: productId }).first();
    return product?.sku || null;
  }

  private static async updateShiftTotals(db: any, shiftId: string, saleTotal: number): Promise<void> {
    await db('shifts')
      .where({ id: shiftId })
      .increment('total_sales', saleTotal)
      .increment('total_transactions', 1);
  }
}

// ============================================================================
// 2. INVENTORY MANAGEMENT ENGINE
// ============================================================================

class InventoryManager {
  /**
   * Adjust stock level with audit trail
   * Used for manual corrections, damage, etc.
   */
  static async adjustStock(
    db: any,
    adjustment: {
      organizationId: string;
      locationId: string;
      productId: string;
      variantId?: string;
      quantity: number; // Can be positive or negative
      movementType: 'adjustment' | 'damage' | 'return' | 'sample';
      reason: string;
      userId: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const trx = await db.transaction();

    try {
      // 1. Get current stock level
      const stock = await trx('stock_levels')
        .where({
          location_id: adjustment.locationId,
          product_id: adjustment.productId,
          variant_id: adjustment.variantId || null
        })
        .first();

      if (!stock) {
        await trx.rollback();
        return { success: false, error: 'Stock record not found' };
      }

      // 2. Calculate new quantity
      const newQuantity = stock.quantity_on_hand + adjustment.quantity;

      if (newQuantity < 0) {
        await trx.rollback();
        return { success: false, error: 'Cannot reduce stock below zero' };
      }

      // 3. Update stock level
      await trx('stock_levels')
        .where({
          location_id: adjustment.locationId,
          product_id: adjustment.productId,
          variant_id: adjustment.variantId || null
        })
        .update({
          quantity_on_hand: newQuantity,
          updated_at: new Date()
        });

      // 4. Create stock movement record
      await trx('stock_movements').insert({
        id: uuidv4(),
        organization_id: adjustment.organizationId,
        location_id: adjustment.locationId,
        product_id: adjustment.productId,
        variant_id: adjustment.variantId,
        movement_type: adjustment.movementType,
        quantity: adjustment.quantity,
        notes: adjustment.reason,
        created_by: adjustment.userId,
        created_at: new Date()
      });

      // 5. Check if reorder needed
      const product = await trx('products')
        .where({ id: adjustment.productId })
        .first();

      if (product && newQuantity <= product.reorder_level) {
        // Trigger low stock alert (emit event, send notification, etc.)
        await this.triggerLowStockAlert(trx, adjustment.organizationId, product, newQuantity);
      }

      await trx.commit();
      return { success: true };
    } catch (error) {
      await trx.rollback();
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Transfer stock between locations
   */
  static async transferStock(
    db: any,
    transfer: {
      organizationId: string;
      fromLocationId: string;
      toLocationId: string;
      productId: string;
      variantId?: string;
      quantity: number;
      userId: string;
      notes?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const trx = await db.transaction();

    try {
      // 1. Validate source stock
      const sourceStock = await trx('stock_levels')
        .where({
          location_id: transfer.fromLocationId,
          product_id: transfer.productId,
          variant_id: transfer.variantId || null
        })
        .first();

      if (!sourceStock || sourceStock.quantity_on_hand < transfer.quantity) {
        await trx.rollback();
        return { success: false, error: 'Insufficient stock at source location' };
      }

      // 2. Decrease source stock
      await trx('stock_levels')
        .where({
          location_id: transfer.fromLocationId,
          product_id: transfer.productId,
          variant_id: transfer.variantId || null
        })
        .decrement('quantity_on_hand', transfer.quantity);

      // 3. Increase destination stock
      await trx('stock_levels')
        .insert({
          id: uuidv4(),
          organization_id: transfer.organizationId,
          location_id: transfer.toLocationId,
          product_id: transfer.productId,
          variant_id: transfer.variantId,
          quantity_on_hand: transfer.quantity,
          quantity_reserved: 0,
          average_cost: sourceStock.average_cost
        })
        .onConflict(['location_id', 'product_id', 'variant_id'])
        .merge({
          quantity_on_hand: db.raw('stock_levels.quantity_on_hand + ?', [transfer.quantity])
        });

      // 4. Create movement records
      const transferId = uuidv4();

      // Outbound movement
      await trx('stock_movements').insert({
        id: uuidv4(),
        organization_id: transfer.organizationId,
        location_id: transfer.fromLocationId,
        product_id: transfer.productId,
        variant_id: transfer.variantId,
        movement_type: 'transfer_out',
        quantity: -transfer.quantity,
        related_location_id: transfer.toLocationId,
        reference_type: 'transfer',
        reference_id: transferId,
        notes: transfer.notes,
        created_by: transfer.userId,
        created_at: new Date()
      });

      // Inbound movement
      await trx('stock_movements').insert({
        id: uuidv4(),
        organization_id: transfer.organizationId,
        location_id: transfer.toLocationId,
        product_id: transfer.productId,
        variant_id: transfer.variantId,
        movement_type: 'transfer_in',
        quantity: transfer.quantity,
        related_location_id: transfer.fromLocationId,
        reference_type: 'transfer',
        reference_id: transferId,
        notes: transfer.notes,
        created_by: transfer.userId,
        created_at: new Date()
      });

      await trx.commit();
      return { success: true };
    } catch (error) {
      await trx.rollback();
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get products needing reorder
   */
  static async getReorderList(
    db: any,
    organizationId: string,
    locationId?: string
  ): Promise<Array<{
    productId: string;
    productName: string;
    sku: string;
    currentStock: number;
    reorderLevel: number;
    suggestedQuantity: number;
  }>> {
    let query = db('stock_levels as sl')
      .join('products as p', 'sl.product_id', 'p.id')
      .where('sl.organization_id', organizationId)
      .where('p.track_inventory', true)
      .where('p.is_active', true)
      .whereRaw('sl.quantity_available <= p.reorder_level')
      .select(
        'p.id as productId',
        'p.name as productName',
        'p.sku',
        'sl.quantity_available as currentStock',
        'p.reorder_level as reorderLevel',
        'p.reorder_quantity as suggestedQuantity'
      );

    if (locationId) {
      query = query.where('sl.location_id', locationId);
    }

    return await query;
  }

  private static async triggerLowStockAlert(
    db: any,
    organizationId: string,
    product: any,
    currentStock: number
  ): Promise<void> {
    // Insert notification or emit event
    // This would trigger email/SMS/push notification
    console.log(`LOW STOCK ALERT: ${product.name} (${currentStock} remaining)`);
  }
}

// ============================================================================
// 3. SHIFT MANAGEMENT
// ============================================================================

class ShiftManager {
  /**
   * Open a new shift
   */
  static async openShift(
    db: any,
    shift: {
      organizationId: string;
      locationId: string;
      userId: string;
      openingCash: number;
    }
  ): Promise<{ success: boolean; shiftId?: string; error?: string }> {
    try {
      // Check if user already has open shift
      const existingShift = await db('shifts')
        .where({
          user_id: shift.userId,
          status: 'open'
        })
        .first();

      if (existingShift) {
        return { success: false, error: 'User already has an open shift' };
      }

      const [shiftId] = await db('shifts').insert({
        id: uuidv4(),
        organization_id: shift.organizationId,
        location_id: shift.locationId,
        user_id: shift.userId,
        started_at: new Date(),
        opening_cash: shift.openingCash,
        status: 'open'
      }).returning('id');

      return { success: true, shiftId };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Close shift with cash reconciliation
   */
  static async closeShift(
    db: any,
    shiftId: string,
    closingData: {
      closingCash: number;
      notes?: string;
    }
  ): Promise<{ success: boolean; report?: any; error?: string }> {
    const trx = await db.transaction();

    try {
      // 1. Get shift details
      const shift = await trx('shifts').where({ id: shiftId }).first();

      if (!shift) {
        await trx.rollback();
        return { success: false, error: 'Shift not found' };
      }

      if (shift.status === 'closed') {
        await trx.rollback();
        return { success: false, error: 'Shift already closed' };
      }

      // 2. Calculate expected cash (opening + cash sales)
      const cashSales = await trx('sales')
        .where({
          shift_id: shiftId,
          payment_method: 'cash',
          status: 'completed'
        })
        .sum('total as total')
        .first();

      const expectedCash = shift.opening_cash + (cashSales?.total || 0);
      const cashDifference = closingData.closingCash - expectedCash;

      // 3. Get shift summary
      const summary = await this.calculateShiftSummary(trx, shiftId);

      // 4. Update shift
      await trx('shifts')
        .where({ id: shiftId })
        .update({
          ended_at: new Date(),
          closing_cash: closingData.closingCash,
          expected_cash: expectedCash,
          closing_notes: closingData.notes,
          status: 'closed',
          total_sales: summary.totalSales,
          total_transactions: summary.totalTransactions,
          average_transaction_value: summary.averageTransactionValue
        });

      await trx.commit();

      return {
        success: true,
        report: {
          shiftId,
          userId: shift.user_id,
          startedAt: shift.started_at,
          endedAt: new Date(),
          openingCash: shift.opening_cash,
          closingCash: closingData.closingCash,
          expectedCash,
          cashDifference,
          ...summary
        }
      };
    } catch (error) {
      await trx.rollback();
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Calculate shift performance summary
   */
  private static async calculateShiftSummary(
    db: any,
    shiftId: string
  ): Promise<{
    totalSales: number;
    totalTransactions: number;
    cashSales: number;
    cardSales: number;
    averageTransactionValue: number;
    totalRefunds: number;
  }> {
    const sales = await db('sales')
      .where({ shift_id: shiftId, status: 'completed' })
      .select(
        db.raw('SUM(total) as total_sales'),
        db.raw('COUNT(*) as total_transactions'),
        db.raw("SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END) as cash_sales"),
        db.raw("SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END) as card_sales")
      )
      .first();

    const refunds = await db('sales')
      .where({ shift_id: shiftId, status: 'refunded' })
      .sum('refunded_amount as total_refunds')
      .first();

    const totalSales = sales?.total_sales || 0;
    const totalTransactions = sales?.total_transactions || 0;

    return {
      totalSales,
      totalTransactions,
      cashSales: sales?.cash_sales || 0,
      cardSales: sales?.card_sales || 0,
      averageTransactionValue: totalTransactions > 0 ? totalSales / totalTransactions : 0,
      totalRefunds: refunds?.total_refunds || 0
    };
  }
}

// ============================================================================
// 4. ANALYTICS ENGINE
// ============================================================================

class AnalyticsEngine {
  /**
   * Calculate daily business metrics
   * Run this at end of day or on-demand
   */
  static async calculateDailySummary(
    db: any,
    organizationId: string,
    locationId: string | null,
    date: Date
  ): Promise<void> {
    const trx = await db.transaction();

    try {
      const dateStr = date.toISOString().split('T')[0];

      // Get all completed sales for the day
      let salesQuery = trx('sales')
        .where('organization_id', organizationId)
        .whereRaw('DATE(completed_at) = ?', [dateStr])
        .where('status', 'completed');

      if (locationId) {
        salesQuery = salesQuery.where('location_id', locationId);
      }

      const sales = await salesQuery;

      if (sales.length === 0) {
        await trx.commit();
        return;
      }

      // Calculate metrics
      const totalSales = sales.reduce((sum, s) => sum + parseFloat(s.total), 0);
      const totalTransactions = sales.length;
      const totalTax = sales.reduce((sum, s) => sum + parseFloat(s.tax_amount), 0);

      const cashSales = sales
        .filter(s => s.payment_method === 'cash')
        .reduce((sum, s) => sum + parseFloat(s.total), 0);

      const cardSales = sales
        .filter(s => s.payment_method === 'card')
        .reduce((sum, s) => sum + parseFloat(s.total), 0);

      // Get sale items for product-level metrics
      const saleIds = sales.map(s => s.id);
      const items = await trx('sale_items')
        .whereIn('sale_id', saleIds);

      const totalItemsSold = items.reduce((sum, i) => sum + parseFloat(i.quantity), 0);
      const totalCost = items.reduce((sum, i) => sum + (parseFloat(i.cost_price) * parseFloat(i.quantity)), 0);
      const grossProfit = totalSales - totalCost;
      const grossMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

      // Insert or update daily summary
      await trx('daily_summaries')
        .insert({
          id: uuidv4(),
          organization_id: organizationId,
          location_id: locationId,
          date: dateStr,
          total_sales: totalSales,
          total_transactions: totalTransactions,
          total_items_sold: totalItemsSold,
          total_customers: new Set(sales.map(s => s.customer_phone).filter(Boolean)).size,
          cash_sales: cashSales,
          card_sales: cardSales,
          other_sales: totalSales - cashSales - cardSales,
          total_cost: totalCost,
          gross_profit: grossProfit,
          gross_margin: grossMargin,
          average_transaction_value: totalSales / totalTransactions,
          average_items_per_transaction: totalItemsSold / totalTransactions,
          total_tax_collected: totalTax
        })
        .onConflict(['organization_id', 'location_id', 'date'])
        .merge();

      await trx.commit();
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Get top performing products
   */
  static async getTopProducts(
    db: any,
    organizationId: string,
    options: {
      locationId?: string;
      startDate: Date;
      endDate: Date;
      limit?: number;
    }
  ): Promise<Array<{
    productId: string;
    productName: string;
    quantitySold: number;
    revenue: number;
    profit: number;
    timesOrdered: number;
  }>> {
    let query = db('sale_items as si')
      .join('sales as s', 'si.sale_id', 's.id')
      .join('products as p', 'si.product_id', 'p.id')
      .where('s.organization_id', organizationId)
      .whereBetween('s.completed_at', [options.startDate, options.endDate])
      .where('s.status', 'completed')
      .groupBy('p.id', 'p.name')
      .select(
        'p.id as productId',
        'p.name as productName',
        db.raw('SUM(si.quantity) as quantitySold'),
        db.raw('SUM(si.line_total) as revenue'),
        db.raw('SUM(si.profit) as profit'),
        db.raw('COUNT(DISTINCT si.sale_id) as timesOrdered')
      )
      .orderBy('revenue', 'desc')
      .limit(options.limit || 10);

    if (options.locationId) {
      query = query.where('s.location_id', options.locationId);
    }

    return await query;
  }

  /**
   * Get staff performance metrics
   */
  static async getStaffPerformance(
    db: any,
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{
    userId: string;
    userName: string;
    totalSales: number;
    totalTransactions: number;
    averageTransactionValue: number;
    hoursWorked: number;
    salesPerHour: number;
  }>> {
    // Get sales per staff
    const salesData = await db('sales as s')
      .join('users as u', 's.completed_by', 'u.id')
      .where('s.organization_id', organizationId)
      .whereBetween('s.completed_at', [startDate, endDate])
      .where('s.status', 'completed')
      .groupBy('u.id', 'u.full_name')
      .select(
        'u.id as userId',
        'u.full_name as userName',
        db.raw('SUM(s.total) as totalSales'),
        db.raw('COUNT(*) as totalTransactions'),
        db.raw('AVG(s.total) as averageTransactionValue')
      );

    // Get hours worked from shifts
    const shiftsData = await db('shifts')
      .where('organization_id', organizationId)
      .whereBetween('started_at', [startDate, endDate])
      .where('status', 'closed')
      .groupBy('user_id')
      .select(
        'user_id as userId',
        db.raw("SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 3600) as hoursWorked")
      );

    // Merge data
    const shiftsMap = new Map(shiftsData.map(s => [s.userId, s.hoursWorked]));

    return salesData.map(staff => {
      const hoursWorked = shiftsMap.get(staff.userId) || 0;
      return {
        ...staff,
        totalSales: parseFloat(staff.totalSales),
        totalTransactions: parseInt(staff.totalTransactions),
        averageTransactionValue: parseFloat(staff.averageTransactionValue),
        hoursWorked: parseFloat(hoursWorked.toFixed(2)),
        salesPerHour: hoursWorked > 0 ? parseFloat(staff.totalSales) / hoursWorked : 0
      };
    });
  }
}

// ============================================================================
// 5. OFFLINE SYNC ENGINE (Critical for Stage 1)
// ============================================================================

interface SyncQueueItem {
  id: string;
  type: 'sale' | 'stock_adjustment' | 'shift_close';
  data: any;
  createdAt: Date;
  attempts: number;
}

class OfflineSyncEngine {
  private queue: SyncQueueItem[] = [];
  private syncInterval: NodeJS.Timeout | null = null;

  /**
   * Add operation to sync queue
   */
  addToQueue(type: string, data: any): string {
    const item: SyncQueueItem = {
      id: uuidv4(),
      type: type as any,
      data,
      createdAt: new Date(),
      attempts: 0
    };

    this.queue.push(item);
    
    // Save to local storage (IndexedDB in browser, SQLite in mobile)
    this.saveQueueToLocalStorage();

    return item.id;
  }

  /**
   * Process sync queue when connection available
   */
  async processSyncQueue(db: any): Promise<{
    successful: number;
    failed: number;
    errors: Array<{ itemId: string; error: string }>;
  }> {
    const results = {
      successful: 0,
      failed: 0,
      errors: [] as Array<{ itemId: string; error: string }>
    };

    // Process in order
    for (const item of this.queue) {
      try {
        await this.syncItem(db, item);
        
        // Remove from queue on success
        this.queue = this.queue.filter(i => i.id !== item.id);
        results.successful++;
      } catch (error) {
        item.attempts++;
        
        // Remove after 5 failed attempts
        if (item.attempts >= 5) {
          this.queue = this.queue.filter(i => i.id !== item.id);
          results.failed++;
          results.errors.push({
            itemId: item.id,
            error: (error as Error).message
          });
        }
      }
    }

    this.saveQueueToLocalStorage();
    return results;
  }

  /**
   * Sync individual item
   */
  private async syncItem(db: any, item: SyncQueueItem): Promise<void> {
    switch (item.type) {
      case 'sale':
        await SaleProcessor.processSale(db, item.data);
        break;
      case 'stock_adjustment':
        await InventoryManager.adjustStock(db, item.data);
        break;
      case 'shift_close':
        await ShiftManager.closeShift(db, item.data.shiftId, item.data.closingData);
        break;
    }
  }

  /**
   * Start auto-sync on interval
   */
  startAutoSync(db: any, intervalMs: number = 30000): void {
    this.syncInterval = setInterval(async () => {
      if (this.isOnline()) {
        await this.processSyncQueue(db);
      }
    }, intervalMs);
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }

  private isOnline(): boolean {
    // Browser: return navigator.onLine
    // Node/Mobile: implement actual connectivity check
    return true;
  }

  private saveQueueToLocalStorage(): void {
    // Implementation depends on environment
    // Browser: localStorage.setItem('syncQueue', JSON.stringify(this.queue))
    // Mobile: SQLite or AsyncStorage
  }
}

// ============================================================================
// 6. VALIDATION & BUSINESS RULES
// ============================================================================

class BusinessRules {
  /**
   * Validate sale before processing
   */
  static validateSale(sale: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!sale.items || sale.items.length === 0) {
      errors.push('Sale must have at least one item');
    }

    if (sale.items) {
      for (const item of sale.items) {
        if (item.quantity <= 0) {
          errors.push(`Invalid quantity for item: ${item.productId}`);
        }
        if (item.unitPrice < 0) {
          errors.push(`Invalid price for item: ${item.productId}`);
        }
      }
    }

    if (!sale.paymentMethod) {
      errors.push('Payment method is required');
    }

    if (sale.amountPaid < 0) {
      errors.push('Payment amount cannot be negative');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check user permissions
   */
  static async checkPermission(
    db: any,
    userId: string,
    organizationId: string,
    permission: string
  ): Promise<boolean> {
    const member = await db('organization_members')
      .where({
        user_id: userId,
        organization_id: organizationId,
        is_active: true
      })
      .first();

    if (!member) return false;

    // Check role-based permissions
    const rolePermissions: Record<string, string[]> = {
      owner: ['*'], // All permissions
      manager: ['pos.*', 'inventory.*', 'reports.*', 'staff.view'],
      supervisor: ['pos.*', 'inventory.view', 'reports.view'],
      staff: ['pos.access'],
      viewer: ['reports.view']
    };

    const userPermissions = rolePermissions[member.role] || [];
    
    // Check wildcard or exact match
    return userPermissions.includes('*') || 
           userPermissions.includes(permission) ||
           userPermissions.some(p => p.endsWith('.*') && permission.startsWith(p.slice(0, -2)));
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export {
  SaleProcessor,
  InventoryManager,
  ShiftManager,
  AnalyticsEngine,
  OfflineSyncEngine,
  BusinessRules
};

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/*
// Example 1: Process a sale
const result = await SaleProcessor.processSale(db, {
  organizationId: 'uuid',
  locationId: 'uuid',
  items: [
    { productId: 'uuid', quantity: 2, unitPrice: 150.00, discountAmount: 10 },
    { productId: 'uuid2', quantity: 1, unitPrice: 500.00 }
  ],
  paymentMethod: 'cash',
  amountPaid: 800.00,
  completedBy: 'user-uuid',
  shiftId: 'shift-uuid'
});

// Example 2: Adjust inventory
const adjustment = await InventoryManager.adjustStock(db, {
  organizationId: 'uuid',
  locationId: 'uuid',
  productId: 'uuid',
  quantity: -5, // Negative = decrease
  movementType: 'damage',
  reason: 'Expired products removed',
  userId: 'user-uuid'
});

// Example 3: Close shift
const shiftReport = await ShiftManager.closeShift(db, 'shift-uuid', {
  closingCash: 15000.00,
  notes: 'Normal shift, no issues'
});

// Example 4: Get analytics
const topProducts = await AnalyticsEngine.getTopProducts(db, 'org-uuid', {
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31'),
  limit: 10
});
*/