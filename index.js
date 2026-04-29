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

function buildPromptDieta(u) {
    const imc = calcIMC(u.peso, u.estatura);
    const { label: imcLabel } = infoIMC(imc);
    return `Eres un nutricionista deportivo y médico. Basándote en el perfil del paciente, crea:

1. UN PLAN DE DIETA REALISTA y específico para su objetivo
2. RECOMENDACIONES MÉDICAS para sus lesiones o padecimientos (siempre indicando consultar al especialista)

PERFIL:
- Nombre: ${u.nombre} | Sexo: ${u.sexo} | Edad: ${u.edad} años
- Peso: ${u.peso}kg | Estatura: ${u.estatura}cm | IMC: ${imc} (${imcLabel})
- Objetivo: ${u.objetivo}
- Lesiones/Padecimientos: ${u.padecimientos || 'Ninguno'}

INSTRUCCIONES:
- La dieta debe ser práctica, con alimentos accesibles y porciones claras
- Incluye desayuno, almuerzo, merienda y cena de ejemplo
- Para las lesiones: explica qué alimentos o suplementos pueden ayudar a la recuperación, y qué evitar
- SIEMPRE añade al final: "⚕️ Consulta a tu médico o especialista antes de hacer cambios en tu alimentación o tratamiento."
- Responde ÚNICAMENTE en HTML limpio. Solo estas etiquetas: <b>, <br>, <ul>, <li>, <h3>, <p>. Sin estilos inline.`;
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
    const sinLesiones = !u.padecimientos || u.padecimientos.trim() === '' || u.padecimientos.toLowerCase().includes('ninguna') || u.padecimientos.toLowerCase().includes('no tengo');
    return `Eres un médico deportivo y entrenador personal certificado de alto rendimiento. Crea una rutina FITNESS INTENSA y COMPLETA para 5 días.

PERFIL DEL ATLETA:
- Nombre: ${u.nombre} | Sexo: ${u.sexo} | Edad: ${u.edad} años
- Peso: ${u.peso}kg | Estatura: ${u.estatura}cm | IMC: ${imc} (${imcLabel})
- Objetivo: ${u.objetivo}
- Condición médica / lesiones: ${u.padecimientos || 'NINGUNA — atleta sano, puede trabajar al máximo'}

REGLAS OBLIGATORIAS:
${sinLesiones
    ? '- El atleta está SANO. Genera una rutina EXIGENTE con alto volumen de trabajo, series pesadas (4-5 series, 8-12 reps con carga progresiva), ejercicios compuestos, y ritmo intenso. No simplificar.'
    : '- ANALIZA cada lesión/padecimiento con criterio médico y EXCLUYE ejercicios peligrosos. Explica brevemente por qué se evitan.'
}
- Plan de 5 días: Lunes, Martes, Miércoles, Jueves, Viernes. Sábado y Domingo descanso activo.
- Cada día: calentamiento específico (5-8 min), bloque principal con 6-8 ejercicios mínimo, series/reps/descanso exactos, enfriamiento (5 min).
- Varía los grupos musculares. No repetir los mismos ejercicios dos días seguidos.
- Usa lenguaje motivador y directo. Tutea al usuario.
- FORMATO OBLIGATORIO: Usa EXACTAMENTE estas etiquetas HTML: <h3> para cada día, <b> para nombres de ejercicios, <ul><li> para listas, <p> para texto. NADA más. Sin HTML, sin head, sin body, sin estilos.
- Empieza DIRECTAMENTE con <h3>Lunes: [nombre del día]</h3> sin introducción previa.`;
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
    --card: #111118ee;
    --card2: #18182aee;
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
    background-image:
        linear-gradient(to bottom, rgba(9,9,16,0.82) 0%, rgba(9,9,16,0.75) 50%, rgba(9,9,16,0.9) 100%),
        url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1400&q=80&auto=format&fit=crop');
    background-size: cover;
    background-position: center;
    background-attachment: fixed;
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
    min-height: 110px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
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

#dieta { line-height: 1.75; }
#dieta b { color: #00ff88; }
#dieta h3 { color: #00ff88; margin: 14px 0 6px; font-family: 'Rajdhani', sans-serif; font-size: 1.05em; letter-spacing: 1px; text-transform: uppercase; }
#dieta ul { padding-left: 18px; margin: 8px 0; }
#dieta li { margin-bottom: 6px; }
#dieta p { margin-bottom: 8px; }

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

/* ── LAYOUT CON PANEL FIJO ── */
.main-layout {
    display: flex;
    gap: 0;
    align-items: flex-start;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 14px;
}
.main-content { flex: 1; min-width: 0; padding: 20px 16px 40px 0; }
.side-panel {
    width: 240px;
    flex-shrink: 0;
    position: sticky;
    top: 56px;
    height: calc(100vh - 56px);
    overflow-y: auto;
    padding: 16px 0 16px 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    scrollbar-width: none;
}
.side-panel::-webkit-scrollbar { display: none; }

@media (max-width: 768px) {
    .main-layout { flex-direction: column; padding: 0 10px; }
    .main-content { padding: 16px 0 120px; }
    .side-panel {
        position: fixed;
        bottom: 0; left: 0; right: 0;
        width: 100%;
        height: auto;
        top: auto;
        flex-direction: row;
        background: rgba(9,9,16,0.97);
        border-top: 1px solid rgba(0,212,255,0.15);
        padding: 8px 12px;
        z-index: 200;
        backdrop-filter: blur(10px);
        gap: 8px;
        align-items: center;
        overflow-x: auto;
        overflow-y: hidden;
    }
}

/* ── AVATAR PANEL ── */
.avatar-panel {
    background: rgba(17,17,24,0.9);
    border: 1px solid rgba(0,212,255,0.15);
    border-radius: 16px;
    padding: 12px;
    text-align: center;
    backdrop-filter: blur(10px);
}
.avatar-panel svg { width: 100%; max-width: 210px; height: auto; display: block; margin: 0 auto; }
.trainer-name {
    font-family: 'Rajdhani', sans-serif;
    font-size: .95em;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 2px;
    margin-top: 6px;
}
.trainer-status {
    font-size: .7em;
    color: var(--muted);
    margin: 4px 0 8px;
    min-height: 1em;
}
.trainer-speak-btn {
    padding: 7px 12px;
    border-radius: 8px;
    font-size: .75em;
    font-weight: 700;
    background: var(--accent);
    color: #000;
    border: none;
    cursor: pointer;
    width: 100%;
    transition: .2s;
}
.trainer-speak-btn:hover { opacity: .85; transform: none; box-shadow: none; }
.trainer-speak-btn.speaking { background: var(--accent2); color: #fff; animation: speakPulse 1s infinite; }
@keyframes speakPulse { 0%,100%{opacity:1} 50%{opacity:.7} }

/* ── CRONO PANEL ── */
.crono-panel {
    background: rgba(17,17,24,0.9);
    border: 1px solid rgba(0,212,255,0.15);
    border-radius: 16px;
    padding: 12px;
    text-align: center;
    backdrop-filter: blur(10px);
}
.crono-label { font-size:.65em; color:var(--muted); letter-spacing:2px; text-transform:uppercase; margin-bottom:6px; }
.crono-display {
    font-family: 'Rajdhani', sans-serif;
    font-size: 2.8em;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 3px;
    text-shadow: 0 0 20px rgba(0,212,255,0.4);
    line-height: 1;
    margin: 4px 0 8px;
}
.crono-display.warning { color: var(--yellow); text-shadow: 0 0 20px rgba(255,204,0,0.4); }
.crono-display.danger  { color: #ff4444; text-shadow: 0 0 20px rgba(255,68,68,0.4); animation: pulse .6s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }

.crono-preset { display:flex; gap:4px; justify-content:center; flex-wrap:wrap; margin-bottom:8px; }
.cpbtn {
    padding:4px 8px; border-radius:12px; font-size:.68em; font-weight:700;
    background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1);
    color:var(--muted); cursor:pointer; transition:.2s; width:auto;
}
.cpbtn:hover { border-color:var(--accent); color:var(--accent); transform:none; box-shadow:none; }
.cpbtn.on { background:var(--accent); color:#000; border-color:var(--accent); }
.crono-input-row { display:flex; gap:4px; justify-content:center; align-items:center; margin-bottom:8px; }
.crono-input-row input { width:46px; text-align:center; font-family:'Rajdhani',sans-serif; font-size:1em; margin-bottom:0; padding:6px 4px; }
.crono-input-row span { color:var(--muted); font-size:1.2em; }
.crono-btns { display:flex; gap:6px; justify-content:center; }
.crono-btns button { width:auto; padding:7px 10px; flex:1; font-size:.78em; }

/* Avatar animations */
@keyframes blink { 0%,88%,100%{transform:scaleY(1)} 92%{transform:scaleY(0.08)} }
@keyframes headBob { 0%,100%{transform:translateY(0) rotate(0deg)} 30%{transform:translateY(-1.5px) rotate(.5deg)} 70%{transform:translateY(1px) rotate(-.3deg)} }
@keyframes armLTalk { 0%,100%{transform:rotate(0deg)} 50%{transform:rotate(-12deg)} }
@keyframes armRTalk { 0%,100%{transform:rotate(0deg)} 50%{transform:rotate(12deg)} }
@keyframes breathe { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(1.015)} }
.avatar-body { transform-origin: center top; animation: breathe 3s ease-in-out infinite; }
.avatar-head { transform-origin: 50% 100%; }
.avatar-head.talking { animation: headBob .5s ease-in-out infinite; }
.eye-l, .eye-r { transform-origin: center; animation: blink 5s infinite; }
.arm-l { transform-origin: 72% 35%; }
.arm-r { transform-origin: 28% 35%; }
.arm-l.talking { animation: armLTalk .6s ease-in-out infinite; }
.arm-r.talking { animation: armRTalk .6s ease-in-out infinite alternate; }

/* ── MENSAJES BADGE ── */
.msg-btn {
    position:relative; background:none;
    border:1px solid rgba(0,212,255,0.2);
    color:var(--accent); width:38px; height:38px;
    border-radius:8px; cursor:pointer; font-size:1.1em;
    display:flex; align-items:center; justify-content:center;
    transition:.2s; padding:0; flex-shrink:0;
}
.msg-btn:hover { background:rgba(0,212,255,0.08); box-shadow:none; transform:none; }
.msg-badge {
    position:absolute; top:-6px; right:-6px;
    background:#ff4444; color:#fff;
    border-radius:50%; width:18px; height:18px;
    font-size:.65em; font-weight:700;
    display:flex; align-items:center; justify-content:center;
    border:2px solid var(--bg);
}

/* ── MODAL MENSAJES ── */
.msg-list { max-height:340px; overflow-y:auto; margin-bottom:14px; }
.msg-item {
    padding:10px 12px; border-radius:10px; margin-bottom:8px;
    font-size:.88em; line-height:1.5;
}
.msg-item.del-admin {
    background:rgba(0,212,255,0.06);
    border-left:3px solid var(--accent);
}
.msg-item.del-user {
    background:rgba(255,102,0,0.06);
    border-left:3px solid var(--accent2);
    text-align:right;
}
.msg-item .msg-meta { font-size:.7em; color:var(--muted); margin-bottom:4px; }
.msg-item.del-admin .msg-meta::before { content:'👨‍💼 Soporte · '; }
.msg-item.del-user .msg-meta::before  { content:'Tú · '; }
.msg-empty { color:var(--muted); font-size:.85em; text-align:center; padding:20px 0; }


/* ── ADMIN PANEL ── */
.admin-wrap { max-width:900px; margin:0 auto; padding:20px 14px 40px; }
.admin-table { width:100%; border-collapse:collapse; font-size:.88em; }
.admin-table th { color:var(--accent); font-family:'Rajdhani',sans-serif; letter-spacing:2px; text-transform:uppercase; padding:10px 8px; border-bottom:1px solid var(--border2); text-align:left; }
.admin-table td { padding:10px 8px; border-bottom:1px solid rgba(255,255,255,0.03); vertical-align:top; }
.admin-table tr:hover td { background:rgba(255,255,255,0.02); }
.abtn { padding:5px 10px; font-size:.75em; border-radius:6px; width:auto; cursor:pointer; border:none; font-weight:700; }
.abtn.red { background:rgba(204,34,34,0.2); color:#ff6666; border:1px solid rgba(204,34,34,0.3); }
.abtn.red:hover { background:var(--danger); color:#fff; transform:none; box-shadow:none; }
.abtn.cyan { background:rgba(0,212,255,0.1); color:var(--accent); border:1px solid rgba(0,212,255,0.2); }
.abtn.cyan:hover { background:var(--accent); color:#000; transform:none; box-shadow:none; }

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

// ─── GET /changelog ───────────────────────────────────────────
app.get('/changelog', (req, res) => {
    res.send(page(`
    <div class="lp" style="align-items:flex-start;padding-top:40px;">
        <div class="lc" style="max-width:520px;">
            <div style="text-align:center;margin-bottom:24px;">
                <div style="font-family:'Rajdhani',sans-serif;font-size:1.8em;color:var(--accent);letter-spacing:4px;font-weight:700;">EN-FORMA AI</div>
                <div style="color:var(--muted);font-size:.78em;letter-spacing:2px;margin-top:4px;">HISTORIAL DE VERSIONES</div>
            </div>

            <div style="border-left:2px solid rgba(0,212,255,0.2);padding-left:18px;">

                <div style="margin-bottom:24px;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                        <span style="font-family:'Rajdhani',sans-serif;font-size:1.1em;color:var(--accent);font-weight:700;">v1.2.0</span>
                        <span style="background:rgba(0,212,255,0.1);color:var(--accent);font-size:.68em;padding:2px 8px;border-radius:20px;letter-spacing:1px;">ACTUAL</span>
                        <span style="color:var(--muted);font-size:.75em;">Abril 2025</span>
                    </div>
                    <ul style="color:var(--text);font-size:.88em;line-height:1.9;padding-left:16px;">
                        <li>⏱ Cronómetro de entrenamiento con alertas de voz</li>
                        <li>💬 Sistema de mensajes y soporte al usuario</li>
                        <li>👑 Panel de administración completo</li>
                        <li>📢 Mensajes globales a todos los usuarios</li>
                        <li>🥗 Plan de dieta personalizado con IA</li>
                        <li>📈 Gráfica de evolución de peso</li>
                        <li>🎵 Música ambiente mejorada</li>
                        <li>☰ Menú lateral con configuración completa</li>
                    </ul>
                </div>

                <div style="margin-bottom:24px;opacity:.7;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                        <span style="font-family:'Rajdhani',sans-serif;font-size:1.1em;color:var(--muted);font-weight:700;">v1.1.0</span>
                        <span style="color:var(--muted);font-size:.75em;">Marzo 2025</span>
                    </div>
                    <ul style="color:var(--muted);font-size:.85em;line-height:1.9;padding-left:16px;">
                        <li>🤖 Integración con Groq IA (Llama 3.3 70B)</li>
                        <li>🏥 IA médica deportiva para lesiones</li>
                        <li>📓 Diario de entrenamiento</li>
                        <li>🔊 Narración de rutina por voz (TTS)</li>
                        <li>⚖️ Historial de peso</li>
                    </ul>
                </div>

                <div style="opacity:.5;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                        <span style="font-family:'Rajdhani',sans-serif;font-size:1.1em;color:var(--muted);font-weight:700;">v1.0.0</span>
                        <span style="color:var(--muted);font-size:.75em;">Febrero 2025</span>
                    </div>
                    <ul style="color:var(--muted);font-size:.85em;line-height:1.9;padding-left:16px;">
                        <li>🚀 Lanzamiento inicial</li>
                        <li>👤 Registro y login de usuarios</li>
                        <li>🎨 Diseño oscuro con tema cian</li>
                    </ul>
                </div>

            </div>

            <div style="text-align:center;margin-top:24px;">
                <a href="/" style="color:var(--accent);font-size:.85em;text-decoration:none;">← Volver al inicio</a>
            </div>
        </div>
    </div>
    `));
});

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
    <div style="text-align:center;margin-top:16px;">
        <a href="/changelog" style="color:var(--muted);font-size:.72em;text-decoration:none;letter-spacing:1px;"
           onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--muted)'">
            v1.2.0 — Ver novedades ✨
        </a>
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

    // Mensajes del usuario
    const { data: mensajes } = await supabase
        .from('mensajes')
        .select('*')
        .eq('usuario_id', user.id)
        .order('fecha', { ascending: false });

    const mensajesArr = mensajes || [];
    const noLeidos = mensajesArr.filter(m => m.es_del_admin && !m.leido).length;

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

    // Parsear días de la rutina — maneja h3, bullets y texto plano
    function parsearDias(html) {
        if (!html) return [];
        const dias = [];
        const diasNombres = ['Lunes','Martes','Miércoles','Miercoles','Jueves','Viernes','Sábado','Sabado','Domingo'];

        // Intentar split por <h3> primero
        if (html.includes('<h3')) {
            const partes = html.split(/<h3[^>]*>/i).filter(Boolean);
            partes.forEach((p, i) => {
                if (i === 0 && !diasNombres.some(d => p.includes(d))) return;
                const endH3 = p.indexOf('</h3>');
                const titulo = endH3 > -1 ? p.substring(0, endH3).replace(/<[^>]+>/g,'').trim() : 'Día '+(i+1);
                const contenido = endH3 > -1 ? p.substring(endH3+5) : p;
                if (titulo) dias.push({ titulo, contenido: '<h3>'+titulo+'</h3>'+contenido });
            });
        }

        // Si no encontró días, intentar split por nombre del día en texto plano/bullets
        if (dias.length === 0) {
            // Convertir bullets a HTML primero
            let texto = html
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]+>/g, '')
                .replace(/&[a-z]+;/gi, ' ');

            // Dividir por líneas que empiecen con nombre de día
            const lineas = texto.split('\n');
            let diaActual = null;
            let contenidoActual = [];

            lineas.forEach(linea => {
                const limpia = linea.trim().replace(/^\*+\s*/, '');
                const esDia = diasNombres.some(d => limpia.toLowerCase().startsWith(d.toLowerCase()));

                if (esDia) {
                    if (diaActual) {
                        dias.push({
                            titulo: diaActual,
                            contenido: '<h3>'+diaActual+'</h3><ul>'+contenidoActual.map(l=>'<li>'+l+'</li>').join('')+'</ul>'
                        });
                    }
                    diaActual = limpia.replace(/[:*]/g,'').trim();
                    contenidoActual = [];
                } else if (diaActual && limpia) {
                    contenidoActual.push(limpia);
                }
            });

            if (diaActual) {
                dias.push({
                    titulo: diaActual,
                    contenido: '<h3>'+diaActual+'</h3><ul>'+contenidoActual.map(l=>'<li>'+l+'</li>').join('')+'</ul>'
                });
            }
        }

        return dias.length > 0 ? dias : [{ titulo: 'Tu Rutina Completa', contenido: html }];
    }

    const diasRutina = parsearDias(user.consejo_ia);
    const diasSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const diaHoy = new Date().getDay(); // 0=Dom...6=Sab
    const diaActivo = Math.min(diaHoy === 0 ? 6 : diaHoy - 1, diasRutina.length - 1);

    const esFemenino = user.sexo === 'Femenino';
    const trainerName = esFemenino ? 'Entrenadora Sofia' : 'Entrenador Marco';
    const minutosSugeridos = {'Perder PESO':45,'Ganar MÚSCULO':60,'Mejorar RESISTENCIA':75,'Tonificar el CUERPO':50,'Mantenerse en FORMA':45}[user.objetivo] || 45;

    const avatarMasc = `<svg viewBox="0 0 160 180" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="skinM" cx="48%" cy="38%" r="58%">
          <stop offset="0%" stop-color="#f2c490"/>
          <stop offset="60%" stop-color="#d9956a"/>
          <stop offset="100%" stop-color="#c07848"/>
        </radialGradient>
        <radialGradient id="hairM" cx="50%" cy="20%" r="65%">
          <stop offset="0%" stop-color="#3a2010"/>
          <stop offset="100%" stop-color="#1a0d05"/>
        </radialGradient>
        <radialGradient id="shirtM" cx="50%" cy="0%" r="100%">
          <stop offset="0%" stop-color="#1e5080"/>
          <stop offset="100%" stop-color="#0d2a45"/>
        </radialGradient>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="rgba(0,0,0,0.4)"/>
        </filter>
      </defs>

      <!-- Glow ring behind head -->
      <ellipse cx="80" cy="88" rx="62" ry="62" fill="none" stroke="rgba(0,212,255,0.12)" stroke-width="1"/>

      <!-- Shirt/shoulders (just top) -->
      <path d="M18 180 Q18 148 38 140 L58 132 L80 138 L102 132 L122 140 Q142 148 142 180Z" fill="url(#shirtM)"/>
      <!-- collar -->
      <path d="M64 132 Q80 144 96 132" stroke="rgba(255,255,255,0.18)" stroke-width="2" fill="none" stroke-linecap="round"/>
      <text x="80" y="168" text-anchor="middle" fill="rgba(0,212,255,0.4)" font-size="8" font-family="Rajdhani,sans-serif" letter-spacing="2">EN-FORMA</text>

      <!-- Neck -->
      <path d="M66 122 Q66 136 80 138 Q94 136 94 122 L90 118 L70 118Z" fill="url(#skinM)"/>

      <!-- Head -->
      <g class="avatar-head" filter="url(#softShadow)">
        <!-- Jaw/chin shadow -->
        <ellipse cx="80" cy="122" rx="44" ry="8" fill="rgba(0,0,0,0.18)"/>
        <!-- Head shape - slightly wider jaw -->
        <path d="M36 78 Q34 48 80 42 Q126 48 124 78 Q124 110 106 122 Q92 130 80 130 Q68 130 54 122 Q36 110 36 78Z" fill="url(#skinM)"/>

        <!-- Hair top -->
        <path d="M36 76 Q34 44 80 38 Q126 44 124 76 Q120 58 80 54 Q40 58 36 76Z" fill="url(#hairM)"/>
        <!-- Hair sides -->
        <path d="M36 76 Q32 86 34 96 Q33 88 36 80Z" fill="url(#hairM)"/>
        <path d="M124 76 Q128 86 126 96 Q127 88 124 80Z" fill="url(#hairM)"/>
        <!-- Hair fade/texture -->
        <path d="M40 68 Q44 56 60 52 Q50 58 44 70Z" fill="rgba(0,0,0,0.15)"/>

        <!-- Ear L -->
        <ellipse cx="124" cy="84" rx="6" ry="9" fill="#c87848"/>
        <ellipse cx="124" cy="84" rx="3.5" ry="6" fill="#b86838" opacity=".5"/>
        <!-- Ear R -->
        <ellipse cx="36" cy="84" rx="6" ry="9" fill="#c87848"/>
        <ellipse cx="36" cy="84" rx="3.5" ry="6" fill="#b86838" opacity=".5"/>

        <!-- Eyebrow L -->
        <path d="M52 66 Q64 60 74 63" stroke="#1a0d05" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <!-- Eyebrow R -->
        <path d="M86 63 Q96 60 108 66" stroke="#1a0d05" stroke-width="3.5" fill="none" stroke-linecap="round"/>

        <!-- Eye L -->
        <g class="eye-l">
          <ellipse cx="63" cy="78" rx="11" ry="9.5" fill="white"/>
          <circle cx="65" cy="78" r="6" fill="#1a4080"/>
          <circle cx="65" cy="78" r="3.5" fill="#050e1f"/>
          <circle cx="67.5" cy="75.5" r="2" fill="white"/>
          <circle cx="62" cy="77" r="1" fill="white" opacity=".6"/>
          <!-- Eyelid -->
          <path d="M52 74 Q63 68 74 74" stroke="#1a0d05" stroke-width="2.2" fill="none" stroke-linecap="round"/>
          <!-- Lower lid -->
          <path d="M53 82 Q63 86 73 82" stroke="#c87848" stroke-width="1" fill="none" opacity=".4"/>
        </g>

        <!-- Eye R -->
        <g class="eye-r">
          <ellipse cx="97" cy="78" rx="11" ry="9.5" fill="white"/>
          <circle cx="95" cy="78" r="6" fill="#1a4080"/>
          <circle cx="95" cy="78" r="3.5" fill="#050e1f"/>
          <circle cx="97.5" cy="75.5" r="2" fill="white"/>
          <circle cx="92" cy="77" r="1" fill="white" opacity=".6"/>
          <path d="M86 74 Q97 68 108 74" stroke="#1a0d05" stroke-width="2.2" fill="none" stroke-linecap="round"/>
          <path d="M87 82 Q97 86 107 82" stroke="#c87848" stroke-width="1" fill="none" opacity=".4"/>
        </g>

        <!-- Nose bridge -->
        <path d="M78 82 L76 96 Q78 100 80 100 Q82 100 84 96 L82 82Z" fill="#b87040" opacity=".35"/>
        <!-- Nose tip -->
        <ellipse cx="80" cy="100" rx="8" ry="5" fill="#c07848" opacity=".5"/>
        <circle cx="74" cy="100" r="3" fill="#b06838" opacity=".3"/>
        <circle cx="86" cy="100" r="3" fill="#b06838" opacity=".3"/>

        <!-- Philtrum -->
        <path d="M77 104 Q80 108 83 104" stroke="#b07040" stroke-width="1" fill="none" opacity=".4"/>

        <!-- Upper lip -->
        <path d="M60 113 Q68 108 76 110 Q80 109 84 110 Q92 108 100 113" fill="#c06050" opacity=".7" stroke="none"/>
        <!-- Mouth -->
        <path id="mouthM" d="M62 113 Q80 123 98 113" stroke="#904030" stroke-width="2.5" fill="rgba(180,60,40,0.3)" stroke-linecap="round"/>

        <!-- Chin cleft hint -->
        <line x1="80" y1="126" x2="80" y2="130" stroke="#b07040" stroke-width="1.5" opacity=".25"/>
        <!-- Cheek shadows -->
        <ellipse cx="46" cy="94" rx="12" ry="8" fill="rgba(0,0,0,0.06)"/>
        <ellipse cx="114" cy="94" rx="12" ry="8" fill="rgba(0,0,0,0.06)"/>
        <!-- Highlight on forehead -->
        <ellipse cx="74" cy="58" rx="14" ry="8" fill="rgba(255,255,255,0.06)"/>
      </g>
    </svg>`;

    const avatarFem = `<svg viewBox="0 0 160 180" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="skinF" cx="48%" cy="38%" r="58%">
          <stop offset="0%" stop-color="#f8d0a8"/>
          <stop offset="60%" stop-color="#e8a878"/>
          <stop offset="100%" stop-color="#d08858"/>
        </radialGradient>
        <radialGradient id="hairF" cx="50%" cy="15%" r="70%">
          <stop offset="0%" stop-color="#4a1a08"/>
          <stop offset="100%" stop-color="#220a02"/>
        </radialGradient>
        <radialGradient id="shirtF" cx="50%" cy="0%" r="100%">
          <stop offset="0%" stop-color="#782080"/>
          <stop offset="100%" stop-color="#3a0840"/>
        </radialGradient>
        <filter id="softShadowF" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="rgba(0,0,0,0.35)"/>
        </filter>
      </defs>

      <ellipse cx="80" cy="88" rx="62" ry="62" fill="none" stroke="rgba(255,102,0,0.12)" stroke-width="1"/>

      <!-- Shirt -->
      <path d="M20 180 Q20 150 40 142 L60 134 L80 140 L100 134 L120 142 Q140 150 140 180Z" fill="url(#shirtF)"/>
      <path d="M66 134 Q80 146 94 134" stroke="rgba(255,255,255,0.22)" stroke-width="2" fill="none" stroke-linecap="round"/>
      <text x="80" y="168" text-anchor="middle" fill="rgba(255,102,0,0.4)" font-size="8" font-family="Rajdhani,sans-serif" letter-spacing="2">EN-FORMA</text>

      <!-- Neck -->
      <path d="M68 120 Q68 136 80 140 Q92 136 92 120 L88 116 L72 116Z" fill="url(#skinF)"/>

      <g class="avatar-head" filter="url(#softShadowF)">
        <ellipse cx="80" cy="120" rx="40" ry="7" fill="rgba(0,0,0,0.15)"/>

        <!-- Long hair back layer -->
        <path d="M30 72 Q26 110 30 148" stroke="url(#hairF)" stroke-width="20" fill="none" stroke-linecap="round" opacity=".95"/>
        <path d="M130 72 Q134 110 130 148" stroke="url(#hairF)" stroke-width="20" fill="none" stroke-linecap="round" opacity=".95"/>

        <!-- Head shape - softer oval -->
        <path d="M40 78 Q38 50 80 44 Q122 50 120 78 Q120 108 104 120 Q92 128 80 128 Q68 128 56 120 Q40 108 40 78Z" fill="url(#skinF)"/>

        <!-- Hair top/crown -->
        <path d="M40 76 Q38 46 80 40 Q122 46 120 76 Q116 56 80 52 Q44 56 40 76Z" fill="url(#hairF)"/>
        <!-- Hair part highlight -->
        <line x1="80" y1="40" x2="80" y2="58" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>

        <!-- Ear -->
        <ellipse cx="120" cy="82" rx="5.5" ry="8" fill="#d08858"/>
        <ellipse cx="40" cy="82" rx="5.5" ry="8" fill="#d08858"/>

        <!-- Thin arched eyebrows -->
        <path d="M54 64 Q65 57 75 61" stroke="#220a02" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <path d="M85 61 Q95 57 106 64" stroke="#220a02" stroke-width="2.2" fill="none" stroke-linecap="round"/>

        <!-- Eye L with lashes -->
        <g class="eye-l">
          <ellipse cx="64" cy="76" rx="11" ry="9" fill="white"/>
          <circle cx="66" cy="76" r="6" fill="#4a1870"/>
          <circle cx="66" cy="76" r="3.5" fill="#0e0518"/>
          <circle cx="68.5" cy="73.5" r="2" fill="white"/>
          <circle cx="63" cy="75" r="1" fill="white" opacity=".6"/>
          <!-- Upper eyelid + lashes -->
          <path d="M53 72 Q64 65 75 72" stroke="#1a0828" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <path d="M54 72 L52 68M58 69 L57 65M63 67 L63 63M68 68 L69 64M73 70 L75 67" stroke="#1a0828" stroke-width="1.4" stroke-linecap="round"/>
          <!-- Lower lid -->
          <path d="M54 80 Q64 85 74 80" stroke="#d08858" stroke-width="1" fill="none" opacity=".35"/>
        </g>

        <!-- Eye R -->
        <g class="eye-r">
          <ellipse cx="96" cy="76" rx="11" ry="9" fill="white"/>
          <circle cx="94" cy="76" r="6" fill="#4a1870"/>
          <circle cx="94" cy="76" r="3.5" fill="#0e0518"/>
          <circle cx="96.5" cy="73.5" r="2" fill="white"/>
          <circle cx="91" cy="75" r="1" fill="white" opacity=".6"/>
          <path d="M85 72 Q96 65 107 72" stroke="#1a0828" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <path d="M86 72 L84 68M90 69 L89 65M95 67 L95 63M100 68 L101 64M105 70 L107 67" stroke="#1a0828" stroke-width="1.4" stroke-linecap="round"/>
          <path d="M86 80 Q96 85 106 80" stroke="#d08858" stroke-width="1" fill="none" opacity=".35"/>
        </g>

        <!-- Nose - petite -->
        <path d="M78 80 L76 93 Q78 97 80 97 Q82 97 84 93 L82 80Z" fill="#c07858" opacity=".28"/>
        <ellipse cx="80" cy="97" rx="6.5" ry="4" fill="#c07858" opacity=".38"/>
        <circle cx="75" cy="97" r="2.5" fill="#b06848" opacity=".22"/>
        <circle cx="85" cy="97" r="2.5" fill="#b06848" opacity=".22"/>

        <!-- Cupid's bow upper lip -->
        <path d="M63 109 Q70 104 76 106 Q80 104 84 106 Q90 104 97 109 Q90 106 80 107 Q70 106 63 109Z" fill="#d05870" opacity=".85"/>
        <!-- Lips / mouth -->
        <path id="mouthF" d="M65 109 Q80 120 95 109" stroke="#a03050" stroke-width="2.2" fill="rgba(208,80,100,0.5)" stroke-linecap="round"/>

        <!-- Cheek blush -->
        <ellipse cx="46" cy="90" rx="13" ry="9" fill="rgba(255,100,130,0.1)"/>
        <ellipse cx="114" cy="90" rx="13" ry="9" fill="rgba(255,100,130,0.1)"/>
        <!-- Highlight cheekbones -->
        <ellipse cx="50" cy="86" rx="8" ry="5" fill="rgba(255,255,255,0.05)"/>
        <ellipse cx="110" cy="86" rx="8" ry="5" fill="rgba(255,255,255,0.05)"/>
        <!-- Forehead highlight -->
        <ellipse cx="76" cy="56" rx="12" ry="7" fill="rgba(255,255,255,0.07)"/>
      </g>
    </svg>`;

    const avatarSVG = esFemenino ? avatarFem : avatarMasc;

    // Botones de días
    const diasBtns = diasRutina.map((d, i) => {
        const isToday = i === diaActivo;
        return `<button class="day-btn${isToday ? ' active today' : ''}" onclick="selectDay(${i})" id="daybtn-${i}">${d.titulo.substring(0,8)}</button>`;
    }).join('');


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
                        <div class="mb" id="mb-rock" onclick="playMusic('rock')">🎵 Moderno</div>
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

            <!-- DIETA -->
            <div class="sb-section">
                <div class="sb-section-h" onclick="toggleSb('sb-dieta')">
                    🥗 DIETA Y RECOMENDACIONES <span>▼</span>
                </div>
                <div class="sb-section-b" id="sb-dieta">
                    ${user.dieta_ia
                        ? `<div style="font-size:.85em;line-height:1.6;max-height:400px;overflow-y:auto;">${user.dieta_ia}</div><div class="div"></div>`
                        : `<p style="color:var(--muted);font-size:.82em;margin-bottom:10px;">Aún no tienes un plan de dieta. Genera uno con IA basado en tu perfil y objetivo.</p>`
                    }
                    <form action="/regenerar-dieta" method="POST" onsubmit="showSpin('GENERANDO PLAN DE DIETA CON IA...')">
                        <button type="submit" class="orange" style="font-size:.82em;">🤖 ${user.dieta_ia ? 'Regenerar dieta' : 'Generar dieta con IA'}</button>
                    </form>
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
            <button class="msg-btn" onclick="abrirMensajes()" title="Mensajes y soporte">
                💬
                ${noLeidos > 0 ? `<span class="msg-badge">${noLeidos}</span>` : ''}
            </button>
            ${user.es_admin ? `<a href="/admin" style="text-decoration:none;"><button class="tbtn" style="background:rgba(255,204,0,0.1);color:#ffcc00;border-color:rgba(255,204,0,0.3);">👑 ADMIN</button></a>` : ''}
            <form action="/logout" method="POST" style="display:inline;">
                <button type="submit" class="tbtn red">CERRAR SESIÓN</button>
            </form>
        </div>
    </div>

    <div class="mo" id="modal-msg">
        <div class="mb2" style="max-width:500px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <div class="mo-t" style="margin-bottom:0;">💬 MENSAJES</div>
                <button class="sec" style="width:auto;padding:6px 12px;font-size:.8em;" onclick="document.getElementById('modal-msg').classList.remove('open')">✕ Cerrar</button>
            </div>
            <div class="msg-list" id="msgList">
                ${mensajesArr.length === 0
                    ? `<div class="msg-empty">No tienes mensajes aún.<br>¡Escríbenos si tienes alguna duda!</div>`
                    : mensajesArr.map(m => `
                        <div class="msg-item ${m.es_del_admin ? 'del-admin' : 'del-user'}">
                            <div class="msg-meta">${new Date(m.fecha).toLocaleDateString('es-ES', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
                            <div>${m.contenido}</div>
                        </div>`).join('')
                }
            </div>
            <div class="div"></div>
            <form action="/enviar-mensaje" method="POST" onsubmit="showSpin('ENVIANDO...')">
                <label>Escribe tu duda, sugerencia o comentario</label>
                <textarea name="contenido" placeholder="Ej: ¿Puedo cambiar mi objetivo de perder peso a ganar músculo? ¿Cómo funciona la dieta?" required style="min-height:80px;"></textarea>
                <button type="submit" class="orange">📨 Enviar mensaje</button>
            </form>
        </div>
    </div>

    <div class="main-layout">
        <!-- PANEL LATERAL FIJO -->
        <div class="side-panel">
            <!-- AVATAR -->
            <div class="avatar-panel">
                ${avatarSVG}
                <div class="trainer-name">${trainerName}</div>
                <div class="trainer-status" id="trainerStatus">Listo para entrenar 💪</div>
                <button class="trainer-speak-btn" id="btnHablar" onclick="toggleHablar()">🔊 Escuchar hoy</button>
            </div>
            <!-- CRONÓMETRO -->
            <div class="crono-panel">
                <div class="crono-label">⏱ CRONÓMETRO</div>
                <div class="crono-display" id="cronoDisplay">00:00:00</div>
                <div class="crono-preset">
                    <button class="cpbtn" onclick="setPreset(30,event)">30m</button>
                    <button class="cpbtn" onclick="setPreset(45,event)">45m</button>
                    <button class="cpbtn" onclick="setPreset(60,event)">60m</button>
                </div>
                <div class="crono-preset" style="margin-top:0;">
                    <button class="cpbtn" onclick="setPreset(75,event)">75m</button>
                    <button class="cpbtn" onclick="setPreset(90,event)">90m</button>
                    <button class="cpbtn" onclick="setPreset(120,event)">120m</button>
                </div>
                <div class="crono-input-row">
                    <input type="number" id="cronoH" min="0" max="9" value="0" placeholder="HH">
                    <span>:</span>
                    <input type="number" id="cronoM" min="0" max="59" value="${minutosSugeridos}" placeholder="MM">
                    <span>:</span>
                    <input type="number" id="cronoS" min="0" max="59" value="0" placeholder="SS">
                </div>
                <div class="crono-btns">
                    <button onclick="cronoStart()" class="orange" id="btnStart">▶</button>
                    <button onclick="cronoPause()" class="sec" id="btnPause" style="display:none;">⏸</button>
                    <button onclick="cronoReset()" class="sec">↺</button>
                </div>
            </div>
        </div>

        <!-- CONTENIDO PRINCIPAL -->
        <div class="main-content">

        <!-- STATS 2x2 -->
        <div class="stats">
            <div class="sc">
                <div class="sl">PESO ACTUAL</div>
                <div class="sv grande" style="color:var(--accent2);display:flex;align-items:baseline;justify-content:center;gap:3px;">${user.peso}<small style="font-size:.35em;">kg</small></div>
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

        <div class="card hl">
            <div class="card-t" style="flex-wrap:wrap;gap:8px;">
                <span>🤖 TU PLAN SEMANAL</span>
                <form action="/regenerar" method="POST" style="display:inline;" onsubmit="showSpin('GENERANDO NUEVA RUTINA CON IA...')">
                    <button type="submit" class="orange" style="width:auto;padding:7px 14px;font-size:.75em;">🔄 Regenerar</button>
                </form>
            </div>
            ${diasRutina.map((d, i) => {
                const isToday = i === diaActivo;
                return `<div class="acc" style="margin-bottom:8px;${isToday ? 'border-color:rgba(0,212,255,0.3);' : ''}">
                    <div class="acc-h" onclick="selectDay(${i}, this)" style="${isToday ? 'color:var(--accent);' : 'color:var(--muted);'}">
                        ${isToday ? '📅' : '📋'} ${d.titulo} ${isToday ? '<span style="font-size:.7em;background:rgba(0,212,255,0.15);color:var(--accent);padding:2px 8px;border-radius:10px;margin-left:6px;">HOY</span>' : ''}
                        <span class="arr">${isToday ? '▲' : '▼'}</span>
                    </div>
                    <div class="acc-b ${isToday ? 'open' : ''}" id="dia-${i}">
                        <div class="rutina">${d.contenido}</div>
                    </div>
                </div>`;
            }).join('')}
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

        </div><!-- /main-content -->
    </div><!-- /main-layout -->

    <!-- SPINNER -->
    <div class="spin-overlay" id="spinner">
        <div class="spin"></div>
        <div class="spin-t" id="spinMsg">PROCESANDO...</div>
        <div class="spin-sub">Un momento por favor</div>
    </div>

    <!-- DATA STORE -->
    <script type="application/json" id="_diasData">${JSON.stringify(diasRutina).replace(/<\//g,'<\\/')}</script>
    <script type="application/json" id="_histData">${JSON.stringify(historial).replace(/<\//g,'<\\/')}</script>

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

    // ── AVATAR + TTS ──────────────────────────────────────────
    const diasData = JSON.parse(document.getElementById('_diasData').textContent);
    let diaActivo = ${JSON.stringify(diaActivo)};
    let hablando = false;
    let mouth = null;

    function selectDay(idx) {
        diaActivo = idx;
        const body = document.getElementById('dia-' + idx);
        if (!body) return;
        const isOpen = body.classList.contains('open');
        document.querySelectorAll('[id^="dia-"]').forEach(b => b.classList.remove('open'));
        document.querySelectorAll('.acc-h .arr').forEach(a => a.textContent = '▼');
        if (!isOpen) {
            body.classList.add('open');
            const arr = body.previousElementSibling?.querySelector('.arr');
            if (arr) arr.textContent = '▲';
        }
        const dia = diasData[idx];
        if (dia) document.getElementById('trainerStatus').textContent = '📋 ' + dia.titulo;
        if (hablando) detener();
    }

    function selectDaySpeak(idx) {
        diaActivo = idx;
        const dia = diasData[idx];
        if (!dia) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = dia.contenido;
        const text = tmp.innerText || tmp.textContent || '';
        if (!text.trim()) return;
        setTrainerTalking(true);
        animateMouth(true);
        document.getElementById('trainerStatus').textContent = '🎙️ Narrando ' + dia.titulo;
        const frases = text.match(/[^.!?]+[.!?]*/g) || [text];
        let fidx = 0;
        window.speechSynthesis.cancel();
        function hablar() {
            if (fidx >= frases.length) { setTrainerTalking(false); animateMouth(false); return; }
            const u = new SpeechSynthesisUtterance(frases[fidx].trim());
            const sel = document.getElementById('voiceSelect');
            const esp = voices.filter(v => v.lang.startsWith('es'));
            u.voice = esp[parseInt(sel?.value)] || selectedVoice;
            u.lang = 'es-ES';
            u.rate = modoVoz === 'm' ? 0.92 : 0.95;
            u.pitch = modoVoz === 'm' ? 0.9 : 1.05;
            u.onend = () => { fidx++; hablar(); };
            u.onerror = () => { fidx++; hablar(); };
            window.speechSynthesis.speak(u);
        }
        hablar();
    }

    function toggleHablar() {
        if (hablando) { detener(); return; }
        // Leer el día actualmente abierto
        const diaAbierto = document.querySelector('[id^="dia-"].open');
        const idx = diaAbierto ? parseInt(diaAbierto.id.replace('dia-','')) : diaActivo;
        selectDaySpeak(idx);
    }

    function leer() { toggleHablar(); }
    function detener() {
        window.speechSynthesis.cancel();
        clearInterval(mouthInterval);
        mouthInterval = null;
        setTrainerTalking(false);
        animateMouth(false);
    }

    function setTrainerTalking(talking) {
        hablando = talking;
        const btn = document.getElementById('btnHablar');
        const head = document.querySelector('.avatar-head');
        if (btn) {
            btn.textContent = talking ? '⏹ Detener' : '🔊 Escuchar hoy';
            btn.classList.toggle('speaking', talking);
        }
        if (head) head.classList.toggle('talking', talking);
        if (!talking) {
            animateMouth(false);
            const st = document.getElementById('trainerStatus');
            if (st) st.textContent = '✅ Listo';
        }
    }

    // Mouth animation loop
    let mouthInterval = null;

    function animateMouth(active) {
        const el = document.getElementById('mouthM') || document.getElementById('mouthF');
        if (!el) return;
        clearInterval(mouthInterval);
        mouthInterval = null;
        if (!active) {
            const isFem = !!document.getElementById('mouthF');
            el.setAttribute('d', isFem ? 'M69 79 Q80 88 91 79' : 'M68 82 Q80 90 92 82');
            return;
        }
        const isFem = !!document.getElementById('mouthF');
        const open  = isFem ? 'M69 79 Q80 90 91 79' : 'M68 82 Q80 92 92 82';
        const mid   = isFem ? 'M69 79 Q80 86 91 79' : 'M68 82 Q80 88 92 82';
        const close2 = isFem ? 'M70 80 Q80 84 90 80' : 'M69 83 Q80 86 91 83';
        const shapes = [open, mid, close2, mid, open, close2, mid, open];
        let si = 0;
        mouthInterval = setInterval(() => {
            el.setAttribute('d', shapes[si % shapes.length]);
            si++;
        }, 100);
    }

    let voices = [];
    let selectedVoice = null;
    let vocesMasculinas = [];
    let vocesFemeninas = [];
    let modoVoz = ${JSON.stringify(esFemenino ? 'f' : 'm')};

    function loadVoices() {
        voices = window.speechSynthesis.getVoices();
        const esp = voices.filter(v => v.lang.startsWith('es'));
        // Priorizar voces neurales/naturales de Google y Microsoft
        const neuralKeywords = /google|neural|natural|premium|enhanced|microsoft/i;
        const maleKeywords = /male|pablo|diego|jorge|miguel|carlos|juan|alvaro/i;
        const femaleKeywords = /female|marta|laura|helena|mónica|paulina|sabina|elvira/i;

        vocesMasculinas = esp.filter(v => maleKeywords.test(v.name))
            .sort((a,b) => neuralKeywords.test(b.name) ? 1 : -1);
        vocesFemeninas = esp.filter(v => femaleKeywords.test(v.name))
            .sort((a,b) => neuralKeywords.test(b.name) ? 1 : -1);

        // Si no hay con keywords, tomar las primeras neurales disponibles
        if (!vocesMasculinas.length) vocesMasculinas = esp.filter(v => neuralKeywords.test(v.name));
        if (!vocesFemeninas.length) vocesFemeninas = [...esp].reverse().filter(v => neuralKeywords.test(v.name));

        const sel = document.getElementById('voiceSelect');
        if (!sel) return;
        sel.innerHTML = '';
        esp.forEach((v, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = v.name + (neuralKeywords.test(v.name) ? ' ⭐' : '');
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

    // ── MÚSICA ────────────────────────────────────────────────
    let audio = null;
    let currentMusic = null;
    const streams = {
        feng:    'https://streams.ilovemusic.de/iloveradio17.mp3',
        clasica: 'https://icecast.radiofrance.fr/francemusique-midfi.mp3',
        rock:    'https://streams.ilovemusic.de/iloveradio1.mp3'
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

    // ── MENSAJES ──────────────────────────────────────────────
    function abrirMensajes() {
        document.getElementById('modal-msg').classList.add('open');
        fetch('/marcar-leidos', { method: 'POST' });
        document.querySelectorAll('.msg-badge').forEach(b => b.remove());
    }

    function toggleCrono() {
        const m = document.getElementById('modal-crono');
        m.classList.toggle('open');
    }

    // ── CRONÓMETRO ────────────────────────────────────────────
    let cronoInterval = null;
    let cronoTotal = 0;
    let cronoRestante = 0;
    let cronoPausado = false;
    let alerta15Dada = false;
    let alertaFinalDada = false;

    const tiempoSugerido = {'Perder PESO':45,'Ganar MÚSCULO':60,'Mejorar RESISTENCIA':75,'Tonificar el CUERPO':50,'Mantenerse en FORMA':45};
    const sugerido = ${minutosSugeridos};
    document.getElementById('cronoM').value = sugerido;

    function setPreset(mins, e) {
        document.querySelectorAll('.cpbtn').forEach(b => b.classList.remove('on'));
        if (e && e.target) e.target.classList.add('on');
        document.getElementById('cronoH').value = 0;
        document.getElementById('cronoM').value = mins;
        document.getElementById('cronoS').value = 0;
        actualizarDisplay(mins * 60);
        if (cronoInterval) cronoReset();
    }

    function pad(n) { return String(n).padStart(2, '0'); }

    function actualizarDisplay(seg) {
        const h = Math.floor(seg / 3600);
        const m = Math.floor((seg % 3600) / 60);
        const s = seg % 60;
        const d = document.getElementById('cronoDisplay');
        d.textContent = pad(h) + ':' + pad(m) + ':' + pad(s);
        d.className = 'crono-display';
        if (seg <= 900 && seg > 60) d.classList.add('warning');
        if (seg <= 60) d.classList.add('danger');
    }

    function hablarAviso(texto) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(texto);
        u.lang = 'es-ES';
        u.rate = 0.9;
        const esp = voices.filter(v => v.lang.startsWith('es'));
        const sel = document.getElementById('voiceSelect');
        if (sel && esp.length) u.voice = esp[parseInt(sel.value)] || esp[0];
        window.speechSynthesis.speak(u);
    }

    function cronoStart() {
        if (cronoInterval) return;
        if (!cronoPausado) {
            const h = parseInt(document.getElementById('cronoH').value) || 0;
            const m = parseInt(document.getElementById('cronoM').value) || 0;
            const s = parseInt(document.getElementById('cronoS').value) || 0;
            cronoTotal = h * 3600 + m * 60 + s;
            cronoRestante = cronoTotal;
            alerta15Dada = false;
            alertaFinalDada = false;
            if (cronoTotal <= 0) return;
        }
        cronoPausado = false;
        document.getElementById('btnStart').style.display = 'none';
        document.getElementById('btnPause').style.display = 'inline-block';
        const cts = document.getElementById('cronoTrainerStatus');
        if (cts) cts.textContent = '💪 Entrenando...';
        cronoInterval = setInterval(() => {
            cronoRestante--;
            actualizarDisplay(cronoRestante);
            // Alerta 15 min antes
            if (!alerta15Dada && cronoRestante === 900) {
                alerta15Dada = true;
                hablarAviso('Atención, quedan 15 minutos para terminar tu entrenamiento. ¡Sigue adelante, lo estás haciendo genial!');
            }
            // Alerta final
            if (!alertaFinalDada && cronoRestante === 0) {
                alertaFinalDada = true;
                clearInterval(cronoInterval);
                cronoInterval = null;
                document.getElementById('btnStart').style.display = 'inline-block';
                document.getElementById('btnPause').style.display = 'none';
                hablarAviso('¡Felicidades! Has completado tu sesión de entrenamiento. Excelente trabajo. No olvides hacer el enfriamiento y beber agua.');
                document.getElementById('cronoDisplay').classList.add('danger');
                const cts2 = document.getElementById('cronoTrainerStatus');
                if (cts2) cts2.textContent = '🏆 ¡Sesión completada!';
            }
        }, 1000);
    }

    function cronoPause() {
        if (cronoInterval) {
            clearInterval(cronoInterval);
            cronoInterval = null;
            cronoPausado = true;
            document.getElementById('btnStart').style.display = 'inline-block';
            document.getElementById('btnStart').textContent = '▶ Continuar';
            document.getElementById('btnPause').style.display = 'none';
        }
    }

    function cronoReset() {
        clearInterval(cronoInterval);
        cronoInterval = null;
        cronoPausado = false;
        alerta15Dada = false;
        alertaFinalDada = false;
        const m = sugerido;
        document.getElementById('cronoH').value = 0;
        document.getElementById('cronoM').value = m;
        document.getElementById('cronoS').value = 0;
        actualizarDisplay(m * 60);
        document.getElementById('btnStart').style.display = 'inline-block';
        document.getElementById('btnStart').textContent = '▶ Iniciar';
        document.getElementById('btnPause').style.display = 'none';
        document.getElementById('cronoDisplay').className = 'crono-display';
    }

    actualizarDisplay(sugerido * 60);

    // ── GRÁFICA DE PESO ────────────────────────────────────────
    const histData = JSON.parse(document.getElementById('_histData').textContent);
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

// ─── GET+POST /regenerar-dieta ────────────────────────────────
async function generarDieta(req, res) {
    const user = await getUser(req);
    if (!user) return res.redirect('/');
    const dieta = await llamarGroq(buildPromptDieta(user));
    if (dieta) {
        await supabase.from('usuarios').update({ dieta_ia: dieta }).eq('id', user.id);
    }
    res.redirect('/dashboard');
}
app.get('/regenerar-dieta', generarDieta);
app.post('/regenerar-dieta', generarDieta);

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

// ─── POST /enviar-mensaje ─────────────────────────────────────
app.post('/enviar-mensaje', async (req, res) => {
    const user = await getUser(req);
    if (!user || !req.body.contenido?.trim()) return res.redirect('/dashboard');
    const { error } = await supabase.from('mensajes').insert([{
        usuario_id: user.id,
        contenido: req.body.contenido.trim(),
        es_del_admin: false,
        leido: false
    }]);
    if (error) console.error('[MENSAJE] Error al insertar:', error.message);
    res.redirect('/dashboard');
});

// ─── POST /marcar-leidos ──────────────────────────────────────
app.post('/marcar-leidos', async (req, res) => {
    const user = await getUser(req);
    if (!user) return res.sendStatus(401);
    await supabase.from('mensajes')
        .update({ leido: true })
        .eq('usuario_id', user.id)
        .eq('es_del_admin', true);
    res.sendStatus(200);
});

// ─── GET /admin ───────────────────────────────────────────────
app.get('/admin', async (req, res) => {
    const user = await getUser(req);
    if (!user || !user.es_admin) return res.redirect('/dashboard');

    // PIN check
    const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
    if (req.cookies['admin_pin'] !== ADMIN_PIN) {
        return res.send(page(`
        <div class="lp">
            <div class="lc" style="max-width:320px;">
                <div class="logo"><h1 style="font-size:1.8em;">👑 ADMIN</h1><p>INGRESA TU PIN DE ACCESO</p></div>
                ${req.query.err ? '<div class="err">PIN incorrecto</div>' : ''}
                <form action="/admin/pin" method="POST">
                    <input name="pin" type="password" placeholder="PIN" maxlength="8" style="text-align:center;font-size:1.5em;letter-spacing:6px;" required autofocus>
                    <button type="submit">ENTRAR</button>
                </form>
                <a href="/dashboard" style="display:block;text-align:center;color:var(--muted);font-size:.82em;margin-top:12px;text-decoration:none;">← Volver</a>
            </div>
        </div>`));
    }

    const { data: usuarios, error: errU } = await supabase
        .from('usuarios').select('id,nombre,edad,peso,objetivo,sexo,padecimientos')
        .order('id', { ascending: false });

    const { data: mensajes, error: errM } = await supabase
        .from('mensajes').select('*').order('fecha', { ascending: false });

    if (errU) console.error('[ADMIN] Error usuarios:', errU.message);
    if (errM) console.error('[ADMIN] Error mensajes:', errM.message);

    const usersArr = usuarios || [];
    const msgsArr = mensajes || [];
    const sinResponder = msgsArr.filter(m => !m.es_del_admin && !msgsArr.some(r => r.es_del_admin && r.usuario_id === m.usuario_id && new Date(r.fecha) > new Date(m.fecha))).length;

    res.send(page(`
    <div class="topbar">
        <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-family:'Rajdhani',sans-serif;font-size:1.1em;color:#ffcc00;letter-spacing:2px;">👑 PANEL ADMIN</span>
        </div>
        <div class="topbar-brand">EN-FORMA AI</div>
        <div class="topbar-actions">
            <a href="/dashboard" style="text-decoration:none;"><button class="tbtn">← Dashboard</button></a>
            <form action="/logout" method="POST" style="display:inline;">
                <button type="submit" class="tbtn red">CERRAR SESIÓN</button>
            </form>
        </div>
    </div>

    <div class="admin-wrap">

        <!-- STATS ADMIN -->
        <div class="stats" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px;">
            <div class="sc"><div class="sl">USUARIOS</div><div class="sv" style="color:var(--accent);">${usersArr.length}</div></div>
            <div class="sc"><div class="sl">MENSAJES</div><div class="sv" style="color:var(--accent2);">${msgsArr.filter(m=>!m.es_del_admin).length}</div></div>
            <div class="sc"><div class="sl">SIN RESPONDER</div><div class="sv" style="color:${sinResponder>0?'#ff4444':'#00ff88'};">${sinResponder}</div></div>
        </div>

        <!-- MENSAJE GLOBAL -->
        <div class="card" style="border-left:3px solid #ffcc00;margin-bottom:16px;">
            <div class="card-t" style="color:#ffcc00;">📢 MENSAJE GLOBAL A TODOS LOS USUARIOS</div>
            <form action="/admin/mensaje-global" method="POST" onsubmit="showSpin('ENVIANDO A TODOS...')">
                <textarea name="contenido" placeholder="Escribe el mensaje que recibirán TODOS los usuarios..." required style="min-height:70px;"></textarea>
                <button type="submit" style="background:#ffcc00;color:#000;font-weight:700;">📨 Enviar a todos</button>
            </form>
        </div>

        <!-- MENSAJES -->
        <div class="card hl" style="margin-bottom:16px;">
            <div class="card-t">💬 MENSAJES DE USUARIOS</div>
            ${msgsArr.filter(m => !m.es_del_admin).length === 0
                ? `<p style="color:var(--muted);font-size:.88em;">No hay mensajes aún.</p>`
                : msgsArr.filter(m => !m.es_del_admin).map(m => {
                    const uName = usersArr.find(u => u.id === m.usuario_id)?.nombre || 'Usuario';
                    return `
                    <div style="background:var(--card2);border-radius:10px;padding:12px;margin-bottom:10px;border-left:3px solid var(--accent2);">
                        <div style="font-size:.75em;color:var(--muted);margin-bottom:6px;">
                            👤 <b style="color:var(--accent);">${uName}</b> · ${new Date(m.fecha).toLocaleDateString('es-ES',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
                        </div>
                        <div style="margin-bottom:10px;font-size:.9em;">${m.contenido}</div>
                        <form action="/admin/responder" method="POST" style="display:flex;gap:8px;" onsubmit="showSpin('ENVIANDO RESPUESTA...')">
                            <input type="hidden" name="usuario_id" value="${m.usuario_id}">
                            <input name="respuesta" placeholder="Escribe tu respuesta..." required style="flex:1;margin-bottom:0;font-size:.85em;padding:8px 10px;">
                            <button type="submit" class="abtn cyan" style="padding:8px 14px;white-space:nowrap;">📨 Responder</button>
                        </form>
                    </div>`;
                }).join('')
            }
        </div>

        <!-- USUARIOS -->
        <div class="card">
            <div class="card-t">👥 USUARIOS REGISTRADOS</div>
            <div style="overflow-x:auto;">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Nombre</th><th>Edad</th><th>Peso</th><th>Objetivo</th><th>Sexo</th><th>Acción</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${usersArr.map(u => `
                        <tr>
                            <td><b>${u.nombre}</b></td>
                            <td>${u.edad} años</td>
                            <td>${u.peso} kg</td>
                            <td style="font-size:.82em;">${u.objetivo}</td>
                            <td>${u.sexo}</td>
                            <td style="display:flex;gap:6px;flex-wrap:wrap;">
                                <button class="abtn cyan" onclick="document.getElementById('msgModal-${u.id}').style.display='flex'">✉️ Mensaje</button>
                                <form action="/admin/eliminar-usuario" method="POST" onsubmit="return confirm('¿Eliminar a ${u.nombre}?')">
                                    <input type="hidden" name="usuario_id" value="${u.id}">
                                    <button type="submit" class="abtn red">🗑 Eliminar</button>
                                </form>
                            </td>
                        </tr>
                        <!-- Mini modal mensaje usuario -->
                        <tr id="msgModal-${u.id}" style="display:none;">
                            <td colspan="6" style="padding:10px;background:rgba(0,212,255,0.05);">
                                <form action="/admin/mensaje-usuario" method="POST" style="display:flex;gap:8px;align-items:center;">
                                    <input type="hidden" name="usuario_id" value="${u.id}">
                                    <input name="contenido" placeholder="Mensaje para ${u.nombre}..." required style="flex:1;margin-bottom:0;font-size:.85em;padding:8px 10px;">
                                    <button type="submit" class="abtn cyan" style="padding:8px 14px;">📨 Enviar</button>
                                    <button type="button" class="abtn red" onclick="document.getElementById('msgModal-${u.id}').style.display='none'">✕</button>
                                </form>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>

    </div>
    <div class="spin-overlay" id="spinner"><div class="spin"></div><div class="spin-t" id="spinMsg">PROCESANDO...</div></div>
    <script>function showSpin(m){document.getElementById('spinMsg').textContent=m;document.getElementById('spinner').classList.add('show');}</script>
    `));
});

// ─── POST /admin/pin ──────────────────────────────────────────
app.post('/admin/pin', async (req, res) => {
    const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
    if (req.body.pin === ADMIN_PIN) {
        res.setHeader('Set-Cookie', `admin_pin=${ADMIN_PIN}; Path=/; HttpOnly; Max-Age=28800`);
        return res.redirect('/admin');
    }
    res.redirect('/admin?err=1');
});

// ─── POST /admin/mensaje-usuario ──────────────────────────────
app.post('/admin/mensaje-usuario', async (req, res) => {
    const user = await getUser(req);
    if (!user || !user.es_admin) return res.redirect('/dashboard');
    const { usuario_id, contenido } = req.body;
    if (!contenido?.trim()) return res.redirect('/admin');
    await supabase.from('mensajes').insert([{
        usuario_id: usuario_id,
        contenido: contenido.trim(),
        es_del_admin: true,
        leido: false
    }]);
    res.redirect('/admin');
});

// ─── POST /admin/mensaje-global ───────────────────────────────
app.post('/admin/mensaje-global', async (req, res) => {
    const user = await getUser(req);
    if (!user || !user.es_admin) return res.redirect('/dashboard');
    const { contenido } = req.body;
    if (!contenido?.trim()) return res.redirect('/admin');
    // Obtener todos los usuarios excepto el admin
    const { data: usuarios, error: errU2 } = await supabase.from('usuarios').select('id').eq('es_admin', false);
    if (errU2) console.error('[GLOBAL] Error usuarios:', errU2.message);
    if (usuarios && usuarios.length > 0) {
        const inserts = usuarios.map(u => ({
            usuario_id: u.id,
            contenido: contenido.trim(),
            es_del_admin: true,
            leido: false
        }));
        const { error: errI } = await supabase.from('mensajes').insert(inserts);
        if (errI) console.error('[GLOBAL] Error insert:', errI.message);
    }
    res.redirect('/admin');
});

// ─── POST /admin/responder ────────────────────────────────────
app.post('/admin/responder', async (req, res) => {
    const user = await getUser(req);
    if (!user || !user.es_admin) return res.redirect('/dashboard');
    const { usuario_id, respuesta } = req.body;
    if (!respuesta?.trim()) return res.redirect('/admin');
    await supabase.from('mensajes').insert([{
        usuario_id: usuario_id,
        contenido: respuesta.trim(),
        es_del_admin: true,
        leido: false
    }]);
    res.redirect('/admin');
});

// ─── POST /admin/eliminar-usuario ─────────────────────────────
app.post('/admin/eliminar-usuario', async (req, res) => {
    const user = await getUser(req);
    if (!user || !user.es_admin) return res.redirect('/dashboard');
    const uid = req.body.usuario_id;
    // Borrar notas, mensajes y usuario
    await supabase.from('notas').delete().eq('usuario_id', uid);
    await supabase.from('mensajes').delete().eq('usuario_id', uid);
    await supabase.from('usuarios').delete().eq('id', uid);
    res.redirect('/admin');
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
