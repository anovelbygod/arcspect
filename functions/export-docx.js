const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
    LevelFormat, PageNumberElement, Footer, Header
  } = require('docx');
  
  exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    try {
      const { markdown, filename } = JSON.parse(event.body);
      if (!markdown) return { statusCode: 400, body: JSON.stringify({ error: 'No markdown provided' }) };
      const buffer = await buildDocx(markdown);
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: buffer.toString('base64'), filename: filename || 'Arcspect-Export.docx' })
      };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  };
  
  function inlineRuns(text, sz) {
    sz = sz || 22;
    const runs = [];
    const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|([^*`]+)/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      if (m[1] !== undefined) runs.push(new TextRun({ text: m[1], bold: true, font: 'Calibri', size: sz }));
      else if (m[2] !== undefined) runs.push(new TextRun({ text: m[2], italics: true, font: 'Calibri', size: sz }));
      else if (m[3] !== undefined) runs.push(new TextRun({ text: m[3], font: 'Courier New', size: sz - 2, color: '2E7D50' }));
      else if (m[4] !== undefined && m[4]) runs.push(new TextRun({ text: m[4], font: 'Calibri', size: sz }));
    }
    return runs.length ? runs : [new TextRun({ text, font: 'Calibri', size: sz })];
  }
  
  function parseMarkdown(markdown) {
    const lines = markdown.split('\n');
    const children = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.startsWith('# ')) {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: line.slice(2).trim(), bold: true, font: 'Calibri', size: 44, color: '1A1A1A' })], spacing: { before: 480, after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '4A7C59', space: 4 } } }));
        i++; continue;
      }
      if (line.startsWith('## ') && !line.startsWith('### ')) {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: line.slice(3).trim().toUpperCase(), bold: true, font: 'Calibri', size: 22, color: '4A7C59' })], spacing: { before: 400, after: 120 } }));
        i++; continue;
      }
      if (line.startsWith('### ')) {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: line.slice(4).trim(), bold: true, font: 'Calibri', size: 26, color: '2C2C2C' })], spacing: { before: 280, after: 100 } }));
        i++; continue;
      }
      if (/^---+$/.test(line.trim())) {
        children.push(new Paragraph({ children: [new TextRun({ text: '' })], border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 1 } }, spacing: { before: 200, after: 200 } }));
        i++; continue;
      }
      if (line.trim().startsWith('|')) {
        const tableLines = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          if (!/^[\|\s\-:]+$/.test(lines[i])) tableLines.push(lines[i]);
          i++;
        }
        if (!tableLines.length) continue;
        const parseRow = r => r.split('|').map(c => c.trim()).filter(Boolean);
        const headers = parseRow(tableLines[0]);
        const colCount = headers.length;
        const colWidth = Math.floor(9360 / colCount);
        const border = { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' };
        const borders = { top: border, bottom: border, left: border, right: border };
        const rows = [new TableRow({ tableHeader: true, children: headers.map(h => new TableCell({ borders, width: { size: colWidth, type: WidthType.DXA }, shading: { fill: 'E8F4EC', type: ShadingType.CLEAR }, margins: { top: 100, bottom: 100, left: 140, right: 140 }, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, font: 'Calibri', size: 20, color: '2E7D50' })] })] })) })];
        for (let r = 1; r < tableLines.length; r++) {
          const cells = parseRow(tableLines[r]);
          rows.push(new TableRow({ children: Array.from({ length: colCount }, (_, ci) => new TableCell({ borders, width: { size: colWidth, type: WidthType.DXA }, shading: { fill: r % 2 === 0 ? 'F9FCF9' : 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 140, right: 140 }, children: [new Paragraph({ children: inlineRuns(cells[ci] || '', 20) })] })) }));
        }
        children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: Array(colCount).fill(colWidth), rows }));
        children.push(new Paragraph({ children: [new TextRun('')], spacing: { after: 160 } }));
        continue;
      }
      if (/^- \[[ x]\] /.test(line)) {
        const checked = line[3] === 'x';
        children.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: (checked ? '☑' : '☐') + ' ', font: 'Calibri', size: 22, color: '4A7C59' }), ...inlineRuns(line.slice(6).trim())], spacing: { before: 40, after: 40 } }));
        i++; continue;
      }
      if (/^- /.test(line)) {
        children.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: inlineRuns(line.slice(2).trim()), spacing: { before: 40, after: 40 } }));
        i++; continue;
      }
      if (/^\d+\. /.test(line)) {
        children.push(new Paragraph({ numbering: { reference: 'numbers', level: 0 }, children: inlineRuns(line.replace(/^\d+\. /, '').trim()), spacing: { before: 40, after: 40 } }));
        i++; continue;
      }
      if (!line.trim()) { children.push(new Paragraph({ children: [new TextRun('')], spacing: { after: 100 } })); i++; continue; }
      children.push(new Paragraph({ children: inlineRuns(line.trim()), spacing: { before: 60, after: 100 } }));
      i++;
    }
    return children;
  }
  
  async function buildDocx(markdown) {
    const doc = new Document({
      numbering: { config: [
        { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }
      ]},
      styles: {
        default: { document: { run: { font: 'Calibri', size: 22, color: '2C2C2C' } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 44, bold: true, font: 'Calibri', color: '1A1A1A' }, paragraph: { spacing: { before: 480, after: 240 }, outlineLevel: 0 } },
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, font: 'Calibri', color: '4A7C59' }, paragraph: { spacing: { before: 400, after: 120 }, outlineLevel: 1 } },
          { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, font: 'Calibri', color: '2C2C2C' }, paragraph: { spacing: { before: 280, after: 100 }, outlineLevel: 2 } }
        ]
      },
      sections: [{
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1260, right: 1260, bottom: 1260, left: 1260 } } },
        headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: 'ARCSPECT', bold: true, font: 'Calibri', size: 18, color: '4A7C59' }), new TextRun({ text: '   ·   AI Product Documentation', font: 'Calibri', size: 18, color: 'AAAAAA' })], border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E0E0E0', space: 4 } } })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: 'arcspect.netlify.app   ·   Page ', font: 'Calibri', size: 16, color: 'AAAAAA' }), new PageNumberElement()], alignment: AlignmentType.RIGHT, border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E0E0E0', space: 4 } } })] }) },
        children: parseMarkdown(markdown)
      }]
    });
    return await Packer.toBuffer(doc);
  }