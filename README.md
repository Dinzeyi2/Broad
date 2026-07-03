# HoldBack MVP Backend

Railway-ready Node.js backend for a fintech MVP that demonstrates detecting gas station authorization holds, issuing a mock balance restoration advance, and collecting repayment after the hold is released.

> This is demo software only. It does not connect to real banks, move real money, or make lending decisions.

## Features

- Health check endpoint for Railway deployments.
- Demo dashboard with a fake user, pending Shell gas hold, transactions, and advances.
- Mock advance creation for eligible pending gas holds.
- Mock repayment flow that settles the transaction and collects principal plus fee.
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

### `POST /api/advances/:advanceId/repay`

Marks the hold as released and collects principal plus fee in the mock ledger.

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
