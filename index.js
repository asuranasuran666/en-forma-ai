require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const app = express();

const PORT = process.env.PORT || 10000;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'secreto-en-forma-ai',
    resave: false,
    saveUninitialized: false
}));

const styles = `
    :root { --bg: #000; --card: #111; --accent: #00aaff; --text: #fff; --sec: #00ff88; }
    body { background: var(--bg); color: var(--text); font-family: sans-serif; margin: 0; padding: 15px; display: flex; flex-direction: column; align-items: center; }
    .card { background: var(--card); padding: 25px; border-radius: 15px; border: 1px solid var(--accent); text-align: center; width: 100%; max-width: 450px; box-sizing: border-box; }
    input, select { width: 100%; padding: 14px; margin: 10px 0; border-radius: 8px; border: none; background: #222; color: #fff; box-sizing: border-box; font-size: 16px; }
    button { width: 100%; padding: 15px; background: var(--accent); border: none; border-radius: 8px; color: #000; font-weight: bold; cursor: pointer; font-size: 16px; }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; width: 100%; max-width: 1100px; margin-top: 20px; }
    .stat-card { background: var(--card); padding: 20px; border-radius: 12px; border: 1px solid #333; text-align: center; }
    .update-section { background: var(--card); border: 1px dashed #444; padding: 20px; border-radius: 15px; margin-top: 20px; width: 100%; max-width: 1100px; box-sizing: border-box; }
`;

app.get('/', (req, res) => {
    if (req.session.usuarioId) return res.redirect('/dashboard');
    res.send(`<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${styles}</style></head><body>
        <div class="card">
            <h2>EN-FORMA AI</h2>
            <form action="/login" method="POST">
                <input name="nombre" placeholder="Usuario" required>
                <input name="password" type="password" placeholder="Contraseña" required>
                <button>ENTRAR AL PANEL</button>
            </form>
            <p>¿Nuevo? <a href="/registro" style="color:var(--accent)">Regístrate</a></p>
        </div></body></html>`);
});

app.get('/registro', (req, res) => {
    res.send(`<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${styles}</style></head><body>
        <div class="card">
            <h2 style="color:var(--sec)">CREAR PERFIL</h2>
            <form action="/registrar" method="POST">
                <input name="nombre" placeholder="Nombre" required>
                <input name="peso" type="number" step="0.1" placeholder="PESO INICIAL (kg)" required>
                <input name="estatura" type="number" placeholder="Estatura (cm)" required>
                <input name="password" type="password" placeholder="Contraseña" required>
                <select name="objetivo">
                    <option>Perder PESO</option>
                    <option>Ganar MÚSCULO</option>
                </select>
                <button style="background:var(--sec)">CREAR CUENTA</button>
            </form>
        </div></body></html>`);
});

app.get('/dashboard', async (req, res) => {
    if (!req.session.usuarioId) return res.redirect('/');
    const { data: user } = await supabase.from('usuarios').select('*').eq('id', req.session.usuarioId).single();
    
    res.send(`<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${styles}</style></head><body>
        <div style="width:100%; max-width:1100px; display:flex; justify-content:space-between; align-items:center;">
            <h3>HOLA, ${user.nombre.toUpperCase()}</h3>
            <form action="/logout" method="POST" style="margin:0;"><button style="width:auto; padding:8px 15px; background:#444; color:#fff;">SALIR</button></form>
        </div>

        <div class="stat-grid">
            <div class="stat-card"><h4>PESO ACTUAL</h4><p style="font-size:28px; color:var(--accent); margin:10px 0;">${user.peso} kg</p></div>
            <div class="stat-card"><h4>META</h4><p style="font-size:18px; margin:15px 0;">${user.objetivo.toUpperCase()}</p></div>
        </div>

        <div class="update-section">
            <h4 style="margin-top:0; color:var(--accent);">ACTUALIZAR PESO DE HOY</h4>
            <form action="/actualizar-peso" method="POST" style="display:flex; gap:10px;">
                <input name="nuevoPeso" type="number" step="0.1" placeholder="Nuevo PESO (kg)" required style="margin:0;">
                <button style="width:auto; white-space:nowrap;">GUARDAR</button>
            </form>
        </div>

        <div class="card" style="margin-top:20px; max-width:1100px; text-align:left; border-color:var(--sec);">
            <h3 style="color:var(--sec)">ESTRATEGIA IA</h3>
            <p>Tu objetivo es ${user.objetivo.toUpperCase()}. Mantén la constancia para ver resultados en tu MÚSCULO.</p>
        </div>
    </body></html>`);
});

app.post('/actualizar-peso', async (req, res) => {
    if (!req.session.usuarioId) return res.redirect('/');
    const nuevoPeso = parseFloat(req.body.nuevoPeso);
    const { data: user } = await supabase.from('usuarios').select('historial_peso').eq('id', req.session.usuarioId).single();
    
    const nuevoHistorial = [...(user.historial_peso || []), { fecha: new Date().toLocaleDateString('es-ES'), peso: nuevoPeso }];
    await supabase.from('usuarios').update({ peso: nuevoPeso, historial_peso: nuevoHistorial }).eq('id', req.session.usuarioId);
    res.redirect('/dashboard');
});

app.post('/login', async (req, res) => {
    const { nombre, password } = req.body;
    const { data: user } = await supabase.from('usuarios').select('*').ilike('nombre', nombre.trim()).eq('password', password).single();
    if (user) {
        req.session.usuarioId = user.id;
        return res.redirect('/dashboard');
    }
    res.send("ACCESO DENEGADO. <a href='/'>REINTENTAR</a>");
});

app.post('/registrar', async (req, res) => {
    const { nombre, peso, estatura, password, objetivo } = req.body;
    const { data } = await supabase.from('usuarios').insert([{ 
        nombre, peso: parseFloat(peso), estatura, password, objetivo,
        historial_peso: [{ fecha: new Date().toLocaleDateString('es-ES'), peso: parseFloat(peso) }]
    }]).select();
    req.session.usuarioId = data[0].id;
    res.redirect('/dashboard');
});

app.post('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.listen(PORT, () => console.log("Servidor en marcha"));