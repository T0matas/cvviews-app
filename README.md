# CVviews App

O Leo, assistente do CVviews, no estilo ChatGPT/Gemini, para mobile e desktop. É um PWA: pode ser instalado no telemóvel (Android/iOS) e no computador (Chrome/Edge → "Instalar app").

## Funcionalidades

- Histórico de conversas na barra lateral (pesquisar, mudar o nome, fixar, eliminar), guardado no dispositivo
- Modos **Recrutador** e **Candidato**, com sugestões e instruções próprias
- Respostas em streaming com Markdown (listas, tabelas, código), parar, copiar e gerar novamente
- Anexar currículos em PDF ou TXT (botão, arrastar e largar ou colar)
- Segue o tema do sistema: branco no modo claro, preto no modo escuro; layout com gaveta lateral e áreas seguras no mobile
- Pesquisa na web (Groq `browser_search`) e a data de hoje no prompt, para factos atuais
- Ditado por voz ao lado do botão de enviar (Whisper da Groq, `whisper-large-v3-turbo`)
- Contas com a Firebase do site (Google ou email), com a foto da conta; conversas separadas por conta
- Configurações: nome, modo por omissão, Enter envia, pesquisa na web, língua do ditado, exportar e eliminar conversas, conta
- Animação do Leo a escrever enquanto a resposta chega

## Executar

```bash
npm install
npm run dev
```

Abre em http://localhost:3100.

## IA (Groq)

A IA é a mesma do site oficial (`cvviews-ofcsite/lib/ai.js`): Groq com `openai/gpt-oss-120b`, a passar para `openai/gpt-oss-20b` quando o limite por minuto enche (ou xAI Grok sem chave Groq). A chave está em `.env.local`, que não vai para o git:

```
GROQ_API_KEY=gsk_...
GROQ_MODEL=openai/gpt-oss-120b
```

Sem chave, o app responde em modo demonstração. Os PDFs são lidos no servidor com `unpdf` e enviados como texto.

## Estrutura

- `components/chat-app.tsx` — interface completa (barra lateral, conversa, compositor)
- `lib/ai.ts` — fornecedor Groq/xAI, limites, regras de escrita (portado do site)
- `components/markdown.tsx` — renderização segura de Markdown
- `app/api/chat/route.ts` — rota de streaming para o Groq (ou demonstração)
- `app/api/transcribe/route.ts` — ditado por voz (Whisper da Groq)
- `lib/firebase.ts`, `components/auth-dialog.tsx` — contas (projeto Firebase `cvviews-26241`)
- `components/settings-dialog.tsx` — configurações
- `components/leo-writing.tsx` — animação do Leo a escrever
- `app/manifest.ts`, `public/sw.js` — instalação como app

Para a entrada com o Google funcionar num endereço publicado, adiciona esse domínio em Firebase → Authentication → Definições → Domínios autorizados (o `localhost` já lá está).
