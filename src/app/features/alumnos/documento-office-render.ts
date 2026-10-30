/** Local-only Office readers. Returned Word markup must only enter a sandboxed iframe. */
export async function renderizarWord(blob: Blob): Promise<Blob> {
  const { parseAsync, renderDocument } = await import('docx-preview');
  const options = {
    breakPages: true,
    ignoreLastRenderedPageBreak: false,
    ignoreWidth: false,
    ignoreHeight: false,
    ignoreFonts: false,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    renderAltChunks: false,
    renderComments: false,
    useBase64URL: true,
    experimental: false,
  };
  const doc = await parseAsync(await blob.arrayBuffer(), options);
  const nodes = await renderDocument(doc, options);
  const container = document.createElement('div');
  container.append(...nodes);
  container
    .querySelectorAll('script,iframe,object,embed,form,input,button,link,meta,base,audio,video')
    .forEach((n) => n.remove());
  container.querySelectorAll('*').forEach((element) => {
    for (const attr of Array.from(element.attributes)) {
      if (
        /^on/i.test(attr.name) ||
        attr.name.endsWith(':href') ||
        ['href', 'srcdoc', 'action', 'formaction', 'srcset'].includes(attr.name)
      )
        element.removeAttribute(attr.name);
      if (attr.name === 'src' && !/^data:image\//i.test(attr.value))
        element.removeAttribute(attr.name);
    }
  });
  return new Blob(
    [
      `<!doctype html><html><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'">
    <style>html,body{margin:0;background:#e5e5e5}body{overflow:auto}</style></head><body>${container.innerHTML}</body></html>`,
    ],
    { type: 'text/html' },
  );
}
export interface HojaLectura {
  nombre: string;
  filas: string[][];
  columnas: number[];
}
export async function leerExcel(blob: Blob): Promise<HojaLectura[]> {
  const { default: read } = await import('read-excel-file/browser');
  const sheets = await read(await blob.arrayBuffer(), { trim: false });
  return sheets.map((sheet) => ({
    nombre: sheet.sheet,
    filas: sheet.data.map((row) =>
      row.map((cell) =>
        cell instanceof Date ? cell.toLocaleDateString('es-AR') : String(cell ?? ''),
      ),
    ),
    columnas: Array.from(
      { length: sheet.data.reduce((max, row) => Math.max(max, row.length), 0) },
      (_, i) => i,
    ),
  }));
}
