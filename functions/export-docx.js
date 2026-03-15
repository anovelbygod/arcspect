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

function cleanInline(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function buildPDF(markdown) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true, autoFirstPage: true });

    doc.registerFont('Inter', fonts.regular);
    doc.registerFont('Inter-Bold', fonts.bold);

    const buffers = [];
    doc.on('data', d => buffers.push(d));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const L = 56;
    const R = 56;
    const pageW = doc.page.width - L - R;
    const pageBottom = doc.page.height - 48;

    function drawHeader() {
      doc.rect(0, 0, doc.page.width, 44).fill(C.green);
      doc.font('Inter-Bold').fontSize(11).fillColor('#FFFFFF').text('ARCSPECT', L, 16);
      doc.font('Inter').fontSize(9).fillColor('rgba(255,255,255,0.65)').text('AI Product Documentation', L + 82, 18);
    }

    function drawFooter(pageNum, total) {
      const fy = doc.page.height - 28;
      doc.moveTo(L, fy).lineTo(L + pageW, fy).strokeColor(C.border).lineWidth(0.5).stroke();
      doc.font('Inter').fontSize(8).fillColor(C.muted)
         .text('arcspect.netlify.app', L, fy + 8, { continued: true, width: pageW })
         .text(`Page ${pageNum} of ${total}`, { align: 'right' });
    }

    drawHeader();
    doc.y = 64;

    const lines = markdown.split('\n');
    let i = 0;

    function newPage() { doc.addPage(); drawHeader(); doc.y = 60; }
    function ensureSpace(n) { if (doc.y + n > pageBottom) newPage(); }

    function hRule(color, weight) {
      doc.moveTo(L, doc.y).lineTo(L + pageW, doc.y)
         .strokeColor(color || C.border).lineWidth(weight || 0.5).stroke();
      doc.y += 6;
    }

    // ── Key fix: render bullet as absolute-positioned glyph + text block ──
    function renderBullet(symbol, symbolColor, text, indent) {
      indent = indent || 0;
      const symbolW = 16;
      const textX = L + indent + symbolW;
      const textW = pageW - indent - symbolW;
      const startY = doc.y;

      // Draw symbol at fixed position
      doc.font('Inter-Bold').fontSize(13).fillColor(symbolColor || C.green)
         .text(symbol, L + indent, startY, { lineBreak: false });

      // Draw text starting after symbol — use absolute x position
      doc.font('Inter').fontSize(11).fillColor(C.text2)
         .text(text, textX, startY, { width: textW });

      // doc.y is now set by the text block above
      doc.y += 2;
    }

    function renderNumbered(num, text) {
      const numW = 22;
      const textX = L + numW;
      const textW = pageW - numW;
      const startY = doc.y;

      doc.font('Inter-Bold').fontSize(11).fillColor(C.muted)
         .text(num + '.', L, startY, { lineBreak: false, width: numW });

      doc.font('Inter').fontSize(11).fillColor(C.text2)
         .text(text, textX, startY, { width: textW });

      doc.y += 2;
    }

    while (i < lines.length) {
      const line = lines[i];

      // H1
      if (line.startsWith('# ')) {
        ensureSpace(72);
        doc.y += 8;
        doc.font('Inter-Bold').fontSize(22).fillColor(C.text)
           .text(line.slice(2).trim(), L, doc.y, { width: pageW });
        doc.y += 4;
        hRule(C.green, 2);
        doc.y += 6;
        i++; continue;
      }

      // H2
      if (line.startsWith('## ') && !line.startsWith('### ')) {
        ensureSpace(52);
        doc.y += 18;
        doc.font('Inter-Bold').fontSize(8).fillColor(C.green)
           .text(line.slice(3).trim().toUpperCase(), L, doc.y, { width: pageW, characterSpacing: 1.6 });
        doc.y += 5;
        hRule('#DDDDDD', 0.5);
        doc.y += 2;
        i++; continue;
      }

      // H3
      if (line.startsWith('### ') || line.startsWith('#### ')) {
        ensureSpace(32);
        doc.y += 8;
        const text = line.startsWith('#### ') ? line.slice(5).trim() : line.slice(4).trim();
        doc.font('Inter-Bold').fontSize(12).fillColor(C.text)
           .text(text, L, doc.y, { width: pageW });
        doc.y += 4;
        i++; continue;
      }

      // HR
      if (/^---+$/.test(line.trim())) {
        doc.y += 10; hRule(C.border, 0.5); doc.y += 10;
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
        const colW = Math.floor(pageW / headers.length);
        const hRowH = 24, dRowH = 20;

        ensureSpace(hRowH + Math.min(tableLines.length - 1, 4) * dRowH + 16);
        doc.y += 8;
        const sy = doc.y;

        headers.forEach((h, ci) => {
          const x = L + ci * colW;
          doc.rect(x, sy, colW, hRowH).fill(C.headerBg);
          doc.rect(x, sy, colW, hRowH).strokeColor(C.border).lineWidth(0.5).stroke();
          doc.font('Inter-Bold').fontSize(8).fillColor(C.green)
             .text(h.toUpperCase(), x + 8, sy + 8, { width: colW - 16, ellipsis: true, lineBreak: false });
        });
        doc.y = sy + hRowH;

        for (let r = 1; r < tableLines.length; r++) {
          const cells = parseRow(tableLines[r]);
          if (doc.y + dRowH > pageBottom) newPage();
          const ry = doc.y;
          headers.forEach((_, ci) => {
            const x = L + ci * colW;
            doc.rect(x, ry, colW, dRowH).fill(r % 2 === 0 ? C.rowAlt : C.white);
            doc.rect(x, ry, colW, dRowH).strokeColor(C.border).lineWidth(0.5).stroke();
            doc.font('Inter').fontSize(9).fillColor(C.text2)
               .text(cleanInline(cells[ci] || ''), x + 8, ry + 6, { width: colW - 16, ellipsis: true, lineBreak: false });
          });
          doc.y = ry + dRowH;
        }
        doc.y += 14;
        continue;
      }

      // Checkbox
      if (/^- \[[ x]\] /.test(line)) {
        ensureSpace(22);
        const checked = line[3] === 'x';
        renderBullet(checked ? '☑' : '☐', C.green, cleanInline(line.slice(6).trim()));
        i++; continue;
      }

      // Bullet
      if (/^- /.test(line)) {
        ensureSpace(22);
        renderBullet('•', C.green, cleanInline(line.slice(2).trim()));
        i++; continue;
      }

      // Numbered list
      if (/^\d+\. /.test(line)) {
        ensureSpace(22);
        const num = line.match(/^(\d+)\./)[1];
        renderNumbered(num, cleanInline(line.replace(/^\d+\. /, '').trim()));
        i++; continue;
      }

      // Empty line
      if (!line.trim()) { doc.y += 6; i++; continue; }

      // Paragraph — bold:value pattern
      ensureSpace(22);
      const boldMatch = line.trim().match(/^\*\*([^*]+)\*\*[:\s]\s*(.*)/);
      if (boldMatch) {
        const label = boldMatch[1] + ': ';
        const rest = cleanInline(boldMatch[2]);
        const labelW = doc.font('Inter-Bold').fontSize(11).widthOfString(label);
        const startY = doc.y;
        doc.font('Inter-Bold').fontSize(11).fillColor(C.text)
           .text(label, L, startY, { lineBreak: false });
        doc.font('Inter').fontSize(11).fillColor(C.text2)
           .text(rest, L + labelW, startY, { width: pageW - labelW });
      } else {
        doc.font('Inter').fontSize(11).fillColor(C.text2)
           .text(cleanInline(line.trim()), L, doc.y, { width: pageW });
      }
      doc.y += 4;
      i++;
    }

    // Footers
    const range = doc.bufferedPageRange();
    for (let p = 0; p < range.count; p++) {
      doc.switchToPage(range.start + p);
      drawFooter(p + 1, range.count);
    }

    doc.end();
  });
}