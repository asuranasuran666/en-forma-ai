require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const app = express();

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://enqbfcrpsqgslmckvswo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_FB4_GaqMpK2AVvvG2Xtx_w_70rjqq5W';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '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';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Cookie simple sin express-session
app.use((req, res, next) => {
    const cookies = {};
    if (req.headers.cookie) {
        req.headers.cookie.split(';').forEach(c => {
            const [k, v] = c.trim().split('=');
            cookies[k] = decodeURIComponent(v);
        });
    }
    req.cookies = cookies;
    next();
});

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- GROQ ---
async function llamarGroq(prompt) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 600
        })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Error Groq');
    }
    const data = await response.json();
    return data.choices[0].message.content;
}

function formatearTexto(texto) {
    if (!texto) return '';
    return texto
        .replace(/músculo/gi, 'MÚSCULO')
        .replace(/musculo/gi, 'MÚSCULO')
        .replace(/\bpeso\b/gi, 'PESO');
}

function calcularSalud(peso, estatura) {
    const imc = (peso / ((estatura / 100) ** 2)).toFixed(1);
    if (imc < 18.5) return { val: imc, status: 'Bajo PESO', color: '#ffcc00', pct: 25 };
    if (imc < 25)   return { val: imc, status: 'Saludable',  color: '#00ff88', pct: 50 };
    if (imc < 30)   return { val: imc, status: 'Sobrepeso',  color: '#ff8800', pct: 75 };
    return           { val: imc, status: 'Obesidad',   color: '#ff4444', pct: 95 };
}

const styles = `
    :root { --bg: #0f0f0f; --card: #1a1a1a; --accent: #00d4ff; --sec: #ff8800; --text: #eee; }
    * { box-sizing: border-box; }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; }
    body.zoom-mode { font-size: 1.25rem; }
    body.zoom-mode .stat-card p { font-size: 2.2rem; }
    body.zoom-mode h2, body.zoom-mode h3 { font-size: 1.5rem; }
    .nav { display: flex; justify-content: space-between; align-items: center; max-width: 1100px; margin: 0 auto 30px; flex-wrap: wrap; gap: 10px; }
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
    .btn-mode { background: #333; color: #aaa; width: auto; padding: 8px 18px; font-size: 0.75rem; border-radius: 20px; border: 1px solid #444; cursor: pointer; font-family: inherit; }
    button { padding: 14px; background: var(--accent); border: none; color: #000; font-weight: bold; cursor: pointer; border-radius: 10px; text-transform: uppercase; width: 100%; font-family: inherit; }
    input, select { background: #222; border: 1px solid #444; color: #fff; padding: 12px; border-radius: 10px; width: 100%; margin-bottom: 15px; font-family: inherit; }
    body.low-data .chart-wrapper, body.low-data .imc-bar, body.low-data [class^="icon-"] { display: none; }
    @media (max-width: 768px) {
        .dashboard-grid { grid-template-columns: 1fr; }
        .nav { flex-direction: column; align-items: flex-start; }
        .stat-card { padding: 18px; }
        body { padding: 12px; }
    }
`;

// Helper para cookies seguras en Render (HTTPS)
const getSecureCookieFlag = () => (process.env.NODE_ENV === 'production' ? 'Secure;' : '');

async function getUsuario(req) {
    const userId = req.cookies['uid'];
    const token  = req.cookies['tok'];
    if (!userId || !token) return null;
    const { data: user } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', userId)
        .eq('session_token', token)
        .single();
    return user || null;
}

app.get('/', async (req, res) => {
    const user = await getUsuario(req);
    if (user) return res.redirect('/dashboard');

    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>EN-FORMA</title>
            <style>${styles}</style>
        </head>
        <body style="display:flex; align-items:center; justify-content:center; min-height:100vh;">
            <div id="login-box" style="background:var(--card); padding:50px; border-radius:25px; width:100%; max-width:380px; text-align:center;">
                <h1 style="color:var(--accent); margin-bottom:35px;">EN-FORMA</h1>
                <form action="/login" method="POST">
                    <input name="nombre" placeholder="Usuario" required>
                    <input name="password" type="password" placeholder="Contraseña" required>
                    <button>Entrar al panel</button>
                </form>
                <p style="font-size:0.9rem; color:#888; margin-top:25px;">
                    ¿Nuevo usuario?
                    <span style="color:var(--accent); cursor:pointer; font-weight:bold;"
                        onclick="document.getElementById('reg-modal').style.display='block'; document.getElementById('login-box').style.display='none';">
                        Regístrate aquí
                    </span>.
                </p>
            </div>

            <div id="reg-modal" style="display:none; background:var(--card); padding:40px; border-radius:25px; width:100%; max-width:380px;">
                <h2 style="margin-top:0; text-align:center;">Nuevo perfil</h2>
                <form action="/registrar" method="POST">
                    <input name="nombre" placeholder="Nombre completo" required>
                    <input name="edad" type="number" placeholder="Edad" required>
                    <input name="peso" type="number" step="0.1" placeholder="PESO inicial (kg)" required>
                    <input name="estatura" type="number" placeholder="Estatura (cm)" required>
                    <input name="password" type="password" placeholder="Contraseña" required>
                    <select name="objetivo">
                        <option value="Perder PESO">Perder PESO</option>
                        <option value="Ganar MÚSCULO">Ganar MÚSCULO</option>
                    </select>
                    <button>Crear cuenta</button>
                </form>
                <p style="font-size:0.9rem; color:#888; margin-top:15px; text-align:center;">
                    ¿Ya tienes cuenta?
                    <span style="color:var(--accent); cursor:pointer; font-weight:bold;"
                        onclick="document.getElementById('login-box').style.display='block'; document.getElementById('reg-modal').style.display='none';">
                        Inicia sesión
                    </span>.
                </p>
            </div>
        </body>
        </html>
    `);
});

app.get('/dashboard', async (req, res) => {
    const user = await getUsuario(req);
    if (!user) return res.redirect('/');

    const salud = calcularSalud(user.peso, user.estatura);
    const consejoFormateado = formatearTexto(user.consejo_ia || 'Generando plan...');

    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Panel | EN-FORMA</title>
            <style>${styles}</style>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        </head>
        <body>
            <div class="nav">
                <h2>Hola, ${user.nombre}</h2>
                <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                    <button class="btn-mode" id="data-toggle" onclick="toggleLowData()">Modo: Normal</button>
                    <button class="btn-mode" id="zoom-toggle" onclick="toggleZoom()">Zoom: Off</button>
                    <form action="/logout" method="POST" style="margin:0;">
                        <button style="background:#cc3333; color:white; width:auto; padding:8px 18px; border-radius:8px;">Salir</button>
                    </form>
                </div>
            </div>

            <div class="dashboard-grid">
                <div class="stat-card">
                    <div class="icon-peso"></div>
                    <h3>PESO registrado</h3>
                    <p>${user.peso} kg</p>
                </div>
                <div class="stat-card">
                    <div class="icon-meta"></div>
                    <h3>Tu meta</h3>
                    <p style="font-size:1.2rem;">${formatearTexto(user.objetivo)}</p>
                </div>
                <div class="stat-card">
                    <h3>Tu rango</h3>
                    <span class="rango-txt">Novato</span>
                    <div class="medals">
                        <span class="active">🛡️</span>
                        <span>💧</span>
                        <span>💎</span>
                    </div>
                </div>
                <div class="stat-card">
                    <h3>Índice de salud (IMC)</h3>
                    <p style="color:${salud.color}">${salud.val}</p>
                    <div style="font-size:0.9rem; margin-top:8px;">Estado: ${salud.status}</div>
                    <div class="imc-bar">
                        <div class="imc-fill" style="width:${salud.pct}%; background:${salud.color};"></div>
                    </div>
                </div>
                <div class="stat-card" style="grid-column: span 2;">
                    <h3>Evolución del PESO</h3>
                    <div class="chart-wrapper" style="height:140px;">
                        <canvas id="chart"></canvas>
                    </div>
                </div>
            </div>

            <div style="max-width:1100px; margin:30px auto; background:var(--card); padding:35px; border-radius:18px; border-left:6px solid var(--accent);">
                <h2 style="color:var(--accent); margin-top:0;">Nuestra recomendacion</h2>
                <div style="line-height:1.8; color:#ddd;">${consejoFormateado}</div>
            </div>

            <div style="max-width:1100px; margin:30px auto; background:var(--card); padding:30px; border-radius:18px; text-align:center; border:1px dashed #444;">
                <h3 style="margin-top:0; color:var(--accent);">Registrar PESO de hoy</h3>
                <form action="/actualizar-peso" method="POST" style="display:flex; gap:15px; max-width:500px; margin:0 auto; flex-wrap:wrap;">
                    <input name="nuevoPeso" type="number" step="0.1" placeholder="Nuevo PESO (kg)" required style="margin-bottom:0; flex:1;">
                    <button style="width:auto; padding:0 30px;">Guardar</button>
                </form>
            </div>

            <script>
                function toggleLowData() {
                    const isLow = document.body.classList.toggle('low-data');
                    localStorage.setItem('lowData', isLow);
                    document.getElementById('data-toggle').innerText = isLow ? "Modo: Bajo consumo" : "Modo: Normal";
                    if (!isLow) location.reload();
                }
                function toggleZoom() {
                    const isZoom = document.body.classList.toggle('zoom-mode');
                    localStorage.setItem('zoomMode', isZoom);
                    document.getElementById('zoom-toggle').innerText = isZoom ? "Zoom: On" : "Zoom: Off";
                }
                if (localStorage.getItem('lowData') === 'true') {
                    document.body.classList.add('low-data');
                    document.getElementById('data-toggle').innerText = "Modo: Bajo consumo";
                }
                if (localStorage.getItem('zoomMode') === 'true') {
                    document.body.classList.add('zoom-mode');
                    document.getElementById('zoom-toggle').innerText = "Zoom: On";
                }
                if (!document.body.classList.contains('low-data')) {
                    const ctx = document.getElementById('chart').getContext('2d');
                    new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: ${JSON.stringify(user.historial_peso.map(h => h.fecha))},
                            datasets: [{
                                data: ${JSON.stringify(user.historial_peso.map(h => h.peso))},
                                borderColor: '#00d4ff',
                                tension: 0.4,
                                fill: true,
                                backgroundColor: 'rgba(0,212,255,0.05)'
                            }]
                        },
                        options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
                    });
                }
            </script>
        </body>
        </html>
    `);
});

app.post('/login', async (req, res) => {
    const { nombre, password } = req.body;
    const { data: users } = await supabase
        .from('usuarios')
        .select('*')
        .ilike('nombre', nombre.trim())
        .limit(1);

    if (users?.[0] && await bcrypt.compare(password, users[0].password)) {
        const token = crypto.randomBytes(32).toString('hex');
        await supabase.from('usuarios').update({ session_token: token }).eq('id', users[0].id);
        
        const secureFlag = getSecureCookieFlag();
        res.setHeader('Set-Cookie', [
            `uid=${users[0].id}; Path=/; HttpOnly; ${secureFlag} Max-Age=86400; SameSite=Lax`,
            `tok=${token}; Path=/; HttpOnly; ${secureFlag} Max-Age=86400; SameSite=Lax`
        ]);
        return res.redirect('/dashboard');
    }

    res.send("Usuario o contraseña incorrectos. <a href='/'>Volver</a>");
});

app.post('/registrar', async (req, res) => {
    const { nombre, edad, peso, estatura, password, objetivo } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString('hex');

    const prompt = `Actua como entrenador personal de EN-FORMA. Crea una rutina corta y motivadora para ${nombre}, de ${edad} anos y ${peso}kg, cuyo objetivo es: ${objetivo}. Se concreto, incluye 3-4 ejercicios con series y repeticiones. Responde en formato HTML usando solo etiquetas p, strong y ul/li. Sin estilos inline.`;

    let consejo_ia = 'Generando plan...';
    try {
        consejo_ia = await llamarGroq(prompt);
    } catch (e) {
        console.error('Error Groq:', e.message);
    }

    const { data } = await supabase.from('usuarios').insert([{
        nombre: nombre.trim(),
        edad: parseInt(edad),
        peso: parseFloat(peso),
        estatura: parseInt(estatura),
        password: hashed,
        objetivo,
        consejo_ia,
        session_token: token,
        historial_peso: [{ fecha: new Date().toLocaleDateString('es-ES'), peso: parseFloat(peso) }]
    }]).select();

    const secureFlag = getSecureCookieFlag();
    res.setHeader('Set-Cookie', [
        `uid=${data[0].id}; Path=/; HttpOnly; ${secureFlag} Max-Age=86400; SameSite=Lax`,
        `tok=${token}; Path=/; HttpOnly; ${secureFlag} Max-Age=86400; SameSite=Lax`
    ]);
    res.redirect('/dashboard');
});

app.post('/actualizar-peso', async (req, res) => {
    const user = await getUsuario(req);
    if (!user) return res.redirect('/');
    const nuevoPeso = parseFloat(req.body.nuevoPeso);
    const nuevoHistorial = [...user.historial_peso, {
        fecha: new Date().toLocaleDateString('es-ES'),
        peso: nuevoPeso
    }];
    await supabase.from('usuarios').update({ peso: nuevoPeso, historial_peso: nuevoHistorial }).eq('id', user.id);
    res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
    res.setHeader('Set-Cookie', [
        'uid=; Path=/; Max-Age=0',
        'tok=; Path=/; Max-Age=0'
    ]);
    res.redirect('/');
});

app.listen(PORT, () => console.log('Servidor EN-FORMA activo en puerto ' + PORT));