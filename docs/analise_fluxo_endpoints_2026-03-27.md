# Analise do Sistema - Endpoints de Logica e Fluxo Atual

Data da analise: 2026-03-27

## Escopo

Este documento foi montado a partir da leitura direta do codigo atual do projeto, principalmente destes arquivos:

- `App.tsx`
- `components/Layout.tsx`
- `services/dataService.ts`
- `services/campaignPlannerService.ts`
- `services/scraperService.ts`
- `services/portfolioCatalogService.ts`
- `services/emailService.ts`
- `services/smartImportService.ts`
- `supabase/functions/scraper/index.ts`
- `views/*.tsx`
- `components/*.tsx`

Observacoes importantes:

- O sistema nao expoe uma API REST propria no repositorio.
- O frontend conversa quase sempre direto com o Supabase.
- O principal "gateway de logica" da aplicacao e o `dataService`, apoiado por servicos auxiliares.
- Onde o schema SQL completo nao aparece no repositorio, o comportamento abaixo foi inferido pelo uso real do codigo.

---

## BLOCO 1 - MAPA TECNICO

### 1. Arquitetura atual

O sistema hoje opera em 4 camadas:

1. Interface React/Vite
   Responsavel pelas telas, navegacao e gatilhos de acao.

2. Camada de servicos
   Principalmente `dataService`, `CampaignPlannerService`, `scraperService`, `PortfolioCatalogService`, `EmailService` e `SmartImportService`.

3. Persistencia e autenticacao
   Supabase Auth, tabelas do Postgres e 1 RPC conhecido: `get_unified_remarketing_report`.

4. Integracoes externas
   Google Maps Geocoding, Places Nearby Search, Places Details, links `wa.me` e proxy HTTP para chamadas ao Google.

Resumo objetivo:

- Frontend: React 19 + React Router (`HashRouter`)
- Autenticacao: Supabase Auth
- Banco: Supabase/Postgres
- Relatorios e operacao: leitura direta em tabelas
- Captacao: Google Maps via fetch direto no frontend/proxy e tambem via Edge Function alternativa

### 2. Endpoints de interface (rotas do sistema)

| Rota | Perfil | Funcao atual | Principais servicos acionados |
| --- | --- | --- | --- |
| `login` (fora do router) | publico/autenticado | entrada no sistema e criacao de conta quando liberado | `dataService.signIn`, `dataService.createUser` |
| `/#/` | ADMIN, SUPERVISOR, OPERATOR | dashboard operacional | `getCalls`, `getProtocols`, `getTasks`, `getUsers`, `getQuestions`, `getWhatsAppTasks`, `getDetailedCallsToday`, `getDetailedPendingTasks` |
| `/#/queue` | ADMIN, SUPERVISOR, OPERATOR | fila de atendimento por voz | `getTasks`, `getQuestions`, `getClients`, `checkRecentCall`, `getClientHistory`, `saveCall`, `updateTask`, `createScheduleRequest`, `saveProtocol`, `moveCallToWhatsApp`, `logOperatorEvent` |
| `/#/sales` | ADMIN, SUPERVISOR, OPERATOR | cadastro e acompanhamento de vendas | `getSales`, `checkSaleExists`, `saveSale`, `updateSale`, `updateSaleStatus`, `deleteSale` |
| `/#/clients` | ADMIN, SUPERVISOR, OPERATOR | CRM de clientes e leads | `getClients`, `getClientHistory`, `getClientTags`, `saveClientProfile`, `upsertClient`, `EmailService.saveEmail` |
| `/#/protocols` | ADMIN, SUPERVISOR, OPERATOR | abertura, resolucao e aprovacao de protocolos | `getProtocols`, `getProtocolEvents`, `saveProtocol`, `updateProtocol`, `getClients`, `getUsers`, `getQuestions`, `upsertClient` |
| `/#/admin` | ADMIN | gestao operacional e saneamento | varios metodos administrativos do `dataService`, `CampaignPlannerService.getCampaigns`, `EmailService.getCoverageStats` |
| `/#/calendar` | ADMIN, SUPERVISOR, OPERATOR | agenda de retornos e aprovacoes | `getSchedules`, `createTask`, `updateSchedule`, `getTasks`, `getCalls`, `getVisits`, `getClients`, `getUsers`, `logOperatorEvent` |
| `/#/routes` | ADMIN, SUPERVISOR, OPERATOR | montagem e execucao de roteiros/visitas | `getRouteCandidates`, `saveVisit`, `updateVisit`, `deleteVisit`, `saveSale`, `saveQuote`, `addExternalSalesperson`, `removeExternalSalesperson` |
| `/#/whatsapp` | ADMIN, SUPERVISOR, OPERATOR | fila de WhatsApp | `getWhatsAppTasks`, `startWhatsAppTask`, `skipWhatsAppTask`, `completeWhatsAppTask` |
| `/#/scraper` | ADMIN, SUPERVISOR, OPERATOR | captacao de leads pelo Maps | `scraperService.*`, `dataService.getSystemSetting` |
| `/#/reports` | ADMIN, SUPERVISOR | relatorios gerenciais e auditoria | `getCalls`, `getTasks`, `getWhatsAppTasks`, `getSales`, `getUsers`, `getClients`, `getOperatorEvents`, `getQuestions`, `getVisits`, `getProspects`, `getClientTags`, `getInvalidClients` |
| `/#/prospects` | ADMIN, SUPERVISOR, OPERATOR | gestao de leads/prospects | `getProspects`, `dispatchLeadsToQueue`, `createVisit`, `updateClientFields`, `upsertClient`, `getClientHistory`, `getUsers` |
| `/#/quotes` | ADMIN, SUPERVISOR, OPERATOR | gestao de orcamentos | `getQuotes`, `saveQuote`, `updateQuote`, `saveSale`, `getClients`, `getUsers`, `getExternalSalespeople` |
| `/#/workload` | ADMIN, SUPERVISOR | carga manual e em lote para fila | `upsertClient`, `bulkCreateTasks`, `createWhatsAppTask`, `getUsers` |
| `/#/campaigns` | ADMIN, SUPERVISOR | planejamento e disparo de campanhas | `CampaignPlannerService.*`, `dataService.getUsers`, `PortfolioCatalogService.getCatalogConfig` |
| `/#/data-center` | ADMIN, SUPERVISOR | importacao inteligente, catalogo tecnico e tags | `SmartImportModal`, `PortfolioCatalogManager`, `ProductImport`, `CustomerPortfolioImport`, `getClientTags` |

Observacao tecnica relevante:

- A navegacao usa `HashRouter`.
- O menu lateral e o bloqueio de acesso por perfil sao definidos no frontend.
- A rota `/admin` e exclusiva de ADMIN.
- As rotas `/workload`, `/campaigns` e `/data-center` sao restritas a ADMIN e SUPERVISOR.

### 3. Endpoints de logica por servico

#### 3.1 `dataService` - autenticacao e usuarios

- `getUsers`
  Lista usuarios ativos/inativos a partir da tabela `profiles`.
- `updateUser`
  Atualiza papel, status e nome exibido em `profiles`.
- `createUser`
  Cria conta no Supabase Auth e insere perfil em `profiles`.
- `signIn`
  Autentica por e-mail interno derivado do username e carrega `profiles`.
- `getCurrentSignedUser`
  Restaura sessao ativa do Supabase Auth.
- `signOut`
  Encerra sessao no Supabase Auth.

Observacao critica de comportamento atual:

- Se `VITE_ALLOW_PUBLIC_REGISTRATION=true`, a tela de login permite cadastro publico.
- O cadastro publico cria usuario com papel `ADMIN`.

#### 3.2 `dataService` - configuracoes e auditoria

- `logAudit`
  Registra evento manual em `audit_logs`.
- `getSystemSetting`
  Le valor em `system_settings`.
- `updateSystemSetting`
  Upsert em `system_settings`.
- `getCommunicationBlockDays`
  Le a configuracao anti-spam usada em fila, WhatsApp e agendamentos.

Configuracao central inferida:

- Chave `COMMUNICATION_BLOCK_DAYS`
- Chave `GOOGLE_MAPS_KEY`
- Chave `CLIENT_PORTFOLIO_CATALOG_V1`

#### 3.3 `dataService` - questionarios

- `getQuestions`
  Carrega perguntas ativas, filtradas por tipo, proposito e contexto do cliente/campanha.
- `saveQuestion`
  Cria ou atualiza em `questions`.
- `deleteQuestion`
  Remove de `questions`.
- `getResponseValue`
  Resolve valor de resposta em relatorios e calculos.

#### 3.4 `dataService` - fila de voz e tarefas

- `getTasks`
  Monta a fila operacional combinando `tasks` e agendamentos aprovados em `call_schedules`.
- `createTask`
  Cria tarefa de voz com bloqueio anti-spam, deduplicacao e aproveitamento de tarefa aberta.
- `updateTask`
  Atualiza status, motivo, tipo, operador e sincroniza funil do lead.
- `updateTaskStatus`
  Atualizacao curta de status em `tasks`.
- `deleteTask`
  Exclui tarefa individual e limpa `operator_events`.
- `deleteMultipleTasks`
  Exclui lote de tarefas.
- `backfillSkipReasons`
  Reconstroi motivo de pulo a partir de `operator_events`.
- `deleteTasksByOperator`
  Limpa pendencias de um operador.
- `deleteDuplicateTasks`
  Remove duplicidades de `tasks`.
- `checkRecentCall`
  Valida janela anti-spam por cliente.
- `bulkCreateTasks`
  Cria varias tarefas chamando `createTask` uma a uma.

Tabelas centrais:

- `tasks`
- `call_schedules`
- `operator_events`
- `clients`
- `call_logs`

Regras centrais:

- Bloqueio por contato recente.
- Deduplicacao por cliente + tipo para tarefas pendentes.
- Tarefa pulada ou concluida pode evoluir funil do lead.

#### 3.5 `dataService` - agendamentos e repiques

- `createScheduleRequest`
  Cria pedido de agendamento em `call_schedules`.
- `bulkCreateScheduleRequest`
  Lote de agendamentos.
- `getSchedules`
  Lista agenda com join em `clients`.
- `updateSchedule`
  Atualiza status, operador, data e aprovacao.
- `deleteDuplicateSchedules`
  Remove agendamentos duplicados.

Regras tecnicas atuais:

- Nao permite mais de um agendamento para o mesmo cliente no mesmo dia.
- Nao permite novo agendamento se houve contato recente na janela anti-spam.
- Existe indice unico parcial no banco para reforcar deduplicacao de agenda ativa.

Comportamento operacional importante:

- No calendario, ao aprovar um repique, o sistema marca o `call_schedule` como `CONCLUIDO` e cria uma nova `task` pendente na fila.
- Ou seja: a agenda aprovada vira historico e o atendimento ativo passa a ser a `task`.

#### 3.6 `dataService` - chamadas e interacoes

- `getCalls`
  Lista `call_logs` com cliente agregado.
- `saveCall`
  Salva atendimento, enriquece respostas, atualiza CRM, dispara motor de tags e sincroniza dados do cliente.
- `updateCall`
  Atualiza chamada ja registrada.
- `deleteCall`
  Remove chamada.
- `getDetailedCallsToday`
  Entrega detalhamento diario para dashboard.
- `logOperatorEvent`
  Grava eventos operacionais em `operator_events`.
- `getOperatorEvents`
  Le historico de eventos.
- `getDetailedPendingTasks`
  Dado detalhado da fila para dashboard.

Comportamento tecnico importante:

- `saveCall` enriquece respostas com contexto do cliente, da campanha e do negocio.
- `saveCall` pode sugerir tags automaticas em `client_tags`.
- `saveCall` tambem atualiza `clients.email`, `interest_product`, `buyer_name` e `responsible_phone` quando os dados aparecem no atendimento.

#### 3.7 `dataService` - clientes, leads, CRM e deduplicacao

- `getClients`
  Lista clientes, com opcao de incluir leads.
- `getClientById`
  Busca cliente unitario.
- `getClientHistory`
  Consolida chamadas e protocolos de um cliente.
- `getProspects`
  Lista leads em `clients` com `status='LEAD'`.
- `dispatchLeadsToQueue`
  Envia leads para `tasks`.
- `upsertClient`
  Principal endpoint de cadastro/merge de cliente.
- `saveClientProfile`
  Edicao completa do cadastro.
- `updateClientFields`
  Atualizacao parcial.
- `getInvalidClients`
  Lista clientes com telefone ou registro invalido.
- `findDuplicateClients`
  Procura duplicidades por telefone.
- `findDuplicatesByName`
  Procura duplicidades por nome.
- `mergeClients`
  Funde dois clientes e migra referencias em varias tabelas.
- `batchUpdateInactiveClients`
  Marca clientes como `INATIVO`.
- `cleanupBadClientRecords`
  Remove registros ruins de importacao antiga.
- `repairWhatsAppPhoneDuplicates`
  Corrige clientes com telefones combinados e remapeia `whatsapp_tasks`.

Tabelas tocadas pelo merge:

- `clients`
- `call_logs`
- `tasks`
- `call_schedules`
- `protocols`
- `whatsapp_tasks`
- `client_tags`
- `quotes`
- `visits`
- `sales`

Regras de negocio relevantes:

- `upsertClient` deduplica por id, `external_id`, telefone principal, telefone secundario e nome+rua.
- `syncDerivedTagsForClient` recalcula `clients.tags` a partir do historico recente.
- `updateClientFunnelStatus` so evolui funil quando o registro ainda e um lead.

Diferenca operacional importante:

- `dispatchLeadsToQueue` insere direto em `tasks`, sem passar pelo mesmo funil de validacao anti-spam e deduplicacao do `createTask`.

#### 3.8 `dataService` - tags

- `getClientTags`
  Lista tags em `client_tags`.
- `saveClientTag`
  Cria tag manual.
- `confirmTag`
  Move tag para `CONFIRMADA_OPERADOR`.
- `approveTag`
  Move tag para `APROVADA_SUPERVISOR`.
- `rejectTag`
  Move tag para `REJEITADA`.
- `rebuildDerivedClientTags`
  Recalcula tags derivadas da base inteira.

Fluxo atual das tags:

- Chamada salva pode gerar sugestoes automaticas.
- Operador confirma ou rejeita.
- Supervisor/admin aprova definitivamente ou rejeita.
- Tag aprovada/confirmada pode ser sincronizada para `clients.tags`.

#### 3.9 `dataService` - protocolos

- `getProtocolConfig`
  Exibe departamentos disponiveis.
- `getProtocols`
  Lista protocolos.
- `getProtocolEvents`
  Lista historico do protocolo.
- `saveProtocol`
  Abre protocolo e grava evento de criacao.
- `updateProtocol`
  Atualiza status, responsavel, fechamento e notas.

Tabelas:

- `protocols`
- `protocol_events`

Fluxo atual:

- Operador pode abrir protocolo na fila ou no modulo dedicado.
- Operador alimenta historico.
- Gestao aprova resolucao e fecha.

#### 3.10 `dataService` - WhatsApp

- `createWhatsAppTask`
  Cria tarefa digital com anti-spam e deduplicacao.
- `getWhatsAppTasks`
  Lista fila, pendentes iniciados e historico.
- `startWhatsAppTask`
  Move para `started`.
- `skipWhatsAppTask`
  Move para `skipped`.
- `completeWhatsAppTask`
  Move para `completed` e salva respostas na propria tarefa.
- `moveCallToWhatsApp`
  Converte uma tarefa de voz em tarefa de WhatsApp.
- `deleteWhatsAppTask`
  Exclui item.
- `deleteMultipleWhatsAppTasks`
  Exclui lote.
- `deleteWhatsAppTasksByOperator`
  Limpa fila de um operador.
- `updateWhatsAppTask`
  Atualizacao administrativa.
- `updateWhatsAppTaskStatus`
  Atualizacao curta de status.

Ponto tecnico importante:

- O fluxo de WhatsApp tem dois modelos de registro hoje:
  - fila nativa em `whatsapp_tasks`, concluida com respostas dentro da propria tarefa;
  - interacao registrada como `call_logs` de tipo `WHATSAPP` quando sai da fila de voz ou quando o operador so registra o contato.

#### 3.11 `dataService` - vendas

- `getSales`
  Lista vendas com filtro por periodo.
- `saveSale`
  Cria venda em `sales`.
- `updateSaleStatus`
  Atualiza entrega/atraso.
- `checkSaleExists`
  Detecta duplicidade de numero de pedido.
- `deleteSale`
  Exclui venda.
- `updateSale`
  Edita dados comerciais.

Regra de negocio importante:

- `saveSale` promove `LEAD` ou `INATIVO` para `CLIENT` e define funil como `QUALIFIED`.

#### 3.12 `dataService` - orcamentos

- `getQuotes`
  Lista orcamentos.
- `saveQuote`
  Cria orcamento e espelha `interest_product` no cliente.
- `updateQuote`
  Atualiza orcamento e sincroniza `interest_product`.
- `deleteQuote`
  Exclui orcamento.

Observacao de comportamento atual:

- Quando o orcamento e criado para um cliente inexistente na tela de orcamentos, o sistema cria um lead com telefone placeholder `00000000000`.

#### 3.13 `dataService` - visitas e roteiros

- `createVisit`
  Cria visita simples, usada a partir de prospects.
- `getVisits`
  Lista visitas.
- `saveVisit`
  Persiste visita/roteiro.
- `updateVisit`
  Atualiza roteiro, ordem e realizacao.
- `getRouteCandidates`
  Monta candidatos a visita a partir de `call_logs`, `whatsapp_tasks` e leads.
- `deleteVisit`
  Remove visita.
- `getExternalSalespeople`
  Lista vendedores externos ativos.
- `addExternalSalesperson`
  Cadastra vendedor externo.
- `removeExternalSalesperson`
  Desativa vendedor externo.

Regra de negocio:

- Visita realizada pode mover lead para `PHYSICAL_VISIT`.

#### 3.14 `dataService` - metricas e relatorios

- `getProductivityMetrics`
  Consolida produtividade por operador.
- `listUnifiedReport`
  Usa RPC `get_unified_remarketing_report`; se falhar, usa agregacao fallback em codigo.
- `calculateIDE`
  Calcula indicador baseado nas respostas.
- `getStageAverages`
  Media por etapa do questionario.
- `getDetailedStats`
  Estatistica detalhada para relatorios.
- `getProspectHistory`
  Historico rapido de prospects.
- `bulkUpdateUpsell`
  Gera marcacoes de upsell em lote via `call_logs`.

#### 3.15 `CampaignPlannerService`

- `getCampaigns`, `createCampaign`, `updateCampaign`, `toggleCampaignStatus`
  Gestao basica de `campanhas`.
- `getDistinctCities`, `getDistinctNeighborhoods`, `getDistinctItems`, `getDistinctCustomerProfiles`, `getDistinctProductCategories`, `getDistinctInterestProducts`, `getDistinctCallTypes`, `getDistinctTagCategories`
  Endpoints de apoio para filtros.
- `getPortfolioFilterOptions`
  Consolida opcoes do catalogo tecnico + base real.
- `fetchClientsByFilters`
  Motor de segmentacao da campanha.
- `previewDispatchCampaign`
  Simula bloqueios e volume criavel.
- `dispatchCampaign`
  Cria campanha, grava `campanha_interacoes`, atualiza `clients.campanha_atual_id` e cria fila de voz/WhatsApp.
- `saveTemplate`, `loadTemplates`, `markTemplateUsed`
  Gestao de templates.
- `bulkUpdateClientProducts`
  Atualiza produtos/perfil tecnico em lote.

Tabelas:

- `campanhas`
- `campanha_interacoes`
- `campaign_planner_templates`
- `clients`
- `call_logs`
- `tasks`
- `call_schedules`
- `whatsapp_tasks`
- `quotes`
- `client_tags`

Regras importantes:

- O preview detecta bloqueio por contato recente.
- O dispatch nao cria tudo cegamente; ele calcula o que e criavel por canal.

#### 3.16 `scraperService`

- `parseGoogleAddress`
  Extrai cidade/bairro do endereco retornado.
- `verifyLocation`
  Hoje esta neutro no service; a verificacao real acontece na view.
- `runProcess`
  Executa captacao no Maps, grava `scraper_runs` e `scraper_results`.
- `getProcesses`, `saveProcess`, `deleteProcess`
  Gestao de processos de busca.
- `getRuns`, `forceCompleteRun`, `deleteRun`
  Gestao das execucoes.
- `getResults`, `getAllResults`, `updateResultStatus`
  Revisao e exportacao dos leads captados.
- `approveLead`
  Aprova resultado e faz `upsertClient` como `LEAD`.

Integracoes externas envolvidas:

- Google Geocoding API
- Google Places Nearby Search
- Google Places Details
- `corsproxy.io` em producao
- `/google-proxy/...` em ambiente local/proxy

Ponto tecnico importante:

- Existe Edge Function em `supabase/functions/scraper/index.ts`.
- Porem o fluxo do frontend atual usa principalmente `fetch` direto para Google/proxy, nao `supabase.functions.invoke`.

#### 3.17 `PortfolioCatalogService`

- `getSettingKey`
  Retorna a chave logica do catalogo.
- `getCatalogConfig`
  Le do `system_settings` ou reconstrui a partir de `clients`.
- `saveCatalogConfig`
  Salva configuracao do catalogo tecnico.
- `applyCatalogToAllClients`
  Reprocessa a base inteira de clientes aplicando o catalogo.

#### 3.18 `EmailService`

- `hasEmail`
  Verifica cobertura em `clients.email` e `client_emails`.
- `saveEmail`
  Persiste e-mail principal e tabela secundaria.
- `getCoverageStats`
  Le a visao `cobertura_email`.

#### 3.19 `SmartImportService`

Este servico nao e um endpoint remoto, mas e um endpoint logico importante de importacao:

- `validateRequiredColumns`
- `detectColumnMapping`
- `normalizePhone`
- `splitPhones`
- `normalizeName`
- `parseExcel`
- `processImport`

Ele transforma planilhas em comandos para:

- `dataService.upsertClient`
- `dataService.updateClientFields`

### 4. Endpoints externos e tecnicos fora da UI

#### 4.1 Supabase Auth

- `signUp`
- `signInWithPassword`
- `getSession`
- `signOut`

#### 4.2 Supabase RPC

- `get_unified_remarketing_report`

Uso atual:

- Relatorio unificado de pos-venda e remarketing.
- Existe fallback em codigo caso a RPC nao exista ou falhe.

#### 4.3 Edge Function `scraper`

Arquivo: `supabase/functions/scraper/index.ts`

Acoes conhecidas:

- `action = verify-location`
  Faz geocoding e devolve endereco resolvido + coordenadas.
- `action = run`
  Executa uma busca, grava `scraper_runs` e `scraper_results`.

#### 4.4 Integracoes diretas

- Google Geocode API
- Google Places Nearby Search API
- Google Places Details API
- `https://wa.me/55<telefone>`

### 5. Tabelas e dominios funcionais mapeados

As tabelas/objetos de negocio que aparecem de forma recorrente no codigo atual sao:

- `profiles`
- `system_settings`
- `questions`
- `clients`
- `tasks`
- `call_schedules`
- `call_logs`
- `operator_events`
- `protocols`
- `protocol_events`
- `client_tags`
- `campanhas`
- `campanha_interacoes`
- `campaign_planner_templates`
- `sales`
- `quotes`
- `visits`
- `external_salespeople`
- `whatsapp_tasks`
- `client_emails`
- `scraper_processes`
- `scraper_runs`
- `scraper_results`
- `cobertura_email` (view)

### 6. Regras de negocio transversais hoje

1. Anti-spam / bloqueio de contato
   O sistema tenta impedir novo contato quando houve comunicacao recente, usando `COMMUNICATION_BLOCK_DAYS`.

2. Deduplicacao operacional
   Tarefas de voz, tarefas de WhatsApp e agendamentos possuem limpeza preventiva e indices unicos parciais.

3. Evolucao de funil
   Leads podem evoluir de `NEW` para `CONTACT_ATTEMPT`, `CONTACT_MADE`, `QUALIFIED`, `PROPOSAL_SENT` e `PHYSICAL_VISIT`.

4. Conversao comercial
   Venda salva converte lead/inativo em cliente.

5. Enriquecimento automatico
   Chamadas atualizam dados de cliente e podem gerar tags automaticamente.

6. Sincronizacao de tags
   Confirmacao/aprovacao de tag impacta `clients.tags`.

7. Aprovacao de repique
   O operador solicita; a agenda registra; a gestao aprova; a fila recebe a tarefa ativa.

### 7. Fluxo tecnico ponta a ponta - do usuario ao admin

#### 7.1 Entrada e sessao

1. Usuario informa username/e-mail e senha.
2. `dataService.signIn` converte username em e-mail interno.
3. Supabase Auth autentica.
4. Perfil e carregado de `profiles`.
5. `App.tsx` restaura a sessao com `getCurrentSignedUser`.
6. `Layout.tsx` filtra o menu conforme o papel.

#### 7.2 Operacao de atendimento por voz

1. A fila busca `tasks` e `call_schedules` aprovados.
2. O sistema remove itens invalidos ou bloqueados por contato recente.
3. O operador inicia a chamada e gera `operator_events`.
4. Ao finalizar:
   - pode salvar `call_logs`;
   - pode abrir `protocols`;
   - pode pedir novo `call_schedule`;
   - pode concluir ou pular a `task`;
   - pode mover para `whatsapp_tasks`.
5. `saveCall` enriquece respostas e pode sugerir `client_tags`.

#### 7.3 Pulo, repique e aprovacao

1. Operador marca motivo de pulo.
2. Se quiser retorno, cria `call_schedule` em `PENDENTE_APROVACAO`.
3. Gestao usa a agenda para aprovar, reagendar ou cancelar.
4. Na aprovacao atual, o schedule vai para `CONCLUIDO` e nasce uma `task` pendente na fila.

#### 7.4 Fluxo WhatsApp

1. A tarefa de WhatsApp nasce por campanha, carga, acao manual ou migracao da fila de voz.
2. O operador inicia a tarefa.
3. A conversa pode ser concluida com questionario dentro de `whatsapp_tasks`.
4. Tambem existe o caminho de registrar um contato WhatsApp como `call_log` de tipo `WHATSAPP`.

#### 7.5 Prospecao e leads

1. Leads entram por:
   - cadastro manual;
   - importacao;
   - captacao Maps;
   - criacao indireta via outros modulos.
2. O lead fica em `clients` com `status='LEAD'`.
3. Pode ser enviado para fila, visita fisica, campanha ou orcamento.
4. Interacoes atualizam `funnel_status`.

#### 7.6 Campanhas

1. Gestao filtra clientes/leads por historico, satisfacao, tag, interesse, geografia e portfolio tecnico.
2. O sistema faz preview de bloqueios.
3. Ao disparar:
   - cria `campanhas`;
   - cria `campanha_interacoes`;
   - atualiza `clients.campanha_atual_id`;
   - cria `tasks` e/ou `whatsapp_tasks`.

#### 7.7 Orcamento, venda e visita

1. Orcamento pode nascer para cliente existente ou criar lead novo.
2. Orcamento ganho pode ser convertido em venda.
3. Venda ativa logistica e converte lead/inativo em cliente.
4. Contatos de voz e WhatsApp podem virar candidatos de rota.
5. A rota gera `visits`, pode produzir `quotes` e `sales`, e pode atualizar o funil.

#### 7.8 Governanca e camada admin

1. Admin gerencia usuarios e questionarios.
2. Admin limpa fila, deduplica tarefas e agendamentos.
3. Admin corrige base, clientes duplicados e problemas de WhatsApp.
4. Admin reprocessa tags derivadas.
5. Admin controla chaves e parametros em `system_settings`.
6. Admin acompanha dashboards, relatorios, produtividade e cobertura de email.

### 8. Matriz de responsabilidade por perfil

| Papel | Capacidade principal |
| --- | --- |
| OPERATOR | atender fila, registrar chamadas, criar protocolos, solicitar repique, responder WhatsApp, trabalhar prospects, vendas, quotes e rotas |
| SUPERVISOR | tudo do operador + relatorios, campanhas, carga de trabalho e central de dados |
| ADMIN | tudo do supervisor + gestao, usuarios, configuracoes, saneamento de base e aprovacoes gerais |

### 9. Conclusao tecnica objetiva

O sistema atual nao e orientado a uma API backend propria. Ele funciona como uma SPA React que orquestra logica de negocio no frontend e persiste quase tudo direto no Supabase. O coracao operacional esta em `services/dataService.ts`, enquanto campanhas, captacao Maps, catalogo tecnico e e-mail vivem em servicos especializados. O fluxo do usuario ate o admin e fortemente orientado por fila, agenda, tags, funil comercial e governanca operacional.

---

## BLOCO 2 - VISAO FORMAL PARA UM LEIGO

### Como o sistema funciona hoje

O sistema foi construido para organizar todo o trabalho do time comercial e de relacionamento em um unico lugar. Ele recebe clientes e leads, distribui atendimentos para operadores, registra o que aconteceu em cada contato, acompanha promessas de retorno e entrega para a gestao uma visao centralizada do que esta funcionando e do que precisa de intervencao.

Em termos simples, ele faz quatro coisas ao mesmo tempo:

1. Guarda a base de clientes e leads.
2. Entrega tarefas para o time entrar em contato.
3. Registra o resultado do contato e os proximos passos.
4. Mostra para o gestor onde ha gargalo, oportunidade ou risco.

### Fluxo atual do usuario ate o admin

#### Etapa 1 - Entrada no sistema

O colaborador entra com usuario e senha. Depois do login, o sistema identifica se ele e operador, supervisor ou admin. Com isso, cada pessoa ve apenas os modulos que fazem sentido para sua funcao.

#### Etapa 2 - Recebimento da demanda

A demanda pode nascer de varios lugares:

- um cliente ja existente;
- um lead importado por planilha;
- um lead captado pelo Google Maps;
- uma campanha criada pela gestao;
- um retorno agendado anteriormente;
- uma conversa transferida da fila de ligacao para o WhatsApp.

Quando isso acontece, o sistema coloca a pessoa certa na fila de atendimento ou na fila de WhatsApp.

#### Etapa 3 - Atendimento do operador

O operador recebe o proximo contato, faz a ligacao ou conversa no WhatsApp e registra o resultado. Nesse momento, o sistema pode:

- guardar o historico do atendimento;
- atualizar dados do cliente;
- marcar interesse em produto;
- abrir um protocolo, se houver problema;
- pedir um retorno futuro;
- sugerir tags automaticas para classificacao;
- mover o contato para WhatsApp, se for melhor.

#### Etapa 4 - Quando o cliente nao fecha ou nao responde

Se o cliente nao atende, pede retorno ou precisa de novo contato, o operador solicita um reagendamento. Esse retorno nao vai direto para a fila definitiva: ele passa por uma camada de controle para evitar excesso de contato e para dar previsibilidade para a operacao.

Se o problema for telefone invalido, o sistema pode retirar esse cadastro das filas ativas para nao gerar retrabalho.

#### Etapa 5 - Quando existe problema ou tratativa formal

Se durante o contato surgir reclamacao, pendencia ou necessidade de acompanhamento, o operador abre um protocolo. Esse protocolo fica visivel para acompanhamento, pode receber notas internas, pode ser repassado para outro responsavel e so termina de verdade quando a gestao aprova o encerramento.

#### Etapa 6 - Quando vira oportunidade comercial

Se o contato avanca, o sistema pode registrar:

- orcamento;
- venda;
- visita externa;
- interesse em outro produto;
- campanha futura.

Quando uma venda e registrada, o sistema passa a tratar esse registro como cliente consolidado, mesmo que antes ele fosse apenas lead ou cliente inativo.

#### Etapa 7 - Papel da gestao e do admin

A gestao acompanha a operacao de forma mais ampla. Ela aprova retornos, cria campanhas, reorganiza filas, revisa tags, acompanha produtividade e olha os relatorios de conversao, perdas, gargalos e qualidade do atendimento.

O admin vai alem: ele tambem cuida de usuarios, configuracoes do sistema, chaves de integracao, correcoes de base, deduplicacao de clientes e limpeza de inconsistencias operacionais.

### O que o gestor consegue enxergar no fluxo

Do ponto de vista gerencial, o sistema mostra:

- quantos contatos foram feitos;
- quantos ainda estao pendentes;
- quais protocolos seguem abertos;
- quais leads avancaram no funil;
- quais clientes estao com chance de nova venda;
- quais operadores estao produzindo mais;
- quais dados da base precisam de correcao.

### Em uma frase

Hoje o sistema funciona como um centro de operacao comercial: o usuario executa o contato, o sistema registra e organiza, e o admin/supervisor controla, aprova, corrige e direciona o proximo passo.

### Resumo executivo final

Se for explicar para um leigo, o fluxo atual e este:

1. O sistema recebe pessoas da base ou da captacao.
2. Distribui os contatos para o time.
3. Registra o resultado de cada abordagem.
4. Encaminha problemas, retornos, vendas e visitas.
5. Entrega para a gestao uma visao completa do que foi feito e do que precisa ser decidido.

