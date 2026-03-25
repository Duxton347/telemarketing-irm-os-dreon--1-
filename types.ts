export enum UserRole {
  ADMIN = 'ADMIN',
  SUPERVISOR = 'SUPERVISOR',
  OPERATOR = 'OPERATOR'
}

export type TagCategories = 'RECUPERACAO' | 'OPORTUNIDADE' | 'REATIVACAO' | 'CONFIRMACAO' | 'CLIENTE_PERDIDO';
export type TagMotivos = 
  | 'ATENDIMENTO_RUIM' | 'EXECUCAO_RUIM' | 'ATRASO' | 'PRODUTO_DEFEITO' 
  | 'UPSELL' | 'NOVA_INDICACAO' | 'VOLTOU_COMPRAR' | 'SATISFEITO' | 'INSATISFEITO';
export type TagStatus = 'SUGERIDA' | 'CONFIRMADA_OPERADOR' | 'APROVADA_SUPERVISOR' | 'REJEITADA';
export type TagOrigins = 'AUTOMATICA' | 'MANUAL';
export type InteractionTypes = 'LIGACAO_CAMPANHA' | 'MENSAGEM_WHATSAPP' | 'CONFIRMACAO_TAG' | 'REJEICAO_TAG';

export interface User {
  id: string;
  username: string;
  password?: string;
  name: string;
  role: UserRole;
  active: boolean;
}

export enum CallType {
  POS_VENDA = 'PÓS-VENDA',
  PROSPECCAO = 'PROSPECÇÃO',
  VENDA = 'VENDA',
  CONFIRMACAO_PROTOCOLO = 'CONFIRMAÇÃO PROTOCOLO',
  REATIVACAO = 'REATIVAÇÃO',
  WHATSAPP = 'WHATSAPP' // Kept for internal logic/channel identification
}

export enum SaleCategory {
  QUIMICOS = 'QUÍMICOS',
  BOMBAS = 'BOMBAS',
  BOILER = 'BOILER',
  AQUECEDOR_PISCINA = 'AQUECEDOR PISCINA',
  FOTOVOLTAICO = 'FOTOVOLTAICO',
  LINHA_BANHO = 'LINHA BANHO',
  OUTROS = 'OUTROS'
}

export enum SaleChannel {
  WHATSAPP = 'WHATSAPP',
  PROSPECCAO = 'PROSPECÇÃO',
  RECUPERACAO = 'RECUPERAÇÃO DE CLIENTE',
  SITE = 'SITE',
  LOJA = 'LOJA FÍSICA'
}

export enum SaleStatus {
  PENDENTE = 'PENDENTE',
  ENTREGUE = 'ENTREGUE',
  CANCELADO = 'CANCELADO'
}

export interface Sale {
  id: string;
  saleNumber: string;
  clientId?: string; // New field
  clientName: string;
  address: string;
  category: SaleCategory;
  channel: SaleChannel;
  operatorId: string;
  status: SaleStatus;
  value: number;
  registeredAt: string;
  deliveredAt?: string;
  externalSalesperson?: string;
  deliveryDelayReason?: string;
  deliveryNote?: string;
}

export type QuoteStatus = 'OPEN' | 'WON' | 'LOST';

export interface Quote {
  id: string;
  quote_number: string;
  client_id?: string;
  client_name: string;
  salesperson_id?: string;
  salesperson_name: string;
  value: number;
  win_probability: number;
  status: QuoteStatus;
  justification?: string;
  interest_product?: string;
  visit_id?: string;
  created_at: string;
  updated_at: string;
}

export enum ProtocolStatus {
  ABERTO = 'Aberto',
  EM_ANDAMENTO = 'Em andamento',
  AGUARDANDO_SETOR = 'Aguardando Setor',
  AGUARDANDO_CLIENTE = 'Aguardando Cliente',
  RESOLVIDO_PENDENTE = 'Resolvido (Pendente Confirmação)',
  FECHADO = 'Fechado',
  REABERTO = 'Reaberto'
}

export enum OperatorEventType {
  INICIAR_PROXIMO_ATENDIMENTO = 'INICIAR_PROXIMO_ATENDIMENTO',
  FINALIZAR_ATENDIMENTO = 'FINALIZAR_ATENDIMENTO',
  PULAR_ATENDIMENTO = 'PULAR_ATENDIMENTO',
  ADMIN_AGENDAR = 'ADMIN_AGENDAR',
  ADMIN_APROVAR = 'ADMIN_APROVAR',
  ADMIN_REJEITAR = 'ADMIN_REJEITAR',
  ADMIN_REAGENDAR = 'ADMIN_REAGENDAR',
  WHATSAPP_START = 'WHATSAPP_START',
  WHATSAPP_SKIP = 'WHATSAPP_SKIP',
  WHATSAPP_COMPLETE = 'WHATSAPP_COMPLETE'
}

export interface OperatorEvent {
  id: string;
  operatorId: string;
  taskId?: string;
  eventType: OperatorEventType;
  timestamp: string;
  note?: string;
}

export interface Interaction {
  id: string;
  type: string;
  date: string;
  summary: string;
  operatorId?: string;
}

export interface ClientPortfolioEntry {
  id?: string;
  profile: string;
  product_category: string;
  equipment: string;
  quantity?: number;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  address: string;
  acceptance: 'low' | 'medium' | 'high';
  satisfaction: 'low' | 'medium' | 'high';
  items: string[];
  offers?: string[];
  lastInteraction?: string;
  invalid?: boolean;
  history?: Interaction[];
  // New Fields for Scraper & Prospects
  origin?: 'MANUAL' | 'GOOGLE_SEARCH' | 'CSV_IMPORT';
  email?: string;
  website?: string;
  status?: 'CLIENT' | 'LEAD' | 'INATIVO';
  responsible_phone?: string;
  buyer_name?: string;
  interest_product?: string;
  preferred_channel?: 'PHONE' | 'WHATSAPP' | 'BOTH';
  funnel_status?: 'NEW' | 'CONTACT_ATTEMPT' | 'CONTACT_MADE' | 'QUALIFIED' | 'PROPOSAL_SENT' | 'PHYSICAL_VISIT';

  // New Fields for Structured Address & Multi-Phone (Legacy Import)
  external_id?: string;
  phone_secondary?: string;
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  last_purchase_date?: string;
  customer_profiles?: string[];
  product_categories?: string[];
  equipment_models?: string[];
  portfolio_entries?: ClientPortfolioEntry[];

  // New Fields for Dreon Skill v3
  tags?: string[];
  campanha_atual_id?: string;
}

export type ScheduleStatus = 'PENDENTE_APROVACAO' | 'APROVADO' | 'REJEITADO' | 'REPROGRAMADO' | 'CONCLUIDO' | 'CANCELADO';

export interface CallSchedule {
  id: string;
  customerId?: string; // FK to Client
  originCallId?: string; // Optional link to original task
  requestedByOperatorId: string;
  assignedOperatorId: string;
  approvedByAdminId?: string;
  scheduledFor: string; // ISO String
  callType: CallType;
  status: ScheduleStatus;
  scheduleReason?: string;
  approvalReason?: string;
  resolutionChannel?: string;

  // New fields for Repique
  skipReason?: string;
  whatsappSent?: boolean;
  whatsappNote?: string;
  hasRepick?: boolean;
  rescheduledBy?: string;
  rescheduledAt?: string;
  rescheduleReason?: string;
  deletedBy?: string;
  deletedAt?: string;
  deleteReason?: string;
  queuedAt?: string;
  completedAt?: string;

  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  tableName: string;
  recordId: string;
  action: string;
  changes?: any;
  userId: string;
  reason?: string;
  createdAt: string;
}

export interface ProductivityMetrics {
  totalCalls: number;
  totalWhatsApp: number;
  salesCount: number;
  conversionRate: number;
  operatorStats: {
    id: string;
    name: string;
    calls: number;
    whatsapp: number;
    sales: number;
  }[];
}

export interface CallScheduleWithClient extends CallSchedule {
  clientName?: string;
  clientPhone?: string;
}

export interface Task {
  id: string;
  clientId: string;
  type: CallType;
  deadline: string;
  assignedTo: string;
  status: 'pending' | 'completed' | 'skipped';
  skipReason?: string;
  scheduledFor?: string; // ISO Date for callback
  scheduleReason?: string;
  createdAt: string;
  updatedAt?: string;

  // New fields for Scheduling/Approval
  approvalStatus?: 'PENDING' | 'APPROVED' | 'RESOLVED';
  originCallId?: string;
  targetCallType?: string;

  // Joined fields
  clientName?: string;
  clientPhone?: string;
  clients?: any; // For full object access if needed

  // New Fields for Dreon Skill v3
  proposito?: string;
  campanha_id?: string;
  campaignName?: string;
  targetProduct?: string;
  offerProduct?: string;
  portfolioScope?: string;
  campaignMode?: 'RELATIONSHIP' | 'TARGETED' | string;
}

export interface Visit {
  id: string;
  clientId?: string;
  clientName: string;
  address: string;
  city?: string;
  phone: string;
  salespersonId: string;
  salespersonName: string;
  scheduledDate: string; // ISO
  status: 'PENDING' | 'COMPLETED' | 'CANCELED';
  outcome?: string;
  createdAt: string;

  // New fields for Route Management
  orderIndex?: number;
  externalSalesperson?: string;
  isIndication?: boolean;
  realized?: boolean;
  originType?: 'CALL' | 'TASK' | 'MANUAL';
  originId?: string;
  contactPerson?: string;
  notes?: string; // Observation about visit purpose
}

export interface CallRecord {
  id: string;
  taskId?: string;
  operatorId: string;
  clientId: string;
  startTime: string;
  endTime: string;
  duration: number;
  reportTime: number;
  responses: Record<string, any>;
  type: CallType;
  protocolId?: string;
  clientName?: string;
  clientPhone?: string;

  // New Fields for Dreon Skill v3
  proposito?: string;
  campanha_indicada_id?: string;
  campanha_id?: string;
  campaignName?: string;
  targetProduct?: string;
  offerProduct?: string;
  portfolioScope?: string;
  campaignMode?: 'RELATIONSHIP' | 'TARGETED' | string;
  offerInterestLevel?: string;
  offerBlockerReason?: string;
}

export interface HistoryBreakdown {
  key: string;
  label: string;
  total: number;
}

export interface ClientHistorySummary {
  totalCalls: number;
  totalProtocols: number;
  openProtocols: number;
  callCountsByType: HistoryBreakdown[];
  callCountsByPurpose: HistoryBreakdown[];
  callCountsByTargetProduct: HistoryBreakdown[];
}

export interface ClientHistoryData {
  calls: CallRecord[];
  protocols: Protocol[];
  summary: ClientHistorySummary;
}

export interface Protocol {
  id: string;
  protocolNumber?: string;
  clientId: string;
  openedByOperatorId: string;
  ownerOperatorId: string;
  origin: string;
  departmentId: string;
  categoryId: string;
  title: string;
  description: string;
  priority: 'Baixa' | 'Média' | 'Alta';
  status: ProtocolStatus;
  openedAt: string;
  updatedAt: string;
  closedAt?: string;
  firstResponseAt?: string;
  lastActionAt: string;
  slaDueAt: string;
  resolutionSummary?: string;
  rootCause?: string;
}

export interface ProtocolEvent {
  id: string;
  protocolId: string;
  eventType: string;
  oldValue?: string;
  newValue?: string;
  note?: string;
  actorId: string;
  createdAt: string;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  type: CallType | 'ALL';
  order: number;
  stageId?: string;

  // New Fields for Dreon Skill v3
  proposito?: string;
  campo_resposta?: string;
  tipo_input?: 'text' | 'select' | 'radio' | 'checkbox';
  obrigatoria?: boolean;
  ativo?: boolean;
}

export interface ExternalSalesperson {
  id: string;
  name: string;
  active: boolean;
}

export type WhatsAppStatus = 'pending' | 'started' | 'completed' | 'skipped';

export interface WhatsAppTask {
  id: string;
  clientId: string;
  assignedTo?: string; // Operator ID
  status: WhatsAppStatus;
  type: CallType;
  source: 'manual' | 'call_skip_whatsapp';
  sourceId?: string;
  skipReason?: string;
  skipNote?: string;
  startedAt?: string;
  completedAt?: string;
  responses?: Record<string, any>;
  createdAt: string;
  updatedAt: string;

  // Joined fields
  clientName?: string;
  clientPhone?: string;

  // Dreon Skill v3
  proposito?: string;
}

export interface UnifiedReportRow {
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientStatus: string;
  attemptsCount: number;
  lastContactAt?: string;
  lastOutcome?: string;
  lastOperatorId?: string;
  lastChannel?: string;
  lastContactGenre?: string;
  lastRating?: number; // 1 (Bad) or 5 (Good) based on JSON responses proxy
  upsellOffer?: string; // Captured from the JSON responses
  upsellStatus?: 'OPEN' | 'DONE' | 'CANCELLED';
  responseStatus: string; // 'Não Contatado', 'Sem Resposta', 'Respondeu'
  conversionStatus: string; // 'Gerou Venda', 'Sem Venda'
  lastSkipReason?: string;
}

// Dreon Skill v3 New Interfaces

export interface ClientTag {
  id: string;
  client_id: string;
  call_record_id?: string;
  campanha_id?: string;
  categoria: TagCategories | string;
  motivo: TagMotivos | string;
  label: string;
  status: TagStatus;
  origem: TagOrigins;
  score_confianca?: number;
  motivo_detalhe?: string;
  campos_negativos?: string[];
  criado_em: string;
  confirmado_por?: string;
  confirmado_em?: string;
  aprovado_por?: string;
  aprovado_em?: string;
  rejeitado_por?: string;
  motivo_rejeicao?: string;
}

export interface Campanha {
  id: string;
  nome: string;
  descricao?: string;
  proposito_alvo?: string;
  call_type_alvo?: CallType | 'ALL' | string;
  tipo_mensagem?: 'voz' | 'whatsapp' | 'email' | 'ambos' | string;
  publico_alvo?: 'CLIENT' | 'LEAD' | 'INATIVO' | string;
  prioridade: number;
  ativa: boolean;
  data_inicio?: string;
  data_fim?: string;
  criado_em: string;
  criado_pelo_planner?: boolean;
  filters_usados?: any;
  total_clientes?: number;
  operator_destino_id?: string;
}

export interface CampanhaInteracao {
  id: string;
  campanha_id: string;
  client_id: string;
  client_tag_id?: string;
  tipo_interacao: InteractionTypes | string;
  canal?: 'voz' | 'whatsapp' | 'email' | string;
  call_record_id?: string;
  task_id?: string;
  resultado?: string;
  notas?: string;
  operador_id?: string;
  data_hora: string;
}

export interface RegrasCampanha {
  id: string;
  campanha_id: string;
  campo_resposta: string;
  operador: 'EQUALS' | 'CONTAINS' | 'GREATER_THAN' | 'LESS_THAN' | 'NOT_EQUALS' | string;
  valor_esperado: string;
  call_type_origem?: string;
  proposito_origem?: string;
  peso: number;
  ativo: boolean;
}

export interface CampaignPlannerTemplate {
  id: string;
  nome: string;
  filters: any;
  criado_por?: string;
  criado_em: string;
  usado_em?: string;
}

export interface TagDecisionResult {
  tagsToCreate: Partial<ClientTag>[];
  logs: string[];
}
