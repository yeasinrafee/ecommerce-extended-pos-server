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

- `storeId` is required.
- One of these must be provided:
	- `products`
	- `productIds`
	- `productId`
- `quantity` or `quantities` must be positive integers when required by the format.
- `variationIds` can be used with either a single product or multiple products.
- If a line includes `variationIds`, it must also include `variationQuantities` with the same number of entries.
- `variationQuantities` must match the number of `variationIds` when used as a per-variation payload.
- If no variation is provided for a line, use only `quantity` for that product line.

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
	"message": "Invalid store id",
	"data": null,
	"errors": [
		{
			"field": "storeId",
			"message": "storeId is required",
			"code": "INVALID_STORE_ID"
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
