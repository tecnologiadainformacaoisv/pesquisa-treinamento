/**
 * Backend das Pesquisas de Treinamento ISV (Google Apps Script).
 *
 * Contrato com index.html (POST, corpo JSON em text/plain):
 *   {acao:"enviar", id, s, r}        -> grava uma resposta (idempotente por id)
 *   {acao:"listar", senha}           -> {ok:true, respostas:[{id,s,ts,r}]}
 *   {acao:"excluir", senha, s, id}   -> remove uma resposta
 * Resposta sempre {ok:true,...} ou {ok:false, erro:"..."}; erro "senha" = senha incorreta.
 *
 * Planilha: uma aba por pesquisa (est, coord). Colunas: id | ts | <perguntas, legíveis> | r_json.
 * O painel lê apenas r_json (fonte da verdade); as demais colunas são para consulta humana.
 *
 * Configuração: Configurações do projeto > Propriedades do script > SENHA_PAINEL = <senha>.
 */
var ABAS = {est: "Aprendizes", coord: "Coordenadores"};
var FIXAS = ["id", "ts"];

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

function aba_(chave, colunasPerguntas) {
  var nome = ABAS[chave];
  if (!nome) throw new Error("pesquisa");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
  if (sh.getLastRow() === 0) {
    sh.appendRow(FIXAS.concat(colunasPerguntas || [], ["r_json"]));
    sh.setFrozenRows(1);
  }
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
  var sh = aba_(b.s, Object.keys(b.r));
  var cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var colJson = cab.indexOf("r_json");

  var ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
  for (var i = 0; i < ids.length; i++) if (ids[i][0] === b.id) return {ok: true, duplicada: true};

  // perguntas novas viram colunas novas, inseridas antes de r_json
  Object.keys(b.r).forEach(function (k) {
    if (cab.indexOf(k) === -1) {
      sh.insertColumnBefore(colJson + 1);
      sh.getRange(1, colJson + 1).setValue(k);
      cab.splice(colJson, 0, k);
      colJson++;
    }
  });

  var linha = cab.map(function (c) {
    if (c === "id") return b.id;
    if (c === "ts") return new Date().toISOString();
    if (c === "r_json") return JSON.stringify(b.r);
    return texto_(b.r[c]);
  });
  sh.appendRow(linha);
  return {ok: true};
}

function listar_(b) {
  if (!senhaOk_(b.senha)) return {ok: false, erro: "senha"};
  var out = [];
  Object.keys(ABAS).forEach(function (chave) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABAS[chave]);
    if (!sh || sh.getLastRow() < 2) return;
    var cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var cId = cab.indexOf("id"), cTs = cab.indexOf("ts"), cJ = cab.indexOf("r_json");
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().forEach(function (l) {
      try { out.push({id: l[cId], s: chave, ts: l[cTs], r: JSON.parse(l[cJ])}); } catch (x) {}
    });
  });
  return {ok: true, respostas: out};
}

function excluir_(b) {
  if (!senhaOk_(b.senha)) return {ok: false, erro: "senha"};
  if (!ABAS[b.s] || !b.id) return {ok: false, erro: "dados"};
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABAS[b.s]);
  if (!sh || sh.getLastRow() < 2) return {ok: true};
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === b.id) { sh.deleteRow(i + 2); return {ok: true}; }
  }
  return {ok: true};
}
