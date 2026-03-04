const dotenv = require('dotenv');

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const DEFAULT_ACCESS_SECRET = 'dev_access_secret';
const DEFAULT_REFRESH_SECRET = 'dev_refresh_secret';

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toFloat(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function hasPlaceholder(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes('replace_with') ||
    normalized.includes('change_me') ||
    normalized.includes('your_')
  );
}

function isLocalhostUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch (_error) {
    return false;
  }
}

const rawFrontendOrigin = process.env.FRONTEND_ORIGIN || '*';
const frontendOrigins = parseOrigins(rawFrontendOrigin);
const explicitAllowedOrigins = frontendOrigins.filter((origin) => origin !== '*');

const config = {
  nodeEnv: NODE_ENV,
  isProduction: IS_PRODUCTION,
  port: toInt(process.env.PORT, 4000),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'elevatex',
    connectionLimit: toInt(process.env.DB_CONNECTION_LIMIT, 10)
  },
  http: {
    allowedOrigins: explicitAllowedOrigins
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || DEFAULT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET || DEFAULT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },
  oauth: {
    frontendOrigin: explicitAllowedOrigins[0] || rawFrontendOrigin || '*',
    stateTtlMs: toInt(process.env.OAUTH_STATE_TTL_MS, 600000),
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/api/auth/google/callback'
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      callbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:4000/api/auth/github/callback'
    }
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    maxTokens: toInt(process.env.OPENAI_MAX_TOKENS, 450),
    temperature: toFloat(process.env.OPENAI_TEMPERATURE, 0.6)
  }
};

if (IS_PRODUCTION) {
  const configErrors = [];

  if (config.jwt.accessSecret.length < 32 || hasPlaceholder(config.jwt.accessSecret)) {
    configErrors.push('JWT_ACCESS_SECRET must be set to a strong secret (min 32 chars).');
  }
  if (config.jwt.refreshSecret.length < 32 || hasPlaceholder(config.jwt.refreshSecret)) {
    configErrors.push('JWT_REFRESH_SECRET must be set to a strong secret (min 32 chars).');
  }

  if (!rawFrontendOrigin || rawFrontendOrigin === '*' || explicitAllowedOrigins.length === 0) {
    configErrors.push('FRONTEND_ORIGIN must be set to one or more explicit HTTPS origins in production.');
  }

  const googleOAuthEnabled = Boolean(config.oauth.google.clientId || config.oauth.google.clientSecret);
  if (googleOAuthEnabled) {
    if (hasPlaceholder(config.oauth.google.clientId) || hasPlaceholder(config.oauth.google.clientSecret)) {
      configErrors.push('Google OAuth credentials are placeholders. Set real GOOGLE_CLIENT_ID/SECRET.');
    }
    if (isLocalhostUrl(config.oauth.google.callbackUrl)) {
      configErrors.push('GOOGLE_CALLBACK_URL cannot use localhost in production.');
    }
  }

  const githubOAuthEnabled = Boolean(config.oauth.github.clientId || config.oauth.github.clientSecret);
  if (githubOAuthEnabled) {
    if (hasPlaceholder(config.oauth.github.clientId) || hasPlaceholder(config.oauth.github.clientSecret)) {
      configErrors.push('GitHub OAuth credentials are placeholders. Set real GITHUB_CLIENT_ID/SECRET.');
    }
    if (isLocalhostUrl(config.oauth.github.callbackUrl)) {
      configErrors.push('GITHUB_CALLBACK_URL cannot use localhost in production.');
    }
  }

  if (configErrors.length > 0) {
    throw new Error(`Invalid production configuration:\n- ${configErrors.join('\n- ')}`);
  }
}

module.exports = config;
