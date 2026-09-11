import 'dotenv/config';
import express from 'express';
import { OpenAI } from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const API_KEY = process.env.DEEPSEEK_API_KEY;

if (!API_KEY) {
  console.warn('[qmind] WARNING: DEEPSEEK_API_KEY not set. Copy .env.example to .env and add your key.');
}

const openai = new OpenAI({ baseURL: BASE_URL, apiKey: API_KEY || 'missing' });
const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `You are an expert at generating draw.io diagrams. You output ONLY valid draw.io XML.

OUTPUT RULES (strict):
- Respond with ONLY a single <mxGraphModel ...>...</mxGraphModel> XML block. No prose, no markdown fences, no explanation.
- The XML must begin with <mxGraphModel and end with </mxGraphModel>.
- Always include the two mandatory root cells first: <mxCell id="0"/> and <mxCell id="1" parent="0"/>.
- All diagram elements must have parent="1".
- Vertices use vertex="1", edges use edge="1" (mutually exclusive).
- IDs must be unique across the diagram. Use simple incrementing ids: "2","3","4","5"...
- Every vertex must have a child <mxGeometry x=".." y=".." width=".." height=".." as="geometry"/>.
- Edges must reference source and target vertex ids and contain <mxGeometry relative="1" as="geometry"/>.
- Style strings are semicolon-separated key=value pairs, ending with a semicolon. Prefer: rounded=1;whiteSpace=wrap;html=1;
- Coordinates: origin (0,0) is top-left, x increases right, y increases down. NEVER overlap boxes. Space vertices at least 160px horizontally and 120px vertically. Lay out top-to-bottom for flows, left-to-right for mind maps.

SHAPE GUIDE:
- Flowchart: start/end = ellipse; process = rounded=1 rectangle; decision = rhombus; data = cylinder; datastores = cylinder.
- Mind map: central topic = large ellipse, branches = rounded rectangles connected by labeled edges; sub-branches = text shapes.
- Architecture: use swimlane containers, cylinder for datastores, cloud for external services, mxgraph component boxes.
- Use fillColor/strokeColor/fontColor with hex (#RRGGBB). Suggested palette: blue #dae8fc, green #d5e8d4, yellow #fff2cc, orange #ffe6cc, purple #e1d5e7, red #f8cecc.

MODIFYING (multi-turn):
- When the user provides CURRENT XML and asks to modify it, take that XML, apply ONLY the requested change, and return the FULL updated <mxGraphModel> XML.
- Preserve existing ids and positions unless the change requires moving things. Keep other elements stable.

Always return a complete, self-consistent, non-overlapping diagram.`;

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }
  if (!API_KEY) {
    // DEV MOCK: lets the full pipeline (prompt -> XML -> iframe) be exercised
    // without a real key. Replace DEEPSEEK_API_KEY in .env for real AI output.
    const mock = mockDiagram(messages[messages.length - 1]?.content || '');
    console.warn('[qmind] MOCK MODE: returning sample diagram (no DEEPSEEK_API_KEY set)');
    return res.json({ xml: mock, raw: mock, model: MODEL + ' (mock)', mock: true });
  }
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.4,
      max_tokens: 8000,
    });
    const content = completion.choices?.[0]?.message?.content || '';
    const xml = extractXml(content);
    res.json({ xml, raw: content, model: MODEL });
  } catch (err) {
    console.error('[qmind] /api/chat error:', err?.message || err);
    res.status(502).json({ error: err?.message || 'upstream error' });
  }
});

function extractXml(text) {
  if (!text) return '';
  let t = text.trim();
  const fence = t.match(/```(?:xml|html)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const end = t.lastIndexOf('</mxGraphModel>');
  const start = t.indexOf('<mxGraphModel');
  if (start >= 0 && end > start) {
    return t.slice(start, end + '</mxGraphModel>'.length);
  }
  // accept a full <mxfile> wrapper too
  const s2 = t.indexOf('<mxfile');
  const e2 = t.lastIndexOf('</mxfile>');
  if (s2 >= 0 && e2 > s2) return t.slice(s2, e2 + '</mxfile>'.length);
  return t;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, model: MODEL, hasKey: Boolean(API_KEY) }));

// Minimal sample diagram for dev verification when no API key is present.
function mockDiagram(prompt) {
  const label = (prompt && prompt.length) ? prompt.slice(0, 24) : '示例流程';
  return `<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="2" value="开始" style="ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
      <mxGeometry x="120" y="80" width="100" height="50" as="geometry"/>
    </mxCell>
    <mxCell id="3" value="${escapeXml(label)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="100" y="180" width="140" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="4" value="结束" style="ellipse;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
      <mxGeometry x="120" y="300" width="100" height="50" as="geometry"/>
    </mxCell>
    <mxCell id="5" style="edgeStyle=orthogonalEdgeStyle;html=1;rounded=0;" edge="1" parent="1" source="2" target="3">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="6" style="edgeStyle=orthogonalEdgeStyle;html=1;rounded=0;" edge="1" parent="1" source="3" target="4">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>`;
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

app.listen(PORT, () => {
  console.log(`[qmind] running at http://localhost:${PORT} (model=${MODEL})`);
});
