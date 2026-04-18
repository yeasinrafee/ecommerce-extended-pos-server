# Review Module Documentation

This module handles **Blog Comments** and **Product Reviews**.

## General Rules
- **Public APIs:** All `GET` requests are public.
- **Protected APIs:** `POST`, `PATCH`, and `DELETE` requests require authentication and are restricted to users with the **Customer** (`Role.CUSTOMER`) role.
- **Replies:** If a `parentId` is provided, the entry is treated as a reply. Replies to product reviews do not require a `rating`.
- **Product Ratings:** Adding, updating, or deleting a top-level product review automatically recalculates the product's `avgRating`, `totalRatings`, and `totalReviews`.

---

## 1. Blog Comments

### Add a Comment / Reply
- **URL:** `POST /api/reviews/blog/comment`
- **Body:**
```json
{
  "blogId": "uuid",
  "content": "Your comment here",
  "parentId": "uuid (optional for replies)"
}
```

### Update a Comment
- **URL:** `PATCH /api/reviews/blog/comment/:commentId`
- **Body:**
```json
{
  "content": "Updated comment content"
}
```

### Delete a Comment
- **URL:** `DELETE /api/reviews/blog/comment/:commentId`

### Get Blog Comments
- **URL:** `GET /api/reviews/blog/:blogId/comments`
- **Description:** Returns a list of top-level comments with their nested replies.

---

## 2. Product Reviews

### Add a Review / Reply
- **URL:** `POST /api/reviews/product/review`
- **Body:**
```json
{
  "productId": "id",
  "content": "Your review here",
  "rating": 5, 
  "parentId": "uuid (optional for replies)"
}
```

### Update a Review
- **URL:** `PATCH /api/reviews/product/review/:reviewId`
- **Body:**
```json
{
  "content": "Updated review content",
  "rating": 4 
}
```

### Delete a Review
- **URL:** `DELETE /api/reviews/product/review/:reviewId`

### Get Product Reviews
- **URL:** `GET /api/reviews/product/:productId/reviews`
- **Description:** Returns a list of top-level reviews with their nested replies and the user information.

---

## 3. Integrated Responses in Single Get APIs

When fetching a single Blog or a single Product through their respective APIs, the comments and reviews are returned attached to the main data. They share an identical nested structure, containing user info and properly formatted parent-child (reply) structures.

### Fetch Single Blog (`GET /api/blogs/get/:id`)
The blog response will now include a `comments` array containing only top-level comments (where `parentId: null`). Each comment will have a nested `replies` array containing the children.
```json
{
  "success": true,
  "message": "Blog fetched successfully",
  "data": {
    "id": "blog-uuid",
    "title": "My Blog",
    "slug": "my-blog",
    "content": "...",
    "comments": [
      {
        "id": "comment-uuid-1",
        "parentId": null,
        "content": "This is a root comment",
        "userId": "user-uuid",
        "createdAt": "2026-03-14T00:00:00.000Z",
        "user": {
          "id": "user-uuid",
          "email": "customer@example.com",
          "customers": [{ "phone": "123456789" }],
          "admins": []
        },
        "replies": [
          {
            "id": "comment-uuid-2",
            "parentId": "comment-uuid-1",
            "content": "This is a reply to the root comment",
            "userId": "another-user-uuid",
            "createdAt": "2026-03-14T01:00:00.000Z",
            "user": {
               "id": "another-user-uuid",
               "email": "another@example.com",
               "customers": [{ "phone": "987654321" }],
               "admins": []
            }
          }
        ]
      }
    ]
  }
}
```

### Fetch Single Product (`GET /api/products/:id`)
The product response will now include a `productReviews` array structured exactly like the blog comments.
```json
{
  "success": true,
  "message": "Product fetched successfully",
  "data": {
    "id": "product-cuid",
    "name": "My Product",
    "slug": "my-product",
    "avgRating": 4.5,
    "totalRatings": 2,
    "totalReviews": 3,
    "productReviews": [
      {
        "id": "review-uuid-1",
        "parentId": null,
        "rating": 5,
        "content": "Great product!",
        "userId": "user-uuid",
        "createdAt": "2026-03-14T00:00:00.000Z",
        "user": {
          "id": "user-uuid",
          "email": "customer@example.com",
          "customers": [{ "phone": "123456789" }],
          "admins": []
        },
        "replies": [
          {
            "id": "reply-uuid-1",
            "parentId": "review-uuid-1",
            "rating": null,
            "content": "I agree!",
            "userId": "admin-uuid",
            "createdAt": "2026-03-14T01:00:00.000Z",
            "user": {
               "id": "admin-uuid",
               "email": "admin@example.com",
               "customers": [],
               "admins": [{ "name": "Admin John", "image": "url.jpg" }]
            }
          }
        ]
      }
    ]
  }
}
```
