require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const app = express();

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://enqbfcrpsqgslmckvswo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_FB4_GaqMpK2AVvvG2Xtx_w_70rjqq5W';

app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'secreto-en-forma-ai-pro',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production'
    }
}));

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const styles = `
    :root { --bg: #0f0f0f; --card: #1a1a1a; --accent: #00d4ff; --sec: #ff8800; --text: #eee; }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; }
    .nav { display: flex; justify-content: space-between; align-items: center; max-width: 1100px; margin: 0 auto 30px; }
    .sexo-tag { font-size: 0.75rem; color: var(--accent); border: 1px solid var(--accent); padding: 3px 10px; border-radius: 12px; margin-left: 10px; text-transform: uppercase; }
    .dashboard-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; max-width: 1100px; margin: 0 auto; }
    .stat-card { background: var(--card); padding: 25px; border-radius: 15px; border-top: 4px solid var(--accent); text-align: center; }
    .icon-peso::before { content: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="%23ff8800" stroke-width="2"><path d="M2 16a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2ZM12 14v-4M8 10h8M12 2v4"/></svg>'); display: block; margin: 0 auto 12px; }
    .icon-meta::before { content: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="%2300d4ff" stroke-width="2"><path d="M6 18h12M12 22a8 8 0 0 0 8-8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a8 8 0 0 0 8 8ZM12 2v4M2 10h20"/></svg>'); display: block; margin: 0 auto 12px; }
    .stat-card p { font-size: 1.8rem; font-weight: bold; color: var(--accent); margin: 0; }
    .rango-txt { color: #ffd700; font-size: 1.4rem; font-weight: bold; display: block; margin-bottom: 10px; }
    .medals { display: flex; gap: 12px; justify-content: center; font-size: 1.3rem; opacity: 0.2; }
    .medals .active { opacity: 1; filter: drop-shadow(0 0 8px var(--accent)); }
    .imc-bar { background: #333; height: 10px; border-radius: 5px; margin-top: 20px; overflow: hidden; }
    .imc-fill { height: 100%; transition: 0.8s; }
    button { padding: 14px; background: var(--accent); border: none; color: #000; font-weight: bold; cursor: pointer; border-radius: 10px; text-transform: uppercase; width: 100%; }
    input, select { background: #222; border: 1px solid #444; color: #fff; padding: 12px; border-radius: 10px; width: 100%; margin-bottom: 15px; }
    body.low-data .chart-wrapper, body.low-data .imc-bar, body.low-data [class^="icon-"] { display: none; }
`;

function calcularSalud(peso, estatura) {
    const imc = (peso / ((estatura/100)**2)).toFixed(1);
    if (imc < 18.5) return { val: imc, status: "Bajo peso", color: "#ffcc00", pct: 25 };
    if (imc < 25) return { val: imc, status: "Saludable", color: "#00ff88", pct: 50 };
    if (imc < 30) return { val: imc, status: "Sobrepeso", color: "#ff8800", pct: 75 };
    return { val: imc, status: "Obesidad", color: "#ff4444", pct: 95 };
}

// --- RUTAS ---

app.get('/', (req, res) => {
    if (req.session.usuarioId) return res.redirect('/dashboard');
    res.send(`<html><head><title>EN-FORMA AI</title><style>${styles}</style></head><body style="display:flex; align-items:center; justify-content:center; height:100vh;">
        <div id="login-box" style="background:var(--card); padding:50px; border-radius:25px; width:380px; text-align:center;">
            <h1 style="color:var(--accent); margin-bottom:35px;">EN-FORMA AI</h1>
            <form action="/login" method="POST">
                <input name="nombre" placeholder="Usuario" required>
                <input name="password" type="password" placeholder="Contraseña" required>
                <button>Entrar al Panel</button>
            </form>
            <p style="font-size:0.9rem; color:#888; margin-top:25px;">
                ¿Nuevo usuario? <span style="color:var(--accent); cursor:pointer; font-weight:bold;" onclick="document.getElementById('reg-modal').style.display='block'; document.getElementById('login-box').style.display='none';">Regístrate aquí</span>.
            </p>
        </div>
        <div id="reg-modal" style="display:none; background:var(--card); padding:40px; border-radius:25px; width:380px;">
            <h2 style="margin-top:0; text-align:center;">Nuevo Perfil</h2>
            <form action="/registrar" method="POST">
                <input name="nombre" placeholder="Nombre completo" required>
                <select name="sexo"><option>Hombre</option><option>Mujer</option></select>
                <input name="edad" type="number" placeholder="Edad">
                <input name="peso" type="number" step="0.1" placeholder="Peso inicial (kg)">
                <input name="estatura" type="number" placeholder="Estatura (cm)">
                <input name="password" type="password" placeholder="Contraseña">
                <select name="objetivo"><option>Perder peso</option><option>Ganar MÚSCULO</option></select>
                <button>Crear Cuenta</button>
            </form>
        </div>
    </body></html>`);
});

app.get('/dashboard', async (req, res) => {
    if (!req.session.usuarioId) return res.redirect('/');
    const { data: user } = await supabase.from('usuarios').select('*').eq('id', req.session.usuarioId).single();
    const salud = calcularSalud(user.peso, user.estatura);
    
    res.send(`<html><head><title>Panel | EN-FORMA AI</title><style>${styles}</style><script src="https://cdn.jsdelivr.net/npm/chart.js"></script></head><body>
        <div class="nav">
            <h2>Hola, ${user.nombre} <span class="sexo-tag">${user.sexo}</span></h2>
            <div style="display:flex; gap:12px; align-items:center;">
                <button id="data-toggle" onclick="toggleLowData()" style="background:#333; color:#aaa; width:auto; padding:8px 18px; font-size:0.75rem; border-radius:20px; border:1px solid #444;">Modo: Normal</button>
                <form action="/logout" method="POST" style="margin:0;"><button style="background:#cc3333; color:white; width:auto; padding:8px 18px; border-radius:8px;">SALIR</button></form>
            </div>
        </div>
        <div class="dashboard-grid">
            <div class="stat-card"><div class="icon-peso"></div><h3>Peso Registrado</h3><p>${user.peso} kg</p></div>
            <div class="stat-card"><div class="icon-meta"></div><h3>Tu Meta</h3><p>${user.objetivo.toUpperCase()}</p></div>
            <div class="stat-card"><h3>Tu Rango</h3><span class="rango-txt">Novato</span><div class="medals"><span class="active">🛡️</span><span>💧</span><span>💎</span></div></div>
            <div class="stat-card">
                <h3>Índice de Salud (IMC)</h3>
                <p style="color:${salud.color}">${salud.val}</p>
                <div style="font-size:0.9rem; margin-top:8px;">Estado: ${salud.status}</div>
                <div class="imc-bar"><div class="imc-fill" style="width:${salud.pct}%; background:${salud.color};"></div></div>
            </div>
            <div class="stat-card" style="grid-column: span 2;">
                <h3>Evolución del Peso</h3>
                <div class="chart-wrapper" style="height:140px;"><canvas id="chart"></canvas></div>
            </div>
        </div>

        <div style="max-width:1100px; margin:30px auto; background:var(--card); padding:35px; border-radius:18px; border-left:6px solid var(--accent);">
            <h2 style="color:var(--accent); margin-top:0;">Estrategia Integral (IA)</h2>
            <div style="line-height:1.8; color:#ddd;">${user.consejo_ia.replace(/músculo/gi, 'MÚSCULO')}</div>
        </div>

        <div style="max-width:1100px; margin:30px auto; background:var(--card); padding:30px; border-radius:18px; text-align:center; border: 1px dashed #444;">
            <h3 style="margin-top:0; color:var(--accent);">Registrar Peso de Hoy</h3>
            <form action="/actualizar-peso" method="POST" style="display:flex; gap:15px; max-width:500px; margin:0 auto;">
                <input name="nuevoPeso" type="number" step="0.1" placeholder="Nuevo peso (kg)" required style="margin-bottom:0;">
                <button style="width:auto; padding:0 30px;">Actualizar</button>
            </form>
        </div>

        <script>
            function toggleLowData() {
                const isLow = document.body.classList.toggle('low-data');
                localStorage.setItem('lowData', isLow);
                document.getElementById('data-toggle').innerText = isLow ? "Modo: Bajo Consumo" : "Modo: Normal";
                if(!isLow) location.reload();
            }
            const savedMode = localStorage.getItem('lowData');
            if(savedMode === 'true') {
                document.body.classList.add('low-data');
                document.getElementById('data-toggle').innerText = "Modo: Bajo Consumo";
            } else {
                localStorage.setItem('lowData', 'false');
                const ctx = document.getElementById('chart').getContext('2d');
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: ${JSON.stringify(user.historial_peso.map(h => h.fecha))},
                        datasets: [{ data: ${JSON.stringify(user.historial_peso.map(h => h.peso))}, borderColor: '#00d4ff', tension: 0.4, fill: true, backgroundColor: 'rgba(0,212,255,0.05)' }]
                    },
                    options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
                });
            }
        </script>
    </body></html>`);
});

// --- MANEJO DE PESO (Lógica restaurada) ---
app.post('/actualizar-peso', async (req, res) => {
    if (!req.session.usuarioId) return res.redirect('/');
    const nuevoPeso = parseFloat(req.body.nuevoPeso);
    const { data: user } = await supabase.from('usuarios').select('historial_peso').eq('id', req.session.usuarioId).single();
    
    const nuevoHistorial = [...user.historial_peso, { fecha: new Date().toLocaleDateString('es-ES'), peso: nuevoPeso }];
    await supabase.from('usuarios').update({ peso: nuevoPeso, historial_peso: nuevoHistorial }).eq('id', req.session.usuarioId);
    res.redirect('/dashboard');
});

app.post('/login', async (req, res) => {
    const { nombre, password } = req.body;
    const { data: users } = await supabase.from('usuarios').select('*').ilike('nombre', nombre.trim()).limit(1);
    if (users?.[0] && await bcrypt.compare(password, users[0].password)) {
        req.session.usuarioId = users[0].id;
        return res.redirect('/dashboard');
    }
    res.send("Error de acceso.");
});

app.post('/registrar', async (req, res) => {
    const { nombre, edad, peso, estatura, password, objetivo, sexo } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const { data } = await supabase.from('usuarios').insert([{
        nombre: nombre.trim(), edad, peso: parseFloat(peso), estatura, password: hashed, objetivo, sexo, 
        consejo_ia: "Generando plan...", 
        historial_peso: [{ fecha: new Date().toLocaleDateString('es-ES'), peso: parseFloat(peso) }]
    }]).select();
    req.session.usuarioId = data[0].id;
    res.redirect('/dashboard');
});

app.post('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));