# Wishlist API Documentation

The Wishlist and Cart share the same database tables (`Wishlist` and `WishlistItem`). The distinction is made using the `addedToCart` boolean field. Wishlist items are those where `addedToCart` is `false`.

**Base URL:** `/api/v1/wishlists`

---

## 1. Get All Wishlist Items (Paginated)
Get a list of items currently in the wishlist with pagination.

- **URL:** `/get-all-paginated`
- **Method:** `GET`
- **Auth Required:** Yes (Role: `CUSTOMER`)
- **Query Params:**
    - `page` (optional, default: 1)
    - `limit` (optional, default: 10)

### Response
```json
{
    "success": true,
    "statusCode": 200,
    "message": "Wishlist items fetched",
    "data": [
        {
            "id": "uuid",
            "wishlistId": "uuid",
            "productId": "uuid",
            "addedToCart": false,
            "product": { ...productDetails }
        }
    ],
    "meta": {
        "page": 1,
        "limit": 10,
        "total": 5,
        "totalPages": 1,
        "timestamp": "..."
    }
}
```

---

## 2. Get All Wishlist Items (No Pagination)
Get all items currently in the wishlist.

- **URL:** `/get-all`
- **Method:** `GET`
- **Auth Required:** Yes (Role: `CUSTOMER`)

### Response
```json
{
    "success": true,
    "statusCode": 200,
    "message": "All wishlist items fetched",
    "data": [ ...items ]
}
```

---

## 3. Get Single Wishlist Item
Check if a specific product is in the wishlist.

- **URL:** `/get/:productId`
- **Method:** `GET`
- **Auth Required:** Yes (Role: `CUSTOMER`)

---

## 4. Upsert Wishlist (Add or Update)
Add single or multiple items to the wishlist or update existing ones.

- **URL:** `/update/:id` (Note: `:id` can be product ID, or use body)
- **Method:** `PATCH`
- **Auth Required:** Yes (Role: `CUSTOMER`)
- **Body:**
```json
{
    "productIds": ["uuid1", "uuid2"],
    "addedToCart": false
}
```

---

## 5. Transfer to Cart
Move items from the wishlist to the cart by setting `addedToCart` to `true`.

- **Alt URL:** `/transfer-to-cart` (use with body for multiple IDs)
- **Method:** `PATCH`
- **Auth Required:** Yes (Role: `CUSTOMER`)
- **Headers:** 
    - `Authorization: Bearer <token>`
    - `Content-Type: application/json`

### Request Body (Optional if using :id in URL)
Use this format in Insomnia/Postman to transfer multiple products at once:
```json
{
    "productIds": ["uuid1", "uuid2"]
}
```
*Note: If both are provided, the IDs in the request body take precedence.*

### Response
```json
{
    "success": true,
    "statusCode": 200,
    "message": "Wishlist items transferred to cart",
    "data": [
        {
            "id": "uuid",
            "wishlistId": "uuid",
            "productId": "uuid",
            "addedToCart": true,
            "product": { ...productDetails }
        }
    ]
}
```

---

## 6. Delete Wishlist Item(s)
Remove items entirely from the database record for this wishlist.

- **URL:** `/delete-batch` or `/delete/:productId`
- **Method:** `DELETE`
- **Auth Required:** Yes (Role: `CUSTOMER`)
- **Body (for batch):**
```json
{
    "productIds": ["uuid1", "uuid2"]
}
```
