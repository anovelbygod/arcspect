// functions/export-notion.js
// Sends the Arcspect full brief to Notion as a new child page
// under the NOTION_PARENT_PAGE_ID set in Netlify environment variables.
// The NOTION_TOKEN is also set as a Netlify environment variable — never hardcoded.

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
  
    // These come from Netlify environment variables — set them in your Netlify dashboard
    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const NOTION_PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID;
  
    if (!NOTION_TOKEN || !NOTION_PARENT_PAGE_ID) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Notion credentials not configured. Add NOTION_TOKEN and NOTION_PARENT_PAGE_ID to Netlify environment variables.' })
      };
    }
  
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
    }
  
    const { markdown, title, sections } = body;
    // markdown: the combined brief text
    // title: page title (e.g. "Merchant instant settlement — Full Brief")
    // sections: array of section names included (for the page subtitle)
  
    if (!markdown || !title) {
      return { statusCode: 400, body: JSON.stringify({ error: 'markdown and title are required' }) };
    }
  
    // ── Convert markdown to Notion blocks ──────────────────────────────
    // Notion's API accepts a blocks array. We convert the markdown line by line
    // into supported block types: heading_1, heading_2, heading_3, bulleted_list_item,
    // numbered_list_item, to_do, divider, table, and paragraph.
  
    const blocks = markdownToNotionBlocks(markdown);
  
    // Notion API has a 100-block limit per request — we'll chunk if needed
    const CHUNK_SIZE = 95; // leave headroom
    const firstChunk = blocks.slice(0, CHUNK_SIZE);
    const remainingChunks = [];
    for (let i = CHUNK_SIZE; i < blocks.length; i += CHUNK_SIZE) {
      remainingChunks.push(blocks.slice(i, i + CHUNK_SIZE));
    }
  
    // ── Create the page ───────────────────────────────────────────────
    const pagePayload = {
      parent: { page_id: NOTION_PARENT_PAGE_ID },
      properties: {
        title: {
          title: [{ type: 'text', text: { content: title } }]
        }
      },
      children: firstChunk
    };
  
    try {
      const createRes = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify(pagePayload)
      });
  
      const pageData = await createRes.json();
  
      if (!createRes.ok) {
        return {
          statusCode: createRes.status,
          body: JSON.stringify({ error: pageData.message || 'Notion API error', details: pageData })
        };
      }
  
      const pageId = pageData.id;
      const pageUrl = pageData.url;
  
      // ── Append remaining chunks if content exceeded 100 blocks ────────
      for (const chunk of remainingChunks) {
        const appendRes = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${NOTION_TOKEN}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28'
          },
          body: JSON.stringify({ children: chunk })
        });
  
        if (!appendRes.ok) {
          // Page was created but some blocks failed — return partial success
          const appendData = await appendRes.json();
          return {
            statusCode: 207,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              warning: 'Page created but some content may be missing (block append failed)',
              pageUrl,
              error: appendData.message
            })
          };
        }
      }
  
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageUrl })
      };
  
    } catch (err) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: err.message })
      };
    }
  };
  
  // ── Markdown → Notion blocks converter ───────────────────────────────
  // Handles: h1/h2/h3, bullet lists, numbered lists, checkboxes,
  // dividers, tables, bold/italic inline formatting, and paragraphs.
  // Does NOT handle: code blocks, images, nested lists (Notion limitation in v1).
  
  function markdownToNotionBlocks(markdown) {
    const lines = markdown.split('\n');
    const blocks = [];
    let tableLines = [];
    let inTable = false;
  
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
  
      // ── Table detection ──────────────────────────────────────────────
      if (line.startsWith('|')) {
        inTable = true;
        tableLines.push(line);
        continue;
      }
      if (inTable && !line.startsWith('|')) {
        // Flush table
        const tableBlocks = tableToNotionBlocks(tableLines);
        blocks.push(...tableBlocks);
        tableLines = [];
        inTable = false;
        // fall through to process current line
      }
  
      // ── Headings ────────────────────────────────────────────────────
      if (line.startsWith('# ')) {
        blocks.push(heading(1, line.slice(2)));
        continue;
      }
      if (line.startsWith('## ')) {
        blocks.push(heading(2, line.slice(3)));
        continue;
      }
      if (line.startsWith('### ')) {
        blocks.push(heading(3, line.slice(4)));
        continue;
      }
  
      // ── Divider ─────────────────────────────────────────────────────
      if (/^---+$/.test(line.trim())) {
        blocks.push({ object: 'block', type: 'divider', divider: {} });
        continue;
      }
  
      // ── Checkbox (- [ ] ...) ────────────────────────────────────────
      if (/^- \[ \] /.test(line)) {
        blocks.push({
          object: 'block', type: 'to_do',
          to_do: { rich_text: parseInline(line.slice(6)), checked: false }
        });
        continue;
      }
      if (/^- \[x\] /i.test(line)) {
        blocks.push({
          object: 'block', type: 'to_do',
          to_do: { rich_text: parseInline(line.slice(6)), checked: true }
        });
        continue;
      }
  
      // ── Bullet list ─────────────────────────────────────────────────
      if (/^- /.test(line)) {
        blocks.push({
          object: 'block', type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: parseInline(line.slice(2)) }
        });
        continue;
      }
  
      // ── Numbered list ───────────────────────────────────────────────
      if (/^\d+\. /.test(line)) {
        blocks.push({
          object: 'block', type: 'numbered_list_item',
          numbered_list_item: { rich_text: parseInline(line.replace(/^\d+\. /, '')) }
        });
        continue;
      }
  
      // ── Empty line ──────────────────────────────────────────────────
      if (!line.trim()) continue;
  
      // ── Paragraph ───────────────────────────────────────────────────
      blocks.push({
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: parseInline(line) }
      });
    }
  
    // Flush any trailing table
    if (inTable && tableLines.length) {
      blocks.push(...tableToNotionBlocks(tableLines));
    }
  
    return blocks;
  }
  
  // Build a Notion heading block
  function heading(level, text) {
    const type = `heading_${level}`;
    return {
      object: 'block', type,
      [type]: { rich_text: parseInline(text) }
    };
  }
  
  // Convert markdown table lines to Notion table block
  function tableToNotionBlocks(lines) {
    // Filter out separator rows (| --- | --- |)
    const dataLines = lines.filter(l => !/^[\|\s\-:]+$/.test(l));
    if (!dataLines.length) return [];
  
    const rows = dataLines.map(line => {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      return cells;
    });
  
    const columnCount = Math.max(...rows.map(r => r.length));
    if (columnCount === 0) return [];
  
    return [{
      object: 'block',
      type: 'table',
      table: {
        table_width: columnCount,
        has_column_header: true,
        has_row_header: false,
        children: rows.map((cells, rowIdx) => ({
          object: 'block',
          type: 'table_row',
          table_row: {
            cells: Array.from({ length: columnCount }, (_, i) =>
              cells[i] ? parseInline(cells[i]) : [{ type: 'text', text: { content: '' } }]
            )
          }
        }))
      }
    }];
  }
  
  // Parse inline markdown (bold, italic, code) into Notion rich_text array
  function parseInline(text) {
    const richText = [];
    // Regex to capture **bold**, *italic*, `code`, and plain text
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|([^*`]+))/g;
    let match;
  
    while ((match = regex.exec(text)) !== null) {
      if (match[2]) {
        // **bold**
        richText.push({ type: 'text', text: { content: match[2] }, annotations: { bold: true } });
      } else if (match[3]) {
        // *italic*
        richText.push({ type: 'text', text: { content: match[3] }, annotations: { italic: true } });
      } else if (match[4]) {
        // `code`
        richText.push({ type: 'text', text: { content: match[4] }, annotations: { code: true } });
      } else if (match[5]) {
        // plain text
        const content = match[5];
        if (content) richText.push({ type: 'text', text: { content } });
      }
    }
  
    // Fallback if nothing matched
    if (!richText.length && text.trim()) {
      richText.push({ type: 'text', text: { content: text } });
    }
  
    return richText;
  }