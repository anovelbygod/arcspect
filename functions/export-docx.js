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
  
  const FONT = 'Inter';
  const FONT_FALLBACK = 'Calibri';
  const F = `${FONT}, ${FONT_FALLBACK}`;
  
  function run(text, opts = {}) {
    return new TextRun({
      text,
      font: F,
      size: opts.size || 22,
      bold: opts.bold || false,
      italics: opts.italics || false,
      color: opts.color || '2C2C2C'
    });
  }
  
  function inlineRuns(text, sz) {
    sz = sz || 22;
    const runs = [];
    const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|([^*`]+)/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      if (m[1] !== undefined) runs.push(run(m[1], { bold: true, size: sz }));
      else if (m[2] !== undefined) runs.push(run(m[2], { italics: true, size: sz }));
      else if (m[3] !== undefined) runs.push(new TextRun({ text: m[3], font: 'Courier New', size: sz - 2, color: '2E7D50' }));
      else if (m[4] !== undefined && m[4]) runs.push(run(m[4], { size: sz }));
    }
    return runs.length ? runs : [run(text, { size: sz })];
  }
  
  function parseMarkdown(markdown) {
    const lines = markdown.split('\n');
    const children = [];
    let i = 0;
  
    while (i < lines.length) {
      const line = lines[i];
  
      // H1
      if (line.startsWith('# ')) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [run(line.slice(2).trim(), { bold: true, size: 44, color: '1A1A1A' })],
          spacing: { before: 480, after: 240 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '4A7C59', space: 4 } }
        }));
        i++; continue;
      }
  
      // H2
      if (line.startsWith('## ') && !line.startsWith('### ')) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [run(line.slice(3).trim().toUpperCase(), { bold: true, size: 18, color: '4A7C59' })],
          spacing: { before: 400, after: 80 }, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD", space: 4 } }
        }));
  
        i++; continue;
      }
  
      // H3
      if (line.startsWith('### ')) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [run(line.slice(4).trim(), { bold: true, size: 24, color: '1A1A1A' })],
          spacing: { before: 280, after: 80 }
        }));
        i++; continue;
      }
  
      // HR
      if (/^---+$/.test(line.trim())) {
        children.push(new Paragraph({
          children: [run('')],
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 1 } },
          spacing: { before: 160, after: 160 }
        }));
        i++; continue;
      }
  
      // Table
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
  
        const rows = [
          new TableRow({
            tableHeader: true,
            children: headers.map(h => new TableCell({
              borders,
              width: { size: colWidth, type: WidthType.DXA },
              shading: { fill: 'E8F4EC', type: ShadingType.CLEAR },
              margins: { top: 100, bottom: 100, left: 140, right: 140 },
              children: [new Paragraph({
                children: [run(h.toUpperCase(), { bold: true, size: 18, color: '2E7D50' })]
              })]
            }))
          })
        ];
  
        for (let r = 1; r < tableLines.length; r++) {
          const cells = parseRow(tableLines[r]);
          rows.push(new TableRow({
            children: Array.from({ length: colCount }, (_, ci) => new TableCell({
              borders,
              width: { size: colWidth, type: WidthType.DXA },
              shading: { fill: r % 2 === 0 ? 'F9FCF9' : 'FFFFFF', type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 140, right: 140 },
              children: [new Paragraph({ children: inlineRuns(cells[ci] || '', 20) })]
            }))
          }));
        }
  
        children.push(new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: Array(colCount).fill(colWidth),
          rows
        }));
        children.push(new Paragraph({ children: [run('')], spacing: { after: 140 } }));
        continue;
      }
  
      // Checkbox
      if (/^- \[[ x]\] /.test(line)) {
        const checked = line[3] === 'x';
        const text = line.slice(6).trim().replace(/^\*\*([^*]+)\*\*/, '$1').replace(/^\*([^*]+)\*/, '$1');
        children.push(new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [
            run((checked ? '☑' : '☐') + ' ', { bold: true, size: 22, color: '4A7C59' }),
            ...inlineRuns(text)
          ],
          spacing: { before: 40, after: 40 }
        }));
        i++; continue;
      }
  
      // Bullet
      if (/^- /.test(line)) {
        // Strip leading/trailing single asterisks that cause spurious italic rendering
        const bulletText = line.slice(2).trim()
          .replace(/^\*([^*])/g, '$1')
          .replace(/([^*])\*$/g, '$1');
        children.push(new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: inlineRuns(bulletText),
          spacing: { before: 40, after: 40 }
        }));
        i++; continue;
      }
  
      // Numbered list
      if (/^\d+\. /.test(line)) {
        const numText = line.replace(/^\d+\. /, '').trim()
          .replace(/^\*([^*])/g, '$1')
          .replace(/([^*])\*$/g, '$1');
        children.push(new Paragraph({
          numbering: { reference: 'numbers', level: 0 },
          children: inlineRuns(numText),
          spacing: { before: 40, after: 40 }
        }));
        i++; continue;
      }
  
      // Empty line
      if (!line.trim()) {
        children.push(new Paragraph({ children: [run('')], spacing: { after: 80 } }));
        i++; continue;
      }
  
      // Paragraph
      children.push(new Paragraph({
        children: inlineRuns(line.trim()),
        spacing: { before: 40, after: 80 }
      }));
      i++;
    }
  
    return children;
  }
  
  async function buildDocx(markdown) {
    const doc = new Document({
      numbering: {
        config: [
          { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } }, run: { font: F } } }] },
          { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } }, run: { color: '999999', font: F } } }] }
        ]
      },
      styles: {
        default: { document: { run: { font: F, size: 22, color: '2C2C2C' } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 44, bold: true, font: F, color: '1A1A1A' }, paragraph: { spacing: { before: 480, after: 240 }, outlineLevel: 0 } },
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 18, bold: true, font: F, color: '4A7C59' }, paragraph: { spacing: { before: 400, after: 80 }, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD", space: 4 } }, outlineLevel: 1 } },
          { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, font: F, color: '1A1A1A' }, paragraph: { spacing: { before: 280, after: 80 }, outlineLevel: 2 } }
        ]
      },
      sections: [{
        properties: {
          page: { size: { width: 12240, height: 15840 }, margin: { top: 1260, right: 1260, bottom: 1260, left: 1260 } }
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              children: [
                run('ARCSPECT', { bold: true, size: 18, color: '4A7C59' }),
                run('   ·   AI Product Documentation', { size: 18, color: 'AAAAAA' })
              ],
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E0E0E0', space: 4 } }
            })]
          })
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              children: [
                run('arcspect.netlify.app   ·   Page ', { size: 16, color: 'AAAAAA' }),
                new PageNumberElement()
              ],
              alignment: AlignmentType.RIGHT,
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E0E0E0', space: 4 } }
            })]
          })
        },
        children: parseMarkdown(markdown)
      }]
    });
  
    return await Packer.toBuffer(doc);
  }