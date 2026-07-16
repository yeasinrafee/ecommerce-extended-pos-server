# Inventory Module — System Documentation

You are working on a Node.js + TypeScript + Prisma + Express backend for an ecommerce + POS system. This document describes the complete inventory system. Follow all patterns, conventions, and rules described here exactly when implementing or modifying any inventory-related feature.

---

## Tech Stack

- Runtime: Node.js + TypeScript (ESM, `.js` imports)
- ORM: Prisma (multi-file schema at `prisma/schema/`)
- Framework: Express
- DB: PostgreSQL
- Pattern: Controller → Service → Repository (where applicable)
- Auth: JWT via `authenticate` + `authorizeRoles` middleware
- Errors: `throw new AppError(statusCode, message, details[])` from `src/common/errors/app-error.ts`
- Async: all route handlers wrapped with `asyncHandler()`
- Response: `sendResponse(res, { statusCode, message, data })` from `src/common/utils/send-response.ts`
- Transactions: always use `prisma.$transaction(async (tx) => { ... })` for multi-step mutations

---

## Core Concept: The Stock Ledger

**Every stock quantity change in the system MUST go through `stockLedgerService.adjustStock()`.**  
Never update the `stocks` table directly outside of this function.

### Location: `src/modules/stock-ledger/stock-ledger.service.ts`

```ts
stockLedgerService.adjustStock(tx, {
  productId: string,
  locationId: string,
  quantityChanged: number,   // positive = add, negative = deduct
  movementType: StockMovementType,
  referenceType: string,     // e.g. 'GoodsReceive', 'PosOrder', 'StockTransfer'
  referenceId: string,
  performedBy: string,       // userId
  notes?: string
})
```

**What it does internally (in order):**
1. `findUnique` on `stocks` by `{ productId_locationId }` — creates record if missing
2. `SELECT id FROM stocks WHERE id = ? FOR UPDATE` — row-level lock
3. Re-reads locked row to get true `previousQuantity`
4. Rejects if `previousQuantity + quantityChanged < 0` → throws `AppError(400, 'Insufficient stock')`
5. Updates `Stock.quantity`
6. Writes an immutable `StockMovement` record via `stockLedgerRepository.createMovement()`
7. Returns `currentQuantity`

**Also available:** `stockLedgerService.adjustReservation(tx, productId, locationId, reservationChanged)` — adjusts `reservedQuantity` only, no ledger entry.

---

## Database Schema

### `stocks` table — `model Stock`
```
id               String   @id
productId        String   → Product
locationId       String   → Location
quantity         Int      @default(0)   // physical on-hand qty
reservedQuantity Int      @default(0)   // qty committed but not yet dispatched
@@unique([productId, locationId])
```

### `stock_movements` table — `model StockMovement` (immutable audit log)
```
id               String
productId        String
locationId       String
movementType     StockMovementType
previousQuantity Int
quantityChanged  Int
currentQuantity  Int
referenceType    String   // source document type
referenceId      String   // source document id
performedBy      String   // userId
notes            String?
createdAt        DateTime
```

### `locations` table — `model Location`
```
id     String   @id
name   String   @unique
code   String   @unique
type   LocationType  // WAREHOUSE | STORE
status Status        // ACTIVE | INACTIVE
```
A `Store` links to one `Location` (1:1). Location is the unit of stock ownership.

### `low_stock_configs` table — `model LowStockConfig`
```
productId       String
locationId      String?  // null = global config for all locations
minimumQuantity Int      @default(10)
reorderQuantity Int      @default(50)
@@unique([productId, locationId])
```

### All other inventory models (header only):
| Model | Table | Key Fields |
|---|---|---|
| PurchaseOrder | purchase_orders | poNumber, supplierId, locationId, status (DRAFT→PENDING→APPROVED→CANCELLED) |
| PurchaseOrderItem | purchase_order_items | purchaseOrderId, productId, quantity, receivedQuantity, unitPrice |
| GoodsReceive | goods_receives | grnNumber, purchaseOrderId?, supplierId, locationId, status (RECEIVED) |
| GoodsReceiveItem | goods_receive_items | goodsReceiveId, productId, quantityOrdered, quantityReceived, quantityAccepted, quantityRejected |
| StockTransfer | stock_transfers | transferNumber, sourceLocationId, destinationLocationId, status |
| StockTransferItem | stock_transfer_items | stockTransferId, productId, quantity, receivedQuantity |
| SupplierReturn | supplier_returns | returnNumber, supplierId, locationId, status (COMPLETED) |
| SupplierReturnItem | supplier_return_items | supplierReturnId, productId, quantity, unitPrice |
| CustomerReturn | customer_returns | returnNumber, customerId, posOrderId?, orderId?, locationId, status (REFUNDED) |
| CustomerReturnItem | customer_return_items | customerReturnId, productId, quantity, refundPrice |
| StockAdjustment | stock_adjustments | adjustmentNumber, locationId, status (COMPLETED) |
| StockAdjustmentItem | stock_adjustment_items | stockAdjustmentId, productId, previousQuantity, quantityChanged, currentQuantity, reason |
| Damage | damages | damageNumber, locationId, status (COMPLETED) |
| DamageItem | damage_items | damageId, productId, quantity, reason (DAMAGED\|BROKEN\|LOST\|EXPIRED) |

---

## Enums

```ts
enum StockMovementType {
  PURCHASE          // GRN received from supplier
  TRANSFER_IN       // received at destination in a transfer
  TRANSFER_OUT      // dispatched from source in a transfer
  SALE              // POS or online sale
  CUSTOMER_RETURN   // customer returned goods
  SUPPLIER_RETURN   // goods returned to supplier
  ADJUSTMENT_IN     // manual positive adjustment
  ADJUSTMENT_OUT    // manual negative adjustment
  DAMAGE            // physical damage write-off
  EXPIRED           // expiry write-off
}

enum StockTransferStatus  { DRAFT, PENDING, APPROVED, IN_TRANSIT, RECEIVED, CANCELLED }
enum PurchaseOrderStatus  { DRAFT, PENDING, APPROVED, CANCELLED }
enum GoodsReceiveStatus   { DRAFT, RECEIVED, CANCELLED }
enum StockAdjustmentStatus{ DRAFT, COMPLETED, CANCELLED }
enum DamageStatus         { DRAFT, COMPLETED, CANCELLED }
enum SupplierReturnStatus { DRAFT, COMPLETED, CANCELLED }
enum CustomerReturnStatus { PENDING, REFUNDED, CANCELLED }
enum LocationType         { WAREHOUSE, STORE }
enum DamageReason         { DAMAGED, BROKEN, LOST, EXPIRED }
```

---

## Document Number Generation Pattern

Every inventory document generates a serial number before the transaction:
```ts
private async generateXxxNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // '20260624'
  const count = await repository.count({});
  const nextNum = String(count + 1).padStart(4, '0');
  return `PREFIX-${dateStr}-${nextNum}`;
}
```
Prefixes: `PO-`, `GRN-`, `TR-`, `SR-`, `CR-`, `ADJ-`, `DMG-`

---

## Flow-by-Flow Rules

### 1. Purchase Order (PO)
**File:** `src/modules/purchase-order/purchase-order.service.ts`  
**Rule: Creating or approving a PO does NOT move any stock.**  
PO is a procurement planning document only.

- `createPurchaseOrder` → status `DRAFT`, calculates totals per item (unitPrice × qty + tax - discount)
- `approvePurchaseOrder` → `DRAFT/PENDING` → `APPROVED`
- `cancelPurchaseOrder` → throws if any `item.receivedQuantity > 0`
- `updatePurchaseOrder` → only allowed in `DRAFT` or `PENDING`; deletes and recreates items

### 2. Goods Receive Note (GRN)
**File:** `src/modules/goods-receive/goods-receive.service.ts`  
**Rule: GRN is the ONLY way stock enters the system from a supplier.**

- Requires linked PO to have status `APPROVED` (if `purchaseOrderId` provided)
- Creates GRN with status `RECEIVED` immediately (no draft phase)
- For each accepted item → `stockLedgerService.adjustStock(tx, { quantityChanged: +quantityAccepted, movementType: PURCHASE })`
- If PO linked → updates `PurchaseOrderItem.receivedQuantity += quantityAccepted`
- Updates `Supplier.totalPurchaseAmount` and `Supplier.dueAmount` (with `SELECT FOR UPDATE` lock)

### 3. Stock Transfer
**File:** `src/modules/stock-transfer/stock-transfer.service.ts`

Status lifecycle and when stock moves:
```
DRAFT → (no stock change)
PENDING → (no stock change)
APPROVED → source stock DECREASES: adjustStock(-qty, TRANSFER_OUT, sourceLocationId)
IN_TRANSIT → (no stock change, just status update)
RECEIVED → dest stock INCREASES: adjustStock(+receivedQty, TRANSFER_IN, destinationLocationId)
CANCELLED (from APPROVED/IN_TRANSIT) → source stock RESTORED: adjustStock(+qty, TRANSFER_IN, sourceLocationId)
CANCELLED (from DRAFT/PENDING) → no stock change needed
```

### 4. Stock Adjustment (Manual)
**File:** `src/modules/stock-adjustment/stock-adjustment.service.ts`

- Creates `ADJ-...` number, status immediately `COMPLETED`
- For each item: `movementType = quantityChanged > 0 ? ADJUSTMENT_IN : ADJUSTMENT_OUT`
- Calls `adjustStock()`, captures `previousQuantity` snapshot before and `currentQuantity` after
- Creates `StockAdjustmentItem` with `{ previousQuantity, quantityChanged, currentQuantity }`
- After creating the adjustment doc, does `updateMany` on `StockMovement` to link `referenceId` → `adjustment.id`

### 5. Damage / Write-off
**File:** `src/modules/damage/damage.service.ts`

- Status immediately `COMPLETED`
- `movementType`: `EXPIRED` if `item.reason === DamageReason.EXPIRED`, else `DAMAGE`
- Calls `adjustStock(tx, { quantityChanged: -item.quantity })`

### 6. Supplier Return
**File:** `src/modules/supplier-return/supplier-return.service.ts`

- Status immediately `COMPLETED`
- `adjustStock(tx, { quantityChanged: -item.quantity, movementType: SUPPLIER_RETURN })`
- Reduces `Supplier.totalPurchaseAmount` and `Supplier.dueAmount` by `totalAmount` (with `SELECT FOR UPDATE` lock)

### 7. Customer Return
**File:** `src/modules/customer-return/customer-return.service.ts`

- Status immediately `REFUNDED`
- Can reference `posOrderId` or `orderId` (both optional)
- `adjustStock(tx, { quantityChanged: +item.quantity, movementType: CUSTOMER_RETURN })`

### 8. POS Sale
**File:** `src/modules/pos/pos.service.ts`

- Calls `stockLedgerService.adjustStock(tx, { quantityChanged: -qty, movementType: SALE })` per line item
- Uses `storeId` → resolves linked `Location` for stock lookup
- Product display filter: only shows products with `stocks.some({ quantity > 0, location.stores.id = storeId })`

### 9. Online Order (KNOWN GAP)
**File:** `src/modules/order/order.service.ts`

- Currently only checks and decrements `Product.stock` (denormalized field on Product model)
- Does NOT call `stockLedgerService` → no `StockMovement` record, no location-level stock change
- This is a known inconsistency. When fixing: add `adjustStock()` call the same way POS does it

---

## Stock Query & Reports
**File:** `src/modules/stock/stock.service.ts`

- `getStockByProductAndLocation(productId, locationId)` → if no record, returns virtual `{ quantity: 0, reservedQuantity: 0 }` (Odoo-style lazy creation)
- `getLowStockAlerts()` → loads all stocks, filters in-memory against `LowStockConfig`. Priority: location-specific config > global config > default threshold of 10
- `getReorderSuggestions()` → same as alerts but formatted as suggested reorder quantities
- `getCurrentStockReport()` → summary + per-location breakdown with cost valuation (`Stock.quantity × Product.Baseprice`) and retail valuation (`× Product.finalPrice`)
- `getMovementReport()` → paginated `StockMovement` query with date/location/type filters
- `getTransferReport()` → paginated `StockTransfer` query
- `getDamageReport()` → paginated `Damage` query, calculates `totalLossValuation` per damage doc

---

## Module File Structure Convention

Each inventory sub-module follows this pattern:
```
src/modules/<module-name>/
  <module-name>.controller.ts   // thin: extracts req params, calls service, calls sendResponse
  <module-name>.service.ts      // business logic + transactions
  <module-name>.repository.ts   // Prisma queries (findMany, findById, count, create, update, delete)
  <module-name>.route.ts        // Router with authenticate + authorizeRoles(ADMIN, SUPER_ADMIN)
  <module-name>.types.ts        // (optional) input/output TypeScript types
```

---

## Authorization

All inventory routes require:
```ts
authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN)
```
`Role.CUSTOMER` never has access to inventory endpoints.

---

## Critical Rules — Always Follow

1. **Never update `stocks.quantity` directly** — always use `stockLedgerService.adjustStock()` inside a transaction
2. **Always use `prisma.$transaction()`** for any operation that touches multiple tables
3. **Always use `SELECT ... FOR UPDATE`** on rows being modified concurrently (stock, supplier balance)
4. **Document numbers are generated before the transaction** using `count()` + date prefix
5. **Soft delete everywhere** — use `deletedAt: null` in all `where` clauses; never hard delete inventory records
6. **Location must exist and not be soft-deleted** before creating any inventory document
7. **Cannot delete a Location** if `stocks.quantity > 0` exists for that location
8. **PO approval does not move stock** — only GRN moves stock
9. **Transfer cancellation reverses stock** only if status was `APPROVED` or `IN_TRANSIT`
10. **`Product.stock`** (on the Product model) is a denormalized field — it should eventually be kept in sync but the authoritative stock source is the `stocks` table per location
