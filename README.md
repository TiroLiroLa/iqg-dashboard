# IQG Dashboard

Aplicação full-stack independente para avaliar a qualidade de metadados geoespaciais nos padrões Darwin Core, WCMP 2.0 e ISO 19115/MI_Metadata. O projeto implementa os 61 critérios da matriz acadêmica e inclui tudo o que é necessário para desenvolvimento e validação local.

A versão online está disponível em [https://iqg-dashboard.vercel.app/](https://iqg-dashboard.vercel.app/).

## Requisitos

- Node.js 22.12 ou superior
- pnpm 10 (recomendado via Corepack)

## Execução local

```bash
corepack enable
pnpm install
pnpm dev
```

O frontend será aberto em `http://localhost:5173` e encaminhará as chamadas `/api` ao Express em `http://localhost:3000`.

Para simular a implantação:

```bash
pnpm build
pnpm start
```

Nesse modo, frontend e API ficam disponíveis em `http://localhost:3000`.

## Publicação no Vercel

O projeto possui um ponto de entrada Express compatível com as funções Node.js do Vercel. O frontend é compilado pelo Vite e publicado como conteúdo estático, enquanto `/api/*` é encaminhado para uma única função Express na mesma origem.

```bash
corepack enable
npx vercel@latest link
npx vercel@latest deploy
npx vercel@latest promote <url-do-preview>
```

O fluxo recomendado valida primeiro a URL de preview e somente depois a promove para produção. A aplicação não exige variáveis de ambiente nem serviços persistentes. Os uploads continuam sendo processados exclusivamente em memória.

O arquivo `vercel.json` fixa a instalação pelo lockfile, o comando de build, o diretório estático e o encaminhamento da API. O Node.js usado no projeto é definido em `package.json`.

## Testes

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
```

As fixtures sintéticas usadas pelos testes ficam versionadas em `tests/fixtures/`. Um clone isolado do repositório é suficiente para instalar dependências, executar a aplicação e rodar toda a suíte de testes.

## Formatos aceitos

- Darwin Core: texto tabular TSV com extensão `.txt` ou `.tsv` e cabeçalhos reconhecidos.
- WCMP 2.0: GeoJSON `Feature` em `.json` ou `.geojson`, com declaração `conformsTo` da família WCMP 2.
- ISO 19115: XML com raiz `MD_Metadata` ou `MI_Metadata`, independentemente do prefixo de namespace.

O upload aceita até 20 MB por arquivo. Os arquivos são analisados somente em memória e não são armazenados pelo servidor. O histórico local guarda apenas resultados, nomes, tamanhos, limiar e datas — nunca o conteúdo original.

## Regras de avaliação

O limiar de cobertura Darwin Core pode variar de 51% a 100% e começa em 80%. As dimensões recebem pesos de 20%, 20%, 15%, 15%, 10%, 10%, 5% e 5%; o IQG completo usa Darwin Core 20%, WCMP 40% e ISO 19115 40%.

- IQG maior ou igual a 85: **Confiável**
- IQG entre 70 e 84,99: **Aceitável**
- IQG abaixo de 70: **Perigoso**

O IQG só é publicado quando a sessão contém um resultado válido de cada padrão. O diagnóstico opcional de links e a disponibilidade dos tiles do mapa nunca alteram a nota.

## Estrutura

- `src/shared`: contratos, critérios versionados, pesos e fórmulas.
- `src/server`: API Express, parsers, validadores, diagnóstico de links e relatório PDF.
- `src/client`: estado da sessão, interface, gráficos, mapa, histórico e downloads.
- `tests`: testes unitários, de API e integração com amostras reais.
- `e2e`: fluxos de interface com Playwright.
