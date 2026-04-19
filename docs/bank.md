## GET /api/banks/get-all

### Query
```json
{
	"searchTerm": "dutch"
}
```

### Response Body
```json
{
	"success": true,
	"message": "Banks fetched",
	"data": [
		{
			"id": "bank-id",
			"bankName": "Dutch-Bangla Bank",
			"branch": "Dhanmondi",
			"accountNumber": "1234567890",
			"createdAt": "2026-04-19T00:00:00.000Z",
			"updatedAt": "2026-04-19T00:00:00.000Z",
			"deletedAt": null
		}
	],
	"errors": [],
	"meta": {}
}
```

## POST /api/banks/create

### Request Body
```json
{
	"bankName": "Dutch-Bangla Bank",
	"branch": "Dhanmondi",
	"accountNumber": "1234567890"
}
```

### Response Body
```json
{
	"success": true,
	"message": "Bank created",
	"data": {
		"id": "bank-id",
		"bankName": "Dutch-Bangla Bank",
		"branch": "Dhanmondi",
		"accountNumber": "1234567890",
		"createdAt": "2026-04-19T00:00:00.000Z",
		"updatedAt": "2026-04-19T00:00:00.000Z",
		"deletedAt": null
	},
	"errors": [],
	"meta": {}
}
```

## PATCH /api/banks/update/:id

### Request Body
```json
{
	"bankName": "Dutch-Bangla Bank",
	"branch": "Gulshan",
	"accountNumber": "1234567890"
}
```

### Response Body
```json
{
	"success": true,
	"message": "Bank updated",
	"data": {
		"id": "bank-id",
		"bankName": "Dutch-Bangla Bank",
		"branch": "Gulshan",
		"accountNumber": "1234567890",
		"createdAt": "2026-04-19T00:00:00.000Z",
		"updatedAt": "2026-04-19T00:00:00.000Z",
		"deletedAt": null
	},
	"errors": [],
	"meta": {}
}
```

## DELETE /api/banks/delete/:id

### Response Body
```json
{
	"success": true,
	"message": "Bank deleted",
	"data": null,
	"errors": [],
	"meta": {}
}
```
