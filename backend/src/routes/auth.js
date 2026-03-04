const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const {
  findUserByEmail,
  findUserByPhone,
  findUserByIdentifier,
  createUser,
  updateUserLastLogin
} = require('../data-access');

const router = express.Router();
const oauthStates = new Map();

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhone(value) {
  if (!value) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length === 0 ? null : normalized;
}

function sendError(res, status, message, details = null) {
  return res.status(status).json({
    success: false,
    data: null,
    error: {
      message,
      details
    }
  });
}

function serializeForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function sendPopupResult(res, payload) {
  const targetOrigin = config.oauth.frontendOrigin || '*';
  const serializedPayload = serializeForScript(payload);

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"><title>OAuth Login</title></head>
<body>
<script>
  (function () {
    const payload = ${serializedPayload};
    if (window.opener) {
      window.opener.postMessage(payload, ${JSON.stringify(targetOrigin)});
    }
    window.close();
  })();
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}

function createOAuthState(provider) {
  const now = Date.now();
  for (const [key, value] of oauthStates.entries()) {
    if (now - value.createdAt > config.oauth.stateTtlMs) {
      oauthStates.delete(key);
    }
  }

  const state = crypto.randomBytes(24).toString('hex');
  oauthStates.set(state, {
    provider,
    createdAt: now
  });
  return state;
}

function consumeOAuthState(state, provider) {
  const record = oauthStates.get(state);
  oauthStates.delete(state);

  if (!record) {
    return false;
  }
  if (record.provider !== provider) {
    return false;
  }
  if (Date.now() - record.createdAt > config.oauth.stateTtlMs) {
    return false;
  }

  return true;
}

async function upsertOAuthUser({ email, firstName, lastName }) {
  let normalizedEmail = String(email || '')
    .trim()
    .toLowerCase();

  if (!normalizedEmail) {
    normalizedEmail = `${crypto.randomUUID()}@oauth.local`;
  }

  const safeFirstName = String(firstName || 'OAuth').trim() || 'OAuth';
  const safeLastName = String(lastName || 'User').trim() || 'User';

  const existingUser = await findUserByEmail(normalizedEmail);
  if (existingUser) {
    return existingUser;
  }

  const randomPasswordHash = await bcrypt.hash(crypto.randomUUID(), 12);
  return createUser({
    email: normalizedEmail,
    passwordHash: randomPasswordHash,
    firstName: safeFirstName,
    lastName: safeLastName,
    phone: null,
    company: null
  });
}

function signTokens(user) {
  const payload = {
    id: user.id,
    email: user.email
  };

  return {
    accessToken: jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn
    }),
    refreshToken: jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn
    })
  };
}

function toUserResponse(row) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    company: row.company,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at
  };
}

router.get('/google/start', (req, res) => {
  if (!config.oauth.google.clientId || !config.oauth.google.clientSecret || !config.oauth.google.callbackUrl) {
    return sendPopupResult(res, {
      source: 'elevatex_oauth',
      success: false,
      error: 'Google OAuth is not configured on server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env'
    });
  }

  const state = createOAuthState('google');
  const params = new URLSearchParams({
    client_id: config.oauth.google.clientId,
    redirect_uri: config.oauth.google.callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  });

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get('/google/callback', async (req, res) => {
  const oauthError = String(req.query.error || '').trim();
  if (oauthError) {
    return sendPopupResult(res, {
      source: 'elevatex_oauth',
      success: false,
      error: 'Google login was cancelled or denied'
    });
  }

  const code = String(req.query.code || '').trim();
  const state = String(req.query.state || '').trim();

  if (!code || !state || !consumeOAuthState(state, 'google')) {
    return sendPopupResult(res, {
      source: 'elevatex_oauth',
      success: false,
      error: 'Invalid OAuth state'
    });
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        code,
        client_id: config.oauth.google.clientId,
        client_secret: config.oauth.google.clientSecret,
        redirect_uri: config.oauth.google.callbackUrl,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      throw new Error(`Google token exchange failed (${tokenResponse.status})`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      throw new Error('Google access token missing');
    }

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!profileResponse.ok) {
      throw new Error(`Google profile fetch failed (${profileResponse.status})`);
    }

    const profile = await profileResponse.json();
    if (!profile.email) {
      throw new Error('Google account does not provide an email');
    }

    const user = await upsertOAuthUser({
      email: profile.email,
      firstName: profile.given_name || profile.name || 'Google',
      lastName: profile.family_name || 'User'
    });

    await updateUserLastLogin(user.id);

    return sendPopupResult(res, {
      source: 'elevatex_oauth',
      success: true,
      data: {
        user: toUserResponse(user),
        tokens: signTokens(user)
      }
    });
  } catch (error) {
    return sendPopupResult(res, {
      source: 'elevatex_oauth',
      success: false,
      error: error.message || 'Google login failed'
    });
  }
});

router.get('/github/start', (req, res) => {
  if (!config.oauth.github.clientId || !config.oauth.github.clientSecret || !config.oauth.github.callbackUrl) {
    return sendPopupResult(res, {
      source: 'elevatex_oauth',
      success: false,
      error: 'GitHub OAuth is not configured on server. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in backend/.env'
    });
  }

  const state = createOAuthState('github');
  const params = new URLSearchParams({
    client_id: config.oauth.github.clientId,
    redirect_uri: config.oauth.github.callbackUrl,
    scope: 'read:user user:email',
    state
  });

  return res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

router.get('/github/callback', async (req, res) => {
  const oauthError = String(req.query.error || '').trim();
  if (oauthError) {
    return sendPopupResult(res, {
      source: 'elevatex_oauth',
      success: false,
      error: 'GitHub login was cancelled or denied'
    });
  }

  const code = String(req.query.code || '').trim();
  const state = String(req.query.state || '').trim();

  if (!code || !state || !consumeOAuthState(state, 'github')) {
    return sendPopupResult(res, {
      source: 'elevatex_oauth',
      success: false,
      error: 'Invalid OAuth state'
    });
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: config.oauth.github.clientId,
        client_secret: config.oauth.github.clientSecret,
        code,
        redirect_uri: config.oauth.github.callbackUrl,
        state
      })
    });

    if (!tokenResponse.ok) {
      throw new Error(`GitHub token exchange failed (${tokenResponse.status})`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      throw new Error('GitHub access token missing');
    }

    const profileResponse = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'elevatex-app'
      }
    });

    if (!profileResponse.ok) {
      throw new Error(`GitHub profile fetch failed (${profileResponse.status})`);
    }

    const profile = await profileResponse.json();

    let email = String(profile.email || '').trim().toLowerCase();
    if (!email) {
      const emailsResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'elevatex-app'
        }
      });

      if (emailsResponse.ok) {
        const emails = await emailsResponse.json();
        if (Array.isArray(emails) && emails.length > 0) {
          const preferred = emails.find((item) => item.primary && item.verified) || emails[0];
          email = String(preferred.email || '').trim().toLowerCase();
        }
      }
    }

    if (!email) {
      throw new Error('GitHub account does not provide an email');
    }

    const fullName = String(profile.name || '').trim();
    const [firstName, ...rest] = fullName.split(/\s+/).filter(Boolean);

    const user = await upsertOAuthUser({
      email,
      firstName: firstName || profile.login || 'GitHub',
      lastName: rest.join(' ') || 'User'
    });

    await updateUserLastLogin(user.id);

    return sendPopupResult(res, {
      source: 'elevatex_oauth',
      success: true,
      data: {
        user: toUserResponse(user),
        tokens: signTokens(user)
      }
    });
  } catch (error) {
    return sendPopupResult(res, {
      source: 'elevatex_oauth',
      success: false,
      error: error.message || 'GitHub login failed'
    });
  }
});

router.post('/signup', async (req, res, next) => {
  try {
    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = normalizePhone(req.body.phone);
    const company = String(req.body.company || '').trim() || null;
    const password = String(req.body.password || '');

    if (!firstName || !lastName || !email || !password) {
      return sendError(res, 400, 'firstName, lastName, email, and password are required');
    }
    if (!isEmail(email)) {
      return sendError(res, 400, 'Please provide a valid email address');
    }
    if (password.length < 8) {
      return sendError(res, 400, 'Password must be at least 8 characters');
    }

    const existingByEmail = await findUserByEmail(email);
    if (existingByEmail) {
      return sendError(res, 409, 'Email already exists');
    }

    if (phone) {
      const existingByPhone = await findUserByPhone(phone);
      if (existingByPhone) {
        return sendError(res, 409, 'Phone already exists');
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser({
      email,
      passwordHash,
      firstName,
      lastName,
      phone,
      company
    });
    const tokens = signTokens(user);

    return res.status(201).json({
      success: true,
      data: {
        user: toUserResponse(user),
        tokens
      },
      error: null
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const identifier = String(req.body.identifier || '').trim();
    const password = String(req.body.password || '');

    if (!identifier || !password) {
      return sendError(res, 400, 'identifier and password are required');
    }

    const user = await findUserByIdentifier(identifier);
    if (!user) {
      return sendError(res, 401, 'Invalid credentials');
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return sendError(res, 401, 'Invalid credentials');
    }

    await updateUserLastLogin(user.id);

    const tokens = signTokens(user);
    return res.json({
      success: true,
      data: {
        user: toUserResponse(user),
        tokens
      },
      error: null
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
