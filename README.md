# Octógono Sexta

Site do campeonato de MMA entre amigos: cadastro com aprovação, roleta, chaveamento justo e organização da comida.
Frontend em HTML/CSS/JS puro. Servidor em Node (Express). Banco: Postgres (ou arquivo local para testar).

## Rodar no seu computador

```bash
npm install
```

```bash
npm start
```

Abra http://localhost:3000. O arquivo `.env` (que fica fora do git) já tem `ADMIN_PASSWORD` e `WHATSAPP_NUMBER`. Sem `ADMIN_PASSWORD`, o servidor sorteia uma senha de admin e mostra no terminal. Depois de 8 senhas erradas seguidas, o login do admin trava por 5 minutos.
Variáveis (todas opcionais para testar localmente):

| Variável | Para que serve |
| --- | --- |
| `ADMIN_PASSWORD` | Senha do painel admin. Nunca vai para o frontend. |
| `WHATSAPP_NUMBER` | Número com DDI, só dígitos. Para onde vai o botão "Enviar para Alisson". Já vem com `5538998531018` por padrão; também dá para mudar no painel (Ajustes). |
| `DATABASE_URL` | Postgres. Sem ela, os dados ficam em `data/db.json` (some se o servidor reiniciar na nuvem). |
| `PORT` | Porta (a hospedagem define sozinha). |

Testes: `npm test` (lógica do torneio e filtro) e `node test/api.js` (API completa).

## Publicar de graça (você faz, eu não mexo na sua conta)

Confira sempre em qual conta você está logado antes de criar qualquer coisa. Os limites dos planos gratuitos mudam, então leia a tela de cada serviço.

### Opção A: Render (site) + Neon (banco), sem cartão

1. **Banco:** em neon.tech crie um projeto gratuito e copie a *connection string* (começa com `postgresql://`). Ela será o `DATABASE_URL`.
2. **Código no GitHub:** crie um repositório seu e suba esta pasta (o `.gitignore` já deixa `node_modules` e `data` de fora).
3. **Site:** em render.com, *New → Web Service*, escolha o repositório e use:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: Free
4. Em *Environment*, adicione `ADMIN_PASSWORD` (a senha do painel, a mesma do seu `.env`) e `DATABASE_URL`. O `.env` não sobe para o GitHub, então a senha precisa ser colocada aqui à mão. `WHATSAPP_NUMBER` é opcional, já vem com o seu.
5. Depois do deploy, abra o endereço `.onrender.com`, entre em **Admin** e confira em Ajustes se o WhatsApp está certo.

O plano grátis do Render "dorme" depois de uns 15 minutos sem acesso e a primeira visita demora cerca de um minuto para acordar. Abra o site uns minutos antes de avisar o pessoal na sexta.

### Opção B: rodar no seu PC e abrir para a internet (sem conta de hospedagem)

Com o PC ligado durante o evento: `npm start` e, em outro terminal, um túnel gratuito, por exemplo `cloudflared tunnel --url http://localhost:3000` (gera um link público temporário). Os dados ficam em `data/db.json` neste computador.

## Como o chaveamento funciona

- Cada lutador recebe um **nível de 0 a 100**: notas por arte marcial (55%), força de 1 a 15 (25%) e porte físico por peso e altura (20%). Só o admin dá notas e mede a força.
- **Todo mundo luta.** O app calcula quantas lutas cabem no tempo (padrão: 210 min, luta de 7,5 min = 3 rounds de 2,5 min, 2 min entre lutas).
- Rodadas de classificação suíças: cada confronto é o mais parelho possível (nível, peso e pontos), sem repetir adversário. Depois, com 6+ lutadores, os 4 primeiros vão para semifinais e final; com 4 ou 5, final entre os 2 primeiros.
- Número ímpar: em cada rodada um lutador descansa (nunca o mesmo duas vezes). Com tempo para uma rodada só, ele faz uma luta extra.
- **Roleta:** gira para escolher um lutador e depois o adversário, sempre entre opções justas calculadas pelo servidor.

## Cadastro e aprovação

- **O boneco 3D do perfil só quem define é o admin**: por padrão a arte em que o lutador tirou a maior nota, ou a que você escolher na hora de aprovar. O que o amigo marca, o apelido e o sobrenome não mudam o boneco. Antes da aprovação a ficha fica sem boneco.
- Usuário, primeiro nome e foto são obrigatórios. Sobrenome e apelido são opcionais. Senha pode ser qualquer uma.
- Filtro de zoeira (palavrões, termos nazistas etc.) em todos os campos de texto, no navegador e no servidor. Ele barra a palavra "pinto" até como sobrenome; se um amigo se chamar assim, o admin pode cadastrar por ele escrevendo com outra grafia.
- Código de 6 dígitos na tela do amigo + botão que abre o WhatsApp com usuário, código e senha. O admin vê o código no painel e confere.
- O painel mostra o aparelho de cada cadastro (iPhone aproximado pela tela, Android pelo modelo) e avisa se o mesmo navegador cadastrou mais de uma pessoa.
- A foto ser realmente do rosto é conferida por você na aprovação. O site não consegue garantir isso sozinho.
