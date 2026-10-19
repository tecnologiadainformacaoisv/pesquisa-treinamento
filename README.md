# Pesquisas de Treinamento ISV

Página única (HTML/CSS/JS, sem build) com duas pesquisas do Setor de Educação Permanente do Instituto São Vicente — **aprendizes** e **coordenadores** — e um painel protegido por senha. As respostas vão para uma planilha Google por meio de um Google Apps Script.

- **Site:** https://treinamento.institutosaovicente.com.br/ (GitHub Pages, branch `master`, raiz)
- **Links de resposta (distribuir separadamente):**
  - Aprendizes: `https://treinamento.institutosaovicente.com.br/#oxswvcqlha`
  - Coordenadores: `https://treinamento.institutosaovicente.com.br/#aivgq1hyzb`
  - Os códigos ficam em `LINKS` no `index.html`. A página inicial (sem código) não lista as pesquisas. Para trocar um código, altere `LINKS` e publique de novo: o link antigo deixa de funcionar.
- **Painel (equipe):** o link "Painel" no rodapé, ou `…/#painel`
- **Repositório:** `tecnologiadainformacaoisv/pesquisa-treinamento`

## Como funciona

```
Navegador (index.html) --POST--> Apps Script (appscript/codigo.js) --> Planilha Google
```

- `index.html` contém as perguntas (`SURVEYS`), o formulário e o painel.
- `appscript/codigo.js` recebe `enviar`, `listar` e `excluir`. **Listar e excluir exigem a senha do painel**; enviar é público (é a pesquisa).
- Cada pesquisa tem a sua própria planilha, com uma aba cada (**Aprendizes** e **Coordenadores**; ids em Propriedades do script, gravados por `configurarPlanilhas`): `ID | Timestamp | uma coluna por pergunta | r_json`. A coluna `r_json` fica oculta e **não deve ser editada nem apagada**: é a fonte de dados do painel.
- Não edite os cabeçalhos das colunas `ID`, `Timestamp` e `r_json`. Os textos das perguntas podem ser ajustados, mas as respostas novas só preenchem a coluna cujo cabeçalho for igual ao texto em `COLUNAS`.

## Segurança embutida

- O texto das respostas é gravado como texto simples (nada vira fórmula na planilha).
- O servidor só aceita as perguntas conhecidas, limita tamanhos e rejeita ids fora do padrão.
- 5 senhas erradas seguidas bloqueiam o painel por 15 minutos.
- A senha do painel fica **somente** nas Propriedades do script (`SENHA_PAINEL`), nunca no repositório.

## Instalação do zero (outro ambiente ou conta)

Pré-requisitos: Node.js, `npm i -g @google/clasp`, Apps Script API ativada em https://script.google.com/home/usersettings.

1. `clasp login` com a conta Google que será dona da planilha.
2. Na pasta do projeto: `clasp create --type sheets --title "Pesquisas de Treinamento ISV" --rootDir appscript` (cria planilha + script vinculado e gera o `.clasp.json`).
3. Garanta que `appscript/appsscript.json` tenha `"webapp": {"executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS"}`.
4. `clasp push --force`.
5. No editor do Apps Script: **Configurações do projeto > Propriedades do script** → crie `SENHA_PAINEL` com uma senha longa (16+ caracteres).
6. No editor, rode a função `doGet` uma vez e autorize (primeiro acesso).
7. `clasp create-deployment --description "v1"` e anote o **deploymentId** (começa com `AKfycb…`).
8. A URL do app é `https://script.google.com/macros/s/<deploymentId>/exec` → cole em `API_URL` no `index.html`.
9. Publique o site (GitHub Pages).

## Atualizar o backend sem trocar a URL

```
clasp push --force
clasp create-deployment --deploymentId <deploymentId> --description "o que mudou"
```

**Sempre informe o `--deploymentId`.** Sem ele, o Google cria uma implantação nova com URL diferente e o site continua apontando para a antiga.

## Alterar perguntas

1. Edite `SURVEYS` em `index.html`.
2. Atualize `COLUNAS` em `appscript/codigo.js` com os mesmos ids e textos (formato `["id", "N. texto da pergunta"]`; perguntas com "Outro" têm também `id_outro`).
3. `clasp push --force` + `create-deployment` (comando acima) e publique o site.

Se uma pergunta nova não estiver em `COLUNAS`, a resposta é descartada pelo servidor. Se `COLUNAS` mudar o texto de uma pergunta, as colunas antigas continuam na planilha, mas as respostas novas só preenchem colunas com o texto atual no cabeçalho; os dados completos de toda resposta ficam em `r_json`.

## Testar

- Abra o site, responda cada pesquisa e confira a linha na planilha.
- Abra o painel com a senha: as respostas devem aparecer e o botão de excluir deve funcionar.
- Respostas de teste devem ser apagadas pelo painel.

## Manutenção

- Se a formatação da planilha for desfeita, rode `formatarAbas` no editor do Apps Script.
- Erros do servidor aparecem em **Execuções** no editor do Apps Script.
- Endereço e domínio: o subdomínio é um CNAME para `tecnologiadainformacaoisv.github.io` (DNS na HostGator); o arquivo `CNAME` na raiz deve ser mantido.
