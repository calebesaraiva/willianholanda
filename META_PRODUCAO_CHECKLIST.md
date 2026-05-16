# Checklist de Producao da Meta Cloud API

## 1. Infra e dominio

- Publicar o backend em dominio fixo com HTTPS.
- Subir o backend com supervisor de processo (`pm2 start ecosystem.config.cjs`) para reinicio automatico.
- Confirmar `PUBLIC_BASE_URL=https://sistema.seudominio.com.br`.
- Nao usar ngrok em producao.
- Garantir que `POST /api/whatsapp/webhook` esteja acessivel publicamente.

## 2. Variaveis de ambiente no servidor

Base pronta no projeto:

- [`.env.production.example`](c:/Users/caleb/Desktop/SISTEMAS/willianholanda/.env.production.example:1)
- Validar depois com `npm run check:prod-env`

```env
PUBLIC_BASE_URL=https://sistema.seudominio.com.br
WHATSAPP_VERIFY_TOKEN=defina-um-token-seguro
WHATSAPP_ACCESS_TOKEN=cole-o-token-da-cloud-api
WHATSAPP_PHONE_NUMBER_ID=cole-o-phone-number-id
WHATSAPP_APP_SECRET=cole-o-app-secret-da-meta
WHATSAPP_GRAPH_VERSION=v23.0
WHATSAPP_DOCTOR_PHONE=55DDDNUMERO
WHATSAPP_DOCTOR_TEMPLATE_NAME=novo_agendamento_resumo
WHATSAPP_DOCTOR_TEMPLATE_LANGUAGE=pt_BR
WHATSAPP_DOCTOR_FALLBACK_TEXT_ENABLED=false
WHATSAPP_PATIENT_REMINDER_TEMPLATE_NAME=lembrete_agendamento_amanha
WHATSAPP_PATIENT_SAME_DAY_TEMPLATE_NAME=lembrete_agendamento_hoje
WHATSAPP_PATIENT_TEMPLATE_LANGUAGE=pt_BR
WHATSAPP_PATIENT_FALLBACK_TEXT_ENABLED=false
```

## 3. Configuracao no app da Meta

- Criar ou reutilizar um app com WhatsApp.
- Vincular a WABA correta.
- Confirmar o numero oficial exclusivo do atendimento.
- Configurar webhook:
  - Callback URL: `https://sistema.seudominio.com.br/api/whatsapp/webhook`
  - Verify token: igual ao `WHATSAPP_VERIFY_TOKEN`
- Assinar eventos de mensagens e status.
- Copiar o `App Secret` do app e salvar em `WHATSAPP_APP_SECRET`.

## 4. Template do medico

- Criar e aprovar o template `novo_agendamento_resumo`.
- Estruturar o body para 6 parametros, nesta ordem:
  1. nome do paciente
  2. data
  3. hora
  4. procedimento
  5. CPF mascarado
  6. origem

## 5. Validacao no painel

- Acessar a secao `WhatsApp` no painel admin.
- Verificar se `Cloud API`, `App Secret`, `Notif. medico` e `Template medico` aparecem como `OK`.
- Verificar se a prontidao mostra `readyForInboundMessages`, `readyForDoctorAutomation` e `readyForFullAutomation`.
- Rodar `Enviar teste`.
- Rodar `Testar notificacao do medico`.
- Rodar `Rodar check completo`.
- Validar se os templates de lembrete do paciente estao aprovados, quando forem usados.

## 6. Teste ponta a ponta

- Enviar `OI` para o numero oficial real.
- Executar um agendamento completo pelo fluxo guiado.
- Confirmar:
  - resposta ao paciente
  - criacao do agendamento no painel
  - notificacao ao medico
  - eventos `sent`, `delivered` e `read` no historico

## 7. Go-live

- Trocar token temporario por token duradouro da Meta, se aplicavel.
- Confirmar monitoramento basico do servidor e renovacao do HTTPS.
- Liberar o numero para atendimento real somente depois do teste ponta a ponta passar.
