// Optional real-browser regression: node --test <this file> (uses installed Edge).
// Synthetic bytes only. No application credentials, private files or Storage calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';

test(
  'Blob readable locally, inaccessible in incognito, and invalid after revocation',
  { timeout: 45000 },
  async (t) => {
    const executable =
      process.env.DOCUMENTOS_BROWSER ??
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    try {
      await access(executable);
    } catch {
      t.skip('Set DOCUMENTOS_BROWSER to an installed Chromium/Edge executable');
      return;
    }
    const profile = await mkdtemp(join(tmpdir(), 'documentos-blob-test-'));
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      res.end('<!doctype html><title>Document Blob isolation test</title>');
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = spawn(
      executable,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { stdio: 'ignore', windowsHide: true },
    );
    let socket;
    let send;
    try {
      let debuggerPath;
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          debuggerPath = await readFile(join(profile, 'DevToolsActivePort'), 'utf8');
          break;
        } catch {
          await pause(100);
        }
      }
      assert.ok(debuggerPath, 'Browser debugging endpoint must start');
      const [port, path] = debuggerPath.trim().split(/\r?\n/);
      socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
      await new Promise((r, reject) => {
        socket.addEventListener('open', r, { once: true });
        socket.addEventListener('error', reject, { once: true });
      });
      const pending = new Map();
      let sequence = 0;
      socket.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) reject(new Error('Browser protocol command failed'));
          else resolve(msg.result);
        }
      });
      send = (method, params = {}, sessionId) =>
        new Promise((resolve, reject) => {
          const id = ++sequence;
          pending.set(id, { resolve, reject });
          socket.send(JSON.stringify({ id, method, params, sessionId }));
        });
      const page = async (browserContextId) => {
        const { targetId } = await send('Target.createTarget', {
          url: 'about:blank',
          browserContextId,
        });
        const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
        await send('Page.navigate', { url: origin }, sessionId);
        for (let i = 0; i < 100; i++) {
          const { result } = await send(
            'Runtime.evaluate',
            { expression: `location.origin === ${JSON.stringify(origin)}`, returnByValue: true },
            sessionId,
          );
          if (result.value) return sessionId;
          await pause(50);
        }
        throw new Error('Local test page did not load');
      };
      const evaluate = async (sessionId, expression) => {
        const { result, exceptionDetails } = await send(
          'Runtime.evaluate',
          { expression, awaitPromise: true, returnByValue: true },
          sessionId,
        );
        assert.ok(!exceptionDetails, 'Browser expression must succeed');
        return result.value;
      };
      const owner = await page();
      const url = await evaluate(
        owner,
        "URL.createObjectURL(new Blob(['synthetic-document-bytes'], {type:'text/plain'}))",
      );
      assert.ok(url.startsWith('blob:'), 'Only a local Blob URL is used');
      const read = `fetch(${JSON.stringify(url)}).then(r => r.text()).catch(() => null)`;
      assert.equal(await evaluate(owner, read), 'synthetic-document-bytes');
      const { browserContextId } = await send('Target.createBrowserContext', {});
      const incognito = await page(browserContextId);
      assert.equal(
        await evaluate(incognito, read),
        null,
        'Incognito cannot retrieve the Blob even from the same site',
      );
      const navigation = await send('Page.navigate', { url }, incognito);
      assert.ok(navigation.errorText, 'Pasting the URL into incognito must fail');
      await evaluate(owner, `URL.revokeObjectURL(${JSON.stringify(url)})`);
      assert.equal(await evaluate(owner, read), null, 'Revocation releases future access');
    } finally {
      if (socket?.readyState === WebSocket.OPEN) {
        // Do not wait for a response: Browser.close may close the socket first.
        socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' }));
        socket.close();
      }
      await new Promise((r) => server.close(r));
      if (browser.exitCode === null)
        await Promise.race([new Promise((r) => browser.once('exit', r)), pause(2000)]);
      if (browser.exitCode === null) browser.kill();
      // Delete only this test's generated profile, within the OS temporary folder.
      assert.equal(dirname(resolve(profile)), resolve(tmpdir()));
      assert.ok(profile.includes('documentos-blob-test-'));
      await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  },
);
