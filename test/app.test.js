import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';

async function withServer(run) {
  const server = createApp();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('health endpoint returns ok', async () => withServer(async (baseUrl) => {
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
}));

test('dashboard contains the demo gas hold', async () => withServer(async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/demo/dashboard`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.user.id, 'user_demo_001');
  assert.ok(body.transactions.some((transaction) => transaction.id === 'txn_shell_hold_001'));
}));

test('creates and repays an advance for the demo hold', async () => withServer(async (baseUrl) => {
  const createdResponse = await fetch(`${baseUrl}/api/advances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId: 'txn_shell_hold_001', feeCents: 300 }),
  });
  const created = await createdResponse.json();

  assert.equal(createdResponse.status, 201);
  assert.equal(created.advance.principalCents, 7500);
  assert.equal(created.advance.status, 'active');

  const repaidResponse = await fetch(`${baseUrl}/api/advances/${created.advance.id}/repay`, { method: 'POST' });
  const repaid = await repaidResponse.json();
  assert.equal(repaidResponse.status, 200);
  assert.equal(repaid.advance.status, 'repaid');
}));

test('accepts waitlist signups', async () => withServer(async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'founder@example.com', painPoint: 'Gas holds keep blocking my debit card balance.' }),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.signup.email, 'founder@example.com');
}));


test('bank webhook detects a gas hold and settlement auto-collects repayment', async () => withServer(async (baseUrl) => {
  const providerTransactionId = `bank_txn_webhook_${Date.now()}`;
  const pendingResponse = await fetch(`${baseUrl}/api/bank/webhooks/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerTransactionId,
      merchant: 'Chevron',
      category: 'gas_station',
      status: 'pending',
      authorizedAmountCents: 8500,
      estimatedFinalAmountCents: 1200,
    }),
  });
  const pending = await pendingResponse.json();

  assert.equal(pendingResponse.status, 202);
  assert.equal(pending.transaction.eligibleForAdvance, true);

  const advanceResponse = await fetch(`${baseUrl}/api/advances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId: pending.transaction.id, feeCents: 350 }),
  });
  const advanceBody = await advanceResponse.json();
  assert.equal(advanceResponse.status, 201);
  assert.equal(advanceBody.advance.status, 'active');

  const settledResponse = await fetch(`${baseUrl}/api/bank/webhooks/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerTransactionId,
      merchant: 'Chevron',
      category: 'gas_station',
      status: 'settled',
      authorizedAmountCents: 8500,
      settledAmountCents: 1200,
    }),
  });
  const settled = await settledResponse.json();

  assert.equal(settledResponse.status, 202);
  assert.equal(settled.transaction.status, 'settled');
  assert.ok(settled.advances.some((advance) => advance.id === advanceBody.advance.id && advance.status === 'repaid'));
}));
