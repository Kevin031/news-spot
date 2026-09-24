import { openapiDocument } from "./openapi.js";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

function schemaFields(modelOrName, parent = "", depth = 0) {
  if (depth > 4) return "";
  const model = typeof modelOrName === "string" ? openapiDocument.components.schemas[modelOrName] : modelOrName;
  if (!model?.properties) return "";
  return Object.entries(model.properties).map(([key, property]) => {
    const nestedName = property.$ref?.split("/").at(-1) ?? property.items?.$ref?.split("/").at(-1);
    const type = property.type === "array" ? `array${nestedName ? ` · ${nestedName}` : ""}` : nestedName ?? property.type ?? "object";
    const path = parent ? `${parent}.${key}` : key;
    const required = model.required?.includes(key) ? "必填" : "可选";
    const row = `<tr><td><code>${escapeHtml(path)}</code></td><td>${escapeHtml(type)}${property.nullable ? " · null" : ""}</td><td>${required}</td></tr>`;
    const nested = nestedName ?? (property.type === "array" ? property.items : property);
    return row + (nested?.properties || nestedName ? schemaFields(nested, path, depth + 1) : "");
  }).join("");
}

function operationHtml(path, operation) {
  const parameters = operation.parameters ?? [];
  const fields = parameters.map((parameter) => {
    const { name, description, required, schema } = parameter;
    const kind = schema.enum ? schema.enum.join(" / ") : schema.type;
    const constraints = [schema.minimum != null && `最小 ${schema.minimum}`, schema.maximum != null && `最大 ${schema.maximum}`].filter(Boolean).join("，");
    const initial = parameter.example ?? schema.default ?? "";
    return `<label class="field"><span class="field-head"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(kind)}${required ? " · 必填" : ""}${constraints ? ` · ${escapeHtml(constraints)}` : ""}</small></span><span class="field-description">${escapeHtml(description)}</span><input name="${escapeHtml(name)}" data-in="${escapeHtml(parameter.in)}" ${required ? "required" : ""} value="${escapeHtml(initial)}" autocomplete="off"></label>`;
  }).join("");
  const responses = Object.entries(operation.responses).map(([status, detail]) => {
    const schema = detail.content?.["application/json"]?.schema;
    const name = schema?.$ref?.split("/").at(-1);
    return `<div class="response-row"><span class="status">${escapeHtml(status)}</span><span>${escapeHtml(detail.description)}</span>${name ? `<code>${escapeHtml(name)}</code>` : ""}</div>`;
  }).join("");
  const successName = operation.responses[200]?.content?.["application/json"]?.schema?.$ref?.split("/").at(-1);
  const fieldsTable = successName ? `<div class="schema-scroll"><table><thead><tr><th>字段</th><th>类型</th><th>约束</th></tr></thead><tbody>${schemaFields(successName)}</tbody></table></div>` : "";
  return `<article class="endpoint" id="${escapeHtml(operation.operationId ?? path.replace(/[^a-z0-9]+/gi, "-"))}">
    <div class="endpoint-head"><span class="method">GET</span><code>${escapeHtml(path)}</code><span class="endpoint-title">${escapeHtml(operation.summary)}</span></div>
    <p class="description">${escapeHtml(operation.description ?? "")}</p>
    <form data-path="${escapeHtml(path)}">
      ${fields ? `<div class="fields">${fields}</div>` : ""}
      <div class="actions"><button type="submit">发送请求</button><span class="request-url"></span></div>
      <div class="result" hidden><div class="result-head"><span class="result-status"></span><span class="result-time"></span></div><pre></pre></div>
    </form>
    <details class="response-details"><summary>响应结构</summary><div class="response-list">${responses}</div>${fieldsTable}<p>完整字段定义见 <a href="/api/openapi.json">OpenAPI JSON</a> 中的 components.schemas。</p></details>
  </article>`;
}

const sections = openapiDocument.tags.map((tag) => {
  const operations = Object.entries(openapiDocument.paths).flatMap(([path, methods]) => Object.values(methods)
    .filter((operation) => operation.tags?.includes(tag.name)).map((operation) => operationHtml(path, operation))).join("");
  return `<section id="${escapeHtml(tag.name)}"><div class="section-heading"><h2>${escapeHtml(tag.name)}</h2><span>${escapeHtml(tag.description)}</span></div>${operations}</section>`;
}).join("");

export const apiDocsHtml = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>接口文档 · 热点聚合</title>
<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif;color:#202124;background:#f7f7f5;font-synthesis:none}*{box-sizing:border-box}body{margin:0}a{color:#1769aa;text-decoration:none}a:hover{text-decoration:underline}button,input{font:inherit}main{max-width:1120px;margin:0 auto;padding:36px 28px 72px}.topline{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:28px}.topline a{font-size:13px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.1em;color:#777;text-transform:uppercase}h1{font-size:30px;letter-spacing:-.045em;margin:8px 0 7px}header p{margin:0;color:#666;font-size:14px;line-height:1.6}.links{display:flex;gap:18px;flex-wrap:wrap;margin-top:16px;font-size:13px}nav{display:flex;gap:8px;flex-wrap:wrap;margin:32px 0 24px}nav a{padding:8px 12px;border:1px solid #e6e6e3;border-radius:9px;background:#fff;color:#444;font-size:13px}.section-heading{display:flex;align-items:baseline;gap:14px;margin:30px 0 13px}.section-heading h2{margin:0;font-size:18px;letter-spacing:-.03em}.section-heading span{font-size:13px;color:#777}.endpoint{padding:19px 22px;background:#fff;border:1px solid #e8e8e5;border-radius:13px;margin:9px 0}.endpoint-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.method{font-size:11px;font-weight:750;letter-spacing:.04em;color:#14765a;background:#eaf7f0;padding:5px 7px;border-radius:5px}.endpoint-head code{font-size:14px;color:#262626;overflow-wrap:anywhere}.endpoint-title{font-size:13px;color:#777;margin-left:auto}.description{font-size:13px;color:#686868;margin:10px 0 0;line-height:1.55}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:18px}.field{display:flex;flex-direction:column;gap:5px;min-width:0}.field-head{display:flex;align-items:baseline;gap:8px}.field-head strong{font-size:12px}.field-head small,.field-description{font-size:11px;color:#777}.field input{width:100%;height:35px;border:1px solid #dededb;border-radius:7px;padding:0 10px;background:#fff;color:#222;outline:none}.field input:focus{border-color:#5b8bb7;box-shadow:0 0 0 3px #e7f0fa}.actions{display:flex;align-items:center;gap:12px;margin-top:15px;min-height:34px}.actions button{border:0;border-radius:7px;background:#202124;color:#fff;font-size:12px;font-weight:600;padding:9px 13px;cursor:pointer}.actions button:hover{background:#444}.actions button:disabled{opacity:.55;cursor:wait}.request-url{font:11px ui-monospace,SFMono-Regular,monospace;color:#777;overflow-wrap:anywhere}.result{margin-top:15px;border:1px solid #e6e6e3;border-radius:8px;overflow:hidden}.result-head{display:flex;gap:10px;padding:8px 11px;background:#f8f8f6;border-bottom:1px solid #e6e6e3;font-size:11px;color:#666}.result-status{font-weight:700;color:#176e51}pre{margin:0;padding:13px;font:11px/1.55 ui-monospace,SFMono-Regular,monospace;overflow:auto;max-height:340px;white-space:pre-wrap;overflow-wrap:anywhere}.response-details{margin-top:17px;border-top:1px solid #efefec;padding-top:12px}.response-details summary{font-size:12px;color:#666;cursor:pointer}.response-list{margin-top:10px}.response-row{display:flex;align-items:center;gap:12px;padding:7px 0;font-size:12px;border-bottom:1px solid #f1f1ee}.response-row .status{font-weight:700;min-width:28px}.response-row code{margin-left:auto;color:#777}.response-details p{font-size:11px;color:#777}@media(max-width:640px){main{padding:24px 15px 48px}.topline{margin-bottom:24px}h1{font-size:26px}.fields{grid-template-columns:1fr}.endpoint{padding:17px 15px}.endpoint-title{margin-left:0;width:100%}.section-heading{display:block}.section-heading span{display:block;margin-top:4px}}
.schema-scroll{overflow:auto;margin-top:13px}table{width:100%;border-collapse:collapse;text-align:left;font-size:11px}th,td{padding:7px 9px;border-bottom:1px solid #efefec;white-space:nowrap}th{color:#777;font-weight:600}td code{font:11px ui-monospace,SFMono-Regular,monospace}.schema-scroll td:first-child{min-width:220px}
@media(prefers-color-scheme:dark){:root{color:#eee;background:#161718}header p,.description,.field-head small,.field-description,.section-heading span,.endpoint-title,.request-url,.response-details summary,.response-details p{color:#aaa}nav a,.endpoint{background:#232426;border-color:#393a3c;color:#eee}.endpoint-head code{color:#eee}.field input{background:#1b1c1d;border-color:#4a4b4d;color:#eee}.response-details,.response-row,th,td{border-color:#393a3c}.result,.result-head{border-color:#393a3c}.result-head{background:#1b1c1d}.actions button{background:#e6e6e6;color:#202124}.actions button:hover{background:#ccc}.method{background:#173d32;color:#87d5b4}}
</style></head><body><main><div class="topline"><span class="eyebrow">News Spot API</span><a href="/">返回首页</a></div><header><h1>接口文档</h1><p>公开只读接口，可直接发送请求并查看实时响应。参数、错误码和返回字段同时提供标准 OpenAPI 3.0 文档。</p><div class="links"><a href="/api/openapi.json">下载 OpenAPI JSON</a><a href="/api/v1/sources">查看来源 ID</a></div></header><nav>${openapiDocument.tags.map((tag) => `<a href="#${escapeHtml(tag.name)}">${escapeHtml(tag.name)}</a>`).join("")}</nav>${sections}</main>
<script>
for (const form of document.querySelectorAll('form[data-path]')) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    const result = form.querySelector('.result');
    const status = form.querySelector('.result-status');
    const time = form.querySelector('.result-time');
    const output = form.querySelector('pre');
    let path = form.dataset.path;
    const params = new URLSearchParams();
    for (const input of form.querySelectorAll('input')) {
      const value = input.value.trim();
      if (!value) continue;
      if (input.dataset.in === 'path') path = path.replace('{' + input.name + '}', encodeURIComponent(value));
      else params.set(input.name, value);
    }
    const url = path + (params.size ? '?' + params.toString() : '');
    form.querySelector('.request-url').textContent = url;
    button.disabled = true;
    result.hidden = false;
    status.textContent = '请求中';
    time.textContent = '';
    output.textContent = '';
    const started = performance.now();
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      const body = await response.text();
      status.textContent = response.status + ' ' + response.statusText;
      status.style.color = response.ok ? '' : '#b44242';
      time.textContent = Math.round(performance.now() - started) + ' ms';
      try { output.textContent = JSON.stringify(JSON.parse(body), null, 2); }
      catch { output.textContent = body; }
    } catch (error) {
      status.textContent = '请求失败';
      status.style.color = '#b44242';
      output.textContent = String(error);
    } finally { button.disabled = false; }
  });
}
</script></body></html>`;

export async function apiDocsRoutes(app) {
  app.get("/api/openapi.json", async (_request, reply) => reply.header("Cache-Control", "public, max-age=300").send(openapiDocument));
  const serveDocs = async (_request, reply) => reply.type("text/html; charset=utf-8").header("Cache-Control", "public, max-age=300").send(apiDocsHtml);
  app.get("/api/docs", serveDocs);
  app.get("/api/docs/", serveDocs);
}
