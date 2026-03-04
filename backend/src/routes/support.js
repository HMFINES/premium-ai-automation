const express = require('express');
const config = require('../config');
const { createSupportIssue, listSupportIssues } = require('../data-access');

const router = express.Router();

const ISSUE_KEYWORDS = [
  'issue',
  'problem',
  'error',
  'failed',
  'failure',
  'not working',
  'bug',
  'unable',
  'cannot',
  "can't",
  'stuck',
  'crash',
  'blocked'
];

function normalizeString(value, maxLength = 4000) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  const email = normalizeString(value, 255).toLowerCase();
  if (!email) {
    return null;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function detectIssueMessage(message) {
  const lower = message.toLowerCase();
  return ISSUE_KEYWORDS.some((word) => lower.includes(word));
}

function detectCategory(message) {
  const lower = message.toLowerCase();
  if (/(login|signin|sign in|password|otp|account)/.test(lower)) return 'authentication';
  if (/(payment|invoice|billing|refund|subscription)/.test(lower)) return 'billing';
  if (/(api|integration|webhook|connect)/.test(lower)) return 'integration';
  if (/(slow|performance|speed|timeout)/.test(lower)) return 'performance';
  if (/(chatbot|reply|bot|response)/.test(lower)) return 'chatbot';
  return 'general';
}

function detectPriority(message) {
  const lower = message.toLowerCase();
  if (/(urgent|critical|asap|immediately|down|blocked)/.test(lower)) return 'urgent';
  if (/(high|serious|important|cannot|can't|unable)/.test(lower)) return 'high';
  if (/(minor|small|low|later)/.test(lower)) return 'low';
  return 'medium';
}

function generateTicketNumber() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const randomPart = String(Math.floor(Math.random() * 9000) + 1000);
  return `SUP-${datePart}-${randomPart}`;
}

function stripInternalTags(text) {
  return normalizeString(text, 5000).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

async function getAiSupportReply(message, history, context) {
  if (!config.openai.apiKey) {
    return fallbackSupportReply(message, context);
  }

  const systemPrompt = `You are ELEVATEX customer support AI assistant.
Your goals:
1) Help the client solve their query with practical steps.
2) Ask concise follow-up questions only if needed.
3) Keep responses short, clear, and professional.
4) Never output chain-of-thought or <think> tags.
5) If the issue sounds unresolved, suggest that a support ticket is created and ask for email.
`;

  const conversation = Array.isArray(history)
    ? history
        .slice(-8)
        .map((item) => ({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          content: normalizeString(item.content, 2000)
        }))
        .filter((item) => item.content.length > 0)
    : [];

  const contextNote = `Client context: name=${context.clientName || 'unknown'}, email=${context.clientEmail || 'unknown'}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openai.apiKey}`
    },
    body: JSON.stringify({
      model: config.openai.model,
      max_tokens: config.openai.maxTokens,
      temperature: config.openai.temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'system', content: contextNote },
        ...conversation,
        { role: 'user', content: message }
      ]
    })
  });

  if (!response.ok) {
    return fallbackSupportReply(message, context);
  }

  const payload = await response.json();
  const reply = payload?.choices?.[0]?.message?.content;
  const safeReply = stripInternalTags(reply);
  return safeReply || fallbackSupportReply(message, context);
}

function fallbackSupportReply(message) {
  const category = detectCategory(message);

  if (category === 'authentication') {
    return 'Please try: 1) reset your password, 2) clear browser cache, 3) login with your registered email. If this still fails, I can create a support ticket now.';
  }

  if (category === 'billing') {
    return 'For billing issues, please share invoice ID, payment date, and the exact error. I can log this issue and a support agent will follow up.';
  }

  if (category === 'integration') {
    return 'For integration issues, share your platform name, endpoint, and exact error message. I can create a tracked support ticket for this.';
  }

  if (category === 'performance') {
    return 'Please share where the delay happens and approximate response time. We can optimize it, and I can log this issue for technical review.';
  }

  return 'I can help with this. Please share the exact problem, steps to reproduce, and any error message. I can also create a support ticket right now.';
}

async function insertSupportIssue({ clientName, clientEmail, problem, aiSuggestion }) {
  const ticketNumber = generateTicketNumber();
  const category = detectCategory(problem);
  const priority = detectPriority(problem);

  const row = await createSupportIssue({
    ticketNumber,
    clientName,
    clientEmail,
    problem,
    category,
    priority,
    aiSuggestion
  });

  return {
    id: row.id,
    ticketNumber,
    status: 'open',
    category,
    priority
  };
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

router.post('/chat', async (req, res, next) => {
  try {
    const message = normalizeString(req.body.message, 2000);
    const clientName = normalizeString(req.body.clientName, 120);
    const clientEmail = normalizeEmail(req.body.clientEmail);
    const history = Array.isArray(req.body.history) ? req.body.history : [];

    if (!message) {
      return sendError(res, 400, 'message is required');
    }

    const reply = await getAiSupportReply(message, history, { clientName, clientEmail });

    const shouldLogIssue = detectIssueMessage(message) || Boolean(req.body.forceCreateIssue);
    let ticket = null;

    if (shouldLogIssue) {
      ticket = await insertSupportIssue({
        clientName,
        clientEmail,
        problem: message,
        aiSuggestion: reply
      });
    }

    return res.json({
      success: true,
      data: {
        reply,
        issueLogged: Boolean(ticket),
        ticket
      },
      error: null
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/issues', async (req, res, next) => {
  try {
    const problem = normalizeString(req.body.problem, 5000);
    const clientName = normalizeString(req.body.clientName, 120);
    const clientEmail = normalizeEmail(req.body.clientEmail);
    const aiSuggestion = normalizeString(req.body.aiSuggestion, 5000);

    if (!problem) {
      return sendError(res, 400, 'problem is required');
    }

    const ticket = await insertSupportIssue({
      clientName,
      clientEmail,
      problem,
      aiSuggestion
    });

    return res.status(201).json({
      success: true,
      data: {
        ticket
      },
      error: null
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/issues', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.query.email);
    const rows = await listSupportIssues(email);

    return res.json({
      success: true,
      data: {
        issues: rows.map((row) => ({
          id: row.id,
          ticketNumber: row.ticket_number,
          clientName: row.client_name,
          clientEmail: row.client_email,
          problem: row.problem,
          category: row.category,
          priority: row.priority,
          status: row.status,
          resolutionNotes: row.resolution_notes,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      },
      error: null
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
