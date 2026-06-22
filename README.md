# Laca Corretores Imobiliários

Sistema dinâmico para site público e painel administrativo da Laca Corretores, usando Node.js nativo, dados em JSON e uploads locais.

## Como rodar

```bash
npm run dev
```

Depois acesse:

- Site: http://localhost:3000
- Admin: http://localhost:3000/admin
- Imóveis à venda: http://localhost:3000/imoveis

## Credenciais iniciais

O painel usa a senha definida em variável de ambiente:

```bash
LACA_ADMIN_PASSWORD="sua-senha-forte"
```

Se a variável não existir, a senha temporária de desenvolvimento é:

```text
Laca@2026
```

Troque a senha antes de publicar.

## SEO

O servidor gera páginas renderizadas para buscadores, `sitemap.xml`, `robots.txt`, canonical URLs, metadados Open Graph e JSON-LD para `RealEstateAgent`, artigos, FAQ e vídeos.

Para produção, defina também:

```bash
SITE_URL="https://seudominio.com.br"
PORT=3000
MAX_UPLOAD_MB=80
```

## Mídias

O painel permite:

- Postagens publicadas ou rascunhos.
- Imóveis à venda com preço, bairro, tipo, áreas, dormitórios, suítes, banheiros, vagas, condomínio, IPTU, endereço, diferenciais, comodidades e pontos próximos.
- Capa por URL ou upload.
- Galeria de imagens para imóveis.
- Vídeos por upload local.
- Vídeos por link do YouTube.
- Campos de SEO por postagem e por imóvel.

Uploads ficam em `public/uploads`.

## Deploy gratuito na Vercel

O projeto esta preparado para Vercel Hobby com Vercel Blob.

1. Crie ou conecte um projeto na Vercel.
2. No projeto, abra Storage e crie um Blob Store.
3. A Vercel adiciona automaticamente a variavel:

```bash
BLOB_READ_WRITE_TOKEN
```

4. Configure tambem:

```bash
LACA_ADMIN_PASSWORD="uma-senha-forte"
SITE_URL="https://seu-projeto.vercel.app"
MAX_UPLOAD_MB=80
```

Com `BLOB_READ_WRITE_TOKEN`, o sistema salva `data/content.json` e uploads no Vercel Blob. Sem essa variavel, ele continua usando arquivos locais para desenvolvimento.

Para publicar pela CLI:

```bash
npx vercel
npx vercel --prod
```
