/**
 * Villa Verde · Leads — web app de atendimento (ponte até o VGV Copilot).
 *
 * - Lê a planilha de leads da Meta SOMENTE PARA LEITURA. Nunca escreve nela.
 * - Cada toque do corretor vira uma linha nova na aba "Registros" desta planilha
 *   (data/hora, lead_id, autor, campo, de, para). Nada é apagado nem sobrescrito.
 * - Situação atual, tempo de resposta e duplicados são calculados a partir desse histórico.
 */

const SITUACOES = ['Novo', 'Em contato', 'Sem resposta', 'Visita agendada', 'Visita realizada', 'Proposta', 'Venda', 'Perdido'];
const QUALIFICACOES = ['Sim', 'Não', 'Ainda não sei'];
const SITUACAO_PADRAO = 'Novo';
const QUALIFICADO_PADRAO = 'Ainda não sei';

const ABA_CONFIG = 'Config';
const ABA_REGISTROS = 'Registros';
const CABECALHO_REGISTROS = ['data_hora', 'lead_id', 'autor', 'campo', 'de', 'para'];

const PLANILHA_LEADS_PADRAO = '1bMl3twqjR-IWyGHFQQf0oHz1en8McFUgmjIyNs10sEc';
const EMAIL_GESTOR_PADRAO = 'gabrielgoto2@gmail.com';
const FUSO = 'America/Bahia';
const MAX_EMAILS_INDIVIDUAIS = 5;

// Colunas que a Meta sempre manda e que não são perguntas do formulário.
const CAMPOS_META = ['id', 'created_time', 'ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name',
  'form_id', 'form_name', 'is_organic', 'platform', 'email', 'lead_status', 'inbox_url'];
const CAMPOS_TELEFONE = ['phone_number', 'telefone', 'número_do_whatsapp', 'numero_do_whatsapp', 'whatsapp_number', 'whatsapp', 'celular'];
const CAMPOS_NOME = ['full_name', 'nome_completo', 'nome', 'first_name'];

// Rótulos curtos para as perguntas conhecidas; as demais viram texto legível automaticamente.
const ROTULOS_PERGUNTAS = [
  [/tipologia/, 'Tipologia'],
  [/planta/, 'Planta'],
  [/a_partir_de_r\$_(\d+)_mil.*investir/, m => 'Como pretende investir (a partir de R$ ' + m[1] + ' mil)'],
  [/faixa_de_investimento/, 'Faixa de investimento'],
  [/mora_hoje|próprio_ou_alugado/, 'Imóvel onde mora hoje'],
  [/viabilizar|como_pagar/, 'Como pretende pagar'],
  [/objetivo/, 'Objetivo'],
  [/renda/, 'Renda familiar'],
  [/quando.*comprar/, 'Quando pretende comprar'],
];


/* ============================== Web app ============================== */

function doGet(e) {
  const p = (e && e.parameter) || {};
  const cfg = lerConfig_();
  const usuario = usuarioAtual_(cfg);
  if (!usuario) return paginaSemAcesso_();
  if (p.exportar) return exportar_(p.exportar, p, cfg);

  const t = HtmlService.createTemplateFromFile('Index');
  t.leadInicial = String(p.lead || '');
  t.appUrl = ScriptApp.getService().getUrl();
  return t.evaluate()
    .setTitle('Villa Verde · Leads')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** Tudo que a tela de leads precisa. Chamado pelo navegador. */
function carregar() {
  const cfg = lerConfig_();
  const usuario = exigirUsuario_(cfg);
  const est = montarEstado_(cfg);
  const nomes = nomesPorEmail_(cfg);
  return {
    usuario: usuario,
    agora: Date.now(),
    horasAlerta: cfg.horasAlerta,
    situacoes: SITUACOES,
    qualificacoes: QUALIFICACOES,
    empreendimentos: empreendimentos_(est.leads),
    contatos: est.contatos.map(c => paraCliente_(c, nomes)),
  };
}

/** Registra um toque do corretor. campo: "situacao" | "qualificado". */
function salvar(leadId, campo, valor, anterior) {
  const cfg = lerConfig_();
  const usuario = exigirUsuario_(cfg);
  leadId = String(leadId || '');
  if (!/^[\w:.-]{3,64}$/.test(leadId)) throw new Error('Lead inválido.');
  const opcoes = campo === 'situacao' ? SITUACOES : campo === 'qualificado' ? QUALIFICACOES : null;
  if (!opcoes || opcoes.indexOf(valor) < 0) throw new Error('Valor inválido.');
  const de = opcoes.indexOf(anterior) >= 0 ? anterior : '';

  const agora = new Date();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    abaRegistros_().appendRow([agora, leadId, usuario.email, campo, de, valor]);
  } finally {
    lock.releaseLock();
  }
  return { t: agora.getTime(), por: usuario.nome };
}

/** Números do painel do gestor. filtro: { dias: number|0, emp: string } */
function painel(filtro) {
  const cfg = lerConfig_();
  exigirUsuario_(cfg);
  return calcularPainel_(montarEstado_(cfg), cfg, filtro || {});
}


/* ======================= Aviso de lead novo por e-mail ======================= */

/** Roda sozinha a cada 5 minutos (gatilho criado pela função instalar). */
function verificarNovosLeads() {
  if (!ehDono_()) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const cfg = lerConfig_();
    const corretores = cfg.usuarios.filter(u => u.papel === 'corretor');
    if (!cfg.avisarEmail || !corretores.length || !cfg.inicio) return;
    const est = montarEstado_(cfg);
    const avisados = {};
    est.eventos.forEach(ev => { if (ev.campo === 'aviso') avisados[ev.leadId] = true; });

    const novos = [];
    est.leads.forEach(l => {
      if (l.teste || !l.chegada || l.chegada < cfg.inicio || avisados[l.id]) return;
      avisados[l.id] = true; // mesmo lead_id em duas abas gera um aviso só
      novos.push(l);
    });
    if (!novos.length) return;

    const contatoPorLead = {};
    est.contatos.forEach(c => c.entradas.forEach(en => { contatoPorLead[en.id] = c; }));
    const url = cfg.linkApp || ScriptApp.getService().getUrl() || '';
    const itens = novos.map(l => {
      const c = contatoPorLead[l.id];
      const antes = c ? c.entradas.filter(en => en.chegada < l.chegada) : [];
      return {
        primeiroNome: (l.nome || 'Sem nome').split(' ')[0],
        emp: l.aba,
        anuncio: l.anuncio,
        hora: formatar_(l.chegada, 'dd/MM HH:mm'),
        repetido: antes.length ? 'Já entrou antes em ' + formatar_(antes[antes.length - 1].chegada, 'dd/MM') : '',
        link: url ? url + '?lead=' + encodeURIComponent(l.id) : '',
      };
    });

    const para = corretores.map(u => u.email).join(',');
    if (itens.length > MAX_EMAILS_INDIVIDUAIS) {
      MailApp.sendEmail({ to: para, name: 'Villa Verde · Leads', subject: itens.length + ' leads novos', htmlBody: emailHtml_(itens, url) });
    } else {
      itens.forEach(it => MailApp.sendEmail({
        to: para, name: 'Villa Verde · Leads',
        subject: 'Novo lead · ' + it.emp + (it.repetido ? ' (já entrou antes)' : ''),
        htmlBody: emailHtml_([it], url),
      }));
    }

    const agora = new Date();
    const aba = abaRegistros_();
    aba.getRange(aba.getLastRow() + 1, 1, novos.length, CABECALHO_REGISTROS.length)
      .setValues(novos.map(l => [agora, l.id, 'sistema', 'aviso', '', 'email']));
  } finally {
    lock.releaseLock();
  }
}

function emailHtml_(itens, url) {
  const azul = '#2D9FF7';
  const linhas = itens.map(it =>
    '<tr><td style="padding:14px 0;border-bottom:1px solid #E6EAF0">' +
    '<div style="font:600 16px/1.3 Arial,sans-serif;color:#0E0F13">' + esc_(it.primeiroNome) + '</div>' +
    '<div style="font:13px/1.5 Arial,sans-serif;color:#5B6472">' + esc_(it.emp) + ' · ' + esc_(it.anuncio || 'sem anúncio') + ' · ' + esc_(it.hora) + '</div>' +
    (it.repetido ? '<div style="font:13px/1.5 Arial,sans-serif;color:#B26A00">' + esc_(it.repetido) + '</div>' : '') +
    '</td><td style="padding:14px 0;border-bottom:1px solid #E6EAF0;text-align:right">' +
    (it.link ? '<a href="' + esc_(it.link) + '" style="display:inline-block;background:' + azul + ';color:#fff;text-decoration:none;font:600 14px Arial,sans-serif;padding:10px 16px;border-radius:10px">Abrir</a>' : '') +
    '</td></tr>').join('');
  return '<div style="max-width:480px;margin:0 auto;padding:24px 8px">' +
    '<div style="font:700 13px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:' + azul + '">Villa Verde · Leads</div>' +
    '<div style="font:700 22px/1.3 Arial,sans-serif;color:#0E0F13;margin:6px 0 4px">' + (itens.length > 1 ? itens.length + ' leads novos' : 'Lead novo chegou') + '</div>' +
    '<div style="font:14px/1.5 Arial,sans-serif;color:#5B6472">Responda rápido e atualize a situação no app.</div>' +
    '<table style="width:100%;border-collapse:collapse;margin-top:12px">' + linhas + '</table>' +
    (url && itens.length > 1 ? '<p style="margin-top:20px"><a href="' + esc_(url) + '" style="color:' + azul + ';font:600 14px Arial,sans-serif">Abrir lista de leads</a></p>' : '') +
    '</div>';
}


/* ============================== Instalação ============================== */

/**
 * Rode UMA vez pelo editor do Apps Script (botão Executar), logado na conta do gestor (gabrielgoto2@gmail.com).
 * Cria as abas Config e Registros, testa o acesso à planilha de leads e liga o aviso por e-mail.
 * Pode rodar de novo sem perder nada.
 */
function instalar() {
  const props = PropertiesService.getScriptProperties();
  const eu = Session.getEffectiveUser().getEmail();
  const dono = props.getProperty('dono');
  if (dono && dono !== eu) throw new Error('Este app foi instalado por ' + dono + '. Só essa conta pode reinstalar.');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Abra o Apps Script pela própria planilha (Extensões > Apps Script).');
  props.setProperties({ dono: eu, planilha_app_id: ss.getId() });

  if (!ss.getSheetByName(ABA_CONFIG)) criarConfig_(ss);
  if (!ss.getSheetByName(ABA_REGISTROS)) criarRegistros_(ss);
  ['Página1', 'Planilha1', 'Sheet1'].forEach(nome => {
    const aba = ss.getSheetByName(nome);
    if (aba && aba.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(aba);
  });

  const cfg = lerConfig_();
  let leads;
  try {
    leads = lerLeads_(cfg);
  } catch (e) {
    throw new Error('A conta ' + eu + ' não consegue abrir a planilha de leads (' + cfg.planilhaLeadsId + '). ' +
      'Peça ao dono dela para compartilhar com esta conta como Leitor e rode instalar de novo. Detalhe: ' + e.message);
  }
  const porAba = {};
  leads.forEach(l => { if (!l.teste) porAba[l.aba] = (porAba[l.aba] || 0) + 1; });

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'verificarNovosLeads')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('verificarNovosLeads').timeBased().everyMinutes(5).create();

  const resumo = 'Instalado. Leads encontrados por aba: ' + JSON.stringify(porAba) +
    '. Usuários com acesso: ' + (cfg.usuarios.map(u => u.nome + ' <' + u.email + '> (' + u.papel + ')').join(', ') || 'NENHUM — preencha os e-mails na aba Config');
  Logger.log(resumo);
  return resumo;
}

function criarConfig_(ss) {
  const aba = ss.insertSheet(ABA_CONFIG, 0);
  const linhas = [
    ['Configuração', 'Valor', 'Para que serve'],
    ['ID da planilha de leads', PLANILHA_LEADS_PADRAO, 'Planilha que recebe os leads da Meta. O app só LÊ essa planilha, todas as abas.'],
    ['Horas até ficar vermelho', 2, 'Lead em "Novo" há mais tempo que isso aparece em vermelho.'],
    ['Início do sistema', new Date(), 'Leads anteriores a esta data não contam no tempo de resposta nem geram e-mail.'],
    ['Avisar por e-mail', 'SIM', 'SIM = e-mail para os corretores a cada lead novo (o gestor não recebe). NÃO = desliga.'],
    ['Link do app', '', 'Cole aqui o link do app depois de publicar. Ele vai no botão dos e-mails.'],
    ['Quem pode abrir o app (uma pessoa por linha; quem não estiver aqui não entra)', '', ''],
    ['Nome', 'E-mail Google', 'Papel: Corretor (recebe e-mail de lead novo e aparece no painel) ou Gestor (só acompanha)'],
    ['Sandro', '', 'Corretor'],
    ['Luana', '', 'Corretor'],
    ['Gestor', EMAIL_GESTOR_PADRAO, 'Gestor'],
  ];
  aba.getRange(1, 1, linhas.length, 3).setValues(linhas);
  aba.getRange('A1:C1').setFontWeight('bold');
  aba.getRange('A8:C8').setFontWeight('bold');
  aba.getRange('B4').setNumberFormat('dd/MM/yyyy HH:mm');
  aba.setColumnWidth(1, 220); aba.setColumnWidth(2, 320); aba.setColumnWidth(3, 520);
  aba.setFrozenRows(1);
}

function criarRegistros_(ss) {
  const aba = ss.insertSheet(ABA_REGISTROS);
  aba.getRange(1, 1, 1, CABECALHO_REGISTROS.length).setValues([CABECALHO_REGISTROS]).setFontWeight('bold');
  aba.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm:ss');
  aba.getRange('B:F').setNumberFormat('@'); // lead_id como texto: não perde dígitos
  aba.setFrozenRows(1);
  aba.protect()
    .setDescription('Histórico gravado pelo app. Não edite à mão.')
    .setWarningOnly(true);
}


/* ============================ Leitura de dados ============================ */

let memoConfig_ = null;

function lerConfig_() {
  if (memoConfig_) return memoConfig_;
  const aba = planilhaApp_().getSheetByName(ABA_CONFIG);
  if (!aba) throw new Error('Aba "Config" não encontrada. Rode a função instalar.');
  const cfg = { planilhaLeadsId: PLANILHA_LEADS_PADRAO, horasAlerta: 2, inicio: 0, avisarEmail: true, linkApp: '', usuarios: [] };
  let lendoUsuarios = false;
  aba.getDataRange().getValues().forEach(l => {
    const chave = String(l[0]).trim().toLowerCase();
    const valor = l[1];
    if (lendoUsuarios) {
      const email = String(valor || '').trim().toLowerCase();
      const papel = /^gest/i.test(String(l[2]).trim()) ? 'gestor' : 'corretor';
      if (chave && email.indexOf('@') > 0) cfg.usuarios.push({ nome: String(l[0]).trim(), email: email, papel: papel });
      return;
    }
    if (chave === 'nome') lendoUsuarios = true;
    else if (chave === 'id da planilha de leads') {
      const s = String(valor).trim();
      const m = s.match(/\/d\/([\w-]+)/);
      if (s) cfg.planilhaLeadsId = m ? m[1] : s;
    }
    else if (chave === 'horas até ficar vermelho') cfg.horasAlerta = Number(valor) > 0 ? Number(valor) : 2;
    else if (chave === 'início do sistema') cfg.inicio = paraData_(valor) || 0;
    else if (chave === 'avisar por e-mail') cfg.avisarEmail = String(valor).trim().toUpperCase() !== 'NÃO' && String(valor).trim().toUpperCase() !== 'NAO';
    else if (chave === 'link do app') cfg.linkApp = String(valor || '').trim();
  });
  memoConfig_ = cfg;
  return cfg;
}

function lerLeads_(cfg) {
  const leads = [];
  const vistos = {};
  SpreadsheetApp.openById(cfg.planilhaLeadsId).getSheets().forEach(aba => {
    lerAba_(aba).forEach(l => {
      if (vistos[l.id]) return; // mesmo lead_id gravado duas vezes = mesmo envio
      vistos[l.id] = true;
      leads.push(l);
    });
  });
  return leads;
}

/**
 * Lê uma aba da integração da Meta. Cada aba vira um empreendimento (nome da aba).
 * Abas sem colunas "id" e "created_time" são ignoradas.
 */
function lerAba_(aba) {
  const valores = aba.getDataRange().getValues();
  if (!valores.length) return [];
  const linha1 = valores[0].map(v => String(v).trim());
  let cab = linha1;
  let primeiraLinha = 1;
  if (linha1[0] !== 'id') {
    // A integração às vezes grava um lead na linha 1 e o cabeçalho fica à direita
    // (aba Nest: cabeçalho em S1). Os nomes desse bloco valem para as colunas A, B, C...
    const ini = linha1.findIndex((v, i) => v === 'id' && linha1[i + 1] === 'created_time');
    if (ini < 0) return [];
    const bloco = linha1.slice(ini);
    cab = [];
    for (let i = 0; i < ini; i++) cab.push(i < bloco.length ? bloco[i] : (/^[a-z_]+$/.test(linha1[i]) ? linha1[i] : ''));
    primeiraLinha = 0;
  }

  const nomes = cab.map(c => String(c).trim().toLowerCase());
  const col = n => nomes.indexOf(n);
  const iTelefones = CAMPOS_TELEFONE.map(col).filter(i => i >= 0);
  nomes.forEach((n, i) => { if (/telefone|whatsapp|phone|celular/.test(n) && iTelefones.indexOf(i) < 0) iTelefones.push(i); });
  const iNome = CAMPOS_NOME.map(col).filter(i => i >= 0)[0];
  const perguntas = [];
  nomes.forEach((n, i) => {
    if (!n || CAMPOS_META.indexOf(n) >= 0 || iTelefones.indexOf(i) >= 0 || i === iNome) return;
    if (n.indexOf('_') >= 0 || /\?$/.test(n)) perguntas.push({ i: i, rotulo: rotuloPergunta_(n) });
  });

  const leads = [];
  for (let r = primeiraLinha; r < valores.length; r++) {
    const v = valores[r];
    const get = n => { const i = col(n); return i < 0 ? '' : txt_(v[i]); };
    const id = get('id');
    if (!id || id === 'id') continue;
    const telBruto = iTelefones.map(i => txt_(v[i])).filter(Boolean)[0] || '';
    const email = get('email');
    const teste = email.toLowerCase() === 'test@meta.com' || v.some(x => String(x).indexOf('<test lead') >= 0);
    leads.push({
      id: id,
      aba: aba.getName(),
      chegada: paraData_(v[col('created_time')]),
      campanha: get('campaign_name'),
      conjunto: get('adset_name'),
      anuncio: get('ad_name'),
      formulario: get('form_name'),
      nome: iNome === undefined ? '' : txt_(v[iNome]).normalize('NFKC'),
      email: email,
      telefoneBruto: telBruto.replace(/^p:/i, ''),
      tel: normalizarTelefone_(telBruto),
      respostas: perguntas.map(p => ({ p: p.rotulo, r: legivel_(txt_(v[p.i])) })).filter(x => x.r),
      teste: teste,
    });
  }
  return leads;
}

function lerRegistros_() {
  const v = abaRegistros_().getDataRange().getValues();
  const eventos = [];
  for (let r = 1; r < v.length; r++) {
    if (!v[r][1]) continue;
    eventos.push({
      t: paraData_(v[r][0]) || 0,
      leadId: String(v[r][1]).trim(),
      autor: String(v[r][2]).trim().toLowerCase(),
      campo: String(v[r][3]).trim(),
      de: String(v[r][4]),
      para: String(v[r][5]),
    });
  }
  return eventos.sort((a, b) => a.t - b.t);
}


/* ===================== Estado: contatos, duplicados, tempos ===================== */

let memoEstado_ = null;

function montarEstado_(cfg) {
  if (memoEstado_) return memoEstado_;
  const leads = lerLeads_(cfg);
  const eventos = lerRegistros_();
  const contatos = agruparContatos_(leads);
  const contatoPorLead = {};
  contatos.forEach(c => { c.eventos = []; c.entradas.forEach(en => { contatoPorLead[en.id] = c; }); });
  eventos.forEach(ev => {
    const c = contatoPorLead[ev.leadId];
    if (c && (ev.campo === 'situacao' || ev.campo === 'qualificado')) c.eventos.push(ev);
  });
  contatos.forEach(c => resolverContato_(c, cfg));
  memoEstado_ = { leads: leads, eventos: eventos, contatos: contatos };
  return memoEstado_;
}

/** Junta no mesmo contato as entradas com o mesmo telefone normalizado (ou o mesmo lead_id). */
function agruparContatos_(leads) {
  const porChave = {};
  const lista = [];
  leads.filter(l => !l.teste)
    .sort((a, b) => (a.chegada || 0) - (b.chegada || 0))
    .forEach(l => {
      const chave = l.tel && l.tel.chave ? 't' + l.tel.chave : 'i' + l.id;
      let g = porChave[chave];
      if (!g) { g = porChave[chave] = { chave: chave, entradas: [] }; lista.push(g); }
      if (!g.entradas.some(e => e.id === l.id)) g.entradas.push(l);
    });
  return lista;
}

function resolverContato_(c, cfg) {
  c.primeira = c.entradas[0];
  c.principal = c.entradas[c.entradas.length - 1];
  c.situacao = SITUACAO_PADRAO;
  c.qualificado = QUALIFICADO_PADRAO;
  c.qualificadoPor = '';
  c.resposta = null;
  c.ultima = null;
  c.eventos.forEach(ev => {
    if (ev.campo === 'situacao') {
      if (SITUACOES.indexOf(ev.para) < 0) return;
      c.situacao = ev.para;
      if (!c.resposta && ev.para !== SITUACAO_PADRAO) c.resposta = { t: ev.t, autor: ev.autor };
    } else {
      if (QUALIFICACOES.indexOf(ev.para) < 0) return;
      c.qualificado = ev.para;
      c.qualificadoPor = ev.autor;
    }
    c.ultima = { t: ev.t, autor: ev.autor };
  });
  const chegada = c.principal.chegada || 0;
  c.anterior = chegada < cfg.inicio;
  c.voltou = c.entradas.length > 1 && !!c.ultima && chegada > c.ultima.t;
  // Tempo de resposta só para quem chegou depois que o sistema entrou no ar.
  c.tempoResposta = c.resposta && c.primeira.chegada && c.primeira.chegada >= cfg.inicio
    ? Math.max(0, c.resposta.t - c.primeira.chegada) : null;
}

function paraCliente_(c, nomes) {
  const p = c.principal;
  return {
    id: p.id,
    ids: c.entradas.map(e => e.id),
    nome: p.nome || 'Sem nome',
    telefone: formatarTelefone_(p.tel, p.telefoneBruto),
    discar: p.tel ? p.tel.discar : '',
    emp: p.aba,
    campanha: p.campanha,
    conjunto: p.conjunto,
    anuncio: p.anuncio,
    chegada: p.chegada || 0,
    respostas: p.respostas,
    antes: c.entradas.slice(0, -1).map(e => ({ t: e.chegada || 0, emp: e.aba, campanha: e.campanha })),
    situacao: c.situacao,
    qualificado: c.qualificado,
    ultima: c.ultima ? { t: c.ultima.t, por: nomes[c.ultima.autor] || c.ultima.autor } : null,
    anterior: c.anterior,
    voltou: c.voltou,
  };
}


/* ============================== Painel do gestor ============================== */

function calcularPainel_(est, cfg, filtro) {
  const agora = Date.now();
  const dias = Number(filtro.dias) || 0;
  const desde = dias ? agora - dias * 864e5 : 0;
  const emp = String(filtro.emp || '');
  const dentro = l => (l.chegada || 0) >= desde && (!emp || l.aba === emp);

  const zerado = () => {
    const s = {};
    SITUACOES.forEach(x => { s[x] = 0; });
    return { entradas: 0, contatos: 0, avaliados: 0, qualificados: 0, situacoes: s };
  };
  const arvore = {};
  const no = (l, nivel) => {
    const campanha = l.campanha || '(sem campanha)';
    const conjunto = nivel > 0 ? (l.conjunto || '(sem conjunto)') : '';
    const anuncio = nivel > 1 ? (l.anuncio || '(sem anúncio)') : '';
    const k = [campanha, conjunto, anuncio].join('\u0001');
    if (!arvore[k]) arvore[k] = Object.assign(zerado(), { nivel: nivel, campanha: campanha, conjunto: conjunto, anuncio: anuncio });
    return arvore[k];
  };
  const total = zerado();

  est.leads.forEach(l => {
    if (l.teste || !dentro(l)) return;
    total.entradas++;
    [0, 1, 2].forEach(n => { no(l, n).entradas++; });
  });

  // Cada contato conta uma vez, no anúncio que o trouxe primeiro.
  const contatos = est.contatos.filter(c => dentro(c.primeira));
  contatos.forEach(c => {
    [total, no(c.primeira, 0), no(c.primeira, 1), no(c.primeira, 2)].forEach(x => {
      x.contatos++;
      x.situacoes[c.situacao]++;
      if (c.qualificado !== QUALIFICADO_PADRAO) x.avaliados++;
      if (c.qualificado === 'Sim') x.qualificados++;
    });
  });

  // Ordem: campanha > seus conjuntos > seus anúncios, cada nível do maior para o menor.
  const todos = Object.keys(arvore).map(k => arvore[k]);
  const ordenar = lista => lista.sort((a, b) => (b.contatos - a.contatos) || (b.entradas - a.entradas));
  const linhas = [];
  ordenar(todos.filter(x => x.nivel === 0)).forEach(camp => {
    linhas.push(camp);
    ordenar(todos.filter(x => x.nivel === 1 && x.campanha === camp.campanha)).forEach(conj => {
      linhas.push(conj);
      ordenar(todos.filter(x => x.nivel === 2 && x.campanha === camp.campanha && x.conjunto === conj.conjunto))
        .forEach(an => linhas.push(an));
    });
  });

  const seteDias = agora - 7 * 864e5;
  const corretores = cfg.usuarios.filter(u => u.papel === 'corretor').map(u => {
    const tempos = contatos.filter(c => c.resposta && c.resposta.autor === u.email && c.tempoResposta !== null).map(c => c.tempoResposta);
    const avaliou = contatos.filter(c => c.qualificadoPor === u.email && c.qualificado !== QUALIFICADO_PADRAO);
    return {
      nome: u.nome,
      respostas: tempos.length,
      tempoMedio: tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null,
      avaliados: avaliou.length,
      qualificados: avaliou.filter(c => c.qualificado === 'Sim').length,
      atualizacoes7d: est.eventos.filter(ev => ev.autor === u.email && ev.t >= seteDias && (ev.campo === 'situacao' || ev.campo === 'qualificado')).length,
    };
  });

  const limite = cfg.horasAlerta * 36e5;
  const emNovo = est.contatos.filter(c => !c.anterior && c.situacao === SITUACAO_PADRAO && (!emp || c.principal.aba === emp));
  const tempos = contatos.map(c => c.tempoResposta).filter(t => t !== null);

  return {
    filtro: { dias: dias, emp: emp },
    total: total,
    tempoMedio: tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null,
    respostas: tempos.length,
    emNovo: emNovo.length,
    atrasados: emNovo.filter(c => agora - (c.principal.chegada || 0) > limite).length,
    horasAlerta: cfg.horasAlerta,
    linhas: linhas,
    corretores: corretores,
    situacoes: SITUACOES,
    empreendimentos: empreendimentos_(est.leads),
  };
}


/* ============================== Exportação CSV ============================== */

function exportar_(tipo, p, cfg) {
  const est = montarEstado_(cfg);
  const nomes = nomesPorEmail_(cfg);
  const data = d => d ? formatar_(d, 'yyyy-MM-dd HH:mm') : '';
  const hoje = formatar_(Date.now(), 'yyyy-MM-dd');
  let linhas, arquivo;

  if (tipo === 'resumo') {
    // Só contagens. Nenhum dado pessoal.
    const pn = calcularPainel_(est, cfg, { dias: p.dias, emp: p.emp });
    linhas = [['nivel', 'campanha', 'conjunto', 'anuncio', 'entradas', 'contatos', 'avaliados', 'qualificados', 'pct_qualificados_sobre_avaliados']
      .concat(SITUACOES.map(s => 'situacao_' + s.toLowerCase().replace(/ /g, '_')))];
    pn.linhas.forEach(x => linhas.push([['campanha', 'conjunto', 'anuncio'][x.nivel], x.campanha, x.conjunto, x.anuncio,
      x.entradas, x.contatos, x.avaliados, x.qualificados, x.avaliados ? Math.round(100 * x.qualificados / x.avaliados) : '']
      .concat(SITUACOES.map(s => x.situacoes[s]))));
    arquivo = 'villa-verde-resumo-' + hoje + '.csv';
  } else if (tipo === 'completo') {
    const contatoPorLead = {};
    est.contatos.forEach(c => c.entradas.forEach(en => { contatoPorLead[en.id] = c; }));
    linhas = [['lead_id', 'chegada', 'empreendimento', 'campanha', 'conjunto', 'anuncio', 'formulario', 'nome', 'telefone', 'email',
      'respostas', 'contato', 'entrada_n', 'qualificado', 'situacao', 'primeira_resposta_em', 'primeira_resposta_por',
      'tempo_resposta_min', 'ultima_atualizacao_em', 'ultima_atualizacao_por']];
    est.leads.filter(l => !l.teste).sort((a, b) => (a.chegada || 0) - (b.chegada || 0)).forEach(l => {
      const c = contatoPorLead[l.id];
      linhas.push([l.id, data(l.chegada), l.aba, l.campanha, l.conjunto, l.anuncio, l.formulario, l.nome,
        l.tel ? l.tel.discar : l.telefoneBruto, l.email, l.respostas.map(x => x.p + ': ' + x.r).join(' | '),
        c.chave, c.entradas.indexOf(l) + 1, c.qualificado, c.situacao,
        c.resposta ? data(c.resposta.t) : '', c.resposta ? (nomes[c.resposta.autor] || c.resposta.autor) : '',
        c.tempoResposta !== null ? Math.round(c.tempoResposta / 60000) : '',
        c.ultima ? data(c.ultima.t) : '', c.ultima ? (nomes[c.ultima.autor] || c.ultima.autor) : '']);
    });
    arquivo = 'villa-verde-leads-completo-' + hoje + '.csv';
  } else if (tipo === 'historico') {
    linhas = [['data_hora', 'lead_id', 'autor', 'campo', 'de', 'para']];
    est.eventos.forEach(ev => linhas.push([data(ev.t), ev.leadId, nomes[ev.autor] || ev.autor, ev.campo, ev.de, ev.para]));
    arquivo = 'villa-verde-historico-' + hoje + '.csv';
  } else {
    return ContentService.createTextOutput('Tipo de exportação desconhecido.');
  }

  const csv = '\uFEFF' + linhas.map(l => l.map(campoCsv_).join(';')).join('\r\n');
  return ContentService.createTextOutput(csv).setMimeType(ContentService.MimeType.CSV).downloadAsFile(arquivo);
}

function campoCsv_(v) {
  let s = String(v == null ? '' : v);
  if (/^[=@]/.test(s) || /^[+-][^\d]/.test(s)) s = "'" + s; // evita fórmula ao abrir no Excel/Sheets
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}


/* ============================== Acesso ============================== */

function usuarioAtual_(cfg) {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) return null;
  const u = cfg.usuarios.filter(x => x.email === email)[0];
  return u ? { nome: u.nome, email: email } : null;
}

function exigirUsuario_(cfg) {
  const u = usuarioAtual_(cfg);
  if (!u) throw new Error('Acesso não autorizado.');
  return u;
}

function ehDono_() {
  const dono = PropertiesService.getScriptProperties().getProperty('dono');
  return !!dono && Session.getEffectiveUser().getEmail() === dono;
}

function paginaSemAcesso_() {
  const email = String(Session.getActiveUser().getEmail() || '');
  const html = '<!doctype html><meta charset="utf-8"><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0E0F13;color:#F2F5F9;font:16px/1.5 system-ui,sans-serif;padding:24px;box-sizing:border-box">' +
    '<div style="max-width:360px;text-align:center"><div style="font-weight:700;font-size:20px;margin-bottom:8px">Acesso restrito</div>' +
    '<div style="color:#8B93A1">Este app tem dados pessoais de clientes e só abre para os corretores cadastrados.' +
    (email ? '<br><br>Você entrou como <b style="color:#5DB6FA">' + esc_(email) + '</b>.' : '') +
    '<br><br>Se deveria ter acesso, peça para incluir este e-mail na aba Config.</div></div></body>';
  return HtmlService.createHtmlOutput(html).setTitle('Villa Verde · Leads')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}


/* ============================== Utilidades ============================== */

function planilhaApp_() {
  const id = PropertiesService.getScriptProperties().getProperty('planilha_app_id');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function abaRegistros_() {
  const aba = planilhaApp_().getSheetByName(ABA_REGISTROS);
  if (!aba) throw new Error('Aba "Registros" não encontrada. Rode a função instalar.');
  return aba;
}

function nomesPorEmail_(cfg) {
  const m = { sistema: 'Sistema' };
  cfg.usuarios.forEach(u => { m[u.email] = u.nome; });
  return m;
}

function empreendimentos_(leads) {
  const vistos = [];
  leads.forEach(l => { if (!l.teste && vistos.indexOf(l.aba) < 0) vistos.push(l.aba); });
  return vistos;
}

function txt_(v) {
  return String(v == null ? '' : v).trim();
}

/** Aceita Date ou texto ISO com fuso (ex.: 2026-10-13T21:20:52-03:00). Devolve milissegundos ou null. */
function paraData_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === 'number') return v > 1e11 ? v : null;
  const s = String(v || '').trim();
  if (!s) return null;
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}

function formatar_(ms, padrao) {
  return Utilities.formatDate(new Date(ms), FUSO, padrao);
}

/**
 * Telefone → { chave, discar }.
 * chave = DDD + últimos 8 dígitos, para casar o mesmo número com e sem o nono dígito.
 * discar = +55 DDD número, com o 9 incluído em celular antigo de 8 dígitos.
 */
function normalizarTelefone_(bruto) {
  const s = String(bruto || '').replace(/^p:/i, '').trim();
  if (!s || s.indexOf('<test lead') >= 0) return null;
  let d = s.replace(/\D/g, '');
  if (!d) return null;
  if (s.charAt(0) === '+') {
    if (d.indexOf('55') !== 0) return d.length >= 8 ? { chave: '+' + d, discar: '+' + d } : null;
    d = d.slice(2);
  } else if (d.length >= 12 && d.indexOf('55') === 0) {
    d = d.slice(2);
  }
  d = d.replace(/^0+/, '');
  if (d.length === 10 && /[6-9]/.test(d.charAt(2))) d = d.slice(0, 2) + '9' + d.slice(2);
  if (d.length === 10 || d.length === 11) return { chave: d.slice(0, 2) + d.slice(-8), discar: '+55' + d };
  return d.length >= 8 ? { chave: d, discar: '+55' + d } : null;
}

function formatarTelefone_(tel, bruto) {
  if (!tel) return bruto || '';
  const m = tel.discar.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? '(' + m[1] + ') ' + m[2] + '-' + m[3] : tel.discar;
}

function rotuloPergunta_(n) {
  for (let i = 0; i < ROTULOS_PERGUNTAS.length; i++) {
    const m = n.match(ROTULOS_PERGUNTAS[i][0]);
    if (m) return typeof ROTULOS_PERGUNTAS[i][1] === 'function' ? ROTULOS_PERGUNTAS[i][1](m) : ROTULOS_PERGUNTAS[i][1];
  }
  return legivel_(n);
}

/** "🏡_3_quartos_(75m²)" → "🏡 3 quartos (75m²)"; "r$_750_mil" → "R$ 750 mil". */
function legivel_(s) {
  if (!s) return '';
  const t = String(s).replace(/_/g, ' ').replace(/\s+/g, ' ').replace(/\br\$\s?/gi, 'R$ ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
