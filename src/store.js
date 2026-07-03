import { randomUUID } from 'node:crypto';

const now = () => new Date().toISOString();
const shortId = (prefix) => `${prefix}_${randomUUID().slice(0, 8)}`;

const GAS_MERCHANT_HINTS = ['shell', 'chevron', 'exxon', 'mobil', 'bp', 'marathon', 'speedway', 'circle k', 'gas'];
const DEFAULT_ADVANCE_FEE_CENTS = 300;

const users = new Map();
const accounts = new Map();
const transactions = new Map();
const advances = new Map();
const ledgerEntries = new Map();
const waitlist = new Map();

const demoUser = {
  id: 'user_demo_001',
  name: 'Alex Demo',
  email: 'alex@example.com',
  createdAt: now(),
};

const demoAccount = {
  id: 'acct_demo_checking_001',
  userId: demoUser.id,
  provider: 'demo_bank',
  mask: '1234',
  availableBalanceCents: 12845,
  connectedAt: now(),
};

const demoTransactions = [
  {
    id: 'txn_shell_hold_001',
    providerTransactionId: 'bank_txn_shell_001',
    accountId: demoAccount.id,
    userId: demoUser.id,
    merchant: 'Shell',
    category: 'gas_station',
    status: 'pending',
    authorizedAmountCents: 7500,
    estimatedFinalAmountCents: 1000,
    settledAmountCents: null,
    detectedHoldCents: 7500,
    holdReleasedAt: null,
    eligibleForAdvance: true,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: 'txn_coffee_001',
    providerTransactionId: 'bank_txn_coffee_001',
    accountId: demoAccount.id,
    userId: demoUser.id,
    merchant: 'Neighborhood Coffee',
    category: 'restaurant',
    status: 'settled',
    authorizedAmountCents: 625,
    estimatedFinalAmountCents: 625,
    settledAmountCents: 625,
    detectedHoldCents: 0,
    holdReleasedAt: now(),
    eligibleForAdvance: false,
    createdAt: now(),
    updatedAt: now(),
  },
];

users.set(demoUser.id, demoUser);
accounts.set(demoAccount.id, demoAccount);
demoTransactions.forEach((transaction) => transactions.set(transaction.id, transaction));

function detectGasHold({ merchant, category, status, authorizedAmountCents, settledAmountCents }) {
  const merchantName = merchant.toLowerCase();
  const isGas = category === 'gas_station' || GAS_MERCHANT_HINTS.some((hint) => merchantName.includes(hint));
  const amountCents = authorizedAmountCents ?? settledAmountCents ?? 0;
  return isGas && status === 'pending' && amountCents >= 5000;
}

function writeLedger({ userId, accountId, type, amountCents, description, advanceId = null, transactionId = null }) {
  const entry = {
    id: shortId('ledger'),
    userId,
    accountId,
    advanceId,
    transactionId,
    type,
    amountCents,
    description,
    createdAt: now(),
  };
  ledgerEntries.set(entry.id, entry);
  return entry;
}

function findTransactionByProviderId(providerTransactionId) {
  return [...transactions.values()].find((transaction) => transaction.providerTransactionId === providerTransactionId);
}

function findActiveAdvanceByTransactionId(transactionId) {
  return [...advances.values()].find((advance) => advance.transactionId === transactionId && advance.status === 'active');
}

export function getDemoUser() { return users.get(demoUser.id); }
export function getDemoAccount() { return accounts.get(demoAccount.id); }
export function listAccounts(userId = demoUser.id) { return [...accounts.values()].filter((account) => account.userId === userId); }
export function listTransactions(userId = demoUser.id) { return [...transactions.values()].filter((transaction) => transaction.userId === userId); }
export function getTransaction(transactionId) { return transactions.get(transactionId); }
export function listAdvances(userId = demoUser.id) { return [...advances.values()].filter((advance) => advance.userId === userId); }
export function listLedgerEntries(userId = demoUser.id) { return [...ledgerEntries.values()].filter((entry) => entry.userId === userId); }
export function listWaitlistSignups() { return [...waitlist.values()]; }

export function upsertBankTransaction(event) {
  const account = accounts.get(event.accountId ?? demoAccount.id);
  if (!account) throw Object.assign(new Error('Account not found'), { status: 404 });

  const existing = findTransactionByProviderId(event.providerTransactionId);
  const status = event.status;
  const authorizedAmountCents = event.authorizedAmountCents ?? existing?.authorizedAmountCents ?? event.settledAmountCents ?? 0;
  const settledAmountCents = status === 'settled' ? event.settledAmountCents : null;
  const eligibleForAdvance = detectGasHold({
    merchant: event.merchant ?? existing?.merchant ?? '',
    category: event.category ?? existing?.category ?? 'unknown',
    status,
    authorizedAmountCents,
    settledAmountCents,
  });

  const transaction = {
    id: existing?.id ?? shortId('txn'),
    providerTransactionId: event.providerTransactionId,
    accountId: account.id,
    userId: account.userId,
    merchant: event.merchant ?? existing?.merchant ?? 'Unknown merchant',
    category: event.category ?? existing?.category ?? 'unknown',
    status,
    authorizedAmountCents,
    estimatedFinalAmountCents: event.estimatedFinalAmountCents ?? existing?.estimatedFinalAmountCents ?? null,
    settledAmountCents,
    detectedHoldCents: eligibleForAdvance ? authorizedAmountCents : 0,
    holdReleasedAt: status === 'settled' ? now() : null,
    eligibleForAdvance,
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  };

  transactions.set(transaction.id, transaction);

  const activeAdvance = findActiveAdvanceByTransactionId(transaction.id);
  if (status === 'settled' && activeAdvance) {
    collectRepayment(activeAdvance.id, 'Bank transaction settled; principal plus fee collected automatically.');
  }

  return transaction;
}

export function createAdvance({ transactionId, feeCents = DEFAULT_ADVANCE_FEE_CENTS }) {
  const transaction = transactions.get(transactionId);
  if (!transaction) throw Object.assign(new Error('Transaction not found'), { status: 404 });
  if (!transaction.eligibleForAdvance || transaction.status !== 'pending') {
    throw Object.assign(new Error('Transaction is not eligible for an advance'), { status: 422 });
  }

  const existingAdvance = findActiveAdvanceByTransactionId(transactionId);
  if (existingAdvance) return existingAdvance;

  const account = accounts.get(transaction.accountId);
  const advance = {
    id: shortId('adv'),
    userId: transaction.userId,
    accountId: transaction.accountId,
    transactionId,
    principalCents: transaction.detectedHoldCents,
    feeCents,
    status: 'active',
    riskStatus: account.availableBalanceCents >= feeCents ? 'low' : 'review',
    timeline: [
      { label: 'Bank transaction webhook received', status: 'complete', occurredAt: transaction.createdAt },
      { label: 'Gas authorization hold detected', status: 'complete', occurredAt: transaction.updatedAt },
      { label: 'Advance issued to user balance', status: 'complete', occurredAt: now() },
      { label: 'Hold release webhook received', status: 'pending', occurredAt: null },
      { label: 'Repayment plus fee collected', status: 'pending', occurredAt: null },
    ],
    createdAt: now(),
    updatedAt: now(),
  };

  advances.set(advance.id, advance);
  account.availableBalanceCents += advance.principalCents;
  writeLedger({
    userId: advance.userId,
    accountId: advance.accountId,
    advanceId: advance.id,
    transactionId,
    type: 'advance_disbursement',
    amountCents: advance.principalCents,
    description: 'Mock advance restoring the pending gas authorization hold.',
  });

  return advance;
}

export function collectRepayment(advanceId, description = 'Manual repayment simulation collected principal plus fee.') {
  const advance = advances.get(advanceId);
  if (!advance) throw Object.assign(new Error('Advance not found'), { status: 404 });
  if (advance.status === 'repaid') return advance;

  const account = accounts.get(advance.accountId);
  account.availableBalanceCents -= advance.principalCents + advance.feeCents;

  advance.status = 'repaid';
  advance.timeline = advance.timeline.map((event) => (
    event.label === 'Hold release webhook received' || event.label === 'Repayment plus fee collected'
      ? { ...event, status: 'complete', occurredAt: now() }
      : event
  ));
  advance.updatedAt = now();

  writeLedger({
    userId: advance.userId,
    accountId: advance.accountId,
    advanceId: advance.id,
    transactionId: advance.transactionId,
    type: 'repayment_collection',
    amountCents: -(advance.principalCents + advance.feeCents),
    description,
  });

  return advance;
}

export function addWaitlistSignup({ email, phone, painPoint }) {
  const signup = { id: shortId('wait'), email, phone: phone ?? null, painPoint: painPoint ?? null, createdAt: now() };
  waitlist.set(signup.id, signup);
  return signup;
}
