# Guardiões do Rio V3 💧

Um **jogo de Química e Educação Ambiental para jogar em grupo**, por um link compartilhado, em celular ou computador.

## O que mudou

- **Salas centralizadas no servidor:** não usa mais PeerJS/WebRTC entre os celulares. A sala, a contagem de respostas e o placar ficam sincronizados por requisições HTTPS.
- **Quantidade configurável:** defina qualquer número de 2 a 10.000 ou selecione **Sem limite** (não há limite fixo de cinco pessoas). É possível alterar na sala de espera.
- **120 questões** sobre pH, ácidos e bases, poluição dos rios, chuva ácida, tratamento de água, eutrofização, equilíbrio químico, cálculos e química ambiental.
- **Quatro níveis escolhidos pelo anfitrião:** Fácil (12 introdutórias), Médio (6 introdutórias + 6 básicas), Difícil (4 básicas + 4 intermediárias + 4 avançadas, o padrão da versão anterior) e Hard (4 intermediárias + 4 avançadas + 4 hard). Cada partida continua com **12 perguntas** sorteadas. Na mesma sala, perguntas inéditas têm prioridade enquanto houver opções disponíveis no nível selecionado.
- Os participantes entram com **nome e link**, sem e-mail, senha ou registro.
- Cada questão possui **4 alternativas**, explicação científica e pontuação variável por dificuldade. A saúde do rio acompanha o desempenho da equipe.

## Atualizar seu jogo já publicado no Render (sem criar outro serviço)

1. Baixe o pacote **Atualizacao_Guardioes_do_Rio_V3.zip** e extraia no computador.
2. Abra o seu repositório `https://github.com/danielortega-m/guardioes-do-rio-v2` e clique em **Add file → Upload files**.
3. Arraste a **pasta inteira `Jogo_Guardioes_do_Rio_V2`**, que veio do ZIP, para a área de upload. **Não arraste os arquivos soltos na raiz**, pois seu Render usa a pasta como Root Directory.
4. Verifique que os caminhos que serão atualizados são `Jogo_Guardioes_do_Rio_V2/server.js`, `Jogo_Guardioes_do_Rio_V2/questions.js`, `Jogo_Guardioes_do_Rio_V2/public/client.js` e `Jogo_Guardioes_do_Rio_V2/public/index.html`.
5. Clique em **Commit changes**. No Render, a atualização deve ser publicada automaticamente se o Auto-Deploy estiver ligado. Se não aparecer novo deploy, clique em **Manual Deploy → Deploy latest commit** no serviço existente.
6. Quando o deploy indicar **Live**, abra seu link `.onrender.com` e atualize a página. A tela mostrará **V3**, banco de **120 perguntas** e o seletor **NÍVEL DO JOGO**.

**Importante:** como o serviço reinicia na atualização, salas abertas durante o deploy serão encerradas. Crie uma sala nova depois que a atualização estiver **Live**.

## Publicar e obter um link para compartilhar

**Atenção:** esta versão não funciona como jogo multiplayer se você simplesmente arrastar a pasta para o **Netlify Drop** ou publicar no **GitHub Pages**. Esses serviços servem arquivos estáticos, mas esta versão precisa também de um servidor para as salas. Você precisa fazer o deploy como **Web Service**, não como **Static Site**.

### Passo 1 — Criar um repositório no GitHub

1. Entre em [GitHub](https://github.com/new) e crie um repositório com o nome `guardioes-do-rio-v2`. Pode ser público.
2. Descompacte o ZIP recebido.
3. No repositório, use **Add file → Upload files** e envie o conteúdo da pasta do jogo, preservando a pasta `public` e seus dois arquivos `index.html` e `client.js`.
4. Confirme em **Commit changes**.
5. **Para o repositório existente `danielortega-m/guardioes-do-rio-v2`**, mantenha a estrutura já usada no Render: `Jogo_Guardioes_do_Rio_V2/server.js`, `Jogo_Guardioes_do_Rio_V2/package.json` e `Jogo_Guardioes_do_Rio_V2/public/`. O Root Directory do serviço deve continuar `Jogo_Guardioes_do_Rio_V2`.

### Passo 2 — Publicar no Render

1. Acesse [Render Dashboard](https://dashboard.render.com).
2. Selecione **New → Web Service** e conecte o repositório do GitHub criado no passo 1.
3. Configure:

   | Campo | Valor |
   |---|---|
   | Language / Runtime | `Node` |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | `Free`, quando disponível |
   | Root Directory | `Jogo_Guardioes_do_Rio_V2` no seu repositório atual |

4. Clique em **Deploy Web Service**.
5. Quando o status for **Live**, abra o endereço `https://<nome-gerado>.onrender.com` informado pelo Render.
6. Esse é o **link do jogo**. O anfitrião cria a sala nele, e envia para os colegas o link da sala gerado pelo botão **Copiar link**.

> O Render disponibiliza um plano gratuito de Web Service para testes, sujeito a limitações. O serviço pode entrar em repouso após 15 minutos sem tráfego e descartar salas após reinicialização. Na aula, crie a sala perto do horário de jogar e mantenha as páginas abertas. Se todos forem desconectados durante uma reinicialização, basta criar outra sala.

## Como jogar

**Anfitrião:** abrir o endereço do jogo → clicar em **Criar uma sala** → informar nome → escolher quantidade de jogadores, nível e tempo por pergunta → criar → copiar o link e enviar por WhatsApp. Pode alterar quantidade/tempo/**nível** na sala de espera e remover participantes desconectados. Inicia quando houver **pelo menos duas pessoas online**.

**Convidados:** abrir o link de convite → informar nome → **Entrar na sala**. Todos respondem em seus próprios aparelhos.

**Partida:** 12 questões; resultados são revelados quando todos respondem ou o tempo termina. O anfitrião avança cada rodada. Uma próxima partida sorteia novas perguntas. A equipe vence coletivamente ao alcançar 70% de saúde do rio.

## Teste local (opcional)

Instale [Node.js](https://nodejs.org) versão 20 ou superior. No terminal, dentro desta pasta:

```sh
npm start
```

Acesse `http://localhost:3000`. Para rodar testes automatizados:

```sh
npm test
```

O código usa apenas módulos nativos do Node: **sem instalação de pacotes de terceiros**. O banco pode ser editado em `questions.js`.

## Problemas comuns

- **Página abre, mas criar sala dá erro:** a publicação foi feita como site estático. Use **Web Service**, com `npm start`.
- **Sala não encontrada:** o serviço reiniciou, a sala foi encerrada ou o código está errado. Crie outra sala.
- **Conexão lenta ao abrir:** serviço gratuito pode estar saindo do repouso; atualize o navegador após ele ficar ativo.
- **Colega não entra:** confira se todos receberam o novo link `onrender.com`, não o antigo link Netlify, e se a sala está na fase de espera.
- **Teste do servidor:** abra `https://SEU-SITE.onrender.com/health`; a resposta deve incluir `"ok": true` e `"questions": 120`.
- **Sem limite:** o jogo não impõe um número predefinido de vagas, mas a capacidade real depende da hospedagem e da rede. A opção é pensada para turmas, não milhares de conexões simultâneas.

## Observações de privacidade

Não use nomes completos, e-mails, senhas ou informações pessoais nos campos de entrada. O código da sala é um convite, não uma autenticação forte. As salas usam armazenamento temporário do servidor; o jogo não é uma plataforma de contas de usuários.
