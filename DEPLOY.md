# 🚀 Deploy na Hostinger - Site Estático

## ⚙️ Configuração Local (Antes de Subir)

### 1. Criar arquivo `.env` com suas credenciais Supabase
Crie um arquivo `.env` na raiz do projeto:
```env
VITE_SUPABASE_URL=https://sua-url.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-aqui
```
*Nota: Use as credenciais reais do seu projeto Supabase.*

### 2. Validar Build Limpo
Execute para garantir que não há erros de TypeScript ou dependências quebradas:
```bash
npm run build
```
Se o comando terminar com sucesso (pasta `dist` criada), seu projeto está pronto.

---

## 📤 Deploy via GitHub → Hostinger

### Passo 1: Subir para o GitHub
Certifique-se de que a branch `main` está atualizada.
```bash
git add .
git commit -m "Preparando para deploy Hostinger"
git push origin main
```

### Passo 2: Configurar na Hostinger

No painel da Hostinger (VPS ou Web Hosting com suporte a Node/Static):

1. **Tipo de Aplicação**: Static Site ou Node.js (preferência Static se disponível, pois é SPA)
2. **Repositório**: Conecte seu GitHub
3. **Build Command**: `npm run build`
4. **Publish Directory / Output**: `dist`
5. **Node Version**: v18 ou superior

### Passo 3: Variáveis de Ambiente (CRÍTICO)

Você **PRECISA** adicionar as variáveis de ambiente no painel da Hostinger. Sem isso, o login falhará.

| Nome da Variável | Valor |
| :--- | :--- |
| `VITE_SUPABASE_URL` | Sua URL do Supabase (ex: https://xyz.supabase.co) |
| `VITE_SUPABASE_ANON_KEY` | Sua chave pública (anon key) |

> [!IMPORTANT]
> Após adicionar as variáveis, faça um **Redeploy** manual para que elas sejam injetadas no código.

---

## 🗄️ Scripts SQL Necessários
Certifique-se de ter rodado estes scripts no Supabase SQL Editor:
1. `fix_missing_columns.sql` (Correção de colunas faltantes)
2. `supabase_updates.sql` (Criação de tabelas de visita e índices)
3. `update_schema_v3.sql` (Atualizações gerais)

---

## 🔧 Solução de Problemas Comuns

### Tela Branca / 404 ao recarregar
Como é um SPA, todas as rotas devem redirecionar para `index.html`.
- O arquivo `.htaccess` na raiz já está configurado para isso. Certifique-se de que ele foi enviado ao servidor.

### Erro "Failed to fetch" ou Login travado
Geralmente indica falta das variáveis de ambiente.
1. Verifique `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no painel da Hostinger.
2. Force um novo deploy.

### Erro de Build "Sales.tsx not found"
Se o build falhar procurando `Sales.tsx`, verifique se alguma importação não foi atualizada para `SalesView.tsx`. (O arquivo antigo foi removido).

