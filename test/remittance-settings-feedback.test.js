import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('  var _remittanceSettings ='), html.indexOf('  // ── PAYUNi 收款設定分頁'));
const tick = () => new Promise(setImmediate);
function harness(apiFetch, payload = { enabled: true, instruction: '', accounts: [{ bankName: '測試銀行', accountNo: '12345' }] }) {
  const nodes = new Map();
  const panel = { querySelectorAll: () => [], set innerHTML(value) {
    for (const id of ['remittance-save', 'remittance-status']) nodes.set(id, { style: {}, textContent: '', disabled: false, addEventListener(type, fn) { this[type] = fn; } });
  } };
  const ctx = vm.createContext({ document: { getElementById: (id) => id === 'remittance-panel-content' ? panel : nodes.get(id) }, apiFetch, escHtml: (v) => v || '' });
  vm.runInContext(source, ctx);
  ctx.readRemittanceForm = () => payload;
  ctx.renderRemittanceSettings();
  return { ctx, nodes, payload };
}

test('saving shows progress and success on the newly rendered status element', async () => {
  let resolve;
  const h = harness(() => new Promise((r) => { resolve = r; }));
  const oldStatus = h.nodes.get('remittance-status');
  h.nodes.get('remittance-save').click();
  assert.equal(oldStatus.style.display, 'block');
  assert.equal(oldStatus.textContent, '儲存中…');
  assert.equal(h.nodes.get('remittance-save').disabled, true);
  resolve({ ok: true, json: async () => ({ ok: true, ...h.payload }) });
  await tick();
  const status = h.nodes.get('remittance-status');
  assert.notEqual(status, oldStatus);
  assert.equal(status.style.display, 'block');
  assert.equal(status.textContent, '儲存成功，銀行匯款已開啟');
});

test('enabling without accounts displays validation and does not send a request', () => {
  const h = harness(() => assert.fail('must not send'), { enabled: true, accounts: [] });
  h.nodes.get('remittance-save').click();
  assert.equal(h.nodes.get('remittance-status').style.display, 'block');
  assert.match(h.nodes.get('remittance-status').textContent, /新增至少一組/);
});

test('HTTP errors remain visible and allow saving again', async () => {
  const h = harness(async () => ({ ok: false, json: async () => ({ ok: false, error: '請重新登入' }) }));
  h.nodes.get('remittance-save').click();
  await tick();
  assert.equal(h.nodes.get('remittance-status').textContent, '請重新登入');
  assert.equal(h.nodes.get('remittance-status').style.display, 'block');
  assert.equal(h.nodes.get('remittance-save').disabled, false);
  assert.equal(h.nodes.get('remittance-save').textContent, '儲存');
});

test('reports the actual off state when incomplete accounts are rejected by normalization', async () => {
  const h = harness(async () => ({ ok: true, json: async () => ({ ok: true, enabled: false, accounts: [] }) }));
  h.nodes.get('remittance-save').click();
  await tick();
  assert.match(h.nodes.get('remittance-status').textContent, /仍為關閉/);
  assert.equal(h.nodes.get('remittance-status').style.display, 'block');
});

test('saving a disabled switch confirms it is off', async () => {
  const h = harness(async () => ({ ok: true, json: async () => ({ ok: true, enabled: false, accounts: [] }) }), { enabled: false, accounts: [] });
  h.nodes.get('remittance-save').click();
  await tick();
  assert.equal(h.nodes.get('remittance-status').textContent, '儲存成功，銀行匯款已關閉');
});
