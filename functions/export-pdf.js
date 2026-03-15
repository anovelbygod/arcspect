const PDFDocument = require('pdfkit');
const fonts = require('./fonts.js');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    const { markdown, filename } = JSON.parse(event.body);
    if (!markdown) return { statusCode: 400, body: JSON.stringify({ error: 'No markdown provided' }) };
    const buffer = await buildPDF(markdown);
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: buffer.toString('base64'), filename: filename || 'Arcspect-Export.pdf' })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

const C = {
  green: '#4A7C59', text: '#1A1A1A', text2: '#444444',
  muted: '#999999', border: '#E0E0E0', headerBg: '#F0F7F2',
  rowAlt: '#F9FCF9', white: '#FFFFFF'
};

function clean(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function buildPDF(markdown) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true, autoFirstPage: true });
    doc.registerFont('Inter', fonts.regular);
    doc.registerFont('Inter-Bold', fonts.bold);

    const bufs = [];
    doc.on('data', d => bufs.push(d));
    doc.on('end', () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);

    const L = 56, W = doc.page.width - 112, BOTTOM = doc.page.height - 48;

    function header() {
      doc.rect(0, 0, doc.page.width, 44).fill(C.green);
      doc.font('Inter-Bold').fontSize(11).fillColor('#FFF').text('ARCSPECT', L, 16);
      doc.font('Inter').fontSize(9).fillColor('rgba(255,255,255,0.65)').text('AI Product Documentation', L + 82, 18);
    }

    function footer(n, total) {
      const fy = doc.page.height - 28;
      doc.moveTo(L, fy).lineTo(L + W, fy).strokeColor(C.border).lineWidth(0.5).stroke();
      doc.font('Inter').fontSize(8).fillColor(C.muted)
         .text('arcspect.netlify.app', L, fy + 8, { continued: true, width: W })
         .text(`Page ${n} of ${total}`, { align: 'right' });
    }

    header();
    doc.y = 64;

    function newPage() { doc.addPage(); header(); doc.y = 60; }
    function space(n) { if (doc.y + n > BOTTOM) newPage(); }
    function rule(color, w) {
      doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor(color || C.border).lineWidth(w || 0.5).stroke();
      doc.y += 6;
    }

    // Pre-process lines into typed blocks
    const lines = markdown.split('\n');
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Bullet list — collect consecutive
      if (/^- /.test(line)) {
        const items = [];
        while (i < lines.length && /^- /.test(lines[i])) {
          items.push(clean(lines[i].replace(/^- (\[[ x]\] )?/, '')));
          i++;
        }
        blocks.push({ type: 'bullets', items });
        continue;
      }

      // Numbered list — collect consecutive
      if (/^\d+\. /.test(line)) {
        const items = [];
        while (i < lines.length && /^\d+\. /.test(lines[i])) {
          items.push(clean(lines[i].replace(/^\d+\. /, '')));
          i++;
        }
        blocks.push({ type: 'numbers', items });
        continue;
      }

      // Table — collect all rows
      if (line.trim().startsWith('|')) {
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          if (!/^[\|\s\-:]+$/.test(lines[i])) {
            rows.push(lines[i].split('|').map(c => c.trim()).filter(Boolean));
          }
          i++;
        }
        if (rows.length) blocks.push({ type: 'table', rows });
        continue;
      }

      blocks.push({ type: 'line', content: line });
      i++;
    }

    // Render blocks
    for (const block of blocks) {

      if (block.type === 'bullets') {
        space(22 * Math.min(block.items.length, 3));
        doc.font('Inter').fontSize(11).fillColor(C.text2)
           .list(block.items, L, doc.y, {
             bulletRadius: 2.5,
             bulletIndent: 8,
             textIndent: 16,
             width: W,
             bulletColor: C.green,
             lineGap: 4
           });
        doc.y += 8;
        continue;
      }

      if (block.type === 'numbers') {
        space(22 * Math.min(block.items.length, 3));
        doc.font('Inter').fontSize(11).fillColor(C.text2)
           .list(block.items, L, doc.y, {
             listType: 'numbered',
             bulletIndent: 8,
             textIndent: 22,
             width: W,
             lineGap: 4
           });
        doc.y += 8;
        continue;
      }

      if (block.type === 'table') {
        const { rows } = block;
        const colCount = rows[0].length;
        const colW = Math.floor(W / colCount);
        const hRowH = 24, dRowH = 20;

        space(hRowH + Math.min(rows.length - 1, 4) * dRowH + 16);
        doc.y += 8;
        const sy = doc.y;

        // Header row
        rows[0].forEach((h, ci) => {
          const x = L + ci * colW;
          doc.rect(x, sy, colW, hRowH).fill(C.headerBg);
          doc.rect(x, sy, colW, hRowH).strokeColor(C.border).lineWidth(0.5).stroke();
          doc.font('Inter-Bold').fontSize(8).fillColor(C.green)
             .text(h.toUpperCase(), x + 8, sy + 8, { width: colW - 16, lineBreak: false });
        });
        doc.y = sy + hRowH;

        // Data rows
        for (let r = 1; r < rows.length; r++) {
          if (doc.y + dRowH > BOTTOM) newPage();
          const ry = doc.y;
          rows[r].forEach((cell, ci) => {
            const x = L + ci * colW;
            doc.rect(x, ry, colW, dRowH).fill(r % 2 === 0 ? C.rowAlt : C.white);
            doc.rect(x, ry, colW, dRowH).strokeColor(C.border).lineWidth(0.5).stroke();
            doc.font('Inter').fontSize(9).fillColor(C.text2)
               .text(clean(cell), x + 8, ry + 6, { width: colW - 16, lineBreak: false });
          });
          doc.y = ry + dRowH;
        }
        doc.y += 14;
        continue;
      }

      // Single line
      const line = block.content;

      if (line.startsWith('# ')) {
        space(72); doc.y += 8;
        doc.font('Inter-Bold').fontSize(22).fillColor(C.text).text(line.slice(2).trim(), L, doc.y, { width: W });
        doc.y += 4; rule(C.green, 2); doc.y += 6;
        continue;
      }

      if (line.startsWith('## ') && !line.startsWith('### ')) {
        space(52); doc.y += 18;
        doc.font('Inter-Bold').fontSize(8).fillColor(C.green)
           .text(line.slice(3).trim().toUpperCase(), L, doc.y, { width: W, characterSpacing: 1.6 });
        doc.y += 5; rule('#DDDDDD', 0.5); doc.y += 2;
        continue;
      }

      if (line.startsWith('### ') || line.startsWith('#### ')) {
        space(32); doc.y += 8;
        const txt = line.replace(/^#{3,5} /, '').trim();
        doc.font('Inter-Bold').fontSize(12).fillColor(C.text).text(txt, L, doc.y, { width: W });
        doc.y += 4;
        continue;
      }

      if (/^---+$/.test(line.trim())) {
        doc.y += 10; rule(C.border, 0.5); doc.y += 10;
        continue;
      }

      if (!line.trim()) { doc.y += 6; continue; }

      space(22);
      const boldMatch = line.trim().match(/^\*\*([^*]+)\*\*[:\s]\s*(.*)/);
      if (boldMatch) {
        const label = boldMatch[1] + ': ';
        const rest = clean(boldMatch[2]);
        if (rest) {
          // Label + text on same line — render as one paragraph, bold label then normal text
          const startY = doc.y;
          const labelW = doc.font('Inter-Bold').fontSize(11).widthOfString(label);
          doc.font('Inter-Bold').fontSize(11).fillColor(C.text)
             .text(label, L, startY, { lineBreak: false });
          doc.font('Inter').fontSize(11).fillColor(C.text2)
             .text(rest, L + labelW, startY, { width: W - labelW });
        } else {
          // Label only — standalone bold heading
          doc.font('Inter-Bold').fontSize(11).fillColor(C.text)
             .text(label, L, doc.y, { width: W });
        }
      } else {
        doc.font('Inter').fontSize(11).fillColor(C.text2).text(clean(line.trim()), L, doc.y, { width: W });
      }
      doc.y += 6;
    }

    // Add footers
    const range = doc.bufferedPageRange();
    for (let p = 0; p < range.count; p++) {
      doc.switchToPage(range.start + p);
      footer(p + 1, range.count);
    }

    doc.end();
  });
}