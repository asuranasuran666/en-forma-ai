require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const app = express();

const PORT = process.env.PORT || 10000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'secreto-en-forma-ai',
    resave: false,
    saveUninitialized: false
}));

const styles = `
    :root { --bg: #000; --card: #111; --accent: #00aaff; --text: #fff; }
    body { background: var(--bg); color: var(--text); font-family: sans-serif; margin: 0; padding: 15px; display: flex; flex-direction: column; align-items: center; }
    .card { background: var(--card); padding: 25px; border-radius: 15px; border: 1px solid var(--accent); text-align: center; width: 100%; max-width: 400px; box-sizing: border-box; }
    input, select { width: 100%; padding: 14px; margin: 10px 0; border-radius: 8px; border: none; background: #222; color: #fff; box-sizing: border-box; }
    button { width: 100%; padding: 15px; background: var(--accent); border: none; border-radius: 8px; color: #000; font-weight: bold; cursor: pointer; }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; width: 100%; max-width: 1100px; margin-top: 20px; }
    .stat-card { background: var(--card); padding: 20px; border-radius: 12px; border: 1px solid #333; text-align: center; }
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
            <h2>CREAR PERFIL</h2>
            <form action="/registrar" method="POST">
                <input name="nombre" placeholder="Nombre" required>
                <input name="peso" type="number" step="0.1" placeholder="PESO (kg)" required>
                <input name="estatura" type="number" placeholder="Estatura (cm)" required>
                <input name="password" type="password" placeholder="Contraseña" required>
                <select name="objetivo">
                    <option>Perder PESO</option>
                    <option>Ganar MÚSCULO</option>
                </select>
                <button>CREAR CUENTA</button>
            </form>
        </div></body></html>`);
});

app.get('/dashboard', async (req, res) => {
    if (!req.session.usuarioId) return res.redirect('/');
    const { data: user } = await supabase.from('usuarios').select('*').eq('id', req.session.usuarioId).single();
    res.send(`<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${styles}</style></head><body>
        <div style="width:100%; max-width:1100px; display:flex; justify-content:space-between; align-items:center;">
            <h3>Hola, ${user.nombre}</h3>
            <form action="/logout" method="POST"><button style="width:auto; padding:8px 15px; background:#444; color:#fff;">SALIR</button></form>
        </div>
        <div class="stat-grid">
            <div class="stat-card"><h4>PESO ACTUAL</h4><p style="font-size:24px; color:var(--accent)">${user.peso} kg</p></div>
            <div class="stat-card"><h4>META</h4><p>${user.objetivo.toUpperCase()}</p></div>
        </div>
        <div class="card" style="margin-top:20px; max-width:1100px; text-align:left;">
            <h3 style="color:var(--accent)">PLAN DE ACCIÓN</h3>
            <p>Enfócate en ganar MÚSCULO y mantener tu PESO bajo control.</p>
        </div>
    </body></html>`);
});

app.post('/login', async (req, res) => {
    const { nombre, password } = req.body;
    const { data: user } = await supabase.from('usuarios').select('*').eq('nombre', nombre.trim()).eq('password', password).single();
    if (user) {
        req.session.usuarioId = user.id;
        return res.redirect('/dashboard');
    }
    res.send("Acceso denegado. <a href='/'>Reintentar</a>");
});

app.post('/registrar', async (req, res) => {
    const { nombre, peso, estatura, password, objetivo } = req.body;
    const { data } = await supabase.from('usuarios').insert([{ nombre, peso, estatura, password, objetivo }]).select();
    req.session.usuarioId = data[0].id;
    res.redirect('/dashboard');
});

app.post('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.listen(PORT, () => console.log("Servidor listo"));