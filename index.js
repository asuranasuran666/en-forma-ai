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

// --- COOKIE HANDLER ---
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

// --- LÓGICA DE IA (GROQ) ---
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
            max_tokens: 800
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
    return texto.replace(/músculo/gi, 'MÚSCULO').replace(/musculo/gi, 'MÚSCULO').replace(/\bpeso\b/gi, 'PESO');
}

function calcularSalud(peso, estatura) {
    const imc = (peso / ((estatura / 100) ** 2)).toFixed(1);
    if (imc < 18.5) return { val: imc, status: 'Bajo PESO', color: '#ffcc00', pct: 25 };
    if (imc < 25)   return { val: imc, status: 'Saludable',  color: '#00ff88', pct: 50 };
    if (imc < 30)   return { val: imc, status: 'Sobrepeso',  color: '#ff8800', pct: 75 };
    return           { val: imc, status: 'Obesidad',   color: '#ff4444', pct: 95 };
}

// --- ESTILOS MAESTROS (CSS) ---
const styles = `
    :root { --bg: #0f0f0f; --card: #1a1a1a; --accent: #00d4ff; --sec: #ff8800; --text: #eee; --danger: #cc3333; }
    * { box-sizing: border-box; transition: transform 0.2s ease, left 0.3s ease; }
    
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; overflow-x: hidden; }
    
    /* ZOOM GLOBAL +25% */
    body.zoom-mode { font-size: 1.25rem; }
    body.zoom-mode .card, body.zoom-mode .stat-card { transform: scale(1.05); }

    /* LAYOUT DASHBOARD */
    .app-container { padding: 20px; max-width: 1200px; margin: 0 auto; }
    
    /* NAVBAR Y HAMBURGUESA */
    .navbar { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; background: var(--card); border-bottom: 1px solid #333; position: sticky; top: 0; z-index: 100; }
    .menu-btn { font-size: 1.8rem; cursor: pointer; color: var(--accent); background: none; border: none; padding: 0; width: auto; }
    
    .sidebar { position: fixed; top: 0; left: -300px; width: 280px; height: 100%; background: var(--card); box-shadow: 5px 0 15px rgba(0,0,0,0.5); z-index: 200; padding: 30px 20px; display: flex; flex-direction: column; }
    .sidebar.active { left: 0; }
    .sidebar-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: none; z-index: 150; }
    .sidebar-overlay.active { display: block; }
    
    /* COMPONENTES */
    .card { background: var(--card); padding: 30px; border-radius: 20px; text-align: center; }
    .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-top: 20px; }
    .stat-card { background: var(--card); padding: 20px; border-radius: 15px; border-top: 4px solid var(--accent); text-align: center; }
    .stat-card p { font-size: 1.8rem; font-weight: bold; color: var(--accent); margin: 10px 0; }
    
    /* FORMULARIOS */
    input, select, textarea { background: #222; border: 1px solid #444; color: #fff; padding: 12px; border-radius: 10px; width: 100%; margin-bottom: 15px; font-family: inherit; }
    button { padding: 14px; background: var(--accent); border: none; color: #000; font-weight: bold; cursor: pointer; border-radius: 10px; text-transform: uppercase; width: 100%; }
    
    /* SELECTOR SEXO */
    .gender-grid { display: flex; gap: 10px; margin-bottom: 15px; }
    .gender-box { flex: 1; border: 2px solid #444; padding: 10px; border-radius: 12px; cursor: pointer; text-align: center; }
    .gender-box input { display: none; }
    .gender-box:has(input:checked) { border-color: var(--accent); background: rgba(0,212,255,0.1); }

    .logout-btn { background: var(--danger); color: white; margin-top: auto; }
    
    @media (max-width: 768px) { .dashboard-grid { grid-template-columns: 1fr; } }
`;

// --- HELPERS SERVIDOR ---
const getSecureCookieFlag = () => (process.env.NODE_ENV === 'production' ? 'Secure;' : '');

async function getUsuario(req) {
    const userId = req.cookies['uid'];
    const token = req.cookies['tok'];
    if (!userId || !token) return null;
    const { data: user } = await supabase.from('usuarios').select('*').eq('id', userId).eq('session_token', token).single();
    return user || null;
}

// --- RUTAS ---

app.get('/', async (req, res) => {
    const user = await getUsuario(req);
    if (user) return res.redirect('/dashboard');
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>EN-FORMA | Login</title><style>${styles}</style>
        </head>
        <body style="display:flex; align-items:center; justify-content:center; min-height:100vh; flex-direction:column; gap:20px;">
            <button onclick="toggleZoom()" id="z-btn" style="width:auto; background:#333; color:var(--accent); border:1px solid var(--accent); padding:10px 20px; border-radius:50px;">🔍 Zoom: Off</button>
            
            <div id="login-box" class="card" style="max-width:380px; width:90%;">
                <h1 style="color:var(--accent);">EN-FORMA</h1>
                <form action="/login" method="POST">
                    <input name="nombre" placeholder="Usuario" required>
                    <input name="password" type="password" placeholder="Contraseña" required>
                    <button>Entrar</button>
                </form>
                <p style="margin-top:20px; font-size:0.9rem; color:#888;">¿No tienes cuenta? <span style="color:var(--accent); cursor:pointer;" onclick="switchBox('reg-modal','login-box')">Regístrate</span></p>
            </div>

            <div id="reg-modal" class="card" style="max-width:420px; width:90%; display:none;">
                <h2>Nuevo Perfil</h2>
                <form action="/registrar" method="POST">
                    <input name="nombre" placeholder="Nombre" required>
                    <div style="display:flex; gap:10px;"><input name="edad" type="number" placeholder="Edad" required><input name="estatura" type="number" placeholder="Estatura (cm)" required></div>
                    
                    <p style="text-align:left; font-size:0.8rem; color:var(--accent); margin:5px 0;">Sexo biológico:</p>
                    <div class="gender-grid">
                        <label class="gender-box"><input type="radio" name="sexo" value="Masculino" required>♂️<br>Hombre</label>
                        <label class="gender-box"><input type="radio" name="sexo" value="Femenino">♀️<br>Mujer</label>
                    </div>

                    <input name="peso" type="number" step="0.1" placeholder="PESO actual (kg)" required>
                    <select name="objetivo">
                        <option value="Perder PESO">Perder PESO</option>
                        <option value="Ganar MÚSCULO">Ganar MÚSCULO</option>
                        <option value="Recomposición">Perder grasa y ganar MÚSCULO</option>
                        <option value="Movilidad">Flexibilidad y Salud</option>
                    </select>
                    <textarea name="padecimientos" placeholder="Enfermedades o lesiones (Ej: Hernia, Hipertensión...)"></textarea>
                    <input name="password" type="password" placeholder="Contraseña" required>
                    <button>Crear Cuenta</button>
                </form>
                <button onclick="switchBox('login-box','reg-modal')" style="background:none; color:var(--accent); text-transform:none;">Volver al login</button>
            </div>

            <script>
                function toggleZoom(){
                    const isZ = document.body.classList.toggle('zoom-mode');
                    localStorage.setItem('zoomMode', isZ);
                    document.getElementById('z-btn').innerText = isZ ? "🔍 Zoom: On (+25%)" : "🔍 Zoom: Off";
                }
                function switchBox(show, hide){
                    document.getElementById(show).style.display = 'block';
                    document.getElementById(hide).style.display = 'none';
                }
                if(localStorage.getItem('zoomMode')==='true') toggleZoom();
            </script>
        </body>
        </html>
    `);
});

app.get('/dashboard', async (req, res) => {
    const user = await getUsuario(req);
    if (!user) return res.redirect('/');

    const salud = calcularSalud(user.peso, user.estatura);
    const consejo = formatearTexto(user.consejo_ia || 'Generando plan...');

    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Panel | EN-FORMA</title><style>${styles}</style>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        </head>
        <body>
            <div class="sidebar-overlay" id="overlay" onclick="toggleMenu()"></div>
            <div class="sidebar" id="sidebar">
                <h2 style="color:var(--accent); margin-top:0;">EN-FORMA</h2>
                <p>Hola, <strong>${user.nombre}</strong></p>
                <hr style="border:0; border-top:1px solid #333; margin:20px 0;">
                
                <button onclick="toggleZoom()" id="z-btn-side" style="background:#222; margin-bottom:10px;">🔍 Zoom: Off</button>
                <button onclick="location.reload()" style="background:#222; margin-bottom:10px;">🥗 Mi Alimentación</button>
                
                <form action="/logout" method="POST" style="margin-top:auto;">
                    <button class="logout-btn">Cerrar Sesión</button>
                </form>
            </div>

            <div class="navbar">
                <button class="menu-btn" onclick="toggleMenu()">☰</button>
                <h3 style="margin:0; color:var(--accent);">EN-FORMA AI</h3>
                <div style="width:30px;"></div>
            </div>

            <div class="app-container">
                <div class="dashboard-grid">
                    <div class="stat-card"><h3>PESO Actual</h3><p>${user.peso} kg</p></div>
                    <div class="stat-card"><h3>Meta</h3><p style="font-size:1.1rem;">${user.objetivo}</p></div>
                    <div class="stat-card"><h3>Salud (IMC)</h3><p style="color:${salud.color}">${salud.val}</p><span>${salud.status}</span></div>
                    
                    <div class="stat-card" style="grid-column: span 2;">
                        <h3>Evolución</h3>
                        <div style="height:150px;"><canvas id="chart"></canvas></div>
                    </div>
                </div>

                <div class="card" style="margin-top:20px; text-align:left; border-left:6px solid var(--accent);">
                    <h2 style="color:var(--accent); margin-top:0;">Tu Plan Personalizado (Adaptado)</h2>
                    <div style="line-height:1.6; color:#ccc;">${consejo}</div>
                </div>

                <div class="card" style="margin-top:20px;">
                    <h3>Actualizar PESO</h3>
                    <form action="/actualizar-peso" method="POST" style="display:flex; gap:10px;">
                        <input name="nuevoPeso" type="number" step="0.1" placeholder="kg" required>
                        <button style="width:auto; padding:0 30px;">Guardar</button>
                    </form>
                </div>
            </div>

            <script>
                function toggleMenu(){
                    document.getElementById('sidebar').classList.toggle('active');
                    document.getElementById('overlay').classList.toggle('active');
                }
                function toggleZoom(){
                    const isZ = document.body.classList.toggle('zoom-mode');
                    localStorage.setItem('zoomMode', isZ);
                    const btn = document.getElementById('z-btn-side');
                    if(btn) btn.innerText = isZ ? "🔍 Zoom: On" : "🔍 Zoom: Off";
                }
                if(localStorage.getItem('zoomMode')==='true') toggleZoom();

                const ctx = document.getElementById('chart').getContext('2d');
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: ${JSON.stringify(user.historial_peso.map(h => h.fecha))},
                        datasets: [{
                            data: ${JSON.stringify(user.historial_peso.map(h => h.peso))},
                            borderColor: '#00d4ff', tension: 0.4, fill: true, backgroundColor: 'rgba(0,212,255,0.05)'
                        }]
                    },
                    options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
                });
            </script>
        </body>
        </html>
    `);
});

app.post('/login', async (req, res) => {
    const { nombre, password } = req.body;
    const { data: users } = await supabase.from('usuarios').select('*').ilike('nombre', nombre.trim()).limit(1);

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
    res.send("Error. <a href='/'>Volver</a>");
});

app.post('/registrar', async (req, res) => {
    const { nombre, edad, peso, estatura, password, objetivo, sexo, padecimientos } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString('hex');

    const prompt = `Actúa como un experto entrenador médico deportivo. Crea un plan para ${nombre}. 
    Datos: Sexo ${sexo}, ${edad} años, ${peso}kg. Objetivo: ${objetivo}. 
    IMPORTANTE: El usuario padece de: "${padecimientos || 'Ninguno'}". 
    Crea una rutina de 4 ejercicios. Si tiene padecimientos, EVITA ejercicios que afecten esa zona y propón alternativas seguras de bajo impacto. 
    Usa formato HTML (p, strong, ul, li). Sin estilos inline.`;

    let consejo_ia = 'Generando tu plan seguro...';
    try { consejo_ia = await llamarGroq(prompt); } catch (e) { console.error(e); }

    const { data, error } = await supabase.from('usuarios').insert([{
        nombre: nombre.trim(),
        edad: parseInt(edad),
        peso: parseFloat(peso),
        estatura: parseInt(estatura),
        sexo,
        padecimientos,
        password: hashed,
        objetivo,
        consejo_ia,
        session_token: token,
        historial_peso: [{ fecha: new Date().toLocaleDateString('es-ES'), peso: parseFloat(peso) }]
    }]).select();

    if(error) return res.send("Error al registrar: " + error.message);

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
    const nuevoHistorial = [...user.historial_peso, { fecha: new Date().toLocaleDateString('es-ES'), peso: nuevoPeso }];
    await supabase.from('usuarios').update({ peso: nuevoPeso, historial_peso: nuevoHistorial }).eq('id', user.id);
    res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
    res.setHeader('Set-Cookie', ['uid=; Path=/; Max-Age=0', 'tok=; Path=/; Max-Age=0']);
    res.redirect('/');
});

app.listen(PORT, () => console.log('Servidor activo en ' + PORT));