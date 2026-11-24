import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('la pantalla sin conexión recupera la sesión o redirige al acceso', async () => {
  const html = readFileSync(new URL('../public/offline.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  for (const scenario of [
    { response: { ok: true, json: async () => null }, destination: '/login' },
    { response: { ok: true, json: async () => ({ user: { id: '1' } }) }, destination: '/' },
    { response: { ok: false, status: 401 }, destination: '/login' },
    { response: { ok: false, status: 503 }, destination: null },
    { failure: true, destination: null },
  ]) {
    let destination = null;
    const status = { textContent: '' };
    const elements = { status, retry: { addEventListener() {} } };
    const context = { document: { getElementById: id => elements[id] }, window: { addEventListener() {} }, location: { replace: url => { destination = url; } }, fetch: async () => { if (scenario.failure) throw new Error('offline'); return scenario.response; } };
    vm.runInNewContext(script, context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(destination, scenario.destination);
    if (!scenario.destination) assert.match(status.textContent, /No se puede conectar/);
  }
});

test('el service worker redirige un 401 y conserva el modo sin red', async () => {
  const script = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const handlers = {};
  let response;
  const context = { self: { location: { origin: 'https://example.test' }, addEventListener: (event, handler) => { handlers[event] = handler; } }, caches: { match: async () => 'offline' }, fetch: async () => response, URL, Response };
  vm.runInNewContext(script, context);
  async function navigate(path) {
    let result;
    handlers.fetch({ request: { mode: 'navigate', url: `https://example.test${path}` }, respondWith: p => { result = p; } });
    return result;
  }
  response = new Response(null, { status: 401 });
  const redirected = await navigate('/trabajos');
  assert.equal(redirected.status, 302);
  assert.equal(redirected.headers.get('location'), 'https://example.test/login');
  assert.equal((await navigate('/login')).status, 401);
  response = new Response(null, { status: 503 });
  assert.equal((await navigate('/')).status, 503);
  context.fetch = async () => { throw new Error('offline'); };
  assert.equal(await navigate('/'), 'offline');
});
