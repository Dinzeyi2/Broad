import { createServer } from 'node:http';
import {
  addWaitlistSignup,
  createAdvance,
  getDemoUser,
  getTransaction,
  listAdvances,
  listTransactions,
  listWaitlistSignups,
  repayAdvance,
} from './store.js';

const json = (response, status, payload) => {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN ?? '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
};

const readBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const isEmail = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export function createApp() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);

      if (request.method === 'OPTIONS') return json(response, 204, {});

      if (request.method === 'GET' && url.pathname === '/health') {
        return json(response, 200, { ok: true, service: 'holdback-mvp-backend' });
      }

      if (request.method === 'GET' && url.pathname === '/api/demo/dashboard') {
        const user = getDemoUser();
        return json(response, 200, { user, transactions: listTransactions(user.id), advances: listAdvances(user.id) });
      }

      if (request.method === 'GET' && url.pathname === '/api/transactions') {
        return json(response, 200, { transactions: listTransactions() });
      }

      const transactionMatch = url.pathname.match(/^\/api\/transactions\/([^/]+)$/);
      if (request.method === 'GET' && transactionMatch) {
        const transaction = getTransaction(transactionMatch[1]);
        if (!transaction) return json(response, 404, { error: 'Transaction not found' });
        return json(response, 200, { transaction });
      }

      if (request.method === 'POST' && url.pathname === '/api/advances') {
        const body = await readBody(request);
        if (typeof body.transactionId !== 'string' || body.transactionId.length === 0) {
          return json(response, 400, { error: 'transactionId is required' });
        }
        if (body.feeCents !== undefined && (!Number.isInteger(body.feeCents) || body.feeCents < 0 || body.feeCents > 2500)) {
          return json(response, 400, { error: 'feeCents must be an integer from 0 to 2500' });
        }
        const advance = createAdvance({ transactionId: body.transactionId, feeCents: body.feeCents });
        return json(response, 201, { advance, user: getDemoUser() });
      }

      if (request.method === 'GET' && url.pathname === '/api/advances') {
        return json(response, 200, { advances: listAdvances() });
      }

      const repayMatch = url.pathname.match(/^\/api\/advances\/([^/]+)\/repay$/);
      if (request.method === 'POST' && repayMatch) {
        const advance = repayAdvance(repayMatch[1]);
        return json(response, 200, { advance, user: getDemoUser() });
      }

      if (request.method === 'POST' && url.pathname === '/api/waitlist') {
        const body = await readBody(request);
        if (!isEmail(body.email)) return json(response, 400, { error: 'A valid email is required' });
        if (body.phone !== undefined && (typeof body.phone !== 'string' || body.phone.length < 7 || body.phone.length > 30)) {
          return json(response, 400, { error: 'phone must be between 7 and 30 characters' });
        }
        if (body.painPoint !== undefined && (typeof body.painPoint !== 'string' || body.painPoint.length > 500)) {
          return json(response, 400, { error: 'painPoint must be 500 characters or fewer' });
        }
        const signup = addWaitlistSignup(body);
        return json(response, 201, { signup });
      }

      if (request.method === 'GET' && url.pathname === '/api/waitlist') {
        return json(response, 200, { signups: listWaitlistSignups() });
      }

      return json(response, 404, { error: 'Not found' });
    } catch (error) {
      if (error instanceof SyntaxError) return json(response, 400, { error: 'Invalid JSON body' });
      return json(response, error.status ?? 500, { error: error.message ?? 'Internal server error' });
    }
  });
}
