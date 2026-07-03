import { randomUUID } from 'node:crypto';

const now = () => new Date().toISOString();
const shortId = (prefix) => `${prefix}_${randomUUID().slice(0, 8)}`;

const users = new Map();
const transactions = new Map();
const advances = new Map();
const waitlist = new Map();

const demoUser = {
  id: 'user_demo_001',
  name: 'Alex Demo',
  email: 'alex@example.com',
  availableBalanceCents: 12845,
  createdAt: now(),
};

const demoTransactions = [
  {
    id: 'txn_shell_hold_001',
    userId: demoUser.id,
    merchant: 'Shell',
    category: 'gas_station',
    status: 'pending',
    holdAmountCents: 7500,
    estimatedFinalAmountCents: 1000,
    detectedHoldCents: 7500,
    eligibleForAdvance: true,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: 'txn_coffee_001',
    userId: demoUser.id,
    merchant: 'Neighborhood Coffee',
    category: 'restaurant',
    status: 'settled',
    holdAmountCents: 625,
    finalAmountCents: 625,
    detectedHoldCents: 0,
    eligibleForAdvance: false,
    createdAt: now(),
    updatedAt: now(),
  },
];

users.set(demoUser.id, demoUser);
demoTransactions.forEach((transaction) => transactions.set(transaction.id, transaction));

export function getDemoUser() { return users.get(demoUser.id); }
export function listTransactions(userId = demoUser.id) { return [...transactions.values()].filter((t) => t.userId === userId); }
export function getTransaction(transactionId) { return transactions.get(transactionId); }
export function listAdvances(userId = demoUser.id) { return [...advances.values()].filter((a) => a.userId === userId); }
export function listWaitlistSignups() { return [...waitlist.values()]; }

export function createAdvance({ transactionId, feeCents = 300 }) {
  const transaction = transactions.get(transactionId);
  if (!transaction) throw Object.assign(new Error('Transaction not found'), { status: 404 });
  if (!transaction.eligibleForAdvance || transaction.status !== 'pending') {
    throw Object.assign(new Error('Transaction is not eligible for an advance'), { status: 422 });
  }

  const existingAdvance = [...advances.values()].find((a) => a.transactionId === transactionId && a.status !== 'repaid');
  if (existingAdvance) return existingAdvance;

  const advance = {
    id: shortId('adv'),
    userId: transaction.userId,
    transactionId,
    principalCents: transaction.detectedHoldCents,
    feeCents,
    status: 'active',
    riskStatus: 'low',
    timeline: [
      { label: 'Gas hold detected', status: 'complete', occurredAt: transaction.createdAt },
      { label: 'Advance issued', status: 'complete', occurredAt: now() },
      { label: 'Hold released', status: 'pending', occurredAt: null },
      { label: 'Repayment collected', status: 'pending', occurredAt: null },
    ],
    createdAt: now(),
    updatedAt: now(),
  };

  advances.set(advance.id, advance);
  const user = users.get(transaction.userId);
  user.availableBalanceCents += advance.principalCents;
  return advance;
}

export function repayAdvance(advanceId) {
  const advance = advances.get(advanceId);
  if (!advance) throw Object.assign(new Error('Advance not found'), { status: 404 });
  if (advance.status === 'repaid') return advance;

  const transaction = transactions.get(advance.transactionId);
  transaction.status = 'settled';
  transaction.finalAmountCents = transaction.estimatedFinalAmountCents;
  transaction.updatedAt = now();
  transaction.eligibleForAdvance = false;

  const user = users.get(advance.userId);
  user.availableBalanceCents -= advance.principalCents + advance.feeCents;

  advance.status = 'repaid';
  advance.timeline = advance.timeline.map((event) => (
    event.label === 'Hold released' || event.label === 'Repayment collected'
      ? { ...event, status: 'complete', occurredAt: now() }
      : event
  ));
  advance.updatedAt = now();
  return advance;
}

export function addWaitlistSignup({ email, phone, painPoint }) {
  const signup = { id: shortId('wait'), email, phone: phone ?? null, painPoint: painPoint ?? null, createdAt: now() };
  waitlist.set(signup.id, signup);
  return signup;
}
