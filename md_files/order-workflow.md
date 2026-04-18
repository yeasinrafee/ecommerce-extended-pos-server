
# Create Order — Request Body

Example JSON body:

```json
{
	"customerName": "Jane Doe",
	"customerEmail": "jane@example.com",
	"customerPhone": "+1234567890",
	"address": {
		"zoneId": "zone_abc123",
		"postCode": "12345",
		"streetAddress": "123 Main St, Apt 4",
		"flatNumber": "4B"
	},
	"promoId": "promo_abc123",
	"products": [
		{
			"productId": "prod_1",
			"quantity": 2,
			"variationIds": ["var_1", "var_2"]
		},
		{
			"productId": "prod_2",
			"quantity": 1
		}
	]
}
```

Field reference:

- **customerName**: string — required
- **customerEmail**: string — optional
- **customerPhone**: string — optional
- **addressId**: string — optional (mutually exclusive with `address`). If provided, the address must belong to the authenticated customer.
- **address**: object — optional (required if `addressId` is not provided)
	- **zoneId**: string — required when using `address`
	- **postCode**: string — required when using `address`
	- **streetAddress**: string — required when using `address`
	- **flatNumber**: string — optional
- **promoId**: string — optional
- **products**: array — required (must contain at least one item)
	- **productId**: string — required
	- **quantity**: integer — required (must be > 0)
	- **variationIds**: array of strings — optional (one or multiple `ProductVariation` ids)

Notes:

- Either `addressId` or `address` must be provided.
- The authenticated user's id is taken from the session/token; do not include `userId` in the request body.
- Prices, discounts, tax, shipping, and final totals are computed server-side; clients should not send price fields for order items.
