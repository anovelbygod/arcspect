const PDFDocument = require('pdfkit');

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

const C = { green: '#4A7C59', text: '#1A1A1A', text2: '#444444', muted: '#888888', border: '#E0E0E0', headerBg: '#F0F7F2', rowAlt: '#F9FCF9', white: '#FFFFFF' };
const F = { normal: 'Helvetica', bold: 'Helvetica-Bold' };

function cleanInline(text) {
  return text.replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\*([^*]+)\*/g,'$1').replace(/`([^`]+)`/g,'$1').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1');
}

function buildPDF(markdown) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 72, size: 'A4', bufferPages: true, autoFirstPage: true });
    const buffers = [];
    doc.on('data', d => buffers.push(d));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const L = 72;
    const pageW = doc.page.width - 144;

    doc.rect(0, 0, doc.page.width, 52).fill(C.green);
    doc.font(F.bold).fontSize(14).fillColor('#FFFFFF').text('ARCSPECT', L, 18);
    doc.font(F.normal).fontSize(9).fillColor('rgba(255,255,255,0.7)').text('AI Product Documentation', L + 92, 22);
    doc.y = 72;

    const lines = markdown.split('\n');
    let i = 0;

    function newPage() {
      doc.addPage();
      doc.rect(0, 0, doc.page.width, 6).fill(C.green);
      doc.y = 24;
    }

    function ensureSpace(needed) {
      if (doc.y + needed > doc.page.height - 80) newPage();
    }

    function hRule(color, weight) {
      doc.moveTo(L, doc.y).lineTo(L + pageW, doc.y).strokeColor(color || C.border).lineWidth(weight || 0.5).stroke();
      doc.y += 8;
    }

    while (i < lines.length) {
      const line = lines[i];

      if (line.startsWith('# ')) {
        ensureSpace(64);
        doc.y += 12;
        doc.font(F.bold).fontSize(22).fillColor(C.text).text(line.slice(2).trim(), L, doc.y, { width: pageW });
        doc.y += 6; hRule(C.green, 2); doc.y += 4;
        doc.font(F.normal).fontSize(11);
        i++; continue;
      }

      if (line.startsWith('## ') && !line.startsWith('### ')) {
        ensureSpace(48);
        doc.y += 16;
        doc.font(F.bold).fontSize(8.5).fillColor(C.green).text(line.slice(3).trim().toUpperCase(), L, doc.y, { width: pageW, characterSpacing: 1.8 });
        doc.y += 4; hRule(C.green, 0.75);
        doc.font(F.normal).fontSize(11);
        i++; continue;
      }

      if (line.startsWith('### ')) {
        ensureSpace(32);
        doc.y += 10;
        doc.font(F.bold).fontSize(12).fillColor(C.text).text(line.slice(4).trim(), L, doc.y, { width: pageW });
        doc.y += 4; doc.font(F.normal).fontSize(11);
        i++; continue;
      }

      if (/^---+$/.test(line.trim())) {
        doc.y += 10; hRule(C.border, 0.5); doc.y += 10;
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
        const colW = Math.floor(pageW / headers.length);
        const rowH = 22;
        ensureSpace(rowH * Math.min(tableLines.length + 1, 5) + 16);
        doc.y += 8;
        const startY = doc.y;
        headers.forEach((h, ci) => {
          const x = L + ci * colW;
          doc.rect(x, startY, colW, rowH).fill(C.headerBg);
          doc.rect(x, startY, colW, rowH).strokeColor(C.border).lineWidth(0.5).stroke();
          doc.font(F.bold).fontSize(8).fillColor(C.green).text(h.toUpperCase(), x + 7, startY + 7, { width: colW - 14, ellipsis: true });
        });
        doc.y = startY + rowH;
        for (let r = 1; r < tableLines.length; r++) {
          const cells = parseRow(tableLines[r]);
          if (doc.y + rowH > doc.page.height - 80) newPage();
          const ry = doc.y;
          headers.forEach((_, ci) => {
            const x = L + ci * colW;
            doc.rect(x, ry, colW, rowH).fill(r % 2 === 0 ? C.rowAlt : C.white);
            doc.rect(x, ry, colW, rowH).strokeColor(C.border).lineWidth(0.5).stroke();
            doc.font(F.normal).fontSize(9).fillColor(C.text2).text(cleanInline(cells[ci] || ''), x + 7, ry + 7, { width: colW - 14, ellipsis: true });
          });
          doc.y = ry + rowH;
        }
        doc.y += 14;
        continue;
      }

      if (/^- \[[ x]\] /.test(line)) {
        ensureSpace(20);
        const checked = line[3] === 'x';
        doc.font(F.bold).fontSize(11).fillColor(C.green).text(checked ? '☑' : '☐', L, doc.y, { continued: true, width: 18 });
        doc.font(F.normal).fillColor(C.text2).text('  ' + cleanInline(line.slice(6).trim()), { width: pageW - 18 });
        doc.y += 2; i++; continue;
      }

      if (/^- /.test(line)) {
        ensureSpace(20);
        doc.font(F.bold).fontSize(14).fillColor(C.green).text('•', L, doc.y - 1, { continued: true, width: 16 });
        doc.font(F.normal).fontSize(11).fillColor(C.text2).text(' ' + cleanInline(line.slice(2).trim()), { width: pageW - 16 });
        doc.y += 2; i++; continue;
      }

      if (/^\d+\. /.test(line)) {
        ensureSpace(20);
        const num = line.match(/^(\d+)\./)[1];
        doc.font(F.bold).fontSize(11).fillColor(C.green).text(num + '.', L, doc.y, { continued: true, width: 22 });
        doc.font(F.normal).fillColor(C.text2).text('  ' + cleanInline(line.replace(/^\d+\. /, '').trim()), { width: pageW - 22 });
        doc.y += 2; i++; continue;
      }

      if (!line.trim()) { doc.y += 7; i++; continue; }

      ensureSpace(20);
      const boldMatch = line.trim().match(/^\*\*([^*]+)\*\*[:\s]\s*(.*)/);
      if (boldMatch) {
        doc.font(F.bold).fontSize(11).fillColor(C.text).text(boldMatch[1] + ': ', L, doc.y, { continued: true });
        doc.font(F.normal).fillColor(C.text2).text(cleanInline(boldMatch[2]), { width: pageW });
      } else {
        doc.font(F.normal).fontSize(11).fillColor(C.text2).text(cleanInline(line.trim()), L, doc.y, { width: pageW });
      }
      doc.y += 4; i++;
    }

    const range = doc.bufferedPageRange();
    for (let p = 0; p < range.count; p++) {
      doc.switchToPage(range.start + p);
      const fy = doc.page.height - 36;
      doc.moveTo(L, fy).lineTo(L + pageW, fy).strokeColor(C.border).lineWidth(0.5).stroke();
      doc.font(F.normal).fontSize(8).fillColor(C.muted)
         .text('arcspect.netlify.app', L, fy + 10, { continued: true, width: pageW })
         .text(`Page ${p + 1} of ${range.count}`, { align: 'right' });
    }

    doc.end();
  });
}