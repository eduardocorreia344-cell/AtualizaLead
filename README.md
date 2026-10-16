# Villa Verde · Leads

App de celular para os corretores (Sandro e Luana) atualizarem os leads da Meta em segundos. É uma ponte até o VGV Copilot.

- **Lê** a "Planilha Villa Verde Oficial", todas as abas atuais e futuras, **sem nunca escrever nela**.
- Cada toque do corretor vira uma linha nova na aba `Registros` de uma planilha separada. Cada linha guarda data/hora, lead_id, quem mudou, o valor anterior e o novo.
- O corretor registra só **Qualificado** (Sim / Não / Ainda não sei) e **Situação** (8 opções).
- O sistema calcula sozinho o tempo de resposta, os duplicados (por telefone e por lead_id) e o painel do gestor.
- Um e-mail avisa os dois corretores a cada lead novo, com um botão que abre o lead direto.

```
apps-script/Code.gs          servidor (Apps Script)
apps-script/Index.html       tela do app (lista, lead, painel)
apps-script/appsscript.json  permissões e modo de publicação
test/                        testes locais com dados falsos (node --test test/code.test.js)
```

---

## Instalação (uma vez, cerca de 15 minutos)

Faça tudo **logado na conta Provecta VGV**.

**0. Antes de tudo:** abra a "Planilha Villa Verde Oficial" com a conta Provecta VGV. Se não abrir, peça ao dono da planilha para compartilhar com essa conta como **Leitor**.

1. Crie uma planilha nova (digite `sheets.new` no navegador) e dê o nome **Villa Verde – Atendimento (app)**.
2. Nessa planilha, abra o menu **Extensões → Apps Script**.
3. No arquivo `Código.gs` (ou `Code.gs`), apague tudo e cole o conteúdo de `apps-script/Code.gs`. Salve com Ctrl+S.
4. Clique no **+** ao lado de "Arquivos", escolha **HTML** e dê o nome `Index`, sem o ".html". Apague o que vier dentro, cole o conteúdo de `apps-script/Index.html` e salve.
5. Na engrenagem **⚙ Configurações do projeto**, marque **"Mostrar arquivo de manifesto appsscript.json no editor"**. Volte ao editor (ícone `< >`), abra `appsscript.json`, apague tudo, cole o conteúdo de `apps-script/appsscript.json` e salve.
6. No topo do editor, escolha a função **`instalar`** e clique em **Executar**.
   - Vai aparecer **Revisar permissões**. Escolha a conta Provecta VGV.
   - Na tela "O Google não verificou este app", clique em **Avançado → Acessar … (não seguro) → Permitir**. O aviso é normal: o app é de vocês e não foi publicado na loja do Google.
   - No registro de execução deve aparecer `Instalado. Leads encontrados por aba: {...}`.
7. Volte à planilha. Agora existem as abas **Config** e **Registros**. Na **Config**, preencha o e-mail Google do Sandro e da Luana (coluna B, linhas "Sandro" e "Luana").
8. No Apps Script, clique em **Implantar → Nova implantação**:
   - na engrenagem ao lado de "Selecione o tipo", escolha **App da Web**;
   - em "Executar como", escolha **Usuário que acessa o app da Web**;
   - em "Quem pode acessar", escolha **Qualquer pessoa com uma Conta do Google**;
   - clique em **Implantar** e copie o **URL do app da Web**, que termina em `/exec`.
9. Cole esse link na **Config**, na linha **Link do app**. É ele que vai no botão dos e-mails.
10. Compartilhe as duas planilhas com os dois corretores:
    - **Villa Verde – Atendimento (app)** → Sandro e Luana como **Editor**. O app grava em nome deles, por isso precisam poder editar.
    - **Planilha Villa Verde Oficial** → Sandro e Luana como **Leitor**.
11. Mande o link e o guia abaixo para os corretores. No primeiro acesso, cada um passa pela mesma tela de "app não verificado" do passo 6, uma única vez.

> **Por que "Qualquer pessoa com Conta do Google" não deixa o app público:** o app roda com o login de quem abre. Quem não recebeu as planilhas não consegue ler nada. Além disso, quem não está na lista da aba Config cai numa tela de "Acesso restrito". O link nunca abre sem login e não é indexado.

### Alterar o código depois
Cole a nova versão dos arquivos e vá em **Implantar → Gerenciar implantações → lápis (editar) → Versão: Nova versão → Implantar**. O link continua o mesmo.

### Desligar o e-mail
Na Config, troque **Avisar por e-mail** para `NÃO`.

---

## Guia para os corretores (mandar como está)

1. Abra este link no celular, entre com seu Google e use "Adicionar à tela inicial": **[LINK DO APP]**
2. Quando chegar o e-mail de lead novo, toque em **Abrir** e use os botões **Ligar** ou **WhatsApp**.
3. Depois de cada contato, toque na **Situação** (Em contato, Sem resposta, Visita agendada…). Salva sozinho.
4. Quando tiver certeza, marque **Qualificado: Sim ou Não**. Até lá, deixe em "Ainda não sei".
5. No topo da lista ficam os leads que pedem ação. Vermelho quer dizer mais de 2 h sem resposta.

---

## Como funciona (para quem for mexer)

| Regra | Como o app cumpre |
|---|---|
| Não mexer na aba da integração | Só `openById(...).getValues()` na planilha de leads. Toda gravação vai para a aba `Registros` da planilha do app. |
| Ligar pelo lead_id | Cada linha de `Registros` guarda o `lead_id` da Meta (`l:…`). A coluna está formatada como texto para não perder dígitos. |
| Abas novas | Toda aba com colunas `id` e `created_time` vira um empreendimento automaticamente, com o nome da aba. Colunas de pergunta são detectadas sozinhas. |
| Cabeçalho deslocado | A aba Nest tem um lead de teste na linha 1 e o cabeçalho em S1. O app reconhece esse formato e lê as colunas pelo bloco de nomes. |
| Leads de teste da Meta | São ignorados: `test@meta.com` ou valores `<test lead…>`. |
| Duplicados | A chave do telefone é o DDD mais os últimos 8 dígitos, para casar o mesmo número com e sem o nono dígito. O mesmo telefone ou o mesmo lead_id formam um só contato, e nada é apagado. |
| Tempo de resposta | Vai da primeira chegada do contato até o primeiro toque que tira o lead de "Novo", em horas corridas. Conta para quem deu esse toque. Leads anteriores ao "Início do sistema" ficam fora da média. |
| Painel | Cada contato conta uma vez, no anúncio que o trouxe primeiro. "Entradas" conta todos os envios do formulário. |
| Exportar | Há três CSVs (separados por `;`, com BOM, abrem direto no Excel): **Resumo** só com contagens, **Base completa** com lead_id para o CRM e **Histórico**. |
| LGPD | O app abre com login Google e uma lista de acesso na Config. O e-mail de aviso leva só o primeiro nome, o empreendimento e o anúncio. O e-mail do lead não aparece na tela, só no CSV completo. |

### Limites conhecidos
- Gmail comum envia até cerca de 100 destinatários por dia. Cada aviso vai para 2 pessoas, ou seja, uns 50 leads por dia. Quando chegam mais de 5 leads de uma vez, sai um e-mail-resumo.
- Cada abertura do app lê todas as abas. Isso fica rápido até alguns milhares de leads, o que basta para uma ponte até o CRM.
- O aviso por e-mail roda a cada 5 minutos.
