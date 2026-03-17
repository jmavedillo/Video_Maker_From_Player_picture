const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { generateVideo } = require('./generator');

const port = Number(process.env.PORT || 3000);
const maxBodyBytes = 1024 * 1024;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error('Request body too large. Maximum is 1MB.'));
        req.destroy();
        return;
      }
      body += chunk.toString('utf8');
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });

    req.on('error', (err) => reject(err));
  });
}

function parseOptionalNumber(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number when provided.`);
  }

  return value;
}

async function handleRender(req, res) {
  if (req.headers['content-type'] && !req.headers['content-type'].includes('application/json')) {
    sendJson(res, 415, { error: 'Content-Type must be application/json.' });
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  if (typeof payload.text !== 'string' || payload.text.trim().length === 0) {
    sendJson(res, 400, { error: 'text is required and must be a non-empty string.' });
    return;
  }

  let renderOptions;
  try {
    renderOptions = {
      text: payload.text,
      videoDurationSeconds: parseOptionalNumber(payload.videoDurationSeconds, 'videoDurationSeconds'),
      scrollStartSeconds: parseOptionalNumber(payload.scrollStartSeconds, 'scrollStartSeconds'),
      scrollEndSeconds: parseOptionalNumber(payload.scrollEndSeconds, 'scrollEndSeconds')
    };
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'video-render-'));
  const outputPath = path.join(tmpDir, `${randomUUID()}.mp4`);

  try {
    await generateVideo({ ...renderOptions, outputPath });
  } catch (error) {
    await fsp.rm(tmpDir, { recursive: true, force: true });
    const diagnostics = error.details || {};
    console.error('Render failed:', {
      error: error.message,
      code: diagnostics.code ?? null,
      signal: diagnostics.signal ?? null,
      killed: diagnostics.killed ?? null,
      elapsedMs: diagnostics.elapsedMs ?? null,
      command: diagnostics.command ?? null
    });
    sendJson(res, 500, {
      error: error.message,
      code: diagnostics.code ?? null,
      signal: diagnostics.signal ?? null,
      killed: diagnostics.killed ?? null,
      elapsedMs: diagnostics.elapsedMs ?? null,
      command: diagnostics.command ?? null
    });
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', 'inline; filename="render.mp4"');

  const fileStream = fs.createReadStream(outputPath);
  fileStream.pipe(res);

  const cleanup = async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  };

  fileStream.on('error', async (err) => {
    if (!res.headersSent) {
      sendJson(res, 500, { error: `Failed to read generated video: ${err.message}` });
    } else {
      res.destroy(err);
    }
    await cleanup();
  });

  res.on('close', cleanup);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && req.url === '/render') {
    await handleRender(req, res);
    return;
  }

  sendJson(res, 404, { error: 'Not found.' });
});

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
