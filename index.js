require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const app = express();

const PORT = process.env.PORT || 10000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- GESTIÓN DE SESIONES (COOKIES) ---
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

// --- FUNCIÓN DE IA (GROQ) ---
async function llamarGroq(prompt) {
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1000
            })
        });
        const data = await response.json();
        if (data && data.choices && data.choices[0]) {
            return data.choices[0].message.content;
        }
        return "Lo siento, hubo un problema con la IA.";
    } catch (error) {
        console.error("Error Groq:", error);
        return "Error de conexión con la IA.";
    }
}

// --- ESTILOS ---
const styles = `
    :root { --bg: #0f0f0f; --card: #1a1a1a; --accent: #ff6600; --text: #eee; --danger: #cc3333; }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', sans-serif; margin: 0; }
    .app-container { padding: 20px; max-width: 1200px; margin: 0 auto; }
    .navbar { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; background: var(--card); border-bottom: 2px solid var(--accent); position: sticky; top: 0; z-index: 100; }
    .card { background: var(--card); padding: 25px; border-radius: 20px; margin-bottom: 20px; border: 1px solid #333; }
    input, select, textarea { background: #222; border: 1px solid #444; color: #fff; padding: 12px; border-radius: 10px; width: 100%; margin-bottom: 15px; }
    button { padding: 14px; background: var(--accent); border: none; color: #fff; font-weight: bold; cursor: pointer; border-radius: 10px; width: 100%; }
`;

async function getUsuario(req) {
    const userId = req.cookies['uid'];
    if (!userId) return null;
    const { data: user } = await supabase.from('usuarios').select('*').eq('id', userId).single();
    return user || null;
}

// --- RUTAS ---
app.get('/', async (req, res) => {
    const user = await getUsuario(req);
    if (user) return res.redirect('/dashboard');
    res.send(`<html><head><style>${styles}</style></head><body>
        <div class="app-container" style="display:flex; justify-content:center; align-items:center; min-height:80vh;">
            <div class="card" style="width:350px;">
                <h1 style="color:var(--accent); text-align:center;">EN-FORMA AI</h1>
                <form action="/login" method="POST">
                    <input name="nombre" placeholder="Usuario" required>
                    <input name="password" type="password" placeholder="Contraseña" required>
                    <button>ENTRAR</button>
                </form>
                <button onclick="document.getElementById('reg').style.display='block'" style="background:none; color:var(--accent); margin-top:10px;">Crear cuenta</button>
            </div>
        </div>
        <div id="reg" class="card" style="display:none; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:400px; z-index:1000; background:#1a1a1a;">
            <h2>Registro EN-FORMA</h2>
            <form action="/registrar" method="POST">
                <input name="nombre" placeholder="Nombre" required>
                <input name="edad" type="number" placeholder="Edad" required>
                <input name="estatura" type="number" placeholder="Estatura (cm)" required>
                <input name="peso" type="number" step="0.1" placeholder="Peso (kg)" required>
                <select name="objetivo"><option value="Perder PESO">Perder PESO</option><option value="Ganar MÚSCULO">Ganar MÚSCULO</option></select>
                <input name="password" type="password" placeholder="Contraseña" required>
                <button>COMENZAR</button>
            </form>
        </div>
    </body></html>`);
});

app.get('/dashboard', async (req, res) => {
    const user = await getUsuario(req);
    if (!user) return res.redirect('/');
    const { data: notas } = await supabase.from('notas').select('*').eq('usuario_id', user.id).order('fecha', { ascending: false });

    res.send(`<html><head><style>${styles}</style></head><body>
        <div class="navbar"><h3>EN-FORMA AI</h3><form action="/logout" method="POST"><button style="width:auto; padding:5px 15px; background:var(--danger);">Salir</button></form></div>
        <div class="app-container">
            <div class="card" style="border-left:5px solid var(--accent);">
                <h2>Plan Personalizado: ${user.nombre}</h2>
                <div id="rutina">${user.consejo_ia}</div>
            </div>
            <div class="card">
                <h3>Diario de Entrenamiento</h3>
                <form action="/guardar-nota" method="POST">
                    <textarea name="contenido" placeholder="¿Cómo fue el entreno de hoy?" required></textarea>
                    <button>Guardar Nota</button>
                </form>
                <div style="margin-top:20px;">
                    ${notas?.map(n => `<div style="border-bottom:1px solid #333; padding:10px;"><b>${new Date(n.fecha).toLocaleDateString()}:</b> ${n.contenido}</div>`).join('') || ''}
                </div>
            </div>
        </div>
    </body></html>`);
});

app.post('/registrar', async (req, res) => {
    try {
        const { nombre, edad, peso, estatura, password, objetivo } = req.body;
        const hashed = await bcrypt.hash(password, 10);
        const p = `Crea una rutina de gimnasio para ${nombre}, de ${edad} años y ${peso}kg, con el objetivo de ${objetivo}. Responde en HTML simple.`;
        const consejo = await llamarGroq(p);
        const { data, error } = await supabase.from('usuarios').insert([{
            nombre, edad, peso, estatura, password: hashed, objetivo, consejo_ia: consejo
        }]).select();
        if (error) throw error;
        res.setHeader('Set-Cookie', `uid=${data[0].id}; Path=/; HttpOnly; Max-Age=86400`);
        res.redirect('/dashboard');
    } catch (e) { res.send("Error: " + e.message); }
});

app.post('/login', async (req, res) => {
    const { nombre, password } = req.body;
    const { data: u } = await supabase.from('usuarios').select('*').eq('nombre', nombre).single();
    if (u && await bcrypt.compare(password, u.password)) {
        res.setHeader('Set-Cookie', `uid=${u.id}; Path=/; HttpOnly; Max-Age=86400`);
        return res.redirect('/dashboard');
    }
    res.send("Usuario o clave incorrecta");
});

app.post('/guardar-nota', async (req, res) => {
    const user = await getUsuario(req);
    if (user) await supabase.from('notas').insert([{ usuario_id: user.id, contenido: req.body.contenido }]);
    res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'uid=; Path=/; Max-Age=0');
    res.redirect('/');
});

app.listen(PORT, '0.0.0.0', () => console.log('Servidor en puerto ' + PORT));