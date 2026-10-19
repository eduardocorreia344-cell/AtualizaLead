// Rode com: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const igual = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, m);
const { criarAmbiente } = require('./mocks');
const { montar, ID_LEADS, H } = require('./fixtures');

const DONO = 'gabrielgoto2@gmail.com';
const SANDRO = 'sandro@exemplo.com';
const LUANA = 'luana@exemplo.com';

function preparar() {
  const agora = Date.now();
  const f = montar(agora);
  const amb = criarAmbiente({ planilhas: { [ID_LEADS]: f.leads, '1bMl3twqjR-IWyGHFQQf0oHz1en8McFUgmjIyNs10sEc': f.leads, PLANILHA_APP_TESTE: f.app }, appSs: f.app });
  amb.estado.usuario = DONO;
  amb.chamar('instalar');
  const cfg = f.app.getSheetByName('Config');
  cfg.values[1][1] = ID_LEADS;
  cfg.values[3][1] = new Date(agora - 48 * H); // sistema "entrou no ar" há 2 dias
  cfg.values[8][1] = SANDRO;
  cfg.values[9][1] = LUANA;
  const como = (email, fn, ...args) => { amb.estado.usuario = email; amb.estado.efetivo = email; return amb.chamar(fn, ...args); };
  return { amb, f, agora, como };
}

test('instalar cria abas, gatilho e não mexe na planilha de leads', () => {
  const { amb, f } = preparar();
  assert.deepStrictEqual(f.app.getSheets().map(s => s.name), ['Config', 'Registros']);
  assert.strictEqual(amb.estado.gatilhos.length, 1);
  assert.strictEqual(amb.estado.props.dono, DONO);
  assert.ok(f.app.getSheetByName('Registros').protegida);
  const antes = JSON.stringify(f.leads.getSheets().map(s => s.values));
  const { como } = { como: (e, fn, ...a) => { amb.estado.usuario = e; return amb.chamar(fn, ...a); } };
  como(SANDRO, 'carregar');
  assert.strictEqual(JSON.stringify(f.leads.getSheets().map(s => s.values)), antes, 'planilha de leads alterada!');
});

test('reinstalar por outra conta é bloqueado', () => {
  const { amb } = preparar();
  amb.estado.usuario = SANDRO; amb.estado.efetivo = SANDRO;
  assert.throws(() => amb.chamar('instalar'), /Só essa conta/);
});

test('carregar: lê todas as abas, ignora testes, junta duplicados', () => {
  const { como } = preparar();
  const d = como(SANDRO, 'carregar');
  assert.strictEqual(d.usuario.nome, 'Sandro');
  igual(d.empreendimentos, ['Nest', 'Cedro', 'Sensia Patamares']);
  const nomes = d.contatos.map(c => c.nome).sort();
  // 5 Nest + 2 Cedro + 1 Sensia = 8 entradas reais; Bruno (Nest+Cedro) vira 1 contato; Gabi repetida vira 1
  igual(nomes, ['Ana Teste', 'Bruno E.', 'Carla Negrito', 'Davi Antigo', 'Eva Exterior', 'Fábio Cedro', 'Gabi Sensia']);
  assert.ok(!JSON.stringify(d).includes('test lead'));
  assert.ok(!/ana@|bruno@|gabi@/.test(JSON.stringify(d.contatos)), 'e-mail do lead não deve ir para a tela');

  const bruno = d.contatos.find(c => c.nome === 'Bruno E.');
  assert.strictEqual(bruno.emp, 'Cedro');
  assert.strictEqual(bruno.ids.length, 2);
  assert.strictEqual(bruno.antes.length, 1);
  assert.strictEqual(bruno.antes[0].emp, 'Nest');
  assert.strictEqual(bruno.telefone, '(71) 99922-0002');
  assert.strictEqual(bruno.discar, '+5571999220002');

  const ana = d.contatos.find(c => c.nome === 'Ana Teste');
  igual(ana.respostas, [
    { p: 'Tipologia', r: '🏡 3 quartos (75m²) — varanda gourmet + suíte'.replace('3 quartos (75m²)', '2 quartos (62m²)') },
    { p: 'Faixa de investimento', r: 'R$ 750 mil a R$ 850 mil' },
  ]);
  assert.strictEqual(ana.situacao, 'Novo');
  assert.strictEqual(ana.qualificado, 'Ainda não sei');
  assert.strictEqual(ana.anterior, false);

  const gabi = d.contatos.find(c => c.nome === 'Gabi Sensia');
  igual(gabi.respostas.map(r => r.p), ['Objetivo', 'Renda familiar', 'Como pretende investir (a partir de R$ 815 mil)']);
  assert.strictEqual(d.contatos.find(c => c.nome === 'Davi Antigo').anterior, true);
  assert.strictEqual(d.contatos.find(c => c.nome === 'Eva Exterior').discar, '+17199940556');
  const fabio = d.contatos.find(c => c.nome === 'Fábio Cedro');
  igual(fabio.respostas.map(r => r.p), ['Planta', 'Imóvel onde mora hoje', 'Como pretende pagar']);
});

test('quem não está na Config não entra', () => {
  const { como, amb } = preparar();
  assert.throws(() => como('intruso@exemplo.com', 'carregar'), /não autorizado/);
  assert.throws(() => como('intruso@exemplo.com', 'salvar', 'l:1000000000000001', 'situacao', 'Venda', 'Novo'), /não autorizado/);
  assert.throws(() => como('intruso@exemplo.com', 'painel', {}), /não autorizado/);
  const pg = como('intruso@exemplo.com', 'doGet', { parameter: {} });
  assert.match(pg.html, /Acesso restrito/);
  const exp = como('intruso@exemplo.com', 'doGet', { parameter: { exportar: 'completo' } });
  assert.match(exp.html, /Acesso restrito/);
  amb.estado.usuario = '';
  assert.match(amb.chamar('doGet', { parameter: {} }).html, /Acesso restrito/);
});

test('salvar grava histórico e muda estado, tempo de resposta e painel', () => {
  const { como, f } = preparar();
  const r = como(SANDRO, 'salvar', 'l:1000000000000001', 'situacao', 'Em contato', 'Novo');
  assert.strictEqual(r.por, 'Sandro');
  como(LUANA, 'salvar', 'l:1000000000000001', 'qualificado', 'Sim', 'Ainda não sei');
  como(LUANA, 'salvar', 'l:2000000000000002', 'situacao', 'Sem resposta', 'Novo');
  como(LUANA, 'salvar', 'l:2000000000000002', 'qualificado', 'Não', 'Ainda não sei');
  assert.throws(() => como(SANDRO, 'salvar', 'l:1000000000000001', 'situacao', 'Inventado', 'Novo'), /Valor inválido/);
  assert.throws(() => como(SANDRO, 'salvar', 'l:1000000000000001', 'corretor', 'Sandro', ''), /Valor inválido/);
  assert.throws(() => como(SANDRO, 'salvar', '=HYPERLINK("x")', 'situacao', 'Venda', 'Novo'), /Lead inválido/);

  const reg = f.app.getSheetByName('Registros').values;
  assert.strictEqual(reg.length, 5);
  igual(reg[1].slice(1), ['l:1000000000000001', SANDRO, 'situacao', 'Novo', 'Em contato']);

  const d = como(SANDRO, 'carregar');
  const ana = d.contatos.find(c => c.nome === 'Ana Teste');
  assert.strictEqual(ana.situacao, 'Em contato');
  assert.strictEqual(ana.qualificado, 'Sim');
  assert.strictEqual(ana.ultima.por, 'Luana');

  const p = como(DONO, 'painel', { dias: 30 }); // gestor abre o painel
  igual(p.corretores.map(c => c.nome), ['Sandro', 'Luana'], 'gestor fora da comparação');
  const sandro = p.corretores.find(c => c.nome === 'Sandro');
  const luana = p.corretores.find(c => c.nome === 'Luana');
  assert.strictEqual(sandro.respostas, 1);
  assert.ok(sandro.tempoMedio > 0.4 * H && sandro.tempoMedio < 0.6 * H, 'tempo de resposta ~30 min');
  assert.strictEqual(luana.respostas, 1);
  assert.strictEqual(luana.avaliados, 2);
  assert.strictEqual(luana.qualificados, 1);
  assert.strictEqual(sandro.atualizacoes7d, 1);
  assert.strictEqual(p.total.contatos, 7);
  assert.strictEqual(p.total.entradas, 8);
  assert.strictEqual(p.total.avaliados, 2);
  assert.strictEqual(p.total.qualificados, 1);
  assert.strictEqual(p.total.situacoes['Em contato'], 1);
  assert.strictEqual(p.total.situacoes['Sem resposta'], 1);
  // Bruno conta no Nest (primeira entrada); a entrada do Cedro conta só em "entradas"
  const cedro = p.linhas.find(x => x.nivel === 0 && x.campanha === 'Leads - Cedro');
  assert.strictEqual(cedro.entradas, 2);
  assert.strictEqual(cedro.contatos, 1);
  // ordem hierárquica: campanha, depois seus conjuntos, depois anúncios
  const niveis = p.linhas.map(x => x.nivel);
  assert.strictEqual(niveis[0], 0);
  assert.strictEqual(niveis[1], 1);
  assert.strictEqual(niveis[2], 2);

  const p7 = como(LUANA, 'painel', { dias: 7, emp: 'Nest' });
  assert.strictEqual(p7.total.contatos, 3); // Ana, Bruno, Carla (Davi e Eva >7 dias)
});

test('lead que volta depois de atendido aparece como "voltou"', () => {
  const { como } = preparar();
  // atualiza Bruno usando a entrada antiga (Nest) — histórico vale para o contato todo
  como(SANDRO, 'salvar', 'l:1000000000000002', 'situacao', 'Em contato', 'Novo');
  let bruno = como(SANDRO, 'carregar').contatos.find(c => c.nome === 'Bruno E.');
  assert.strictEqual(bruno.situacao, 'Em contato');
  assert.strictEqual(bruno.voltou, false); // a entrada do Cedro (há 1h) é anterior à atualização (agora)
});

test('aviso por e-mail: só leads depois do início, uma vez só, só pelo dono', () => {
  const { como, amb } = preparar();
  como(SANDRO, 'verificarNovosLeads');
  assert.strictEqual(amb.estado.emails.length, 0, 'corretor não dispara e-mail');

  como(DONO, 'verificarNovosLeads');
  // depois do início (2 dias): Ana, Bruno(Nest), Carla, Bruno(Cedro), Fábio, Gabi = 6 > 5 → 1 e-mail-resumo
  assert.strictEqual(amb.estado.emails.length, 1);
  assert.match(amb.estado.emails[0].subject, /6 leads novos/);
  assert.strictEqual(amb.estado.emails[0].to, SANDRO + ',' + LUANA, 'gestor não recebe aviso');
  assert.ok(!/Davi|Eva|@exemplo|9922/.test(amb.estado.emails[0].htmlBody), 'sem leads antigos nem dados de contato no e-mail');
  assert.match(amb.estado.emails[0].htmlBody, /Já entrou antes/);
  assert.match(amb.estado.emails[0].htmlBody, /\?lead=l%3A/);

  como(DONO, 'verificarNovosLeads');
  assert.strictEqual(amb.estado.emails.length, 1, 'não repete aviso');
});

test('aviso individual quando chegam poucos leads', () => {
  const { como, amb, f, agora } = preparar();
  f.app.getSheetByName('Config').values[3][1] = new Date(agora - 2 * H); // só Ana, Bruno(Cedro) e Gabi
  como(DONO, 'verificarNovosLeads');
  assert.strictEqual(amb.estado.emails.length, 3);
  assert.ok(amb.estado.emails.some(e => /Novo lead · Cedro \(já entrou antes\)/.test(e.subject)));
});

test('exportações: resumo sem dados pessoais, completo com lead_id', () => {
  const { como } = preparar();
  como(SANDRO, 'salvar', 'l:1000000000000001', 'situacao', 'Visita agendada', 'Novo');
  const resumo = como(SANDRO, 'doGet', { parameter: { exportar: 'resumo', dias: '0' } });
  assert.match(resumo.arquivo, /^villa-verde-resumo-/);
  assert.ok(!/@|Ana|Bruno|9922|l:1/.test(resumo.conteudo), 'resumo vazou dado pessoal');
  assert.match(resumo.conteudo, /situacao_visita_agendada/);

  const completo = como(SANDRO, 'doGet', { parameter: { exportar: 'completo' } });
  const linhas = completo.conteudo.replace(/^﻿/, '').split('\r\n');
  assert.strictEqual(linhas.length, 1 + 8);
  assert.ok(linhas[0].startsWith('lead_id;chegada'));
  assert.ok(completo.conteudo.includes('l:1000000000000001'));
  assert.ok(completo.conteudo.includes('+5571981110001'), 'telefone não vira fórmula');

  const hist = como(SANDRO, 'doGet', { parameter: { exportar: 'historico' } });
  assert.match(hist.conteudo, /Sandro;situacao;Novo;Visita agendada/);
});

test('notas: aba própria, duplicados juntos, mais recente primeiro, painel intocado', () => {
  const { como, f } = preparar();
  como(SANDRO, 'salvar', 'l:1000000000000002', 'situacao', 'Em contato', 'Novo');
  const painelAntes = JSON.stringify(como(DONO, 'painel', { dias: 0 }));
  const registrosAntes = JSON.stringify(f.app.getSheetByName('Registros').values);
  const leadsAntes = JSON.stringify(f.leads.getSheets().map(s => s.values));
  assert.strictEqual(f.app.getSheetByName('Notas'), null, 'aba só nasce na primeira nota');

  // Bruno tem duas entradas: Nest (l:1…2) e Cedro (l:2…1). Uma nota em cada.
  const n1 = como(SANDRO, 'salvarNota', 'l:1000000000000002', 'Prefere falar depois das 18h');
  const notas = f.app.getSheetByName('Notas');
  notas.values[1][1] = new Date(Date.now() - 5 * 60000); // nota do Sandro foi há 5 min
  const n2 = como(LUANA, 'salvarNota', 'l:2000000000000001', 'Vai visitar com a esposa');
  assert.strictEqual(n1.por, 'Sandro');
  assert.match(n2.id, /^n:/);

  igual(notas.values[0], ['nota_id', 'data_hora', 'lead_id', 'autor', 'texto']);
  igual(notas.values[2].slice(2), ['l:2000000000000001', LUANA, 'Vai visitar com a esposa']);
  assert.ok(notas.protegida);

  const d = como(SANDRO, 'carregar');
  const bruno = d.contatos.find(c => c.nome === 'Bruno E.');
  igual(bruno.notas.map(n => [n.por, n.texto, n.minha]), [
    ['Luana', 'Vai visitar com a esposa', false],
    ['Sandro', 'Prefere falar depois das 18h', true],
  ]);
  assert.ok(d.contatos.filter(c => c.nome !== 'Bruno E.').every(c => c.notas.length === 0));
  assert.ok(!/@exemplo/.test(JSON.stringify(d.contatos)), 'e-mail (de lead ou de corretor) não vai para a tela');
  assert.strictEqual(d.minutosEditarNota, 10);

  assert.strictEqual(JSON.stringify(como(DONO, 'painel', { dias: 0 })), painelAntes, 'nota mudou o painel');
  assert.strictEqual(JSON.stringify(f.app.getSheetByName('Registros').values), registrosAntes, 'nota mexeu em Registros');
  assert.strictEqual(JSON.stringify(f.leads.getSheets().map(s => s.values)), leadsAntes, 'nota mexeu na planilha de leads');
});

test('notas: só o autor corrige, até 10 minutos, sem apagar a versão anterior', () => {
  const { como, f } = preparar();
  const n = como(SANDRO, 'salvarNota', 'l:1000000000000001', 'Liga dpeois das 18h');
  assert.throws(() => como(LUANA, 'editarNota', n.id, 'outra coisa'), /Só quem escreveu/);

  const e = como(SANDRO, 'editarNota', n.id, 'Ligar depois das 18h');
  assert.ok(e.editadaEm);
  assert.strictEqual(e.t, n.t, 'a data da nota continua a da criação');
  const notas = f.app.getSheetByName('Notas');
  assert.strictEqual(notas.values.length, 3, 'correção é linha nova');
  assert.strictEqual(notas.values[1][4], 'Liga dpeois das 18h', 'versão anterior preservada');

  // Linha forjada à mão por outra pessoa com o mesmo nota_id é ignorada.
  notas.appendRow([n.id, new Date(Date.now() + 1000), 'l:1000000000000001', LUANA, 'texto trocado']);
  const ana = como(LUANA, 'carregar').contatos.find(c => c.nome === 'Ana Teste');
  assert.strictEqual(ana.notas.length, 1);
  assert.strictEqual(ana.notas[0].texto, 'Ligar depois das 18h');
  assert.ok(ana.notas[0].editadaEm);
  assert.strictEqual(ana.notas[0].minha, false, 'para a Luana, a nota não é dela');

  notas.values[1][1] = new Date(Date.now() - 11 * 60000); // criada há 11 min
  assert.throws(() => como(SANDRO, 'editarNota', n.id, 'tarde demais'), /prazo de 10 minutos/);
});

test('notas: validação e texto que parece fórmula', () => {
  const { como, f } = preparar();
  assert.throws(() => como(SANDRO, 'salvarNota', 'l:1000000000000001', '   '), /vazia/);
  assert.throws(() => como(SANDRO, 'salvarNota', 'l:1000000000000001', 'x'.repeat(501)), /500 caracteres/);
  assert.throws(() => como(SANDRO, 'salvarNota', '=HYPERLINK("x")', 'oi'), /Lead inválido/);
  assert.throws(() => como('intruso@exemplo.com', 'salvarNota', 'l:1000000000000001', 'oi'), /não autorizado/);
  assert.throws(() => como(SANDRO, 'editarNota', 'qualquer', 'oi'), /Nota inválida/);
  assert.throws(() => como(SANDRO, 'editarNota', 'n:naoexiste', 'oi'), /não encontrada/);

  como(SANDRO, 'salvarNota', 'l:1000000000000001', '=HYPERLINK("http://x")');
  como(SANDRO, 'salvarNota', 'l:1000000000000001', '- ligou, sem resposta\nTentar amanhã');
  const gravados = f.app.getSheetByName('Notas').values.slice(1).map(r => r[4]);
  assert.ok(gravados.every(t => !/^[=+\-@]/.test(t)), 'nada gravado pode virar fórmula');
  const ana = como(SANDRO, 'carregar').contatos.find(c => c.nome === 'Ana Teste');
  igual(ana.notas.map(n => n.texto).sort(), ['- ligou, sem resposta\nTentar amanhã', '=HYPERLINK("http://x")']);
});

test('exportações: notas só na base completa', () => {
  const { como } = preparar();
  como(SANDRO, 'salvarNota', 'l:1000000000000001', 'Renda 20 mil; mora com a mãe');
  const resumo = como(SANDRO, 'doGet', { parameter: { exportar: 'resumo', dias: '0' } }).conteudo;
  const hist = como(SANDRO, 'doGet', { parameter: { exportar: 'historico' } }).conteudo;
  assert.ok(!/Renda 20|mora com/.test(resumo + hist), 'nota vazou em exportação sem dados pessoais');

  const linhas = como(SANDRO, 'doGet', { parameter: { exportar: 'completo' } }).conteudo.replace(/^﻿/, '').split('\r\n');
  assert.ok(linhas[0].endsWith(';notas'));
  const ana = linhas.find(l => l.startsWith('l:1000000000000001;'));
  assert.match(ana, /Sandro: Renda 20 mil; mora com a mãe"$/, 'nota com ; vai entre aspas');
});

test('campoCsv_ neutraliza fórmulas e escapa separadores', () => {
  const { amb } = preparar();
  assert.strictEqual(amb.interno('campoCsv_("=1+1")'), "'=1+1");
  assert.strictEqual(amb.interno('campoCsv_("+5571999")'), '+5571999');
  assert.strictEqual(amb.interno('campoCsv_("a;b")'), '"a;b"');
});

test('normalizarTelefone_ casa com e sem nono dígito', () => {
  const { amb } = preparar();
  const n = s => amb.interno('normalizarTelefone_(' + JSON.stringify(s) + ')');
  assert.strictEqual(n('p:+5571999554776').chave, n('p:7199554776').chave);
  assert.strictEqual(n('p:5571988032752').discar, '+5571988032752');
  assert.strictEqual(n('p:71987846555').discar, '+5571987846555');
  assert.strictEqual(n('p:+557133334444').discar, '+557133334444'); // fixo: não ganha 9
  assert.strictEqual(n('p:<test lead: dummy data for telefone>'), null);
});

test('doGet abre o app e repassa o lead do link do e-mail', () => {
  const { como } = preparar();
  const pg = como(SANDRO, 'doGet', { parameter: { lead: 'l:1000000000000001' } });
  assert.strictEqual(pg.html, 'TEMPLATE:Index');
  assert.strictEqual(pg.t.leadInicial, 'l:1000000000000001');
});
