# Customer Authentication & Registration Workflow

This document outlines the API flow for customer registration and login.

## 1. Customer Registration

**Endpoint:** `POST /api/auth/register`  
**Description:** Registers a new customer and sends an OTP to their email.

### Request Body
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword123"
}
```

### Response (Success - 201 Created)
```json
{
  "success": true,
  "message": "Registration successful. Please verify your OTP.",
  "data": {
    "userId": "uuid-string",
    "email": "john@example.com",
    "otpExpiry": "2026-03-14T12:00:00.000Z"
  }
}
```

### Edge Cases
- **Email already exists & verified:** Returns `409 Conflict`.
- **Email exists & NOT verified:** Automatically deletes the old record and creates a new one, sending a fresh OTP.

---

## 2. OTP Verification

**Endpoint:** `POST /api/auth/otp/verify`  
**Description:** Verifies the OTP sent during registration. This MUST be completed before login is allowed. **Success sets HTTP-Only cookies for tokens.**

### Request Body
```json
{
  "userId": "uuid-string",
  "code": "123456"
}
```

### Response (Success - 200 OK)
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "id": "uuid-string",
    "email": "john@example.com",
    "role": "USER",
    "name": "John Doe",
    "phone": null,
    "image": null,
    "status": "ACTIVE"
  }
}
```

---

## 3. Customer Login

**Endpoint:** `POST /api/auth/login`  
**Description:** Authenticates the user. **Success sets HTTP-Only cookies for tokens. Tokens are NOT returned in the body.**

### Request Body
```json
{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

### Response (Success - 200 OK)
```json
{
  "success": true,
  "message": "Logged in successfully",
  "data": {
    "id": "uuid-string",
    "email": "john@example.com",
    "role": "USER",
    "name": "John Doe",
    "phone": null,
    "image": null,
    "status": "ACTIVE"
  }
}
```


### Errors
- **Not Verified:** If the user hasn't verified their OTP, returns `403 Forbidden` with message `User is not verified yet`.

---

## 4. Resend OTP (If needed)

**Endpoint:** `POST /api/auth/otp/send`  
**Description:** Resends a registration OTP if the previous one expired.

### Request Body
```json
{
  "userId": "uuid-string"
}
```

### Response (Success - 200 OK)
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "otpExpiry": "2026-03-14T12:05:00.000Z"
  }
}
```

---

## 5. Password Reset Workflow

Since passwords are stored in the `User` model, this flow works for both Admins and Customers.

### Step 1: Send Forget Password OTP
**Endpoint:** `POST /api/auth/forgot-password/send-otp`  
**Request Body:**
```json
{
  "email": "john@example.com"
}
```

### Step 2: Verify OTP
**Endpoint:** `POST /api/auth/forgot-password/verify-otp`  
**Request Body:**
```json
{
  "userId": "uuid-from-step-1",
  "code": "123456"
}
```

### Step 3: Reset Password
**Endpoint:** `POST /api/auth/forgot-password/reset`  
**Request Body:**
```json
{
  "userId": "uuid-from-step-1",
  "code": "123456",
  "newPassword": "newSecurePassword123"
}
```

GET /api/product/get-all?page=1&limit=20&searchTerm=phone&category=electronics&smartphones&brand=apple&samsung&minPrice=500&maxPrice=1500

