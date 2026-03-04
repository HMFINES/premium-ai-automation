const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

const DATA_DIR = path.resolve(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

const FALLBACK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'PROTOCOL_CONNECTION_LOST',
  'ER_ACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
  'ER_NO_SUCH_TABLE'
]);

function nowSqlDatetime() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function ensureStoreFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      counters: {
        userId: 0,
        supportIssueId: 0
      },
      users: [],
      supportIssues: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function readStore() {
  ensureStoreFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (_error) {
    const reset = {
      counters: {
        userId: 0,
        supportIssueId: 0
      },
      users: [],
      supportIssues: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(reset, null, 2), 'utf8');
    return reset;
  }
}

function writeStore(store) {
  ensureStoreFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function shouldFallback(error) {
  return Boolean(error && FALLBACK_ERROR_CODES.has(error.code));
}

async function findUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [normalized]);
    return rows[0] || null;
  } catch (error) {
    if (!shouldFallback(error)) throw error;
    const store = readStore();
    return store.users.find((user) => user.email === normalized) || null;
  }
}

async function findUserByPhone(phone) {
  const normalized = String(phone || '').trim();
  if (!normalized) return null;

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE phone = ? LIMIT 1', [normalized]);
    return rows[0] || null;
  } catch (error) {
    if (!shouldFallback(error)) throw error;
    const store = readStore();
    return store.users.find((user) => user.phone === normalized) || null;
  }
}

async function findUserByIdentifier(identifier) {
  const raw = String(identifier || '').trim();
  const email = raw.toLowerCase();

  try {
    const [rows] = await pool.query(
      `SELECT *
       FROM users
       WHERE (email = ? OR phone = ?)
         AND is_active = 1
       LIMIT 1`,
      [email, raw]
    );
    return rows[0] || null;
  } catch (error) {
    if (!shouldFallback(error)) throw error;
    const store = readStore();
    return (
      store.users.find((user) => user.is_active === 1 && (user.email === email || user.phone === raw)) || null
    );
  }
}

async function createUser({ email, passwordHash, firstName, lastName, phone, company }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPhone = String(phone || '').trim() || null;
  const normalizedCompany = String(company || '').trim() || null;

  try {
    const [result] = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, company)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [normalizedEmail, passwordHash, firstName, lastName, normalizedPhone, normalizedCompany]
    );
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [result.insertId]);
    return rows[0];
  } catch (error) {
    if (!shouldFallback(error)) throw error;

    const store = readStore();
    if (store.users.some((user) => user.email === normalizedEmail)) {
      const duplicate = new Error('Duplicate email');
      duplicate.code = 'ER_DUP_ENTRY';
      duplicate.field = 'email';
      throw duplicate;
    }
    if (normalizedPhone && store.users.some((user) => user.phone === normalizedPhone)) {
      const duplicate = new Error('Duplicate phone');
      duplicate.code = 'ER_DUP_ENTRY';
      duplicate.field = 'phone';
      throw duplicate;
    }

    store.counters.userId += 1;
    const ts = nowSqlDatetime();
    const row = {
      id: store.counters.userId,
      email: normalizedEmail,
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      phone: normalizedPhone,
      company: normalizedCompany,
      is_active: 1,
      created_at: ts,
      updated_at: ts,
      last_login_at: null
    };
    store.users.push(row);
    writeStore(store);
    return row;
  }
}

async function updateUserLastLogin(id) {
  try {
    await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  } catch (error) {
    if (!shouldFallback(error)) throw error;
    const store = readStore();
    const user = store.users.find((item) => Number(item.id) === Number(id));
    if (!user) return;
    const ts = nowSqlDatetime();
    user.last_login_at = ts;
    user.updated_at = ts;
    writeStore(store);
  }
}

async function createSupportIssue({
  ticketNumber,
  clientName,
  clientEmail,
  problem,
  category,
  priority,
  aiSuggestion
}) {
  try {
    const [result] = await pool.query(
      `INSERT INTO support_issues (
          ticket_number,
          client_name,
          client_email,
          problem,
          category,
          priority,
          ai_suggestion
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ticketNumber, clientName || null, clientEmail || null, problem, category || null, priority, aiSuggestion || null]
    );

    return {
      id: result.insertId,
      ticket_number: ticketNumber,
      client_name: clientName || null,
      client_email: clientEmail || null,
      problem,
      category: category || null,
      priority,
      status: 'open',
      created_at: nowSqlDatetime(),
      updated_at: nowSqlDatetime()
    };
  } catch (error) {
    if (!shouldFallback(error)) throw error;

    const store = readStore();
    store.counters.supportIssueId += 1;
    const ts = nowSqlDatetime();
    const row = {
      id: store.counters.supportIssueId,
      ticket_number: ticketNumber,
      client_name: clientName || null,
      client_email: clientEmail || null,
      problem,
      category: category || null,
      priority,
      ai_suggestion: aiSuggestion || null,
      status: 'open',
      resolution_notes: null,
      resolved_at: null,
      created_at: ts,
      updated_at: ts
    };
    store.supportIssues.unshift(row);
    writeStore(store);
    return row;
  }
}

async function listSupportIssues(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  try {
    let rows;
    if (normalizedEmail) {
      [rows] = await pool.query(
        `SELECT id, ticket_number, client_name, client_email, problem, category, priority, status, resolution_notes, created_at, updated_at
         FROM support_issues
         WHERE client_email = ?
         ORDER BY created_at DESC
         LIMIT 50`,
        [normalizedEmail]
      );
    } else {
      [rows] = await pool.query(
        `SELECT id, ticket_number, client_name, client_email, problem, category, priority, status, resolution_notes, created_at, updated_at
         FROM support_issues
         ORDER BY created_at DESC
         LIMIT 50`
      );
    }
    return rows;
  } catch (error) {
    if (!shouldFallback(error)) throw error;

    const store = readStore();
    const issues = normalizedEmail
      ? store.supportIssues.filter((item) => (item.client_email || '').toLowerCase() === normalizedEmail)
      : store.supportIssues.slice();
    return issues.slice(0, 50);
  }
}

module.exports = {
  findUserByEmail,
  findUserByPhone,
  findUserByIdentifier,
  createUser,
  updateUserLastLogin,
  createSupportIssue,
  listSupportIssues
};
