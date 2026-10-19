// Renderiza o Index.html com dados falsos e tira prints no tamanho de celular.
// A tela conversa com o Code.gs de verdade (rodando sobre as planilhas falsas), então
// salvar situação ou nota no print grava de fato nas abas falsas.
// Uso: node test/screenshots.js <pasta-de-saida>
const fs = require('fs');
const path = require('path');
const assert = require('node:assert');
const { chromium } = require('playwright');
const { criarAmbiente } = require('./mocks');
const { montar, ID_LEADS, H } = require('./fixtures');

const saida = process.argv[2] || path.join(__dirname, 'prints');
fs.mkdirSync(saida, { recursive: true });

const SANDRO = 'sandro@exemplo.com';
const LUANA = 'luana@exemplo.com';

function ambiente() {
  const agora = Date.now();
  const f = montar(agora);
  const amb = criarAmbiente({ planilhas: { [ID_LEADS]: f.leads, '1bMl3twqjR-IWyGHFQQf0oHz1en8McFUgmjIyNs10sEc': f.leads, PLANILHA_APP_TESTE: f.app }, appSs: f.app });
  amb.estado.usuario = 'gabrielgoto2@gmail.com';
  amb.chamar('instalar');
  const cfg = f.app.getSheetByName('Config').values;
  cfg[1][1] = ID_LEADS; cfg[3][1] = new Date(agora - 48 * H); cfg[8][1] = SANDRO; cfg[9][1] = LUANA;
  const como = (e, fn, ...a) => { amb.estado.usuario = e; return amb.chamar(fn, ...a); };
  como(LUANA, 'salvar', 'l:2000000000000002', 'situacao', 'Visita agendada', 'Novo');
  como(LUANA, 'salvar', 'l:2000000000000002', 'qualificado', 'Sim', 'Ainda não sei');
  como(SANDRO, 'salvar', 'l:1000000000000004', 'situacao', 'Sem resposta', 'Novo');
  // Bruno tem duas entradas (Nest e Cedro): uma nota da Luana em cada uma, para ver as duas juntas.
  como(LUANA, 'salvarNota', 'l:1000000000000002', 'Pediu tabela do Nest. Prefere falar depois das 18h.');
  f.app.getSheetByName('Notas').values[1][1] = new Date(agora - 26 * H);
  como(LUANA, 'salvarNota', 'l:2000000000000001', 'Voltou pelo Cedro. Quer 4 suítes, vai vender o imóvel atual.');
  return { f, como };
}

const html = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Index.html'), 'utf8')
  .replace('<?= leadInicial ?>', '').replace('<?= appUrl ?>', 'https://script.google.com/macros/s/TESTE/exec');
const mock = `<script>
function runner(ok, falha) { return new Proxy({}, { get: (_, k) => k === 'withSuccessHandler' ? (fn) => runner(fn, falha) : k === 'withFailureHandler' ? (fn) => runner(ok, fn) : (...a) => window.__servidor(k, a).then(ok, e => falha(new Error(e.message))) }); }
window.google = { script: { run: runner(() => {}, () => {}), history: { push() {}, setChangeHandler() {} } } };
</script>`;
const arquivo = path.join(saida, 'index-teste.html');
fs.writeFileSync(arquivo, html.replace('<script>\nconst ICONES', mock + '\n<script>\nconst ICONES'));

async function abrir(browser, esquema, viewport) {
  const { f, como } = ambiente();
  const page = await browser.newPage({ viewport: viewport || { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: esquema });
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.exposeFunction('__servidor', (fn, args) => JSON.parse(JSON.stringify(como(SANDRO, fn, ...args))));
  await page.goto('file://' + arquivo);
  await page.waitForSelector('.card');
  await page.waitForTimeout(300);
  return { page, f, erros };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const foto = (page, nome, cheia) => page.screenshot({ path: path.join(saida, nome + '.png'), fullPage: !!cheia });
  for (const esquema of ['dark', 'light']) {
    const { page, f, erros } = await abrir(browser, esquema);
    await foto(page, esquema + '-1-lista', true);
    await page.click('.card');
    await page.waitForTimeout(300);
    await foto(page, esquema + '-2-lead');
    await page.evaluate(() => document.querySelector('#folha').scrollTo(0, 2000));
    await page.waitForTimeout(150);
    await foto(page, esquema + '-3-lead-controles');
    await page.click('[data-valor="Em contato"]');
    await page.waitForTimeout(300);
    await foto(page, esquema + '-4-lead-salvo');
    // lead com duplicado: as notas das duas entradas aparecem juntas
    await page.click('#btnVoltar');
    await page.click('.card:has-text("Bruno")');
    await page.waitForTimeout(250);
    await foto(page, esquema + '-5-duplicado');
    await page.evaluate(() => document.querySelector('#folha').scrollTo(0, 4000));
    await page.waitForTimeout(150);
    await foto(page, esquema + '-5b-duplicado-notas');

    // Nota num lead de EXEMPLO (Ana Teste, dado falso)
    await page.click('#btnVoltar');
    await page.click('.card:has-text("Ana Teste")');
    await page.waitForTimeout(250);
    assert.ok(await page.isDisabled('#btnNota'), 'botão desligado com o campo vazio');
    await page.click('#notaTexto');
    await page.keyboard.type('Atendeu no 2º toque. Mora de aluguel com a família, renda ok.\nQuer visitar sábado de manhã.');
    // a recarga automática não pode apagar o que está sendo digitado
    await page.evaluate(() => carregar(true));
    await page.waitForTimeout(300);
    assert.match(await page.inputValue('#notaTexto'), /sábado de manhã/, 'recarga apagou o rascunho');
    await page.evaluate(() => document.querySelector('#folha').scrollTo(0, 4000));
    await page.waitForTimeout(150);
    await foto(page, esquema + '-7-nota-digitando');
    await page.click('#btnNota');
    await page.waitForSelector('.nt-item');
    await page.waitForTimeout(250);
    await foto(page, esquema + '-8-nota-salva');
    assert.strictEqual(await page.inputValue('#notaTexto'), '', 'campo limpa depois de salvar');

    // correção da própria nota
    await page.click('[data-editar-nota]');
    await page.fill('[data-edicao]', 'Atendeu no 2º toque. Mora de aluguel com a família, renda ok.\nQuer visitar sábado às 10h.');
    await foto(page, esquema + '-9-nota-editando');
    await page.click('[data-salvar-edicao]');
    await page.waitForSelector('.nt-texto:has-text("sábado às 10h")');
    await page.waitForTimeout(250);
    await foto(page, esquema + '-10-nota-corrigida');

    // situação continua 1 toque, sem nota
    await page.click('[data-valor="Visita agendada"]');
    await page.waitForTimeout(300);
    await page.click('#btnVoltar');
    await page.waitForTimeout(250);
    await foto(page, esquema + '-11-lista-com-nota', true);

    // o que ficou gravado na aba Notas falsa
    const linhas = f.app.getSheetByName('Notas').values;
    const daAna = linhas.filter(r => r[2] === 'l:1000000000000001');
    assert.strictEqual(daAna.length, 2, 'nota + correção = 2 linhas');
    assert.strictEqual(daAna[0][0], daAna[1][0], 'correção usa o mesmo nota_id');
    assert.strictEqual(daAna[0][3], SANDRO);
    assert.match(daAna[0][4], /sábado de manhã/, 'versão original preservada');
    assert.match(daAna[1][4], /sábado às 10h/);
    if (esquema === 'dark') console.log('Aba Notas (falsa):\n' + linhas.map(r => r.map(v => v instanceof Date ? v.toISOString() : String(v).replace(/\n/g, '⏎')).join(' | ')).join('\n'));

    await page.click('#navPainel');
    await page.waitForSelector('.kpi');
    await page.waitForTimeout(300);
    await foto(page, esquema + '-6-painel', true);
    if (erros.length) { console.log(esquema, 'ERROS:', erros); process.exitCode = 1; }
    await page.close();
  }
  const { page: desk } = await abrir(browser, 'dark', { width: 1280, height: 900 });
  await desk.click('#navPainel');
  await desk.waitForSelector('.kpi');
  await desk.waitForTimeout(300);
  await desk.screenshot({ path: path.join(saida, 'desktop-painel.png'), fullPage: true });
  await browser.close();
  console.log('ok', saida);
})().catch(e => { console.error(e); process.exit(1); });
