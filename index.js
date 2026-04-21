require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 10000;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ─── COOKIE PARSER ───────────────────────────────────────────
app.use((req, res, next) => {
    const cookies = {};
    if (req.headers.cookie) {
        req.headers.cookie.split(';').forEach(c => {
            const parts = c.trim().split('=');
            const key = parts.shift().trim();
            cookies[key] = decodeURIComponent(parts.join('='));
        });
    }
    req.cookies = cookies;
    next();
});

// ─── GROQ IA ─────────────────────────────────────────────────
async function llamarGroq(prompt) {
    try {
        console.log('[GROQ] Llamando API...');
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1500,
                temperature: 0.7
            })
        });
        const data = await res.json();
        console.log('[GROQ] Status:', res.status);
        if (!res.ok) {
            console.error('[GROQ] Error respuesta:', JSON.stringify(data));
            return null;
        }
        const content = data?.choices?.[0]?.message?.content;
        console.log('[GROQ] OK, chars:', content?.length);
        return content || null;
    } catch (e) {
        console.error('[GROQ] Excepción:', e.message);
        return null;
    }
}

// ─── HELPERS ─────────────────────────────────────────────────
function calcIMC(peso, estatura) {
    return Math.round((peso / Math.pow(estatura / 100, 2)) * 10) / 10;
}

function infoIMC(imc) {
    if (imc < 18.5) return { label: 'Bajo peso',  color: '#ffaa00', pct: 15 };
    if (imc < 25)   return { label: 'Saludable',  color: '#00ff88', pct: 50 };
    if (imc < 30)   return { label: 'Sobrepeso',  color: '#ffaa00', pct: 72 };
    return              { label: 'Obesidad',   color: '#ff4444', pct: 90 };
}

function infoRango(n) {
    if (n < 5)  return { label: 'Novato',     color: '#ffcc00', icons: '🔥💧💎' };
    if (n < 15) return { label: 'Intermedio', color: '#00d4ff', icons: '⚡💪🎯' };
    if (n < 30) return { label: 'Avanzado',   color: '#ff6600', icons: '🏋️🔥⚡' };
    return          { label: 'Élite',      color: '#ff44ff', icons: '🏆👑💎' };
}

function buildPrompt(u) {
    const imc = calcIMC(u.peso, u.estatura);
    const { label: imcLabel } = infoIMC(imc);
    return `Eres un médico deportivo y entrenador personal certificado. Tu misión es crear una rutina FITNESS completamente PERSONALIZADA y SEGURA.

PERFIL DEL PACIENTE:
- Nombre: ${u.nombre} | Sexo: ${u.sexo} | Edad: ${u.edad} años
- Peso actual: ${u.peso}kg | Estatura: ${u.estatura}cm | IMC: ${imc} (${imcLabel})
- Objetivo principal: ${u.objetivo}
- Condiciones médicas / lesiones: ${u.padecimientos || 'Sin restricciones conocidas'}

INSTRUCCIONES OBLIGATORIAS:
1. Si hay padecimientos o lesiones, analízalos con criterio médico y EXCLUYE todos los ejercicios que puedan causarles daño. Explica en 1-2 líneas por qué se evitan.
2. Crea un plan semanal de 5 días (Lun-Vie) con descanso Sáb-Dom.
3. Cada día debe incluir: calentamiento (5 min), ejercicios principales con series/reps, y enfriamiento (5 min).
4. Adapta la intensidad al IMC y objetivo del paciente.
5. Sé motivador, directo y profesional. Tutéa al paciente.
6. Responde ÚNICAMENTE en HTML limpio. Usa SOLO estas etiquetas: <b>, <br>, <ul>, <li>, <h3>, <p>. Sin <html>, sin <head>, sin <body>, sin estilos inline.`;
}

async function getUser(req) {
    try {
        const uid = req.cookies['uid'];
        if (!uid) return null;
        const { data } = await supabase.from('usuarios').select('*').eq('id', uid).single();
        return data || null;
    } catch { return null; }
}

// ─── CSS ─────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Exo+2:wght@300;400;600;700&display=swap');

:root {
    --bg: #090910;
    --card: #111118;
    --card2: #18182a;
    --accent: #00d4ff;
    --accent2: #ff6600;
    --text: #dde0ee;
    --muted: #5a5a7a;
    --danger: #cc2222;
    --green: #00ff88;
    --yellow: #ffcc00;
    --border: rgba(0, 212, 255, 0.1);
    --border2: rgba(255, 255, 255, 0.05);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Exo 2', sans-serif;
    font-size: 16px;
    transition: font-size .25s;
    min-height: 100vh;
    background-image: radial-gradient(ellipse at 80% 0%, rgba(0,212,255,0.04) 0%, transparent 60%);
}

body.zoom-mode { font-size: 20px; }

/* ── TOPBAR ── */
.topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 11px 20px;
    background: rgba(17,17,24,0.95);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(10px);
    flex-wrap: wrap;
    gap: 8px;
}

.topbar-brand {
    font-family: 'Rajdhani', sans-serif;
    font-size: 1.35em;
    color: var(--accent);
    letter-spacing: 4px;
    font-weight: 700;
    text-shadow: 0 0 20px rgba(0,212,255,0.4);
}

.topbar-actions { display: flex; gap: 7px; flex-wrap: wrap; align-items: center; }

.tbtn {
    padding: 7px 14px;
    border-radius: 20px;
    font-family: 'Exo 2', sans-serif;
    font-size: .75em;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: .5px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    color: var(--muted);
    transition: .2s;
    width: auto;
}

.tbtn:hover { border-color: var(--accent); color: var(--accent); background: rgba(0,212,255,0.06); }
.tbtn.on { background: var(--accent); color: #000; border-color: var(--accent); }
.tbtn.red { background: var(--danger); color: #fff; border-color: var(--danger); opacity: .9; }
.tbtn.red:hover { opacity: 1; }

/* ── SIDEBAR ── */
.sidebar {
    position: fixed;
    top: 0; left: -320px;
    width: 300px;
    height: 100%;
    background: #0d0d18;
    border-right: 1px solid rgba(0,212,255,0.15);
    z-index: 300;
    padding: 0;
    transition: left .3s cubic-bezier(.4,0,.2,1);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}
.sidebar.open { left: 0; box-shadow: 6px 0 40px rgba(0,0,0,0.6); }

.sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 18px;
    border-bottom: 1px solid rgba(0,212,255,0.1);
    background: rgba(0,212,255,0.03);
    position: sticky; top: 0;
    z-index: 1;
}
.sidebar-title {
    font-family: 'Rajdhani', sans-serif;
    color: var(--accent);
    font-size: 1em;
    letter-spacing: 3px;
    font-weight: 700;
}
.sidebar-close {
    background: none;
    border: 1px solid rgba(255,255,255,0.1);
    color: var(--muted);
    width: 32px;
    height: 32px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1.1em;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: .2s;
    padding: 0;
    flex-shrink: 0;
}
.sidebar-close:hover { border-color: var(--accent); color: var(--accent); transform: none; box-shadow: none; }

.sidebar-body { padding: 14px; flex: 1; }

.sb-section {
    margin-bottom: 18px;
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 12px;
    overflow: hidden;
}
.sb-section-h {
    padding: 11px 14px;
    font-family: 'Rajdhani', sans-serif;
    font-size: .85em;
    font-weight: 700;
    letter-spacing: 2px;
    color: var(--accent);
    background: rgba(0,212,255,0.04);
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    user-select: none;
    transition: background .2s;
}
.sb-section-h:hover { background: rgba(0,212,255,0.07); }
.sb-section-b { padding: 14px; display: none; }
.sb-section-b.open { display: block; }

.overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 299;
    backdrop-filter: blur(2px);
}
.overlay.show { display: block; }

.ham {
    background: none;
    border: 1px solid rgba(0,212,255,0.2);
    color: var(--accent);
    width: 38px;
    height: 38px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1.2em;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: .2s;
    padding: 0;
    flex-shrink: 0;
}
.ham:hover { background: rgba(0,212,255,0.08); box-shadow: none; transform: none; }

/* ── WRAPPER ── */
.wrap { max-width: 840px; margin: 0 auto; padding: 20px 14px 40px; }

.greeting {
    font-family: 'Rajdhani', sans-serif;
    font-size: 2em;
    font-weight: 700;
    margin-bottom: 20px;
    letter-spacing: 1px;
}
.greeting span { color: var(--accent); }

/* ── STATS GRID ── */
.stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 16px;
}

.sc {
    background: var(--card);
    border: 1px solid var(--border2);
    border-top: 2px solid var(--accent);
    border-radius: 14px;
    padding: 14px 10px;
    text-align: center;
    transition: border-color .2s;
    min-width: 0;
}

.sc:hover { border-top-color: var(--accent); border-color: var(--border); }
.sc .si { font-size: 1.6em; margin-bottom: 4px; }
.sc .sl { font-size: .62em; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; }
.sc .sv { font-family: 'Rajdhani', sans-serif; font-size: 2em; font-weight: 700; line-height: 1; }
.sc .sv.grande { font-size: 2.6em; }
.sc .ss { font-size: .7em; color: var(--muted); margin-top: 4px; }
.sc .ricons { font-size: .85em; letter-spacing: 2px; margin-top: 5px; }

.imc-bar { background: #222; border-radius: 6px; height: 5px; margin-top: 8px; overflow: hidden; }
.imc-fill { height: 100%; border-radius: 6px; transition: width .8s ease; }

@media (max-width: 600px) {
    .stats { grid-template-columns: repeat(2, 1fr); }
}

/* ── CARD BASE ── */
.card {
    background: var(--card);
    border: 1px solid var(--border2);
    border-radius: 16px;
    padding: 20px;
    margin-bottom: 14px;
}

.card.hl { border-left: 3px solid var(--accent); }
.card.hl2 { border-left: 3px solid var(--accent2); }

.card-t {
    font-family: 'Rajdhani', sans-serif;
    font-size: 1.05em;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 2px;
    text-transform: uppercase;
    border-bottom: 1px solid var(--border2);
    padding-bottom: 10px;
    margin-bottom: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

/* ── RUTINA ── */
#rutina { line-height: 1.75; }
#rutina b { color: var(--accent); }
#rutina h3 { color: var(--accent2); margin: 14px 0 6px; font-family: 'Rajdhani', sans-serif; font-size: 1.05em; letter-spacing: 1px; text-transform: uppercase; }
#rutina ul { padding-left: 18px; margin: 8px 0; }
#rutina li { margin-bottom: 6px; }
#rutina p { margin-bottom: 8px; }

/* ── INPUTS ── */
input, select, textarea {
    background: #0e0e18;
    border: 1px solid rgba(255,255,255,0.08);
    color: var(--text);
    padding: 11px 14px;
    border-radius: 10px;
    width: 100%;
    margin-bottom: 12px;
    font-family: 'Exo 2', sans-serif;
    font-size: 1em;
    transition: border .2s, box-shadow .2s;
}

input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(0,212,255,0.08);
}

textarea { min-height: 76px; resize: vertical; }
select option { background: #111118; }
label { display: block; font-size: .78em; color: var(--muted); margin-bottom: 5px; letter-spacing: .5px; text-transform: uppercase; }

/* ── BUTTONS ── */
button {
    padding: 12px;
    background: var(--accent);
    border: none;
    color: #000;
    font-family: 'Exo 2', sans-serif;
    font-weight: 700;
    font-size: 1em;
    cursor: pointer;
    border-radius: 10px;
    width: 100%;
    letter-spacing: .5px;
    transition: .2s;
}

button:hover { opacity: .85; transform: translateY(-1px); box-shadow: 0 4px 15px rgba(0,212,255,0.2); }
button:active { transform: translateY(0); }
button.sec { background: rgba(255,255,255,0.05); color: var(--text); border: 1px solid rgba(255,255,255,0.1); }
button.sec:hover { box-shadow: none; background: rgba(255,255,255,0.08); }
button.red { background: var(--danger); color: #fff; }
button.red:hover { box-shadow: 0 4px 15px rgba(204,34,34,0.3); }
button.orange { background: var(--accent2); color: #fff; }
button.orange:hover { box-shadow: 0 4px 15px rgba(255,102,0,0.3); }

.brow { display: flex; gap: 10px; }
.brow button { flex: 1; }

/* ── PESO UPDATE ── */
.prow { display: flex; gap: 8px; margin-bottom: 10px; align-items: flex-end; }
.prow input { flex: 1; margin-bottom: 0; }
.prow button { width: auto; padding: 11px 18px; white-space: nowrap; flex-shrink: 0; }

/* ── HISTORIAL ── */
.hist { max-height: 170px; overflow-y: auto; margin-top: 8px; }
.hi { display: flex; justify-content: space-between; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--border2); font-size: .88em; }
.hi-f { color: var(--muted); }
.hi-v { color: var(--accent); font-weight: 700; font-family: 'Rajdhani', sans-serif; font-size: 1.1em; }

/* ── NOTAS ── */
.ni-ejemplo {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border2);
    border-left: 2px solid var(--accent2);
    background: rgba(255,102,0,0.04);
    border-radius: 0 6px 6px 0;
    margin-bottom: 6px;
    opacity: 0.75;
}
.ni-ejemplo .ni-f { font-size: .72em; color: var(--accent2); margin-bottom: 3px; letter-spacing: .5px; }
.ni-ejemplo .ni-tag { font-size: .68em; color: var(--accent2); opacity: .7; margin-top: 4px; font-style: italic; }
.ni { padding: 10px 0; border-bottom: 1px solid var(--border2); }
.ni-f { font-size: .72em; color: var(--muted); margin-bottom: 3px; letter-spacing: .5px; }
.notas-list { max-height: 260px; overflow-y: auto; margin-top: 8px; }

/* ── ACCORDION ── */
.acc {
    background: var(--card2);
    border: 1px solid var(--border2);
    border-radius: 14px;
    margin-bottom: 14px;
    overflow: hidden;
}

.acc-h {
    padding: 14px 18px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: 'Rajdhani', sans-serif;
    font-size: 1em;
    font-weight: 700;
    letter-spacing: 2px;
    color: var(--accent);
    user-select: none;
    transition: background .2s;
}

.acc-h:hover { background: rgba(0,212,255,0.04); }
.acc-b { padding: 0 18px; max-height: 0; overflow: hidden; transition: max-height .35s ease, padding .35s; }
.acc-b.open { max-height: 600px; padding: 6px 18px 18px; }

.setting-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 10px; }
.setting-label { font-size: .82em; color: var(--muted); letter-spacing: .5px; }

/* ── MÚSICA ── */
.mbgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 8px; }
.mb {
    padding: 10px 8px;
    font-size: .78em;
    border-radius: 8px;
    background: rgba(255,255,255,0.03);
    color: var(--muted);
    border: 1px solid rgba(255,255,255,0.07);
    cursor: pointer;
    letter-spacing: .5px;
    transition: .2s;
}
.mb:hover { border-color: var(--accent); color: var(--text); }
.mb.on { background: var(--accent); color: #000; border-color: var(--accent); font-weight: 700; }

/* ── VOZ ── */
.voice-row { display: flex; gap: 8px; margin-top: 8px; }
.vb {
    flex: 1;
    padding: 10px;
    font-size: .78em;
    border-radius: 8px;
    background: rgba(255,255,255,0.03);
    color: var(--muted);
    border: 1px solid rgba(255,255,255,0.07);
    cursor: pointer;
    transition: .2s;
    text-align: center;
}
.vb:hover { border-color: var(--accent2); color: var(--text); }
.vb.on { background: var(--accent2); color: #fff; border-color: var(--accent2); font-weight: 700; }

#voiceSelect { margin-bottom: 0; margin-top: 8px; font-size: .88em; }

/* ── LOGIN PAGE ── */
.lp {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background:
        radial-gradient(ellipse 80% 60% at 50% -10%, rgba(0,212,255,0.1) 0%, transparent 60%),
        var(--bg);
}

.lc {
    background: var(--card);
    border: 1px solid rgba(0,212,255,0.2);
    border-radius: 20px;
    padding: 38px 28px;
    width: 100%;
    max-width: 380px;
    box-shadow: 0 0 80px rgba(0,212,255,0.06), 0 0 0 1px rgba(0,212,255,0.05);
}

.logo { text-align: center; margin-bottom: 28px; }
.logo h1 {
    font-family: 'Rajdhani', sans-serif;
    font-size: 2.6em;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 6px;
    text-shadow: 0 0 30px rgba(0,212,255,0.5);
}
.logo p { color: var(--muted); font-size: .8em; margin-top: 6px; letter-spacing: 2px; }

.lnk {
    background: none;
    color: var(--accent);
    border: none;
    font-size: .88em;
    cursor: pointer;
    width: auto;
    padding: 8px;
    text-decoration: underline;
    display: block;
    margin: 6px auto 0;
    transform: none;
    box-shadow: none;
    letter-spacing: 0;
}
.lnk:hover { opacity: .8; transform: none; box-shadow: none; }

.err {
    background: rgba(204,34,34,0.12);
    border: 1px solid rgba(204,34,34,0.3);
    color: #ff6666;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: .85em;
    margin-bottom: 14px;
    text-align: center;
}

/* ── MODAL ── */
.mo {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.88);
    z-index: 500;
    align-items: center;
    justify-content: center;
    padding: 16px;
    backdrop-filter: blur(4px);
}
.mo.open { display: flex; }

.mb2 {
    background: var(--card);
    border: 1px solid rgba(0,212,255,0.2);
    border-radius: 20px;
    padding: 28px;
    width: 100%;
    max-width: 440px;
    max-height: 94vh;
    overflow-y: auto;
}

.mo-t {
    font-family: 'Rajdhani', sans-serif;
    font-size: 1.5em;
    color: var(--accent);
    margin-bottom: 20px;
    letter-spacing: 3px;
}

/* ── SPINNER ── */
.spin-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.92);
    z-index: 999;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    backdrop-filter: blur(6px);
}
.spin-overlay.show { display: flex; }
.spin {
    width: 52px; height: 52px;
    border: 3px solid rgba(0,212,255,0.15);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: sp .75s linear infinite;
    box-shadow: 0 0 20px rgba(0,212,255,0.2);
}
@keyframes sp { to { transform: rotate(360deg); } }
.spin-t {
    color: var(--accent);
    font-family: 'Rajdhani', sans-serif;
    font-size: 1.2em;
    letter-spacing: 4px;
    text-shadow: 0 0 20px rgba(0,212,255,0.5);
}
.spin-sub { color: var(--muted); font-size: .8em; letter-spacing: 1px; }

/* ── DIVIDER ── */
.div { height: 1px; background: var(--border2); margin: 14px 0; }

/* ── SCROLLBAR ── */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.3); border-radius: 2px; }

/* ── RESPONSIVE ── */
@media (max-width: 480px) {
    .stats { gap: 8px; }
    .sc { padding: 12px 8px; }
    .sc .sv { font-size: 1.5em; }
    .sc .si { font-size: 1.6em; }
    .greeting { font-size: 1.7em; }
    .topbar-brand { font-size: 1.1em; letter-spacing: 3px; }
}
`;

// ─── HTML BASE ────────────────────────────────────────────────
const page = (content, title = 'EN-FORMA AI') =>
    `<!DOCTYPE html><html lang="es"><head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>${CSS}</style>
    </head><body>${content}</body></html>`;

// ─── GET /test-ia ─────────────────────────────────────────────
app.get('/test-ia', async (req, res) => {
    const key = process.env.GROQ_API_KEY;
    if (!key) return res.send('❌ GROQ_API_KEY no está configurada en las variables de entorno.');

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: 'Di exactamente esto: "Groq funciona correctamente."' }],
                max_tokens: 50
            })
        });
        const data = await response.json();
        if (!response.ok) {
            return res.send(`❌ Error ${response.status}: ${JSON.stringify(data)}`);
        }
        const msg = data?.choices?.[0]?.message?.content;
        res.send(`✅ Groq responde: "${msg}" — Key: ...${key.slice(-6)}`);
    } catch (e) {
        res.send(`❌ Excepción: ${e.message}`);
    }
});

// ─── GET / ─────────────────────────────────────────────────────
app.get('/', async (req, res) => {
    const user = await getUser(req);
    if (user) return res.redirect('/dashboard');

    const err = req.query.err === '1' ? `<div class="err">Usuario o contraseña incorrectos.</div>` : '';
    const regErr = req.query.regerr ? `<div class="err">${decodeURIComponent(req.query.regerr)}</div>` : '';

    res.send(page(`
    <div class="lp">
        <div class="lc">
            <div class="logo">
                <h1>EN-FORMA</h1>
                <p>ENTRENADOR PERSONAL CON IA</p>
            </div>
            ${err}
            <form action="/login" method="POST" onsubmit="showSpin('ENTRANDO...')">
                <input name="nombre" placeholder="Usuario" required autocomplete="username">
                <input name="password" type="password" placeholder="Contraseña" required autocomplete="current-password">
                <button type="submit">ENTRAR</button>
            </form>
            <button class="lnk" onclick="document.getElementById('modal-reg').classList.add('open')">
                ¿No tienes cuenta? Crear una →
            </button>
        </div>
    </div>

    <!-- MODAL REGISTRO -->
    <div class="mo" id="modal-reg">
        <div class="mb2">
            <div class="mo-t">NUEVA CUENTA</div>
            ${regErr}
            <form action="/registrar" method="POST" onsubmit="showSpin('GENERANDO TU RUTINA CON IA...')">
                <label>Nombre de usuario</label>
                <input name="nombre" placeholder="Ej: carlos92" required>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div>
                        <label>Edad</label>
                        <input name="edad" type="number" min="10" max="100" placeholder="25" required>
                    </div>
                    <div>
                        <label>Sexo</label>
                        <select name="sexo">
                            <option value="Masculino">Hombre</option>
                            <option value="Femenino">Mujer</option>
                        </select>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div>
                        <label>Peso (kg)</label>
                        <input name="peso" type="number" step="0.1" min="30" max="300" placeholder="70" required>
                    </div>
                    <div>
                        <label>Estatura (cm)</label>
                        <input name="estatura" type="number" min="100" max="250" placeholder="175" required>
                    </div>
                </div>

                <label>Objetivo</label>
                <select name="objetivo">
                    <option value="Perder PESO">🔥 Perder PESO</option>
                    <option value="Ganar MÚSCULO">💪 Ganar MÚSCULO</option>
                    <option value="Mejorar RESISTENCIA">🏃 Mejorar RESISTENCIA</option>
                    <option value="Tonificar el CUERPO">✨ Tonificar el CUERPO</option>
                    <option value="Mantenerse en FORMA">⚡ Mantenerse en FORMA</option>
                </select>

                <label>Lesiones o padecimientos (opcional)</label>
                <textarea name="padecimientos" placeholder="Ej: hernia discal L4-L5, dolor de rodilla derecha, hipertensión..."></textarea>

                <label>Contraseña</label>
                <input name="password" type="password" placeholder="Mínimo 6 caracteres" required minlength="6">

                <button type="submit" style="margin-top:6px;">🤖 CREAR CUENTA Y GENERAR RUTINA</button>
            </form>
            <button class="sec" style="margin-top:10px;" onclick="document.getElementById('modal-reg').classList.remove('open')">Cancelar</button>
        </div>
    </div>

    <div class="spin-overlay" id="spinner">
        <div class="spin"></div>
        <div class="spin-t" id="spinMsg">PROCESANDO...</div>
        <div class="spin-sub">Esto puede tardar unos segundos</div>
    </div>

    <script>
    function showSpin(msg) {
        document.getElementById('spinMsg').textContent = msg || 'PROCESANDO...';
        document.getElementById('spinner').classList.add('show');
    }
    // Cerrar modal clicando fuera
    document.getElementById('modal-reg').addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('open');
    });
    </script>
    `));
});

// ─── GET /dashboard ──────────────────────────────────────────
app.get('/dashboard', async (req, res) => {
    const user = await getUser(req);
    if (!user) return res.redirect('/');

    const { data: notas } = await supabase
        .from('notas')
        .select('*')
        .eq('usuario_id', user.id)
        .order('fecha', { ascending: false });

    const notasArr = notas || [];
    const imc = calcIMC(user.peso, user.estatura);
    const imcInfo = infoIMC(imc);
    const rangoInfo = infoRango(notasArr.length);
    const historial = Array.isArray(user.historial_peso) ? user.historial_peso : [];

    // Historial de peso HTML
    const histHTML = historial.length > 0
        ? historial.slice().reverse().map(h =>
            `<div class="hi"><span class="hi-f">${h.fecha}</span><span class="hi-v">${h.peso} kg</span></div>`
          ).join('')
        : `<p style="color:var(--muted);font-size:.85em;padding:8px 0;">Aún no has registrado cambios de peso.</p>`;

    const ejemplosNotas = [
        {
            fecha: 'EJEMPLO — Día 1',
            contenido: 'Primera sesión completada 💪 Hice el calentamiento de 5 min y la rutina completa. Las sentadillas me costaron en las últimas reps. Peso usado: 20kg. Me sentí con energía, sin dolor.'
        },
        {
            fecha: 'EJEMPLO — Día 2',
            contenido: 'Descanso activo. Salí a caminar 30 min a ritmo moderado. Noté que el músculo del cuádriceps está un poco inflamado del día anterior. Mañana retomo la rutina.'
        },
        {
            fecha: 'EJEMPLO — Día 3',
            contenido: 'Subí el peso en press de banca a 25kg — logré 3x10 sin problema. ¡Progreso real! También medí mi cintura: 82cm. La semana pasada eran 84cm. Voy bien 🔥'
        }
    ];

    // Notas HTML
    const notasHTML = notasArr.length > 0
        ? notasArr.slice(0, 20).map(n =>
            `<div class="ni">
                <div class="ni-f">${new Date(n.fecha).toLocaleDateString('es-ES', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</div>
                <div>${n.contenido}</div>
            </div>`
          ).join('')
        : `<p style="color:var(--muted);font-size:.8em;padding:6px 0 10px;">Aún no tienes entradas. Aquí van unos ejemplos de cómo usarlo:</p>` +
          ejemplosNotas.map(e =>
            `<div class="ni-ejemplo">
                <div class="ni-f">${e.fecha}</div>
                <div style="font-size:.88em;line-height:1.5;">${e.contenido}</div>
                <div class="ni-tag">✦ ejemplo — tus notas reales aparecerán aquí</div>
            </div>`
          ).join('');

    // Rutina content
    const rutinaContent = user.consejo_ia
        ? user.consejo_ia
        : `<p style="color:var(--muted);">No se pudo generar la rutina. Usa el botón de abajo para generarla ahora.</p>`;

    res.send(page(`
    <!-- OVERLAY -->
    <div class="overlay" id="overlay" onclick="closeSidebar()"></div>

    <!-- SIDEBAR -->
    <div class="sidebar" id="sidebar">
        <div class="sidebar-header">
            <div class="sidebar-title">⚡ MENÚ</div>
            <button class="sidebar-close" onclick="closeSidebar()">✕</button>
        </div>
        <div class="sidebar-body">

            <!-- CONFIGURACIÓN Y HERRAMIENTAS -->
            <div class="sb-section">
                <div class="sb-section-h" onclick="toggleSb('sb-config')">
                    ⚙️ CONFIGURACIÓN <span>▼</span>
                </div>
                <div class="sb-section-b" id="sb-config">
                    <div style="font-size:.78em;color:var(--muted);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px;">🎙️ Narración</div>
                    <select id="voiceSelect" onchange="updateVoice()"></select>
                    <div class="voice-row">
                        <div class="vb on" id="vb-m" onclick="selectVoz('m')">👨 Entrenador</div>
                        <div class="vb" id="vb-f" onclick="selectVoz('f')">👩 Entrenadora</div>
                    </div>
                    <div class="brow" style="margin-top:10px;">
                        <button onclick="leer()" class="sec">▶ Escuchar</button>
                        <button onclick="detener()" class="sec">⏹ Detener</button>
                    </div>
                    <div class="div"></div>
                    <div style="font-size:.78em;color:var(--muted);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px;">🎧 Música Ambiente</div>
                    <div class="mbgrid">
                        <div class="mb" id="mb-feng" onclick="playMusic('feng')">🌿 Feng Shui</div>
                        <div class="mb" id="mb-clasica" onclick="playMusic('clasica')">🎻 Clásica</div>
                        <div class="mb" id="mb-rock" onclick="playMusic('rock')">🎸 Rock</div>
                        <div class="mb" id="mb-silencio" onclick="playMusic('silencio')">🔇 Silencio</div>
                    </div>
                    <div style="color:var(--muted);font-size:.72em;margin-top:10px;text-align:center;">
                        Volumen:
                        <input type="range" id="volSlider" min="0" max="100" value="30"
                               style="width:100px;height:4px;margin:0 8px;background:#333;border:none;padding:0;margin-bottom:0;display:inline-block;vertical-align:middle;"
                               oninput="setVol(this.value)">
                        <span id="volVal">30%</span>
                    </div>
                    <div class="div"></div>
                    <div style="font-size:.78em;color:var(--muted);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px;">🖥️ Pantalla</div>
                    <div class="brow">
                        <button class="sec tbtn" id="btnZoom2" onclick="toggleZoom()" style="width:auto;flex:1;border-radius:8px;padding:9px;">ZOOM: OFF</button>
                        <button class="sec tbtn" id="btnModo2" onclick="toggleModo()" style="width:auto;flex:1;border-radius:8px;padding:9px;">AHORRO: OFF</button>
                    </div>
                </div>
            </div>

            <!-- ACTUALIZAR PERFIL -->
            <div class="sb-section">
                <div class="sb-section-h" onclick="toggleSb('sb-perfil')">
                    👤 ACTUALIZAR PERFIL <span>▼</span>
                </div>
                <div class="sb-section-b" id="sb-perfil">
                    <form action="/actualizar-perfil" method="POST" onsubmit="showSpin('ACTUALIZANDO PERFIL...')">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                            <div>
                                <label>Peso (kg)</label>
                                <input name="peso" type="number" step="0.1" value="${user.peso}" required>
                            </div>
                            <div>
                                <label>Estatura (cm)</label>
                                <input name="estatura" type="number" value="${user.estatura}" required>
                            </div>
                        </div>
                        <label>Objetivo</label>
                        <select name="objetivo">
                            <option value="Perder PESO" ${user.objetivo === 'Perder PESO' ? 'selected' : ''}>🔥 Perder PESO</option>
                            <option value="Ganar MÚSCULO" ${user.objetivo === 'Ganar MÚSCULO' ? 'selected' : ''}>💪 Ganar MÚSCULO</option>
                            <option value="Mejorar RESISTENCIA" ${user.objetivo === 'Mejorar RESISTENCIA' ? 'selected' : ''}>🏃 Mejorar RESISTENCIA</option>
                            <option value="Tonificar el CUERPO" ${user.objetivo === 'Tonificar el CUERPO' ? 'selected' : ''}>✨ Tonificar el CUERPO</option>
                            <option value="Mantenerse en FORMA" ${user.objetivo === 'Mantenerse en FORMA' ? 'selected' : ''}>⚡ Mantenerse en FORMA</option>
                        </select>
                        <label>Lesiones / Padecimientos</label>
                        <textarea name="padecimientos" placeholder="Actualiza tus lesiones...">${user.padecimientos || ''}</textarea>
                        <div class="brow">
                            <button type="submit" class="sec" style="font-size:.82em;">💾 Guardar</button>
                            <button type="submit" name="regenerar" value="1" class="orange" style="font-size:.82em;">🤖 Guardar + IA</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- NOTAS GUARDADAS -->
            <div class="sb-section">
                <div class="sb-section-h" onclick="toggleSb('sb-notas')">
                    📓 MIS NOTAS <span>▼</span>
                </div>
                <div class="sb-section-b" id="sb-notas">
                    <div class="notas-list">${notasHTML}</div>
                </div>
            </div>

            <!-- CERRAR SESIÓN -->
            <form action="/logout" method="POST" style="margin-top:8px;">
                <button type="submit" class="red">🚪 Cerrar Sesión</button>
            </form>

        </div>
    </div>

    <!-- TOPBAR -->
    <div class="topbar">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <button class="ham" onclick="openSidebar()">☰</button>
            <span style="font-family:'Rajdhani',sans-serif;font-size:1.1em;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Hola, <span style="color:var(--accent);">${user.nombre}</span> 👋</span>
        </div>
        <div class="topbar-brand">EN-FORMA AI</div>
        <div class="topbar-actions">
            <form action="/logout" method="POST" style="display:inline;">
                <button type="submit" class="tbtn red">CERRAR SESIÓN</button>
            </form>
        </div>
    </div>

    <div class="wrap">

        <!-- STATS 2x2 -->
        <div class="stats">
            <div class="sc">
                <div class="sl">PESO ACTUAL</div>
                <div class="sv grande" style="color:var(--accent2);">${user.peso}<small style="font-size:.4em;"> kg</small></div>
            </div>
            <div class="sc">
                <div class="si">🎯</div>
                <div class="sl">Tu meta</div>
                <div class="sv" style="color:var(--accent);font-size:1.2em;">${user.objetivo}</div>
                <div class="ss">${user.sexo}</div>
            </div>
            <div class="sc">
                <div class="si">🏅</div>
                <div class="sl">Tu rango</div>
                <div class="sv" style="color:${rangoInfo.color};">${rangoInfo.label}</div>
                <div class="ricons">${rangoInfo.icons}</div>
            </div>
            <div class="sc">
                <div class="si">❤️</div>
                <div class="sl">Índice de salud (IMC)</div>
                <div class="sv" style="color:${imcInfo.color};">${imc}</div>
                <div class="ss">Estado: ${imcInfo.label}</div>
                <div class="imc-bar"><div class="imc-fill" style="width:${imcInfo.pct}%;background:${imcInfo.color};"></div></div>
            </div>
        </div>

        <!-- EVOLUCIÓN DE PESO -->
        <div class="acc">
            <div class="acc-h" onclick="toggleAcc('hist-body')">
                📈 EVOLUCIÓN DEL PESO
                <span class="arr">▼</span>
            </div>
            <div class="acc-b" id="hist-body">
                <form action="/actualizar-peso" method="POST" onsubmit="showSpin('GUARDANDO PESO...')">
                    <div class="prow">
                        <input name="peso" type="number" step="0.1" min="30" max="300" placeholder="Nuevo peso (kg)" required>
                        <button type="submit" class="orange">Registrar</button>
                    </div>
                </form>
                ${historial.length >= 1 ? `
                <div style="position:relative;margin-top:12px;margin-bottom:8px;">
                    <canvas id="pesoChart" height="140"></canvas>
                    <div id="chartPlaceholder" style="text-align:center;padding:20px 0;color:var(--muted);font-size:.82em;display:none;">Registra más pesos para ver tu evolución</div>
                </div>
                ` : `<p style="color:var(--muted);font-size:.82em;padding:8px 0;">Registra tu primer peso para ver la gráfica.</p>`}
                <div class="hist">${histHTML}</div>
            </div>
        </div>

        <!-- RUTINA IA -->
        <div class="card hl">
            <div class="card-t">
                🤖 TU PLAN PERSONALIZADO
                <form action="/regenerar" method="POST" style="display:inline;" onsubmit="showSpin('GENERANDO NUEVA RUTINA CON IA...')">
                    <button type="submit" class="orange" style="width:auto;padding:7px 14px;font-size:.75em;letter-spacing:.5px;">🔄 Regenerar</button>
                </form>
            </div>
            <div id="rutina" class="rutina">${rutinaContent}</div>
        </div>

        <!-- DIARIO -->
        <div class="card hl2">
            <div class="card-t">📓 DIARIO DE ENTRENAMIENTO</div>
            <form action="/guardar-nota" method="POST" onsubmit="showSpin('GUARDANDO NOTA...')">
                <textarea name="contenido" placeholder="¿Cómo fue el entreno de hoy? Anota tus series, cómo te sentiste, tu progreso..." required></textarea>
                <button type="submit">💾 Guardar entrada</button>
            </form>
            <p style="color:var(--muted);font-size:.78em;margin-top:10px;text-align:center;">📂 Ver notas guardadas → abre el menú ☰</p>
        </div>

    </div><!-- /wrap -->

    <!-- SPINNER -->
    <div class="spin-overlay" id="spinner">
        <div class="spin"></div>
        <div class="spin-t" id="spinMsg">PROCESANDO...</div>
        <div class="spin-sub">Un momento por favor</div>
    </div>

    <script>
    // ── SIDEBAR ───────────────────────────────────────────────
    function openSidebar() {
        document.getElementById('sidebar').classList.add('open');
        document.getElementById('overlay').classList.add('show');
        document.body.style.overflow = 'hidden';
    }
    function closeSidebar() {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('overlay').classList.remove('show');
        document.body.style.overflow = '';
    }
    function toggleSb(id) {
        const b = document.getElementById(id);
        const isOpen = b.classList.contains('open');
        // cerrar todos
        document.querySelectorAll('.sb-section-b').forEach(x => x.classList.remove('open'));
        document.querySelectorAll('.sb-section-h span').forEach(x => x.textContent = '▼');
        if (!isOpen) {
            b.classList.add('open');
            b.previousElementSibling.querySelector('span').textContent = '▲';
        }
    }

    // ── ZOOM ──────────────────────────────────────────────────
    let zoomOn = false;
    function toggleZoom() {
        zoomOn = !zoomOn;
        document.body.classList.toggle('zoom-mode', zoomOn);
        const label = 'ZOOM: ' + (zoomOn ? 'ON' : 'OFF');
        const b2 = document.getElementById('btnZoom2');
        if (b2) { b2.textContent = label; b2.classList.toggle('on', zoomOn); }
    }

    // ── MODO AHORRO ───────────────────────────────────────────
    let modoAhorro = false;
    const fontLink = document.querySelector('link[href*="fonts.googleapis"]');

    function toggleModo() {
        modoAhorro = !modoAhorro;
        const label = 'AHORRO: ' + (modoAhorro ? 'ON' : 'OFF');
        const b2 = document.getElementById('btnModo2');
        if (b2) { b2.textContent = label; b2.classList.toggle('on', modoAhorro); }

        if (modoAhorro) {
            // 1. Desactivar fuentes externas (Google Fonts)
            if (fontLink) fontLink.disabled = true;
            // 2. Fondo negro puro, sin gradientes
            document.documentElement.style.setProperty('--bg', '#000');
            document.documentElement.style.setProperty('--card', '#080808');
            document.documentElement.style.setProperty('--card2', '#0a0a0a');
            // 3. Quitar animaciones y transiciones
            const st = document.createElement('style');
            st.id = 'ahorro-style';
            st.textContent = '* { animation: none !important; transition: none !important; } body { background-image: none !important; } .topbar { backdrop-filter: none !important; } .sidebar { backdrop-filter: none !important; } .si, .ricons { display: none !important; }';
            document.head.appendChild(st);
            // 4. Ocultar emojis decorativos en botones y secciones
            document.querySelectorAll('.acc-h, .card-t, .sb-section-h').forEach(el => {
                el.dataset.orig = el.innerHTML;
                el.innerHTML = el.innerText;
            });
            // 5. Detener música y TTS
            if (audio) { audio.pause(); audio = null; currentMusic = null; }
            document.querySelectorAll('.mb').forEach(b => b.classList.remove('on'));
            window.speechSynthesis.cancel();
        } else {
            // Restaurar todo
            if (fontLink) fontLink.disabled = false;
            document.documentElement.style.removeProperty('--bg');
            document.documentElement.style.removeProperty('--card');
            document.documentElement.style.removeProperty('--card2');
            const st = document.getElementById('ahorro-style');
            if (st) st.remove();
            document.querySelectorAll('.acc-h, .card-t, .sb-section-h').forEach(el => {
                if (el.dataset.orig) el.innerHTML = el.dataset.orig;
            });
        }
    }

    // ── ACCORDION (main) ──────────────────────────────────────
    function toggleAcc(id) {
        const b = document.getElementById(id);
        b.classList.toggle('open');
        const arr = b.previousElementSibling.querySelector('.arr');
        if (arr) arr.textContent = b.classList.contains('open') ? '▲' : '▼';
        // Cargar gráfica al abrir evolución de peso
        if (id === 'hist-body' && b.classList.contains('open') && !chartLoaded && histData.length >= 1) {
            chartLoaded = true;
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
            s.onload = () => setTimeout(initChart, 60);
            document.head.appendChild(s);
        }
    }

    // ── SPINNER ───────────────────────────────────────────────
    function showSpin(msg) {
        document.getElementById('spinMsg').textContent = msg || 'PROCESANDO...';
        document.getElementById('spinner').classList.add('show');
    }

    // ── TTS ───────────────────────────────────────────────────
    let voices = [];
    let selectedVoice = null;
    let vocesMasculinas = [];
    let vocesFemeninas = [];
    let modoVoz = 'm';

    function loadVoices() {
        voices = window.speechSynthesis.getVoices();
        const esp = voices.filter(v => v.lang.startsWith('es') || v.lang.startsWith('Es'));
        vocesMasculinas = esp.filter(v => /male|hombre|diego|pablo|jorge|miguel/i.test(v.name));
        vocesFemeninas = esp.filter(v => /female|mujer|marta|laura|paulina|Monica|helena/i.test(v.name));
        const sel = document.getElementById('voiceSelect');
        if (!sel) return;
        sel.innerHTML = '';
        esp.forEach((v, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = v.name + ' (' + v.lang + ')';
            sel.appendChild(opt);
        });
        updateVoice();
    }

    window.speechSynthesis.onvoiceschanged = loadVoices;
    setTimeout(loadVoices, 300);

    function selectVoz(genero) {
        modoVoz = genero;
        document.getElementById('vb-m').classList.toggle('on', genero === 'm');
        document.getElementById('vb-f').classList.toggle('on', genero === 'f');
        updateVoice();
    }

    function updateVoice() {
        const sel = document.getElementById('voiceSelect');
        if (!sel) return;
        const esp = voices.filter(v => v.lang.startsWith('es') || v.lang.startsWith('Es'));
        if (modoVoz === 'm' && vocesMasculinas.length > 0) {
            selectedVoice = vocesMasculinas[0];
            const idx = esp.findIndex(v => v.name === selectedVoice.name);
            if (idx >= 0) sel.value = idx;
        } else if (modoVoz === 'f' && vocesFemeninas.length > 0) {
            selectedVoice = vocesFemeninas[0];
            const idx = esp.findIndex(v => v.name === selectedVoice.name);
            if (idx >= 0) sel.value = idx;
        } else {
            const esp2 = voices.filter(v => v.lang.startsWith('es'));
            selectedVoice = esp2[parseInt(sel.value)] || null;
        }
    }

    function leer() {
        const s = window.speechSynthesis;
        s.cancel();
        const text = document.getElementById('rutina').innerText;
        if (!text.trim()) return;
        const u = new SpeechSynthesisUtterance(text);
        const sel = document.getElementById('voiceSelect');
        const esp = voices.filter(v => v.lang.startsWith('es'));
        u.voice = esp[parseInt(sel.value)] || selectedVoice;
        u.lang = 'es-ES';
        u.rate = 0.88;
        u.pitch = modoVoz === 'm' ? 0.85 : 1.1;
        s.speak(u);
    }

    function detener() { window.speechSynthesis.cancel(); }

    // ── MÚSICA ────────────────────────────────────────────────
    let audio = null;
    let currentMusic = null;
    const streams = {
        feng:    'https://streams.ilovemusic.de/iloveradio17.mp3',
        clasica: 'https://streaming.radio.co/s3f4e57df4/listen',
        rock:    'https://streams.ilovemusic.de/iloveradio2.mp3'
    };

    function playMusic(style) {
        document.querySelectorAll('.mb').forEach(b => b.classList.remove('on'));
        if (audio) { audio.pause(); audio = null; }
        if (style === 'silencio' || style === currentMusic) {
            currentMusic = null;
            document.getElementById('mb-silencio')?.classList.add('on');
            return;
        }
        document.getElementById('mb-' + style)?.classList.add('on');
        currentMusic = style;
        if (streams[style]) {
            audio = new Audio(streams[style]);
            audio.volume = parseInt(document.getElementById('volSlider').value) / 100;
            audio.loop = true;
            audio.play().catch(e => console.log('Audio bloqueado:', e));
        }
    }

    function setVol(v) {
        document.getElementById('volVal').textContent = v + '%';
        if (audio) audio.volume = v / 100;
    }

    // ── GRÁFICA DE PESO ────────────────────────────────────────
    const histData = ${JSON.stringify(historial)};
    let chartInstance = null;
    let chartLoaded = false;

    function initChart() {
        const canvas = document.getElementById('pesoChart');
        if (!canvas || chartInstance) return;
        if (histData.length < 2) {
            canvas.style.display = 'none';
            const ph = document.getElementById('chartPlaceholder');
            if (ph) ph.style.display = 'block';
            return;
        }
        if (!window.Chart) return;
        chartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: histData.map(h => h.fecha),
                datasets: [{
                    label: 'Peso kg',
                    data: histData.map(h => h.peso),
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0,212,255,0.07)',
                    borderWidth: 2,
                    pointBackgroundColor: '#ff6600',
                    pointBorderColor: '#00d4ff',
                    pointRadius: 5,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#111118',
                        borderColor: '#00d4ff',
                        borderWidth: 1,
                        titleColor: '#00d4ff',
                        bodyColor: '#dde0ee',
                        callbacks: { label: ctx => ctx.parsed.y + ' kg' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#5a5a7a', font: { size: 10 }, maxRotation: 45 },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    },
                    y: {
                        ticks: { color: '#5a5a7a', font: { size: 10 }, callback: v => v + ' kg' },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    }
                }
            }
        });
    }

    </script>
    `));
});

// ─── POST /login ──────────────────────────────────────────────
app.post('/login', async (req, res) => {
    try {
        const { nombre, password } = req.body;
        const { data: u } = await supabase.from('usuarios').select('*').eq('nombre', nombre).single();
        if (u && await bcrypt.compare(password, u.password)) {
            res.setHeader('Set-Cookie', `uid=${u.id}; Path=/; HttpOnly; Max-Age=604800`);
            return res.redirect('/dashboard');
        }
        res.redirect('/?err=1');
    } catch (e) {
        console.error('Login error:', e);
        res.redirect('/?err=1');
    }
});

// ─── POST /registrar ──────────────────────────────────────────
app.post('/registrar', async (req, res) => {
    try {
        const { nombre, edad, peso, estatura, password, objetivo, sexo, padecimientos } = req.body;

        // Verificar que el usuario no exista
        const { data: existe } = await supabase.from('usuarios').select('id').eq('nombre', nombre).single();
        if (existe) {
            return res.redirect('/?regerr=' + encodeURIComponent('Ese nombre de usuario ya existe.'));
        }

        const hashed = await bcrypt.hash(password, 10);
        const userObj = { nombre, edad: parseInt(edad), peso: parseFloat(peso), estatura: parseInt(estatura), sexo, objetivo, padecimientos, password: hashed };

        const consejo = await llamarGroq(buildPrompt(userObj));

        const { data, error } = await supabase.from('usuarios').insert([{
            ...userObj,
            consejo_ia: consejo || 'Usa el botón Regenerar para generar tu rutina.',
            historial_peso: [{ peso: parseFloat(peso), fecha: new Date().toISOString().split('T')[0] }]
        }]).select();

        if (error) throw error;

        res.setHeader('Set-Cookie', `uid=${data[0].id}; Path=/; HttpOnly; Max-Age=604800`);
        res.redirect('/dashboard');
    } catch (e) {
        console.error('Registro error:', e);
        res.redirect('/?regerr=' + encodeURIComponent('Error en el registro: ' + e.message));
    }
});

// ─── GET /regenerar ───────────────────────────────────────────
app.get('/regenerar', async (req, res) => {
    const user = await getUser(req);
    if (!user) return res.redirect('/');
    const consejo = await llamarGroq(buildPrompt(user));
    if (consejo) {
        await supabase.from('usuarios').update({ consejo_ia: consejo }).eq('id', user.id);
    }
    res.redirect('/dashboard');
});

// ─── POST /regenerar ──────────────────────────────────────────
app.post('/regenerar', async (req, res) => {
    const user = await getUser(req);
    if (!user) return res.redirect('/');
    const consejo = await llamarGroq(buildPrompt(user));
    if (consejo) {
        await supabase.from('usuarios').update({ consejo_ia: consejo }).eq('id', user.id);
    }
    res.redirect('/dashboard');
});

// ─── POST /actualizar-peso ────────────────────────────────────
app.post('/actualizar-peso', async (req, res) => {
    const user = await getUser(req);
    if (!user) return res.redirect('/');

    const nuevoPeso = parseFloat(req.body.peso);
    if (isNaN(nuevoPeso)) return res.redirect('/dashboard');

    const historial = Array.isArray(user.historial_peso) ? user.historial_peso : [];
    historial.push({ peso: nuevoPeso, fecha: new Date().toISOString().split('T')[0] });
    if (historial.length > 50) historial.splice(0, historial.length - 50);

    await supabase.from('usuarios').update({ peso: nuevoPeso, historial_peso: historial }).eq('id', user.id);
    res.redirect('/dashboard');
});

// ─── POST /actualizar-perfil ──────────────────────────────────
app.post('/actualizar-perfil', async (req, res) => {
    const user = await getUser(req);
    if (!user) return res.redirect('/');

    const updates = {
        peso:        parseFloat(req.body.peso) || user.peso,
        estatura:    parseInt(req.body.estatura) || user.estatura,
        objetivo:    req.body.objetivo || user.objetivo,
        padecimientos: req.body.padecimientos || ''
    };

    // Si el peso cambió, agregarlo al historial
    if (updates.peso !== user.peso) {
        const historial = Array.isArray(user.historial_peso) ? user.historial_peso : [];
        historial.push({ peso: updates.peso, fecha: new Date().toISOString().split('T')[0] });
        updates.historial_peso = historial;
    }

    // Si solicitó regenerar rutina
    if (req.body.regenerar === '1') {
        const mergedUser = { ...user, ...updates };
        const consejo = await llamarGroq(buildPrompt(mergedUser));
        if (consejo) updates.consejo_ia = consejo;
    }

    await supabase.from('usuarios').update(updates).eq('id', user.id);
    res.redirect('/dashboard');
});

// ─── POST /guardar-nota ───────────────────────────────────────
app.post('/guardar-nota', async (req, res) => {
    const user = await getUser(req);
    if (user && req.body.contenido?.trim()) {
        await supabase.from('notas').insert([{
            usuario_id: user.id,
            contenido: req.body.contenido.trim()
        }]);
    }
    res.redirect('/dashboard');
});

// ─── POST /logout ─────────────────────────────────────────────
app.post('/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'uid=; Path=/; Max-Age=0; HttpOnly');
    res.redirect('/');
});

// ─── START ───────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`EN-FORMA AI corriendo en puerto ${PORT}`);
});
