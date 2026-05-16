# Dados da Meta para me enviar depois

Quando voce quiser que eu finalize o go-live do WhatsApp oficial, me envie estes dados:

## Obrigatorios

- `PUBLIC_BASE_URL`
  Exemplo: `https://sistema.seudominio.com.br`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_APP_SECRET`

## Para notificacao automatica do medico

- `WHATSAPP_DOCTOR_PHONE`
  Exemplo: `5511999999999`
- nome exato do template aprovado do medico
  Exemplo: `novo_agendamento_resumo`
- idioma do template
  Exemplo: `pt_BR`

## Para lembretes automaticos dos pacientes

- nome exato do template de lembrete do dia anterior
- nome exato do template de lembrete do mesmo dia
- idioma dos templates
  Exemplo: `pt_BR`

## Dados operacionais que ajudam muito

- dominio final onde o sistema vai rodar
- se o token da Meta ja e duradouro ou temporario
- numero oficial que vai receber as mensagens
- se o webhook da Meta ja esta apontado para o dominio final
- se os templates ja foram aprovados

## O que eu vou fazer assim que voce mandar

1. Preencher o `.env` de producao.
2. Rodar `npm run check:prod-env`.
3. Validar o painel em `WhatsApp > Webhook e automacao`.
4. Testar envio real.
5. Confirmar se o sistema ficou pronto para atendimento real.
