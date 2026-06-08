# Deploy

Projeto em producao na VPS srv1537358.

- Caminho: /var/www/willianholanda
- Repositorio: git@github.com:calebesaraiva/willianholanda.git
- Branch de deploy: main
- Atualizacao automatica: /usr/local/bin/github-autodeploy.sh via cron a cada minuto

Arquivos de ambiente, bancos locais, uploads, backups, builds e dependencias instaladas ficam fora do Git por seguranca.

## WhatsApp temporario por QR na VPS

No `.env` da VPS, enquanto a Meta nao liberar a API oficial:

```env
WHATSAPP_DELIVERY_MODE=temporary_qr
WHATSAPP_TEMPORARY_QR_ENABLED=true
WHATSAPP_RESPONSIBLE_NAME=Elinaldo Pereira
WHATSAPP_RESPONSIBLE_PHONE=559887338179
```

Depois do deploy:

```bash
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
pm2 logs willian-holanda-sistema
```

Escaneie o QR code que aparece em `pm2 logs willian-holanda-sistema`. A sessao fica salva em `server/data-willian-holanda/temporary-whatsapp-session-baileys`, entao reinicios normais do PM2 ou da VPS reaproveitam a conexao.

Quando a Meta aprovar a integracao oficial:

```env
WHATSAPP_DELIVERY_MODE=meta
WHATSAPP_TEMPORARY_QR_ENABLED=false
```

Depois reinicie:

```bash
pm2 restart willian-holanda-sistema
```
