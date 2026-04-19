POST /api/pos/bill/:orderId/payments/add

Request body:
{
"payments": [
{
"amount": 300,
"paymentMethod": "BANKCARD",
"bankId": "bank-uuid"
},
{
"amount": 200,
"paymentMethod": "CASH"
}
]
}

Response:

202 Accepted
returns queue summary: orderId, queuedPayments, current paymentStatus, finalAmount, totalPaid, incomingAmount, dueAmount
Validation completed

Type checks passed
Full server build passed successfully
