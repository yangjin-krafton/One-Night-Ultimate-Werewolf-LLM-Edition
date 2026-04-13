#!/usr/bin/env node
// WAV → M4A 변환 서버 (TTS Reviewer 용)
// Usage: node tools/convert-server.js
// Requires: ffmpeg in PATH

const http = require('http');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.PORT || '3457', 10);

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    let ffmpegOk = false;
    try { execFileSync('ffmpeg', ['-version'], { stdio: 'pipe', timeout: 5000 }); ffmpegOk = true; } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', ffmpeg: ffmpegOk }));
    return;
  }

  // Convert WAV → M4A
  if (req.method === 'POST' && req.url === '/convert') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const wavBuf = Buffer.concat(chunks);
      if (wavBuf.length === 0) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Empty body');
        return;
      }

      const id = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tmpWav = path.join(os.tmpdir(), `${id}.wav`);
      const tmpM4a = path.join(os.tmpdir(), `${id}.m4a`);

      fs.writeFileSync(tmpWav, wavBuf);
      try {
        execFileSync('ffmpeg', [
          '-y', '-i', tmpWav,
          '-c:a', 'aac', '-b:a', '64k', '-ar', '32000', '-ac', '1',
          tmpM4a,
        ], { stdio: 'pipe', timeout: 30000 });

        const m4aBuf = fs.readFileSync(tmpM4a);
        console.log(`[${new Date().toLocaleTimeString()}] Converted ${wavBuf.length} bytes WAV → ${m4aBuf.length} bytes M4A`);
        res.writeHead(200, { 'Content-Type': 'audio/mp4', 'Content-Length': m4aBuf.length });
        res.end(m4aBuf);
      } catch (e) {
        console.error(`[${new Date().toLocaleTimeString()}] Conversion failed:`, e.message);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`ffmpeg conversion failed: ${e.message}`);
      } finally {
        try { fs.unlinkSync(tmpWav); } catch {}
        try { fs.unlinkSync(tmpM4a); } catch {}
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`\n  WAV → M4A conversion server`);
  console.log(`  http://localhost:${PORT}\n`);
  console.log(`  GET  /health   - Health check`);
  console.log(`  POST /convert  - WAV → M4A (send WAV as request body)\n`);
});
