# Aurora API

Backend para app mobile: Node.js 22 + TypeScript, Fastify, PostgreSQL, Drizzle ORM, JWT + refresh token rotativo.

## Rodar tudo com Docker (recomendado)
```bash
docker compose up --build        # Postgres + migrations + API
curl localhost:3333/health       # {"status":"ok"}
```
Sobe 3 serviços: `postgres`, `migrate` (aplica as migrations e termina) e `api` (porta 3333). Nada precisa ser
configurado para testar localmente; para login social e segredo próprio, crie um `.env` ao lado do compose
(veja `.env.example`: `JWT_ACCESS_SECRET`, `GOOGLE_CLIENT_IDS`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`).
- O padrão do compose usa um segredo JWT **só de desenvolvimento**; com `NODE_ENV=production` a API recusa iniciar com ele.
- A porta 3333 fica aberta na rede para o celular (mesmo Wi-Fi) acessar `http://IP-DO-PC:3333`; o Postgres só em `127.0.0.1`.
- Dados persistem no volume `pgdata`. Para zerar: `docker compose down -v`.
- Para o app em emulador Android, use `http://10.0.2.2:3333`.

## Como rodar sem Docker (desenvolvimento)
```bash
cp .env.example .env          # ajuste JWT_ACCESS_SECRET (>= 32 chars)
docker compose up -d          # Postgres 16 em 127.0.0.1:5432
npm install
npm run db:migrate            # aplica ./drizzle
npm run dev                   # http://localhost:3333
npm test                      # precisa do Postgres + migrations
```
Após alterar `src/infra/database/schema/*`: `npm run db:generate` e depois `npm run db:migrate`.

## Dados do usuário
`nome`, `e-mail`, `telefone` (normalizado, ex.: `(11) 99999-8888` -> `11999998888`) e `endereço`
(`street, number, complement?, neighborhood?, city, state, zipCode, country`, salvo em `jsonb`).
Telefone e endereço são opcionais no cadastro e no login social; `profileComplete` indica se faltam
(o app pode pedir e enviar via `PATCH /users/me`).

## Login com Google / Facebook
`POST /v1/auth/social` com `{ "provider": "google" | "facebook", "token": "..." }`.
- Google: o app envia o **ID token** (Google Sign-In). Validado localmente (RS256, JWKS do Google, `iss` e `aud`).
- Facebook: o app envia o **access token**; a API confere em `/debug_token` que foi emitido para o NOSSO app e busca `/me`.
- Fluxo: vínculo já existe -> **só loga**; e-mail igual a conta existente -> **vincula e loga**; senão **cria** a conta (201, `isNewUser: true`).
- Configure `GOOGLE_CLIENT_IDS` (Android/iOS/Web, separados por vírgula) e `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET`. Provedor não configurado responde 503.

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
| POST | /auth/social | Login com Google/Facebook: conta existente só loga; senão cria (201) |
| POST | /auth/refresh | Rotaciona refresh token |
| POST | /auth/logout | Revoga refresh token (idempotente) |
| GET | /users/me | Perfil (Bearer JWT) |
| PATCH | /users/me | Atualiza nome, telefone e endereço (`null` limpa) |
| POST | /trips | Cria viagem (sempre rascunho; campos podem faltar) |
| GET | /trips | Lista suas viagens (cursor, `status`, `archived`) |
| GET | /trips/:id | Detalhe com roteiro |
| PATCH | /trips/:id | Edita campos (`null` limpa) |
| POST | /trips/:id/status | Muda status (planejada, em_andamento, concluida, cancelada) |
| POST | /trips/:id/archive | Arquiva (não existe exclusão) |
| DELETE | /trips/:id/archive | Desarquiva |
| POST | /trips/:id/itinerary/generate | Gera o roteiro inicial (`{ "replace": true }` para refazer) |
| GET | /health | Liveness + checagem do banco |

Erros: `{ "error": { "code", "message", "details?" } }`.

## Viagens (`modules/trips`)
### Modelo e regras
Uma linha em `trips` por viagem (dono = `user_id`, toda consulta filtra por ele). Origem/destinos/lugares curtidos/roteiro ficam em `jsonb`
(a posição no array é a ordem escolhida). Valores de `climate`, `reach`, `companion`, `experiences` e `needs` são os mesmos do app.
- **Período** (3 modos): `indefinido`, `mes` (`month`,`year`) ou `definidas` (`startDate`, `endDate?` em `AAAA-MM-DD`). Nada antes de **hoje** (fuso de Brasília); a volta é depois da ida; com ida e volta, `days` vem do intervalo.
- **Sem limite** de duração. **Orçamento**: reais por pessoa, `>= 0`, `null` = sem limite definido. Máximo de **10 destinos**.
- Moeda única: BRL.
### Criar, listar, ver e editar
`POST /trips` cria sempre **rascunho** (pode estar incompleto, mas o que vier é validado). `PATCH` altera só o que foi enviado; `null` limpa.
Listagem paginada por cursor (`nextCursor`), do mais recente para o mais antigo, sem o roteiro.
### Status e arquivo
`rascunho -> planejada -> em_andamento -> concluida`, e `cancelada` a partir de rascunho/planejada/em andamento. Para virar **planejada** são obrigatórios:
origem, 1+ destino, companhia, período e duração (cuidados e orçamento são opcionais). `concluida`/`cancelada` não editam. Com datas exatas o status
avança sozinho (começou -> em andamento; passou -> concluída). **Arquivar** não exclui: só esconde da lista padrão.
### Roteiro: geração
`POST /trips/:id/itinerary/generate` monta os dias (chegada, lugares curtidos distribuídos, volta) com a mesma lógica do app, sem IA. Vários destinos
dividem os dias na ordem. Se já existe roteiro, exige `replace: true`.

## Análise crítica
### Segurança (aplicado)
- Senhas com **Argon2id** (parâmetros OWASP), com verify "falso" quando o e-mail não existe (reduz enumeração por timing); mensagem única "Credenciais inválidas".
- **JWT HS256** de vida curta (15 min) com algoritmo fixado, `iss`/`aud` validados; refresh token **opaco**, guardado só como SHA-256, **rotação a cada uso** e detecção de reuso (revoga todas as sessões), revogação atômica contra corrida.
- Zod com limites de tamanho (senha ≤128 evita DoS por hash), `bodyLimit` 100 KB, Helmet, CORS desligado por padrão, **rate limit** global e mais estrito em login/registro, logs com `Authorization` redigido, 500 sem vazar detalhes internos, queries parametrizadas pelo Drizzle (sem SQL injection), Docker como usuário não-root, Postgres exposto só em localhost, `npm audit` sem vulnerabilidades.

### Login social: decisões de segurança
- Tokens são sempre validados junto ao provedor, com `aud`/`app_id` conferido (impede aceitar token de outro app).
- Só vincula/cria conta com **e-mail verificado pelo provedor**.
- **Pre-hijacking**: o e-mail do cadastro por senha não é verificado; alguém poderia criar a conta com o e-mail da vítima antes dela. Quando a vítima entra com Google/Facebook e a conta já tinha senha, a **senha é anulada e as sessões são revogadas**. Efeito colateral: quem tinha senha e passa a usar o login social deixa de entrar por senha (precisaria de "definir senha", ainda não existe).
- Conta criada só por login social não aceita login por senha (mesma resposta/tempo de "credenciais inválidas").
- Primeiros logins simultâneos são tratados com retry sobre os índices únicos (testado com 8 requisições paralelas).
- Facebook: o e-mail só vem se o usuário concedeu a permissão `email`; sem ele o login é recusado (401).

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
