import { z } from 'zod';

// Password validation regex
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d!@#$%^&*(),.?":{}|<>]{8,}$/;

// Email validation (more permissive than default)
const emailSchema = z.string()
  .email('Invalid email format')
  .min(5, 'Email too short')
  .max(255, 'Email too long')
  .toLowerCase()
  .transform(val => val.trim());

// Password validation
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(
    passwordRegex,
    'Password must contain uppercase, lowercase, and number'
  );

/**
 * Register validation schema
 */
export const registerSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: passwordSchema,
    fullName: z.string()
      .min(2, 'Full name must be at least 2 characters')
      .max(255, 'Full name too long')
      .trim(),
    organizationName: z.string()
      .min(2, 'Organization name must be at least 2 characters')
      .max(255, 'Organization name too long')
      .trim(),
    businessType: z.enum([
      'retail',
      'restaurant',
      'pharmacy',
      'grocery',
      'services',
      'wholesale',
      'other'
    ], {
      errorMap: () => ({ message: 'Invalid business type' })
    })
  })
});

/**
 * Login validation schema
 */
export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string()
      .min(1, 'Password is required')
      .max(128, 'Password too long')
  })
});

/**
 * Refresh token validation schema
 */
export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string()
      .min(10, 'Invalid refresh token')
  })
});

/**
 * Password reset request validation schema
 */
export const passwordResetRequestSchema = z.object({
  body: z.object({
    email: emailSchema
  })
});

/**
 * Password reset confirmation validation schema
 */
export const passwordResetSchema = z.object({
  body: z.object({
    token: z.string()
      .min(10, 'Invalid reset token'),
    password: passwordSchema
  })
});

/**
 * Product validation schemas
 */
export const createProductSchema = z.object({
  body: z.object({
    sku: z.string()
      .min(1, 'SKU is required')
      .max(100, 'SKU too long')
      .trim(),
    barcode: z.string()
      .max(50, 'Barcode too long')
      .optional(),
    name: z.string()
      .min(1, 'Product name is required')
      .max(255, 'Product name too long')
      .trim(),
    description: z.string()
      .max(5000, 'Description too long')
      .optional(),
    costPrice: z.number()
      .min(0, 'Cost price cannot be negative')
      .optional(),
    sellPrice: z.number()
      .min(0, 'Sell price cannot be negative'),
    taxRate: z.number()
      .min(0, 'Tax rate cannot be negative')
      .max(100, 'Tax rate cannot exceed 100%')
      .default(19.00),
    category: z.string()
      .max(100, 'Category too long')
      .optional(),
    trackInventory: z.boolean()
      .default(true),
    reorderLevel: z.number()
      .min(0, 'Reorder level cannot be negative')
      .optional(),
    reorderQuantity: z.number()
      .min(0, 'Reorder quantity cannot be negative')
      .optional()
  })
});

/**
 * Sale validation schemas
 */
export const createSaleSchema = z.object({
  body: z.object({
    locationId: z.string().uuid('Invalid location ID'),
    customerId: z.string().uuid('Invalid customer ID').optional(),
    items: z.array(
      z.object({
        productId: z.string().uuid('Invalid product ID'),
        variantId: z.string().uuid('Invalid variant ID').optional(),
        quantity: z.number()
          .min(0.001, 'Quantity must be positive')
          .max(999999, 'Quantity too large'),
        unitPrice: z.number()
          .min(0, 'Unit price cannot be negative')
          .max(9999999, 'Unit price too large'),
        discountAmount: z.number()
          .min(0, 'Discount cannot be negative')
          .optional()
      })
    ).min(1, 'At least one item is required'),
    paymentMethod: z.enum([
      'cash',
      'card',
      'mobile',
      'bank_transfer',
      'check',
      'credit'
    ], {
      errorMap: () => ({ message: 'Invalid payment method' })
    }),
    amountPaid: z.number()
      .min(0, 'Amount paid cannot be negative'),
    shiftId: z.string().uuid('Invalid shift ID').optional()
  })
});

/**
 * Inventory adjustment validation schema
 */
export const inventoryAdjustmentSchema = z.object({
  body: z.object({
    locationId: z.string().uuid('Invalid location ID'),
    productId: z.string().uuid('Invalid product ID'),
    variantId: z.string().uuid('Invalid variant ID').optional(),
    quantity: z.number()
      .refine(val => val !== 0, 'Quantity cannot be zero'),
    movementType: z.enum([
      'restock',
      'adjustment',
      'damage',
      'return',
      'sample',
      'transfer_in',
      'transfer_out'
    ], {
      errorMap: () => ({ message: 'Invalid movement type' })
    }),
    reason: z.string()
      .max(500, 'Reason too long')
      .optional()
  })
});

/**
 * Shift validation schemas
 */
export const openShiftSchema = z.object({
  body: z.object({
    locationId: z.string().uuid('Invalid location ID'),
    openingCash: z.number()
      .min(0, 'Opening cash cannot be negative')
      .default(0)
  })
});

export const closeShiftSchema = z.object({
  body: z.object({
    closingCash: z.number()
      .min(0, 'Closing cash cannot be negative'),
    notes: z.string()
      .max(1000, 'Notes too long')
      .optional()
  }),
  params: z.object({
    id: z.string().uuid('Invalid shift ID')
  })
});
