/**
 * Backend das Pesquisas de Treinamento ISV (Google Apps Script).
 *
 * Contrato com index.html (POST, corpo JSON em text/plain):
 *   {acao:"enviar", id, s, r}        -> grava uma resposta (idempotente por id)
 *   {acao:"listar", senha}           -> {ok:true, respostas:[{id,s,ts,r}]}
 *   {acao:"excluir", senha, s, id}   -> remove uma resposta
 * Resposta sempre {ok:true,...} ou {ok:false, erro:"..."}; erro "senha" = senha incorreta.
 *
 * Planilha: uma aba por pesquisa (est, coord). Colunas: ID | Timestamp | <uma por pergunta> | r_json.
 * r_json (oculta) guarda a resposta completa e é a fonte do painel; as demais colunas são para consulta humana.
 * COLUNAS espelha as perguntas de SURVEYS em index.html: ao mudar perguntas lá, atualizar aqui.
 *
 * Configuração: Configurações do projeto > Propriedades do script > SENHA_PAINEL = <senha>.
 */
var ABAS = {est: "Aprendizes", coord: "Coordenadores"};
var FIXAS = ["ID", "Timestamp"];
// Padrão visual das planilhas de resposta do projeto pesquisa-satisfacao.
var COR_CABECALHO = "#0a3d62";
var COLUNAS = {
  "est": [ [ "nome", "Nome" ],
   [ "setor", "Setor onde atua no escritório" ],
   [ "q1", "1. Você está cursando ensino superior atualmente?" ],
   [ "q2", "2. Qual curso e instituição de ensino?" ],
   [ "q3", "3. Qual período/semestre você está cursando?" ],
   [ "q4", "4. Qual o turno da faculdade?" ],
   [ "q5", "5. Qual o turno em que você trabalha no escritório?" ],
   [ "q6", "6. Há quanto tempo você está no ISV como aprendiz?" ],
   [ "q7", "7. Quais atividades você realiza no dia a dia? (breve descrição)" ],
   [ "q8", "8. Em quais temas ou habilidades você sente mais dificuldade no seu dia a dia de trabalho?" ],
   [ "q8_outro", "8. Em quais temas ou habilidades você sente mais dificuldade no seu dia a dia de trabalho? — Outro (especifique)" ],
   [ "q9", "9. Você já participou de algum treinamento oferecido pela instituição? Qual e como avalia?" ],
   [ "q10", "10. Que tipo de treinamento você acredita que ajudaria a melhorar seu desempenho no trabalho?" ],
   [ "q11", "11. Você se sente à vontade para tirar dúvidas com seu coordenador/supervisor no dia a dia?" ],
   [ "q12", "12. Você pretende crescer profissionalmente dentro do ISV?" ],
   [ "q13", "13. Sugestões ou observações" ] ],
   "coord": [ [ "nome", "Nome do(a) coordenador(a)" ],
   [ "setor", "Setor/área" ],
   [ "efetivos", "Nº de colaboradores efetivos sob sua coordenação" ],
   [ "aprendizes", "Nº de jovens aprendizes e assistentes sob sua coordenação" ],
   [ "q1", "1. Em uma escala de 1 a 5, como você avalia o nível técnico da sua equipe nas atividades do dia a dia?" ],
   [ "q2", "2. Quais são as principais dificuldades técnicas observadas na equipe atualmente?" ],
   [ "q3", "3. Quais competências comportamentais (soft skills) você identifica como pontos de melhoria?" ],
   [ "q3_outro", "3. Quais competências comportamentais (soft skills) você identifica como pontos de melhoria? — Outro (especifique)" ],
   [ "q4", "4. Quais competências comportamentais (soft skills) você identifica como pontos fortes dos seus liderados?" ],
   [ "q4_outro", "4. Quais competências comportamentais (soft skills) você identifica como pontos fortes dos seus liderados? — Outro (especifique)" ],
   [ "q5", "5. Houve alguma situação recente que evidenciou a necessidade de capacitação? Se sim, descreva brevemente." ],
   [ "neuro", "6. Há, na sua equipe, jovem aprendiz ou colaborador com diagnóstico de TEA, TDAH ou outra condição relacionada?" ],
   [ "q6", "7. Como você avalia, de forma geral, a postura profissional dos jovens aprendizes sob sua coordenação?" ],
   [ "q7", "8. Quais comportamentos você gostaria de reforçar por meio de treinamento?" ],
   [ "q7_outro", "8. Quais comportamentos você gostaria de reforçar por meio de treinamento? — Outro (especifique)" ],
   [ "q8", "9. Já presenciou ou recebeu alguma situação relacionada à conduta/profissionalismo de aprendizes que gostaria de relatar?" ],
   [ "q9", "10. Na sua percepção, os aprendizes recebem orientação suficiente sobre normas e cultura da instituição no momento da admissão?" ],
   [ "q10", "11. Quais temas você considera prioritários para a equipe nos próximos 6 meses?" ],
   [ "q10_outro", "11. Quais temas você considera prioritários para a equipe nos próximos 6 meses? — Outro (especifique)" ],
   [ "q11", "12. Há necessidade de capacitação técnica? (ferramentas e sistemas do setor)" ],
   [ "q11_outro", "12. Há necessidade de capacitação técnica? (ferramentas e sistemas do setor) — Outro (especifique)" ],
   [ "q12", "13. Qual formato de treinamento você considera mais eficaz para sua equipe?" ],
   [ "q13", "14. Sugestão de tema, profissional ou instituição para ministrar o treinamento" ],
   [ "q14", "15. Comentários adicionais" ] ] };

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var b = JSON.parse(e.postData.contents);
    if (b.acao === "enviar") return json_(enviar_(b));
    if (b.acao === "listar") return json_(listar_(b));
    if (b.acao === "excluir") return json_(excluir_(b));
    return json_({ok: false, erro: "acao"});
  } catch (err) {
    return json_({ok: false, erro: "falha"});
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function doGet() {
  return json_({ok: true, servico: "pesquisa-treinamento"});
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function senhaOk_(s) {
  var real = PropertiesService.getScriptProperties().getProperty("SENHA_PAINEL");
  return !!real && s === real;
}

function cabecalho_(chave) {
  return FIXAS.concat(COLUNAS[chave].map(function (c) { return c[1]; }), ["r_json"]);
}

function estilo_(sh) {
  var n = sh.getLastColumn();
  var cab = sh.getRange(1, 1, 1, n);
  cab.setFontWeight("bold").setBackground(COR_CABECALHO).setFontColor("#ffffff").setWrap(true).setVerticalAlignment("middle");
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 160);
  sh.setColumnWidth(2, 200);
  if (n > 3) sh.setColumnWidths(3, n - 3, 240);
  // r_json é a fonte do painel; oculta para a planilha ficar legível
  var j = cab.getValues()[0].indexOf("r_json");
  if (j > -1 && !sh.isColumnHiddenByUser(j + 1)) sh.hideColumns(j + 1);
}

/**
 * Devolve a aba da pesquisa com o layout atual. Se existir uma aba com layout
 * antigo (cabeçalho diferente), ela é preservada renomeada e uma nova é criada.
 */
function aba_(chave) {
  var nome = ABAS[chave];
  if (!nome) throw new Error("pesquisa");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var esperado = cabecalho_(chave);
  var sh = ss.getSheetByName(nome);
  if (sh && sh.getLastRow() > 0) {
    var atual = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 3)).getValues()[0];
    if (atual[2] !== esperado[2]) {
      sh.setName(nome + " (layout antigo " + Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd-MM HH:mm") + ")");
      sh = null;
    }
  }
  if (!sh) sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, esperado.length).setValues([esperado]);
  }
  estilo_(sh);
  return sh;
}

function texto_(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(texto_).join("; ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function enviar_(b) {
  if (!b.id || !ABAS[b.s] || !b.r || typeof b.r !== "object") return {ok: false, erro: "dados"};
  var sh = aba_(b.s);
  var cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  var ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
  for (var i = 0; i < ids.length; i++) if (ids[i][0] === b.id) return {ok: true, duplicada: true};

  // chaves fora do esperado viram colunas extras (antes de r_json), para nada se perder
  var rotulo = {};
  COLUNAS[b.s].forEach(function (c) { rotulo[c[0]] = c[1]; });
  var colJson = cab.indexOf("r_json");
  Object.keys(b.r).forEach(function (k) {
    var nome = rotulo[k] || k;
    if (cab.indexOf(nome) === -1) {
      sh.insertColumnBefore(colJson + 1);
      sh.getRange(1, colJson + 1).setValue(nome);
      cab.splice(colJson, 0, nome);
      colJson++;
    }
  });

  var porRotulo = {};
  Object.keys(b.r).forEach(function (k) { porRotulo[rotulo[k] || k] = b.r[k]; });
  var linha = cab.map(function (c) {
    if (c === "ID") return b.id;
    if (c === "Timestamp") return new Date().toISOString();
    if (c === "r_json") return JSON.stringify(b.r);
    return texto_(porRotulo[c]);
  });
  sh.appendRow(linha);
  sh.getRange(sh.getLastRow(), 1, 1, linha.length).setVerticalAlignment("top").setWrap(true);
  return {ok: true};
}

function listar_(b) {
  if (!senhaOk_(b.senha)) return {ok: false, erro: "senha"};
  var out = [];
  Object.keys(ABAS).forEach(function (chave) {
    var sh = aba_(chave);
    if (sh.getLastRow() < 2) return;
    var cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var cId = cab.indexOf("ID"), cTs = cab.indexOf("Timestamp"), cJ = cab.indexOf("r_json");
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().forEach(function (l) {
      try { out.push({id: l[cId], s: chave, ts: l[cTs], r: JSON.parse(l[cJ])}); } catch (x) {}
    });
  });
  return {ok: true, respostas: out};
}

function excluir_(b) {
  if (!senhaOk_(b.senha)) return {ok: false, erro: "senha"};
  if (!ABAS[b.s] || !b.id) return {ok: false, erro: "dados"};
  var sh = aba_(b.s);
  if (sh.getLastRow() < 2) return {ok: true};
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === b.id) { sh.deleteRow(i + 2); return {ok: true}; }
  }
  return {ok: true};
}
