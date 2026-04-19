# POS Module Documentation

All POS routes are mounted under `/api/pos`.

## Response Envelope

All endpoints use the shared API response shape:

```json
{
	"success": true,
	"message": "string",
	"data": {},
	"errors": [],
	"meta": {}
}
```

For error responses, `success` becomes `false`, `data` is `null`, and `meta` includes a `timestamp`.

> Note: the global error middleware currently returns `400` for all `AppError` responses, even when the error message is `401` or `404` in the code.

---

## 1. Get Products

- **Method:** `GET`
- **URL:** `/api/pos/get-products`
- **Auth:** Public
- **Query Params:**
	- `storeId` string, optional
	- `searchTerm` string, optional

### Store Filter Behavior

- When `storeId` is provided, products are returned only if they have stock entries in that store with `orderStatus = DELIVERED` and available quantity.
- `searchTerm` still applies on top of the store filter.

### Request

No JSON body is required.

Example:

```http
GET /api/pos/get-products?storeId=store_1&searchTerm=shirt
```

### Success Response

Status: `200`

```json
{
	"success": true,
	"message": "Products retrieved",
	"data": [
		{
			"id": "prod_1",
			"name": "Classic T-Shirt",
			"slug": "classic-t-shirt",
			"shortDescription": "Cotton crew neck t-shirt",
			"description": "A premium everyday t-shirt.",
			"posPrice": 18.5,
			"Baseprice": 20,
			"finalPrice": 18.5,
			"discountType": "PERCENTAGE_DISCOUNT",
			"discountValue": 7.5,
			"stock": 120,
			"avgRating": 4.6,
			"totalRatings": 18,
			"totalReviews": 22,
			"weight": 0.2,
			"length": 28,
			"width": 20,
			"height": 2,
			"volume": 1120,
			"sku": "TSHIRT-001",
			"discountStartDate": "2026-04-01T00:00:00.000Z",
			"discountEndDate": "2026-05-01T00:00:00.000Z",
			"brandId": "brand_1",
			"image": "https://cdn.example.com/products/tshirt.jpg",
			"galleryImages": [
				"https://cdn.example.com/products/tshirt-1.jpg",
				"https://cdn.example.com/products/tshirt-2.jpg"
			],
			"status": "ACTIVE",
			"stockStatus": "IN_STOCK",
			"createdAt": "2026-04-18T10:00:00.000Z",
			"updatedAt": "2026-04-18T10:15:00.000Z",
			"deletedAt": null,
			"brand": "Acme",
			"categories": [
				"Apparel"
			],
			"tags": [
				"Featured"
			],
			"productVariations": [
				{
					"id": "var_1",
					"attributeValue": "M",
					"basePrice": 20,
					"finalPrice": 18.5
				}
			]
		}
	],
	"errors": [],
	"meta": {}
}
```

### Response Notes

- Returns up to `50` active products.
- Products are sorted by `createdAt` in descending order.
- `brand`, `categories`, and `tags` are represented as names only.
- `productVariations` return only `id`, `attributeValue`, `basePrice`, and `finalPrice`.

---

## 2. Get All Bills (Paginated)

- **Method:** `GET`
- **URL:** `/api/pos/bill/get-all-paginated`
- **Auth:** Required
- **Auth Source:** HTTP-only `accessToken` cookie
- **Query Params:**
	- `page` number, optional (default `1`)
	- `limit` number, optional (default `10`)

### Purpose

Returns paginated bill summaries only (processed data), not full bill details.

### Success Response

Status: `200`

```json
{
	"success": true,
	"message": "POS bills fetched",
	"data": [
		{
			"id": "pos_order_1",
			"invoiceNumber": "000123456789",
			"totalQuantity": 8,
			"totalAmount": 148,
			"createdAt": "2026-04-18T10:20:00.000Z",
			"processedBy": {
				"userId": "user_1",
				"adminName": "Cashier One"
			}
		}
	],
	"errors": [],
	"meta": {
		"page": 1,
		"limit": 10,
		"total": 24,
		"totalPages": 3
	}
}
```

### Field Notes

- `totalAmount` is derived from `PosOrder.finalAmount`.
- `totalQuantity` is the sum of active (`deletedAt: null`) order item quantities.
- `processedBy.userId` comes from `PosOrder.userId`.
- `processedBy.adminName` comes from the related admin profile (`User -> Admin`) and can be `null`.

---

## 3. Get One Bill

- **Method:** `GET`
- **URL:** `/api/pos/bill/:orderId`
- **Auth:** Required
- **Auth Source:** HTTP-only `accessToken` cookie

### Purpose

Fetch one printable POS bill record. This returns the full processed bill shape used for printing, matching the structure returned by `createBill`.

### Request

Path param:

- `orderId` (required): POS order id

No request body required.

### Success Response

Status: `200`

```json
{
	"success": true,
	"message": "POS bill fetched",
	"data": {
		"id": "pos_order_1",
		"invoiceNumber": "000123456789",
		"storeId": "store_1",
		"store": {
			"id": "store_1",
			"name": "Main Store",
			"address": "123 Market Street",
			"status": "ACTIVE",
			"createdAt": "2026-01-01T00:00:00.000Z",
			"updatedAt": "2026-04-18T10:20:00.000Z",
			"deletedAt": null
		},
		"cashier": {
			"id": "user_1",
			"email": "cashier@example.com",
			"name": "Cashier One"
		},
		"baseAmount": 40,
		"finalAmount": 37,
		"createdAt": "2026-04-18T10:20:00.000Z",
		"updatedAt": "2026-04-18T10:20:00.000Z",
		"items": [
			{
				"id": "pos_item_1",
				"productId": "prod_1",
				"productName": "Classic T-Shirt",
				"productImage": "https://cdn.example.com/products/tshirt.jpg",
				"productSku": "TSHIRT-001",
				"quantity": 2,
				"unitBasePrice": 20,
				"unitFinalPrice": 18.5,
				"lineBaseTotal": 40,
				"lineFinalTotal": 37,
				"discountType": "PERCENTAGE_DISCOUNT",
				"discountValue": 7.5,
				"variations": [
					{
						"id": "var_1",
						"attributeId": "attr_1",
						"attributeName": "Size",
						"attributeValue": "M"
					}
				]
			}
		],
		"summary": {
			"totalItems": 1,
			"totalQuantity": 2
		}
	},
	"errors": [],
	"meta": {}
}
```

### Notes

- This endpoint is intended for receipt printing / bill preview.
- The response shape matches the one returned after creating a bill.
- Access can be restricted to the bill owner by the service layer.

---

## 4. Create POS Bill

- **Method:** `POST`
- **URL:** `/api/pos/bill/create`
- **Auth:** Required
- **Auth Source:** HTTP-only `accessToken` cookie

### Request

The endpoint still accepts all previous product-line formats (`products`, `productIds`, or single `productId`) and now also accepts order-level discount and optional payment queue payload.

```json
{
	"storeId": "store_1",
	"discountType": "PERCENTAGE_DISCOUNT",
	"discountValue": 10,
	"products": [
		{
			"productId": "prod_1",
			"variationIds": ["var_1", "var_2"],
			"variationQuantities": [2, 1]
		},
		{
			"productId": "prod_2",
			"quantity": 1
		}
	],
	"payments": [
		{
			"amount": 300,
			"paymentMethod": "BANKCARD",
			"bankId": "bank_1"
		},
		{
			"amount": 50,
			"paymentMethod": "CASH"
		}
	]
}
```

### Request Field Rules

- `storeId` is optional.
- Product lines are required, using one of the supported shapes (`products`, `productIds`, or single-product fields).
- `discountType` is optional: `PERCENTAGE_DISCOUNT`, `FLAT_DISCOUNT`, or `NONE`.
- `discountValue` is used only for `PERCENTAGE_DISCOUNT` or `FLAT_DISCOUNT`.
- If `discountType` is `PERCENTAGE_DISCOUNT`, `discountValue` cannot exceed `100`.
- `payments` is optional and is processed asynchronously through queue.
- Payment rules:
	- If `paymentMethod` is `BANKCARD`, `bankId` is required.
	- If `paymentMethod` is not `BANKCARD`, `bankId` must not be provided.
- Overpayment is rejected (`existing + incoming` cannot exceed `finalAmount`).

### Success Response

Status: `201`

```json
{
	"success": true,
	"message": "POS bill created",
	"data": {
		"id": "pos_order_1",
		"invoiceNumber": "000123456789",
		"storeId": "store_1",
		"paymentStatus": "PENDING",
		"orderDiscountType": "PERCENTAGE_DISCOUNT",
		"orderDiscountValue": 10,
		"store": {
			"id": "store_1",
			"name": "Main Store",
			"address": "123 Market Street",
			"status": "ACTIVE",
			"createdAt": "2026-01-01T00:00:00.000Z",
			"updatedAt": "2026-04-18T10:20:00.000Z",
			"deletedAt": null
		},
		"cashier": {
			"id": "user_1",
			"email": "cashier@example.com",
			"name": "Cashier One"
		},
		"baseAmount": 40,
		"finalAmount": 33.3,
		"totalPaid": 0,
		"dueAmount": 33.3,
		"createdAt": "2026-04-18T10:20:00.000Z",
		"updatedAt": "2026-04-18T10:20:00.000Z",
		"payments": [],
		"items": [
			{
				"id": "pos_item_1",
				"productId": "prod_1",
				"productName": "Classic T-Shirt",
				"productImage": "https://cdn.example.com/products/tshirt.jpg",
				"productSku": "TSHIRT-001",
				"quantity": 2,
				"unitBasePrice": 20,
				"unitFinalPrice": 18.5,
				"lineBaseTotal": 40,
				"lineFinalTotal": 37,
				"discountType": "PERCENTAGE_DISCOUNT",
				"discountValue": 7.5,
				"variations": [
					{
						"id": "var_1",
						"attributeId": "attr_1",
						"attributeName": "Size",
						"attributeValue": "M"
					}
				]
			}
		],
		"summary": {
			"totalItems": 1,
			"totalQuantity": 2
		}
	},
	"errors": [],
	"meta": {}
}
```

### Error Responses

#### Missing access token cookie

Status: `400`

```json
{
	"success": false,
	"message": "Access token missing in cookies",
	"data": null,
	"errors": [
		{
			"message": "HTTP-only accessToken cookie is required for protected routes",
			"code": "TOKEN_MISSING"
		}
	],
	"meta": {
		"timestamp": "2026-04-18T10:20:00.000Z"
	}
}
```

#### Example validation error

Status: `400`

```json
{
	"success": false,
	"message": "Store not found",
	"data": null,
	"errors": [
		{
			"field": "storeId",
			"message": "No active store found with this id",
			"code": "STORE_NOT_FOUND"
		}
	],
	"meta": {
		"timestamp": "2026-04-18T10:20:00.000Z"
	}
}
```

#### Example stock or lookup error

Status: `400`

```json
{
	"success": false,
	"message": "Not enough store stock",
	"data": null,
	"errors": [
		{
			"field": "products",
			"message": "Insufficient store stock for product prod_1",
			"code": "INSUFFICIENT_STORE_STOCK"
		}
	],
	"meta": {
		"timestamp": "2026-04-18T10:20:00.000Z"
	}
}
```

### Response Notes

- Invoice numbers are generated server-side.
- Product and store stock are checked before the bill is created.
- Product variation pricing is used when variations are provided.
- Order-level discount is applied on subtotal (`lineFinalTotal` sum) to calculate order `finalAmount`.
- `payments` sent in create request are queued and handled in background; they are not synchronously written inside the create transaction.
- The returned cashier name is pulled from the authenticated user's admin profile when available.
- `cashier.id` and `cashier.email` come from the authenticated `User` record.
- `cashier.name` comes from the related `Admin` record (`admins[0].name`) and can be `null` when no admin profile exists.

---

## 5. Update POS Bill

- **Method:** `PATCH`
- **URL:** `/api/pos/bill/:orderId/update`
- **Auth:** Required
- **Auth Source:** HTTP-only `accessToken` cookie

### Purpose

Use this endpoint to replace product lines and optionally update order-level discount or enqueue new payments. It supports:

- adding new products
- removing existing products
- changing quantities
- changing selected variations
- changing order-level discount (`discountType` + `discountValue`)
- queueing additional payment records

### Request

Path param:

- `orderId` (required): POS order id to update

Body format is the same as create bill formats with optional `discountType`, `discountValue`, and `payments`.

Example:

```json
{
	"storeId": "store_1",
	"discountType": "FLAT_DISCOUNT",
	"discountValue": 20,
	"products": [
		{
			"productId": "prod_1",
			"variationIds": ["var_1", "var_2"],
			"variationQuantities": [3, 5]
		},
		{
			"productId": "prod_2",
			"quantity": 2
		}
	],
	"payments": [
		{
			"amount": 200,
			"paymentMethod": "BANKCARD",
			"bankId": "bank_1"
		}
	]
}
```

### Update Safety Guarantees

The update runs in a single DB transaction and does all of the following safely:

- restores previously decremented product stock from old bill items
- restores previously decremented store stock (when original bill had a store)
- validates and applies new requested items/variations
- decrements product stock again based on updated items
- decrements store stock again (when updated bill has a store)
- deletes old order items/variations and inserts the updated items
- recalculates and persists `baseAmount`, `finalAmount`, `orderDiscountType`, and `orderDiscountValue`
- validates overpayment against existing paid amount and newly queued payments

### Success Response

Status: `200`

```json
{
	"success": true,
	"message": "POS bill updated",
	"data": {
		"id": "pos_order_1",
		"invoiceNumber": "000123456789",
		"storeId": "store_1",
		"paymentStatus": "DUE",
		"orderDiscountType": "FLAT_DISCOUNT",
		"orderDiscountValue": 20,
		"store": {
			"id": "store_1",
			"name": "Main Store",
			"address": "123 Market Street",
			"status": "ACTIVE",
			"createdAt": "2026-01-01T00:00:00.000Z",
			"updatedAt": "2026-04-18T10:20:00.000Z",
			"deletedAt": null
		},
		"cashier": {
			"id": "user_1",
			"email": "cashier@example.com",
			"name": "Cashier One"
		},
		"baseAmount": 160,
		"finalAmount": 128,
		"totalPaid": 40,
		"dueAmount": 88,
		"createdAt": "2026-04-18T10:20:00.000Z",
		"updatedAt": "2026-04-18T10:40:00.000Z",
		"payments": [
			{
				"id": "payment_1",
				"amount": 40,
				"paymentMethod": "CASH",
				"bankId": null,
				"bank": null,
				"createdAt": "2026-04-18T10:30:00.000Z"
			}
		],
		"items": [
			{
				"id": "pos_item_2",
				"productId": "prod_1",
				"productName": "Classic T-Shirt",
				"productImage": "https://cdn.example.com/products/tshirt.jpg",
				"productSku": "TSHIRT-001",
				"quantity": 8,
				"unitBasePrice": 20,
				"unitFinalPrice": 18.5,
				"lineBaseTotal": 160,
				"lineFinalTotal": 148,
				"discountType": null,
				"discountValue": null,
				"variations": [
					{
						"id": "var_1",
						"attributeId": "attr_1",
						"attributeName": "Size",
						"attributeValue": "M"
					}
				]
			}
		],
		"summary": {
			"totalItems": 1,
			"totalQuantity": 8
		}
	},
	"errors": [],
	"meta": {}
}
```

### Error Cases

- `POS_ORDER_NOT_FOUND`: order id does not exist or is deleted
- `BILL_UPDATE_FORBIDDEN`: authenticated user is not owner of the bill
- `PRODUCT_NOT_FOUND`, `VARIATION_NOT_FOUND`, `VARIATION_PRODUCT_MISMATCH`
- `INSUFFICIENT_PRODUCT_STOCK`, `INSUFFICIENT_STORE_STOCK`
- `INVALID_DISCOUNT_TYPE`, `INVALID_DISCOUNT_VALUE`
- `BANK_ID_REQUIRED` when method is `BANKCARD` without bank id
- `BANK_ID_NOT_ALLOWED` when method is not `BANKCARD` but bank id is sent
- `OVERPAYMENT_NOT_ALLOWED` when existing paid + incoming payments exceed final amount

---

## 6. Delete POS Bill (Soft Delete)

- **Method:** `DELETE`
- **URL:** `/api/pos/bill/:orderId/delete`
- **Auth:** Required
- **Auth Source:** HTTP-only `accessToken` cookie

### Purpose

Soft-delete a POS bill and its related order lines using `deletedAt` fields, instead of permanently deleting records.

### Behavior

This endpoint runs in one DB transaction and:

- restores product stock from the bill items back to products
- restores store stock summaries/buckets when bill has a `storeId`
- sets `deletedAt` on `PosOrderItemVariation`
- sets `deletedAt` on `PosOrderItem`
- sets `deletedAt` on `PosOrder`

### Request

Path param:

- `orderId` (required): POS order id to delete

No request body required.

### Success Response

Status: `200`

```json
{
	"success": true,
	"message": "POS bill deleted",
	"data": {
		"id": "pos_order_1",
		"invoiceNumber": "000123456789",
		"deletedAt": "2026-04-18T11:10:00.000Z"
	},
	"errors": [],
	"meta": {}
}
```

### Error Cases

- `POS_ORDER_NOT_FOUND`: order id does not exist or is already soft-deleted
- `BILL_DELETE_FORBIDDEN`: authenticated user is not owner of the bill
