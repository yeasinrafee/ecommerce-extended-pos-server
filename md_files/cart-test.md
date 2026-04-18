# Cart API Documentation

The Cart module uses the shared `Wishlist` and `WishlistItem` tables. Cart items are those where the `addedToCart` boolean field is set to `true`.

**Base URL:** `/api/v1/carts`

---

## 1. Get All Cart Items
Retrieves all products currently in the customer's cart.

- **URL:** `/get-all`
- **Method:** `GET`
- **Authorization:** Bearer Token (Role: `CUSTOMER`)

### Response Example:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Cart items fetched",
  "data": [
    {
      "id": "uuid-item-1",
      "wishlistId": "uuid-wishlist",
      "productId": "uuid-product-1",
      "addedToCart": true,
      "createdAt": "...",
      "updatedAt": "...",
      "product": {
        "id": "uuid-product-1",
        "name": "Cool T-Shirt",
        "price": 25.99,
        "image": "..."
      }
    }
  ]
}
```

---

## 2. Add to Cart (Direct)
Adds single or multiple items directly to the cart. Uses Prisma transactions for robustness.

- **URL:** `/add`
- **Method:** `POST`
- **Authorization:** Bearer Token (Role: `CUSTOMER`)

### Request Body Options:
**Single Item:**
```json
{
  "productId": "uuid-product-alpha"
}
```

**Multiple Items:**
```json
{
  "productIds": ["uuid-product-1", "uuid-product-2"]
}
```

### Success Response:
Returns the newly created/updated cart items.

---

## 3. Update Cart Items (Robust Patch)
Updates the `addedToCart` status for one or multiple items. Use this to toggle between wishlist and cart.

- **URL:** `/update-batch`
- **Method:** `PATCH`
- **Authorization:** Bearer Token (Role: `CUSTOMER`)

### Request Body:
```json
{
  "productIds": ["uuid-product-1", "uuid-product-2"],
  "addedToCart": true
}
```

### Success Response:
`200 OK` with the updated item records.

---

## 4. Remove from Cart
Removes items from the cart by setting `addedToCart` to `false`.

- **URL:** `/remove-batch`
- **Method:** `DELETE`
- **Authorization:** Bearer Token (Role: `CUSTOMER`)

### Request Body:
```json
{
  "productIds": ["uuid-product-1"]
}
```

### Success Response:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Items removed from cart",
  "data": null
}
```
