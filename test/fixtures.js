// Planilha de leads FALSA que reproduz a estrutura real da "Planilha Villa Verde Oficial"
// (mesmas colunas e os mesmos defeitos), com nomes e telefones inventados.
const { Sheet, Spreadsheet } = require('./mocks');

const ID_LEADS = 'PLANILHA_LEADS_TESTE';
const H = 36e5;

function iso(ms) {
  // formato da Meta: 2026-10-13T21:20:52-03:00
  const d = new Date(ms - 3 * H);
  return d.toISOString().slice(0, 19) + '-03:00';
}

const CAB_NEST = ['id', 'created_time', 'ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name', 'form_id', 'form_name',
  'is_organic', 'platform', 'qual_tipologia_mais_interessa_você?', 'qual_faixa_de_investimento_você_considera_para_este_imóvel?',
  'número_do_whatsapp', 'email', 'full_name'];

function nestLinha(id, ms, anuncio, conjunto, tip, faixa, fone, email, nome) {
  return [id, iso(ms), 'ag:1', anuncio, 'as:1', conjunto, 'c:1', 'Leads - Formulário NEST RIO VERMELHO', 'f:1', 'Nest Rio Vermelho - Oficial',
    'false', 'ig', tip, faixa, fone, email, nome, 'CREATED'];
}

function montar(agora) {
  const T2 = '🏡_2_quartos_(62m²)_—_varanda_gourmet_+_suíte';
  const T3 = '🏡_3_quartos_(75m²)_—_varanda_gourmet_+_suíte';
  const F1 = 'r$_750_mil_a_r$_850_mil';

  // Aba Nest: lead de teste na linha 1 (A–Q), "lead_status" em R1 e o cabeçalho deslocado para S1:AI1.
  const linha1 = ['l:9000000000000001', iso(agora - 30 * H), '', '', '', '', '', '', 'f:9', 'Nest Rio Vermelho - Oficial 1-copy', 'true', '',
    '<test lead: dummy data for qual_tipologia_mais_interessa_você?>', '<test lead: dummy data for faixa>', '<test lead: dummy data for número_do_whatsapp>',
    'test@meta.com', '<test lead: dummy data for full_name>', 'lead_status'].concat(CAB_NEST);
  const nest = new Sheet('Nest', [
    linha1,
    nestLinha('l:1000000000000001', agora - 0.5 * H, 'Vídeo 1', 'CONJ 2 - REELS', T2, F1, 'p:+5571981110001', 'ana@exemplo.com', 'Ana Teste'),
    nestLinha('l:1000000000000002', agora - 5 * H, '02 - Card', 'CONJ 1', T3, F1, 'p:+557199220002', 'bruno@exemplo.com', 'Bruno Exemplo'),
    nestLinha('l:1000000000000003', agora - 26 * H, 'Vídeo 1', 'CONJ 2 - REELS', T3, 'procuro_imóvel_de_outro_valor', 'p:71983330003', 'carla@exemplo.com', '𝗖𝗮𝗿𝗹𝗮 𝗡𝗲𝗴𝗿𝗶𝘁𝗼'),
    nestLinha('l:1000000000000004', agora - 10 * 24 * H, '02 - Card', 'CONJ 1', T2, F1, 'p:+5575984440004', 'davi@exemplo.com', 'Davi Antigo'),
    nestLinha('l:1000000000000005', agora - 9 * 24 * H, '02 - Card', 'CONJ 1', T2, F1, 'p:+17199940556', 'eva@exemplo.com', 'Eva Exterior'),
  ]);

  // Aba Cedro: cabeçalho normal + 3 colunas extras vazias no fim.
  const cedro = new Sheet('Cedro', [
    ['id', 'created_time', 'ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name', 'form_id', 'form_name', 'is_organic', 'platform',
      'qual_planta_te_interessa?', 'o_imóvel_onde_você_mora_hoje_é_próprio_ou_alugado?', 'como_você_pretende_viabilizar_a_aquisição?', 'email', 'nome_completo',
      'telefone', 'lead_status', 'qual_é_o_seu_objetivo_com_este_imóvel?', 'qual_é_a_sua_renda_familiar_bruta_mensal?', 'a_partir_de_r$_815_mil._como_pretende_investir?'],
    // mesmo telefone do Bruno (Nest), escrito sem +55 e sem o nono dígito → mesmo contato
    ['l:2000000000000001', iso(agora - 1 * H), 'ag:2', 'Carrossel - Cedro', 'as:2', 'Conj 1', 'c:2', 'Leads - Cedro', 'f:2', 'Formulário Cedro Horto Florestal', 'false', 'ig',
      '4_suítes_com_dependência_completa', 'próprio_e_pretendo_vender', 'recursos_próprios', 'bruno2@exemplo.com', 'Bruno E.', 'p:7199220002', 'CREATED', '', '', ''],
    ['l:2000000000000002', iso(agora - 40 * H), 'ag:3', 'Vídeo', 'as:2', 'Conj 1', 'c:2', 'Leads - Cedro', 'f:2', 'Formulário Cedro Horto Florestal', 'false', 'ig',
      'quero_ver_as_5_opções', 'alugado', 'financiamento_a_aprovar', 'fabio@exemplo.com', 'Fábio Cedro', 'p:+5571986660006', 'CREATED', '', '', ''],
  ]);

  const sensia = new Sheet('Sensia Patamares', [
    ['id', 'created_time', 'ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name', 'form_id', 'form_name', 'is_organic', 'platform',
      'qual_é_o_seu_objetivo_com_este_imóvel?', 'qual_é_a_sua_renda_familiar_bruta_mensal?', 'a_partir_de_r$_815_mil._como_pretende_investir?', 'email', 'nome_completo', 'telefone', 'lead_status'],
    ['l:3000000000000001', iso(agora - 3 * H), '', '', '', '', '', '', 'f:3', 'Formulário Sensia Patamares - Oficial 1', 'true', '',
      '<test lead: dummy data for qual_é_o_seu_objetivo_...>', '<test lead: x>', '<test lead: y>', 'test@meta.com', '<test lead: dummy data for nome_completo>', 'p:<test lead: dummy data for telefone>', 'CREATED'],
    ['l:3000000000000002', iso(agora - 2 * H), 'ag:4', 'Card 01', 'as:4', 'CONJ 1 - Seguimentação Cargos', 'c:4', 'Leads - Formulário Sensia Patamares', 'f:3', 'Formulário Sensia Patamares - Oficial 1', 'false', 'ig',
      'moradia_para_a_minha_família', 'r$_18_mil_a_r$_20_mil', 'procuro_valor_menor', 'gabi@exemplo.com', 'Gabi Sensia', 'p:+5571987770007', 'CREATED'],
    // mesmo lead_id repetido (reimportação) → não pode virar dois contatos
    ['l:3000000000000002', iso(agora - 2 * H), 'ag:4', 'Card 01', 'as:4', 'CONJ 1 - Seguimentação Cargos', 'c:4', 'Leads - Formulário Sensia Patamares', 'f:3', 'Formulário Sensia Patamares - Oficial 1', 'false', 'ig',
      'moradia_para_a_minha_família', 'r$_18_mil_a_r$_20_mil', 'procuro_valor_menor', 'gabi@exemplo.com', 'Gabi Sensia', 'p:+5571987770007', 'CREATED'],
  ]);

  const anotacoes = new Sheet('Anotações', [['qualquer coisa', 'sem formato de lead']]);

  const leads = new Spreadsheet(ID_LEADS, [nest, cedro, sensia, anotacoes]);
  const app = new Spreadsheet('PLANILHA_APP_TESTE', [new Sheet('Página1', [])]);
  return { leads, app, nest };
}

module.exports = { montar, ID_LEADS, H, iso };
