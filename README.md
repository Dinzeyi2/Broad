# HoldBack MVP Backend

Railway-ready Node.js backend for a fintech MVP that demonstrates detecting gas station authorization holds, issuing a mock balance restoration advance, and collecting repayment after the hold is released.

> This is demo software only. It does not connect to real banks, move real money, or make lending decisions.

## Features

- Health check endpoint for Railway deployments.
- Demo dashboard with a fake user, connected demo account, pending Shell gas hold, transactions, advances, and ledger entries.
- Mock bank transaction webhook that simulates how a bank/Plaid-style provider would send pending and settled transaction updates.
- Gas-hold detection for pending gas-station authorizations above $50.
- Mock advance creation for eligible pending gas holds.
- Mock repayment flow that is triggered when a later settled-transaction webhook arrives.
- Waitlist signup endpoint for demand validation.

## Local development

```bash
npm run dev
```

The API starts on `http://localhost:3000` by default. Railway will inject `PORT` automatically.

## Scripts

```bash
npm start
npm test
```

## API

### `GET /health`

Returns service health.

### `GET /api/demo/dashboard`

Returns the fake demo user, transactions, and advances for the frontend MVP.

### `GET /api/accounts`

Lists connected mock accounts.

### `GET /api/transactions`

Lists mock transactions.

### `GET /api/transactions/:transactionId`

Returns one mock transaction.

### `POST /api/advances`

Creates a mock advance for an eligible gas hold.

```json
{
  "transactionId": "txn_shell_hold_001",
  "feeCents": 300
}
```

### `GET /api/advances`

Lists mock advances.

### `GET /api/ledger`

Lists mock money-movement ledger entries for advance disbursements and repayment collections.

### `POST /api/advances/:advanceId/repay`

Manually simulates repayment collection. In the more realistic flow, repayment is also collected automatically when the bank webhook reports the original transaction as settled.


### `POST /api/bank/webhooks/transactions`

Simulates the real-life provider callback the app would receive from a bank data partner. A pending gas authorization creates or updates a transaction and marks it eligible for an advance. A later settled update marks the hold released and automatically collects repayment for any active advance.

Pending hold example:

```json
{
  "providerTransactionId": "bank_txn_new_shell_123",
  "merchant": "Shell",
  "category": "gas_station",
  "status": "pending",
  "authorizedAmountCents": 7500,
  "estimatedFinalAmountCents": 1000
}
```

Settlement example using the same `providerTransactionId`:

```json
{
  "providerTransactionId": "bank_txn_new_shell_123",
  "merchant": "Shell",
  "category": "gas_station",
  "status": "settled",
  "authorizedAmountCents": 7500,
  "settledAmountCents": 1000
}
```

### `POST /api/waitlist`

Stores a waitlist signup in memory.

```json
{
  "email": "driver@example.com",
  "phone": "+15555555555",
  "painPoint": "A gas hold made my card decline later that day."
}
```

## Railway deployment

1. Create a new Railway project from this repository.
2. Railway detects the Node app automatically.
3. Use `npm start` as the start command if Railway asks.
4. Optional environment variables:
   - `PORT`: injected by Railway.
   - `CORS_ORIGIN`: set to your frontend URL in production.


## Real-world architecture notes

This MVP now models the real production flow, but it is still not a real money-moving fintech system. In production you would need:

1. A bank data provider such as Plaid, MX, Finicity, Teller, or a direct bank/card-issuer partner to connect accounts and send transaction webhooks.
2. A ledger and banking/money-movement partner to send the temporary credit and later debit repayment plus fees.
3. KYC, risk checks, user authorization, fee disclosures, compliance review, and repayment failure handling before launching with real users.
4. Persistent storage such as Postgres instead of this in-memory demo store.

The backend flow is: provider webhook arrives for a pending gas hold → app detects eligible hold → user accepts advance → ledger records disbursement → provider webhook later reports settlement/release → app records repayment principal plus fee.
