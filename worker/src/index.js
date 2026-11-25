function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGIN || '*';
  const originAllowed = allowed === '*' || origin === allowed;
  return {
    'Access-Control-Allow-Origin': originAllowed ? (allowed === '*' ? '*' : origin) : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}

async function telegram(env, method, form) {
  if (!env.BOT_TOKEN || !env.CHAT_ID) throw new Error('Telegram secrets are not configured.');
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    body: form
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.description || `Telegram API error (${response.status})`);
  }
  return result;
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') {
      if (headers['Access-Control-Allow-Origin'] === 'null') return new Response('Origin not allowed', { status: 403 });
      return new Response(null, { status: 204, headers });
    }
    if (env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== '*' && origin !== env.ALLOWED_ORIGIN) {
      return json({ ok: false, error: 'Origin not allowed.' }, 403, headers);
    }

    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/api/event') {
        const body = await request.json();
        const eventName = String(body.event || 'activity').slice(0, 80);
        const screen = String(body.screen_name || body.screen || 'unknown').slice(0, 100);
        const lines = [
          `💌 Love Proposal — ${eventName}`,
          `Screen: ${screen}`,
          `Time: ${String(body.at || new Date().toISOString()).slice(0, 80)}`
        ];
        const labels = {
          time_spent_seconds: 'Time spent (seconds)', navigation: 'Navigation',
          answer: 'Answer', selected_screen: 'Selected screen', field: 'Reply field',
          text: 'Reply text', media_type: 'Media type', filename: 'File',
          size_bytes: 'File size (bytes)', reason: 'Details', started_at: 'Session started',
          consent: 'Consent'
        };
        for (const [key, label] of Object.entries(labels)) {
          if (body[key] !== undefined && body[key] !== null) {
            const value = String(body[key]).slice(0, key === 'text' ? 2000 : 300);
            lines.push(`${label}: ${value}`);
          }
        }
        const form = new FormData();
        form.set('chat_id', env.CHAT_ID);
        form.set('text', lines.join('\n').slice(0, 3900));
        await telegram(env, 'sendMessage', form);
        return json({ ok: true }, 200, headers);
      }

      if (request.method === 'POST' && url.pathname === '/api/upload') {
        const incoming = await request.formData();
        const file = incoming.get('file');
        const kind = String(incoming.get('kind') || 'file').toLowerCase();
        const screen = String(incoming.get('screen') || 'unknown').slice(0, 100);
        if (!(file instanceof File) || file.size === 0) {
          return json({ ok: false, error: 'No file was provided.' }, 400, headers);
        }
        if (file.size > 48 * 1024 * 1024) {
          return json({ ok: false, error: 'File exceeds the 48 MB upload limit.' }, 413, headers);
        }
        const isPhoto = kind === 'photo';
        const method = isPhoto ? 'sendPhoto' : 'sendDocument';
        const form = new FormData();
        form.set('chat_id', env.CHAT_ID);
        form.set('caption', `Love Proposal — ${kind}\nScreen: ${screen}\nFile: ${file.name}`.slice(0, 900));
        form.set(isPhoto ? 'photo' : 'document', file, file.name || 'upload.bin');
        await telegram(env, method, form);
        return json({ ok: true }, 200, headers);
      }

      return json({ ok: false, error: 'Not found.' }, 404, headers);
    } catch (error) {
      return json({ ok: false, error: error.message || 'Server error.' }, 502, headers);
    }
  }
};
