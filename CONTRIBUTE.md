# Guia de Contribuicao

Obrigado por contribuir com o Flux Action! Este guia explica como preparar o ambiente, enviar PRs e seguir o padrao do projeto.

## Requisitos

- Node.js 20+
- Docker (opcional, recomendado)

## Fluxo de trabalho

1. Crie uma branch a partir da `main`.
2. Siga o fluxo **TDD (Test-Driven Development)**: escreva o teste antes da implementação.
3. Faça alterações pequenas e focadas.
4. Garanta que todos os testes (`npm run test` no backend) e lint passem.
5. Abra um Pull Request com descrição clara.

## Rodando o projeto

Com Docker:

```bash
docker compose up --build
```

Sem Docker:

```bash
cd frontend
npm install
npm run dev
```

```bash
cd backend
npm install
npm run test  # rode os testes antes de desenvolver
BACKEND_ENCRYPTION_KEY=<sua-chave> npm run dev
```

## Padrao de codigo

- TypeScript estrito (sem `any` implicito)
- Strings com aspas simples
- Sem ponto e virgula
- Imports por grupos (libs, componentes, utils, estilos)

## Testes e qualidade

O projeto utiliza **Vitest** e **Supertest**. É obrigatório que:

- Funções utilitárias tenham testes unitários.
- Novos endpoints da API tenham testes de integração em `index.test.js`.
- Todos os testes passem antes de abrir um PR.

Consulte o arquivo `AGENTS.md` para diretrizes detalhadas de TDD.

## Segurança

- Nunca inclua chaves ou credenciais nos commits
- Use `BACKEND_ENCRYPTION_KEY` por variavel de ambiente

## Pull Requests

Inclua:

- O que mudou e por que mudou
- Passos para testar
- Prints de UI quando aplicavel
