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
	- `searchTerm` string, optional

### Request

No JSON body is required.

Example:

```http
GET /api/pos/get-products?searchTerm=shirt
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

## 2. Create POS Bill

- **Method:** `POST`
- **URL:** `/api/pos/bill/create`
- **Auth:** Required
- **Auth Source:** HTTP-only `accessToken` cookie

### Request

The endpoint accepts multiple JSON body shapes. Use one of the supported formats below.

#### Format A: `products` array

```json
{
	"storeId": "store_1",
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
	]
}
```

#### Format A1: same product with different variation quantities

```json
{
	"storeId": "store_1",
	"products": [
		{
			"productId": "prod_A",
			"variationIds": ["var_red", "var_blue"],
			"variationQuantities": [3, 5]
		}
	]
}
```

In this example:
- `var_red` is ordered with quantity `3`.
- `var_blue` is ordered with quantity `5`.
- The API normalizes this into separate internal lines and persists them correctly in the order items.

#### Format B: single product fields

```json
{
	"storeId": "store_1",
	"productId": "prod_1",
	"quantity": 2,
	"variationId": "var_1"
}
```

#### Format C: multiple products with parallel arrays

```json
{
	"storeId": "store_1",
	"productIds": ["prod_1", "prod_2"],
	"quantities": [2, 1],
	"variationIds": ["var_1", "var_3"]
}
```

#### Format D: multiple products with per-line variation quantities

```json
{
	"storeId": "store_1",
	"productIds": ["prod_1"],
	"variationIds": ["var_1", "var_2"],
	"variationQuantities": [1, 2]
}
```

### Request Field Rules

- `storeId` is optional.
- One of these must be provided:
	- `products`
	- `productIds`
	- `productId`
- `quantity` or `quantities` must be positive integers when required by the format.
- `variationIds` can be used with either a single product or multiple products.
- If a line includes `variationIds`, it must also include `variationQuantities` with the same number of entries.
- `variationQuantities` must match the number of `variationIds` when used as a per-variation payload.
- If no variation is provided for a line, use only `quantity` for that product line.
- If `storeId` is omitted, the bill is still created, but store-level stock validation and store stock decrement are skipped.

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
- The returned cashier name is pulled from the authenticated user's admin profile when available.
- `cashier.id` and `cashier.email` come from the authenticated `User` record.
- `cashier.name` comes from the related `Admin` record (`admins[0].name`) and can be `null` when no admin profile exists.

---

## 3. Update POS Bill

- **Method:** `PATCH`
- **URL:** `/api/pos/bill/:orderId/update`
- **Auth:** Required
- **Auth Source:** HTTP-only `accessToken` cookie

### Purpose

Use this endpoint to update an existing POS bill by replacing product lines. It supports:

- adding new products
- removing existing products
- changing quantities
- changing selected variations

### Request

Path param:

- `orderId` (required): POS order id to update

Body format is the same as create bill formats (`products`, `productIds`, or single product fields).

Example:

```json
{
	"storeId": "store_1",
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
- recalculates and persists `baseAmount` and `finalAmount`

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
		"finalAmount": 148,
		"createdAt": "2026-04-18T10:20:00.000Z",
		"updatedAt": "2026-04-18T10:40:00.000Z",
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

---

## 4. Delete POS Bill (Soft Delete)

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
