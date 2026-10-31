# Aurora API

Backend para app mobile: Node.js 22 + TypeScript, Fastify, PostgreSQL, Drizzle ORM, JWT + refresh token rotativo.

## Como rodar
```bash
cp .env.example .env          # ajuste JWT_ACCESS_SECRET (>= 32 chars)
docker compose up -d          # Postgres 16 em 127.0.0.1:5432
npm install
npm run db:migrate            # aplica ./drizzle
npm run dev                   # http://localhost:3333
npm test                      # precisa do Postgres + migrations
```
Após alterar `src/infra/database/schema/*`: `npm run db:generate` e depois `npm run db:migrate`.

## Arquitetura (SOLID)
```
src/
  config/env.ts                 # env validado com zod (fail-fast)
  infra/database/               # client (pool pg), schema Drizzle, migrate
  shared/                       # container (DI), errors, error-handler, authenticate
  modules/users/
    domain/                     # entidades + INTERFACES de repositório (sem dependências externas)
    application/                # use cases + ports (hasher, tokens) -> regras de negócio
    infra/                      # implementações: Drizzle, Argon2, jose, crypto
    http/                       # controllers magros, rotas, schemas zod
```
- **S**: cada use case faz uma coisa; controllers só traduzem HTTP.
- **O**: novos módulos entram como nova pasta em `modules/` sem alterar os existentes.
- **L/I**: interfaces pequenas (`UserRepository`, `PasswordHasher`...), implementações intercambiáveis.
- **D**: use cases dependem de interfaces; `shared/container.ts` é o único lugar que instancia classes concretas.

## Endpoints (`/v1`)
| Método | Rota | Descrição |
|---|---|---|
| POST | /auth/register | Cria usuário, retorna user + tokens |
| POST | /auth/login | Autentica |
| POST | /auth/refresh | Rotaciona refresh token |
| POST | /auth/logout | Revoga refresh token (idempotente) |
| GET | /users/me | Perfil (Bearer JWT) |
| GET | /health | Liveness + checagem do banco |

Erros: `{ "error": { "code", "message", "details?" } }`.

## Análise crítica
### Segurança (aplicado)
- Senhas com **Argon2id** (parâmetros OWASP), com verify "falso" quando o e-mail não existe (reduz enumeração por timing); mensagem única "Credenciais inválidas".
- **JWT HS256** de vida curta (15 min) com algoritmo fixado, `iss`/`aud` validados; refresh token **opaco**, guardado só como SHA-256, **rotação a cada uso** e detecção de reuso (revoga todas as sessões), revogação atômica contra corrida.
- Zod com limites de tamanho (senha ≤128 evita DoS por hash), `bodyLimit` 100 KB, Helmet, CORS desligado por padrão, **rate limit** global e mais estrito em login/registro, logs com `Authorization` redigido, 500 sem vazar detalhes internos, queries parametrizadas pelo Drizzle (sem SQL injection), Docker como usuário não-root, Postgres exposto só em localhost, `npm audit` sem vulnerabilidades.

### Riscos e limitações conhecidas (recomendado antes de produção)
1. **Rate limit em memória**: com várias instâncias cada uma conta separado. Use Redis (`@fastify/rate-limit` suporta `redis`). Atrás de proxy, configure `TRUST_PROXY=true`, senão o IP é o do proxy.
2. **Sem bloqueio por conta** após N falhas (apenas rate limit por IP). Considere lockout progressivo/captcha.
3. **Access token não é revogável** antes de expirar (15 min). Aceitável; para logout imediato, use denylist ou `token_version`.
4. **HS256 com segredo compartilhado**: se outros serviços precisarem validar tokens, migre para RS256/EdDSA (basta trocar `JoseAccessTokenService`). Guarde o segredo em secret manager, não em `.env`.
5. **Sem verificação de e-mail, reset de senha, nem MFA** — fora do escopo do exemplo.
6. `register` revela se o e-mail existe (409). É um trade-off comum de UX; para eliminar, responda sempre 202 e confirme por e-mail.
7. **Tabela `refresh_tokens` cresce**: criar job periódico para apagar expirados/revogados.
8. Banco em produção deve usar TLS (`?sslmode=require`) e usuário com privilégios mínimos; rodar migrations com credencial separada.
9. Sem testes unitários dos use cases com repositórios em memória (a arquitetura permite) e sem CI ainda.

### Performance
- Pool `pg` configurável (`DB_POOL_MAX`), `statement_timeout` de 10 s, timeouts de conexão; Fastify é rápido e usa serialização eficiente.
- Argon2 nativo (Rust) roda em threadpool, não bloqueia o event loop; porém é **intencionalmente caro** (~dezenas de ms e 19 MiB por hash): login/registro são o gargalo de CPU/memória, por isso o rate limit estrito. Dimensione a memória do container considerando concorrência de logins.
- Índices: `users.email` único (login O(log n)), `refresh_tokens.token_hash` único, `user_id` para revogação em massa. Consultas usam `limit(1)`; DTOs explícitos evitam trafegar colunas desnecessárias.
- Refresh/login fazem 2–3 queries sem transação; é seguro porque a revogação é um `UPDATE ... WHERE revoked_at IS NULL` atômico. Se precisar de consistência estrita (ex.: revogar + emitir em uma transação), injete um unit-of-work.
