require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const app = express();

const PORT = process.env.PORT || 10000;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'secreto-en-forma-ai-pro',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000, secure: false } // Cambiar a true si usas HTTPS
}));

const styles = `
    :root { --bg: #000; --card: #111; --accent: #00aaff; --text: #fff; --btn-reg: #00ff88; }
    body { background: var(--bg); color: var(--text); font-family: sans-serif; margin: 0; padding: 15px; display: flex; flex-direction: column; align-items: center; }
    .container { width: 100%; max-width: 400px; margin-top: 50px; }
    .card { background: var(--card); padding: 25px; border-radius: 15px; border: 1px solid var(--accent); text-align: center; box-sizing: border-box; width: 100%; }
    input, select { width: 100%; padding: 14px; margin: 10px 0; border-radius: 8px; border: none; background: #222; color: #fff; box-sizing: border-box; font-size: 16px; }
    button { width: 100%; padding: 15px; background: var(--accent); border: none; border-radius: 8px; color: #000; font-weight: bold; cursor: pointer; margin-top: 10px; font-size: 16px; }
    .btn-registro { background: var(--btn-reg); }
    .nav { width: 100%; max-width: 1100px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; width: 100%; max-width: 1100px; }
    .stat-card { background: var(--card); padding: 20px; border-radius: 12px; border: 1px solid #333; text-align: center; }
    h2 { color: var(--accent); }
    a { color: var(--accent); text-decoration: none; font-weight: bold; }
`;

// --- VISTAS ---

app.get('/', (req, res) => {
    if (req.session.usuarioId) return res.redirect('/dashboard');
    res.send(`<!DOCTYPE html><html><head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${styles}</style></head><body>
        <div class="container"><div class="card">
            <h2>EN-FORMA AI</h2>
            <form action="/login" method="POST">
                <input name="nombre" placeholder="Usuario" required>
                <input name="password" type="password" placeholder="Contraseña" required>
                <button type="submit">ENTRAR AL PANEL</button>
            </form>
            <p style="font-size: 14px; color: #888;">¿Nuevo? <a href="/registro">Regístrate aquí</a></p>
        </div></div></body></html>`);
});

app.get('/registro', (req, res) => {
    res.send(`<!DOCTYPE html><html><head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${styles}</style></head><body>
        <div class="container"><div class="card">
            <h2 style="color:var(--btn-reg)">Crear Perfil</h2>
            <form action="/auth-registro" method="POST">
                <input name="nombre" placeholder="Nombre completo" required>
                <input name="edad" type="number" placeholder="Edad" required>
                <input name="peso" type="number" step="0.1" placeholder="Peso (kg)" required>
                <input name="estatura" type="number" placeholder="Estatura (cm)" required>
                <input name="password" type="password" placeholder="Contraseña" required>
                <select name="objetivo">
                    <option value="Perder peso">Perder peso</option>
                    <option value="Ganar MÚSCULO">Ganar MÚSCULO</option>
                </select>
                <button type="submit" class="btn-registro">CREAR CUENTA</button>
            </form>
            <p><a href="/">Volver al Login</a></p>
        </div></div></body></html>`);
});

app.get('/dashboard', async (req, res) => {
    if (!req.session.usuarioId) return res.redirect('/');
    const { data: user } = await supabase.from('usuarios').select('*').eq('id', req.session.usuarioId).single();
    if (!user) return res.redirect('/');

    res.send(`<!DOCTYPE html><html><head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${styles}</style></head><body>
        <div class="nav">
            <h3>Hola, ${user.nombre}</h3>
            <form action="/logout" method="POST"><button style="width:auto; background:#444; color:#fff; padding:8px 15px;">SALIR</button></form>
        </div>
        <div class="stat-grid">
            <div class="stat-card"><h4>Peso</h4><p style="font-size:24px; color:var(--accent)">${user.peso} kg</p></div>
            <div class="stat-card"><h4>Meta</h4><p>${user.objetivo.toUpperCase()}</p></div>
        </div>
        <div class="card" style="margin-top:20px; text-align:left;">
            <h3 style="color:var(--accent)">Plan de Acción</h3>
            <p>${user.consejo_ia || "Calculando tu estrategia..."}</p>
        </div>
    </body></html>`);
});

// --- LÓGICA ---

app.post('/auth-registro', async (req, res) => {
    try {
        const { nombre, edad, peso, estatura, password, objetivo } = req.body;
        const hashed = await bcrypt.hash(password, 10);
        
        const { data, error } = await supabase.from('usuarios').insert([{
            nombre: nombre.trim(), 
            edad, 
            peso: parseFloat(peso), 
            estatura, 
            password: hashed, 
            objetivo,
            consejo_ia: `Tu plan para ${objetivo} está listo. Enfócate en la constancia.`
        }]).select();

        if (error) throw error;
        req.session.usuarioId = data[0].id;
        res.redirect('/dashboard');
    } catch (e) {
        res.send("Error en registro: " + e.message);
    }
});

app.post('/login', async (req, res) => {
    const { nombre, password } = req.body;
    const { data: user } = await supabase.from('usuarios').select('*').eq('nombre', nombre.trim()).single();

    if (user && await bcrypt.compare(password, user.password)) {
        req.session.usuarioId = user.id;
        return res.redirect('/dashboard');
    }
    res.send("Acceso denegado. <a href='/'>Reintentar</a>");
});

app.post('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));