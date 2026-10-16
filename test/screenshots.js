// Renderiza o Index.html com dados falsos e tira prints no tamanho de celular.
// Uso: node test/screenshots.js <pasta-de-saida>
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { criarAmbiente } = require('./mocks');
const { montar, ID_LEADS, H } = require('./fixtures');

const saida = process.argv[2] || path.join(__dirname, 'prints');
fs.mkdirSync(saida, { recursive: true });

const agora = Date.now();
const f = montar(agora);
const amb = criarAmbiente({ planilhas: { [ID_LEADS]: f.leads, '1bMl3twqjR-IWyGHFQQf0oHz1en8McFUgmjIyNs10sEc': f.leads, PLANILHA_APP_TESTE: f.app }, appSs: f.app });
amb.estado.usuario = 'provecta@exemplo.com';
amb.chamar('instalar');
const cfg = f.app.getSheetByName('Config').values;
cfg[1][1] = ID_LEADS; cfg[3][1] = new Date(agora - 48 * H); cfg[8][1] = 'sandro@exemplo.com'; cfg[9][1] = 'luana@exemplo.com';
const como = (e, fn, ...a) => { amb.estado.usuario = e; return amb.chamar(fn, ...a); };
como('luana@exemplo.com', 'salvar', 'l:2000000000000002', 'situacao', 'Visita agendada', 'Novo');
como('luana@exemplo.com', 'salvar', 'l:2000000000000002', 'qualificado', 'Sim', 'Ainda não sei');
como('sandro@exemplo.com', 'salvar', 'l:1000000000000004', 'situacao', 'Sem resposta', 'Novo');
const dados = como('sandro@exemplo.com', 'carregar');
const painel = como('sandro@exemplo.com', 'painel', { dias: 30 });

const html = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Index.html'), 'utf8')
  .replace('<?= leadInicial ?>', '').replace('<?= appUrl ?>', 'https://script.google.com/macros/s/TESTE/exec');
const mock = `<script>
window.__dados = ${JSON.stringify(dados)};
window.__painel = ${JSON.stringify(painel)};
const resp = { carregar: () => JSON.parse(JSON.stringify(window.__dados)), painel: () => window.__painel, salvar: () => ({ t: Date.now(), por: 'Sandro' }) };
function runner(ok, falha) { return new Proxy({}, { get: (_, k) => k === 'withSuccessHandler' ? (fn) => runner(fn, falha) : k === 'withFailureHandler' ? (fn) => runner(ok, fn) : (...a) => setTimeout(() => ok(resp[k](...a)), 30) }); }
window.google = { script: { run: runner(() => {}, () => {}), history: { push() {}, setChangeHandler() {} } } };
</script>`;
const arquivo = path.join(saida, 'index-teste.html');
fs.writeFileSync(arquivo, html.replace('<script>\nconst ICONES', mock + '\n<script>\nconst ICONES'));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  for (const esquema of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: esquema });
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await page.goto('file://' + arquivo);
    await page.waitForSelector('.card');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(saida, esquema + '-1-lista.png'), fullPage: true });
    await page.click('.card');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(saida, esquema + '-2-lead.png') });
    await page.evaluate(() => document.querySelector('#folha').scrollTo(0, 2000));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(saida, esquema + '-3-lead-controles.png') });
    await page.click('[data-valor="Em contato"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(saida, esquema + '-4-lead-salvo.png') });
    // lead com duplicado
    await page.click('#btnVoltar');
    await page.click('.card:has-text("Bruno")');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(saida, esquema + '-5-duplicado.png') });
    await page.click('#btnVoltar');
    await page.click('#navPainel');
    await page.waitForSelector('.kpi');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(saida, esquema + '-6-painel.png'), fullPage: true });
    if (erros.length) console.log(esquema, 'ERROS:', erros);
    await page.close();
  }
  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  await desk.goto('file://' + arquivo);
  await desk.waitForSelector('.card');
  await desk.click('#navPainel');
  await desk.waitForSelector('.kpi');
  await desk.waitForTimeout(300);
  await desk.screenshot({ path: path.join(saida, 'desktop-painel.png'), fullPage: true });
  await browser.close();
  console.log('ok', saida);
})();
