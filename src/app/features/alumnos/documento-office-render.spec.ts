import JSZip from 'jszip';
import { leerExcel, renderizarWord } from './documento-office-render';

const archivo = (bytes: ArrayBuffer) => ({ arrayBuffer: async () => bytes }) as Blob;
const leerTexto = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });

describe('Lectores Office con archivos sintéticos reales', () => {
  it('Word conserva páginas, márgenes, tablas, imagen y formato sin HTML activo ni enlaces externos', async () => {
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    );
    zip.file(
      '_rels/.rels',
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    );
    zip.file(
      'word/_rels/document.xml.rels',
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="img" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image.png"/>
      <Relationship Id="link" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/>
      <Relationship Id="chunk" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="active.html"/></Relationships>`,
    );
    zip.file(
      'word/document.xml',
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>
      <w:p><w:r><w:rPr><w:b/><w:color w:val="FF0000"/><w:sz w:val="32"/></w:rPr><w:t>Informe</w:t></w:r></w:p>
      <w:tbl><w:tblPr><w:tblW w:w="5000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="5000"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>Celda</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      <w:p><w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="914400"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="img"/></pic:blipFill><pic:spPr><a:xfrm><a:ext cx="914400" cy="914400"/></a:xfrm></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
      <w:p><w:hyperlink r:id="link"><w:r><w:t>Enlace</w:t></w:r></w:hyperlink></w:p><w:altChunk r:id="chunk"/>
      <w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>Segunda pagina</w:t></w:r></w:p>
      <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440"/></w:sectPr></w:body></w:document>`,
    );
    zip.file(
      'word/media/image.png',
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC3sAAAAASUVORK5CYII=',
      { base64: true },
    );
    zip.file(
      'word/active.html',
      '<script>alert(1)</script><iframe src="https://external.invalid"></iframe>',
    );
    const html = await leerTexto(
      await renderizarWord(archivo(await zip.generateAsync({ type: 'arraybuffer' }))),
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelectorAll('section.docx').length).toBeGreaterThanOrEqual(2);
    expect(doc.querySelector('section.docx')?.getAttribute('style')).toContain('72pt');
    expect(doc.querySelector('table')?.textContent).toContain('Celda');
    expect(doc.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(doc.querySelector('span[style*="font-weight"]')?.getAttribute('style')).toContain(
      'bold',
    );
    expect(doc.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(doc.querySelector('script,iframe,object,embed')).toBeNull();
    expect(doc.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain(
      "default-src 'none'",
    );
  });
  it('Excel conserva dos hojas y celdas vacías sin evaluar fórmulas ni interpretar HTML', async () => {
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    );
    zip.file(
      'xl/workbook.xml',
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Enero" sheetId="1" r:id="s1"/><sheet name="Febrero" sheetId="2" r:id="s2"/></sheets></workbook>`,
    );
    zip.file(
      'xl/_rels/workbook.xml.rels',
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="s1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="s2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`,
    );
    zip.file(
      'xl/worksheets/sheet1.xml',
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t> Cuota </t></is></c><c r="C1"><v>1200</v></c></row><row r="2"><c r="A2"><f>SUM(C1,100)</f><v>1300</v></c></row></sheetData></worksheet>`,
    );
    zip.file(
      'xl/worksheets/sheet2.xml',
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&lt;script&gt;no ejecutar&lt;/script&gt;</t></is></c></row></sheetData></worksheet>`,
    );
    const hojas = await leerExcel(archivo(await zip.generateAsync({ type: 'arraybuffer' })));
    expect(hojas.map((h) => h.nombre)).toEqual(['Enero', 'Febrero']);
    expect(hojas[0].filas[0]).toEqual([' Cuota ', '', '1200']);
    expect(hojas[0].filas[1][0]).toBe('1300');
    expect(hojas[1].filas[0][0]).toBe('<script>no ejecutar</script>');
    expect(hojas[0].columnas).toEqual([0, 1, 2]);
  });
});
