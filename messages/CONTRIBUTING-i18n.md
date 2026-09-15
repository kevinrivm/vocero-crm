# Internacionalização (i18n) — Vocero CRM

Contribuição de tradução para **Português (Brasil)** e **Inglês**.

## Arquivos adicionados

| Arquivo | Idioma |
|---|---|
| `messages/es.json` | Espanhol (original) |
| `messages/pt-BR.json` | Português (Brasil) |
| `messages/en.json` | Inglês |

## Como implementar no projeto

O projeto ainda não tem um sistema i18n configurado. As strings estão hardcoded nos componentes. Sugerimos o uso de **`next-intl`**, compatível com Next.js 15 App Router.

### 1. Instalar next-intl

```bash
pnpm add next-intl
```

### 2. Configurar next.config.ts

```ts
import createNextIntlPlugin from 'next-intl/plugin';
const withNextIntl = createNextIntlPlugin();
export default withNextIntl({});
```

### 3. Criar i18n/routing.ts

```ts
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['es', 'pt-BR', 'en'],
  defaultLocale: 'es'
});
```

### 4. Criar i18n/request.ts

```ts
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = (await requestLocale) ?? routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default
  };
});
```

### 5. Mover os arquivos messages/ para a raiz do projeto

```
vocero-crm/
  messages/
    es.json
    pt-BR.json
    en.json
```

### 6. Usar as traduções nos componentes

```tsx
// Antes (hardcoded)
<CardTitle>Iniciar sesión</CardTitle>

// Depois (com next-intl)
import { useTranslations } from 'next-intl';

const t = useTranslations('auth.login');
<CardTitle>{t('title')}</CardTitle>
```

## Estrutura das chaves

```
auth.login.*        — Página de login
auth.register.*     — Página de cadastro
nav.*               — Navegação lateral
inbox.*             — Caixa de entrada
contacts.*          — Contatos
pipeline.*          — Pipeline
agent.*             — Agente de IA
lab.*               — Laboratório
settings.*          — Configurações
common.*            — Strings comuns reutilizáveis
```

## Contribuidores

- **Terceiro Régis** — terceiro@sagga.tec.br — Tradução pt-BR e en
