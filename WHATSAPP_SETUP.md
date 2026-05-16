# WhatsApp Setup

## Variaveis de ambiente

Preencha no servidor:

```env
PUBLIC_BASE_URL=https://sistema.seudominio.com.br
WHATSAPP_VERIFY_TOKEN=defina-um-token-seguro
WHATSAPP_ACCESS_TOKEN=cole-o-token-da-cloud-api
WHATSAPP_PHONE_NUMBER_ID=cole-o-phone-number-id
WHATSAPP_APP_SECRET=cole-o-app-secret-da-meta
WHATSAPP_GRAPH_VERSION=v23.0
WHATSAPP_DOCTOR_PHONE=5511999999999
WHATSAPP_DOCTOR_TEMPLATE_NAME=novo_agendamento_resumo
WHATSAPP_DOCTOR_TEMPLATE_LANGUAGE=pt_BR
WHATSAPP_DOCTOR_FALLBACK_TEXT_ENABLED=false
WHATSAPP_PATIENT_REMINDER_TEMPLATE_NAME=lembrete_agendamento_amanha
WHATSAPP_PATIENT_SAME_DAY_TEMPLATE_NAME=lembrete_agendamento_hoje
WHATSAPP_PATIENT_TEMPLATE_LANGUAGE=pt_BR
WHATSAPP_PATIENT_FALLBACK_TEXT_ENABLED=false
```

Arquivo pronto no projeto:

- Use [`.env.production.example`](c:/Users/caleb/Desktop/SISTEMAS/willianholanda/.env.production.example:1) como base para o ambiente de producao.
- No servidor, publique esse conteudo como `.env` e preencha apenas as credenciais reais.
- Se quiser a versao mais direta, ja deixei [`.env.production.local`](c:/Users/caleb/Desktop/SISTEMAS/willianholanda/.env.production.local:1) pronta com painel e seguranca preenchidos, faltando so os campos do WhatsApp da Meta.
- Quando voce reunir os dados da Meta, use tambem [META_DADOS_PARA_ENVIO.md](C:/Users/Russo/Desktop/sistemas/willianholanda/META_DADOS_PARA_ENVIO.md) como lista rapida do que precisa me mandar.
- Antes do go-live, rode `npm run check:prod-env` para validar o `.env.production.local`.

## Webhook

Configure no Meta WhatsApp Cloud API:

- Callback URL: `https://sistema.seudominio.com.br/api/whatsapp/webhook`
- Verify token: o mesmo valor de `WHATSAPP_VERIFY_TOKEN`
- App Secret: configure tambem `WHATSAPP_APP_SECRET` no servidor para validar a assinatura `X-Hub-Signature-256`.
- Em producao, use dominio fixo com HTTPS. Nao use ngrok.
- Mantenha o backend em execucao com `pm2 start ecosystem.config.cjs` para reinicio automatico.
- Assine tambem os eventos de `messages` e `message_template_status_update`/status de mensagem no app da Meta.

## Operacao recomendada

- O webhook agora responde rapido e processa em fila interna para reduzir timeout e reentrega duplicada.
- A deduplicacao usa `message.id` da Meta salvo em banco. Se a Meta reenviar o mesmo evento, o sistema ignora.
- Status como `sent`, `delivered`, `read` e `failed` passam a ser registrados no historico do WhatsApp.
- Conversas paradas recebem lembrete automatico para retomada.
- O sistema suporta lembretes automaticos de agendamento no dia anterior e no mesmo dia.

## Notificacao automatica para o medico

- Configure `WHATSAPP_DOCTOR_PHONE` com o numero do medico em formato internacional.
- Configure um template aprovado na Meta com nome `novo_agendamento_resumo`.
- O backend envia 6 parametros no corpo do template, nesta ordem:
  1. nome do paciente
  2. data
  3. hora
  4. procedimento
  5. CPF mascarado
  6. origem
- Se quiser liberar texto livre apenas como fallback interno, use `WHATSAPP_DOCTOR_FALLBACK_TEXT_ENABLED=true`.
- O caminho mais seguro continua sendo template oficial aprovado.

## Lembretes automaticos para pacientes

- Template sugerido para dia anterior: `lembrete_agendamento_amanha`
- Template sugerido para o dia do atendimento: `lembrete_agendamento_hoje`
- Se os templates nao estiverem configurados, os lembretes so saem por texto livre quando `WHATSAPP_PATIENT_FALLBACK_TEXT_ENABLED=true`
- O sistema envia lembrete do dia anterior e lembrete de poucas horas antes do atendimento.

## Comandos aceitos no WhatsApp

### Ver datas liberadas

```text
DATAS
```

### Criar agendamento

```text
AGENDAR
NOME: Maria da Silva
CPF: 12345678901
ENDERECO: Rua Exemplo, 10
DATA: 2026-04-12
PROCEDIMENTO: Consulta
OBS: Opcional
```

### Consultar status

```text
STATUS
CPF: 12345678901
DATA: 2026-04-12
```

### Cancelar agendamento

```text
CANCELAR
CPF: 12345678901
DATA: 2026-04-12
```

## Testes

- Painel admin: secao `WhatsApp > Webhook e automacao`
- Simulacao local: cria e atualiza agendamentos sem depender da Meta
- Envio real: so fica habilitado quando `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` estiverem configurados
- Teste de notificacao do medico: `POST /api/admin/whatsapp/test-doctor-notification`
- O status do painel agora mostra tambem a prontidao para:
  - mensagens recebidas reais
  - notificacao automatica do medico
  - lembretes automaticos de pacientes
  - automacao completa
