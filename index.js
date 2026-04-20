require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const app = express();

const PORT = process.env.PORT || 10000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- FUNCIÓN DE IA (GROQ) ---
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
            max_tokens: 1000
        })
    });
    const data = await response.json();

        // Verificamos que la respuesta tenga datos antes de intentar leerlos
        if (data && data.choices && data.choices[0] && data.choices[0].message) {
            return data.choices[0].message.content;
        } else {
            console.error("Error en la respuesta de Groq:", data);
            return "Lo siento, hubo un problema con la IA. Por favor, intenta de nuevo.";
        }
    } catch (error) {
        console.error("Error de conexión:", error);
        return "Error de conexión con el servidor de inteligencia artificial.";
    }
}

// --- ESTILOS DE LA APP ---
const styles = `
    :root { --bg: #0f0f0f; --card: #1a1a1a; --accent: #00d4ff; --text: #eee; --danger: #cc3333; }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', sans-serif; margin: 0; }
    body.zoom-mode { font-size: 1.25rem; }
    .app-container { padding: 20px; max-width: 1200px; margin: 0 auto; }
    .navbar { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; background: var(--card); border-bottom: 1px solid #333; position: sticky; top: 0; z-index: 100; }
// --- FUNCIÓN DE IA (GROQ) ---
async function llamarGroq(prompt) {
    try { // <--- ESTO ES LO QUE TE FALTA ABRIR
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1000
            })
        }); // <--- AQUÍ SE CIERRA EL FETCH

        const data = await response.json();

        if (data && data.choices && data.choices[0] && data.choices[0].message) {
            return data.choices[0].message.content;
        } else {
            console.error("Error en la respuesta de Groq:", data);
            return "Lo siento, hubo un problema con la IA.";
        }
    } catch (error) { // <--- AHORA ESTE CATCH SÍ TIENE SENTIDO
        console.error("Error de conexión:", error);
        return "Error de conexión con el servidor de inteligencia artificial";
    }
    const response = await fetch('https://api.groq.com/openai/v1/chat/comple>
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

        // Verificamos que la respuesta tenga datos antes de intentar leerlos
        if (data && data.choices && data.choices[0] && data.choices[0].messa>
            return data.choices[0].message.content;
        } else {
            console.error("Error en la respuesta de Groq:", data);
            return "Lo siento, hubo un problema con la IA. Por favor, intent>
        }
    } catch (error) {
        console.error("Error de conexión:", error);
        return "Error de conexión con el servidor de inteligencia artificial>
    }
}    .menu-btn { font-size: 1.8rem; cursor: pointer; color: var(--accent); background: none; border: none; }
    .sidebar { position: fixed; top: 0; left: -300px; width: 280px; height: 100%; background: var(--card); z-index: 200; padding: 20px; transition: 0.3s; overflow-y: auto; box-shadow: 5px 0 15px rgba(0,0,0,0.5); }
    .sidebar.active { left: 0; }
    .card { background: var(--card); padding: 25px; border-radius: 20px; margin-bottom: 20px; }
    input, select, textarea { background: #222; border: 1px solid #444; color: #fff; padding: 12px; border-radius: 10px; width: 100%; margin-bottom: 15px; }
    button { padding: 14px; background: var(--accent); border: none; color: #000; font-weight: bold; cursor: pointer; border-radius: 10px; width: 100%; }
    .note-item { border-bottom: 1px solid #333; padding: 10px 0; font-size: 0.9rem; }
    .audio-panel { background: #222; padding: 15px; border-radius: 15px; margin-top: 10px; border: 1px solid var(--accent); }
`;

async function getUsuario(req) {
    const userId = req.cookies['uid'];
    if (!userId) return null;
    const { data: user } = await supabase.from('usuarios').select('*').eq('id', userId).single();
    return user || null;
}

// --- RUTAS DE NAVEGACIÓN ---
app.get('/', async (req, res) => {
    const user = await getUsuario(req);
    if (user) return res.redirect('/dashboard');
    res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>\${styles}</style></head>
    <body style="display:flex; align-items:center; justify-content:center; min-height:100vh;">
        <div class="card" style="width:350px;">
            <h1 style="color:var(--accent); text-align:center;">EN-FORMA AI</h1>
            <form action="/login" method="POST">
                <input name="nombre" placeholder="Usuario" required>
                <input name="password" type="password" placeholder="Contraseña" required>
                <button>Entrar</button>
            </form>
            <button onclick="document.getElementById('reg').style.display='block'" style="background:none; color:var(--accent); margin-top:10px;">Crear cuenta</button>
        </div>
        <div id="reg" class="card" style="display:none; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:400px; z-index:1000; box-shadow:0 0 100px #000;">
            <h2>Registro</h2>
            <form action="/registrar" method="POST">
                <input name="nombre" placeholder="Nombre" required>
                <input name="edad" type="number" placeholder="Edad" required>
                <input name="estatura" type="number" placeholder="Estatura (cm)" required>
                <select name="sexo"><option value="Masculino">Hombre</option><option value="Femenino">Mujer</option></select>
                <input name="peso" type="number" step="0.1" placeholder="Peso (kg)" required>
                <select name="objetivo"><option value="Perder PESO">Perder PESO</option><option value="Ganar MÚSCULO">Ganar MÚSCULO</option></select>
                <textarea name="padecimientos" placeholder="Lesiones o padecimientos..."></textarea>
                <input name="password" type="password" placeholder="Contraseña" required>
                <button>Comenzar</button>
            </form>
        </div>
    </body></html>\`);
});

app.get('/dashboard', async (req, res) => {
    const user = await getUsuario(req);
    if (!user) return res.redirect('/');
    const { data: notas } = await supabase.from('notas').select('*').eq('usuario_id', user.id).order('fecha', { ascending: false });

    res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>\${styles}</style></head>
    <body>
        <div class="sidebar" id="sidebar">
            <h2 style="color:var(--accent);">Menú</h2>
            <button onclick="document.body.classList.toggle('zoom-mode')">🔍 Zoom +/-</button>
            
            <div class="audio-panel">
                <p style="color:var(--accent); font-size:0.8rem;">🎧 ENTRENADOR</p>
                <select id="vSelect"><option value="female">Femenina</option><option value="male">Masculina</option></select>
                <button onclick="leer()" style="padding:8px; font-size:0.8rem;">🔊 Narrar Plan</button>
                <p style="color:var(--accent); font-size:0.8rem; margin-top:10px;">🎶 MÚSICA</p>
                <select id="msc" onchange="playM()"><option value="none">Silencio</option><option value="y">Yoga</option><option value="c">Clásica</option><option value="r">Rock</option></select>
                <audio id="player" loop></audio>
            </div>

            <h3 style="margin-top:20px;">Diario Fitness</h3>
            <form action="/guardar-nota" method="POST">
                <textarea name="contenido" placeholder="Ej: Hoy entrené sin dolor..." style="height:60px;" required></textarea>
                <button style="padding:8px;">Guardar</button>
            </form>
            <div style="margin-top:10px;">\${notas?.map(n => \`<div class="note-item"><b>\${new Date(n.fecha).toLocaleDateString()}:</b> \${n.contenido}</div>\`).join('') || ''}</div>
            <form action="/logout" method="POST" style="margin-top:20px;"><button style="background:var(--danger); color:white;">Cerrar Sesión</button></form>
        </div>

        <div class="navbar"><button class="menu-btn" onclick="document.getElementById('sidebar').classList.toggle('active')">☰</button><h3>EN-FORMA AI</h3><div></div></div>
        
        <div class="app-container">
            <div class="card" style="border-left:5px solid var(--accent);">
                <h2>Plan de \${user.nombre}</h2>
                <div id="rutina">\${user.consejo_ia}</div>
            </div>
        </div>

        <script>
            function leer() {
                const s = window.speechSynthesis;
                const u = new SpeechSynthesisUtterance(document.getElementById('rutina').innerText);
                const v = s.getVoices();
                u.voice = v.find(x => document.getElementById('vSelect').value === 'female' ? x.name.includes('Helena') : x.name.includes('Pablo')) || v[0];
                s.speak(u);
            }
            function playM() {
                const p = document.getElementById('player');
                const v = document.getElementById('msc').value;
                const m = { y: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", c: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", r: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3" };
                if(v === 'none') p.pause(); else { p.src = m[v]; p.play(); }
            }
        </script>
    </body></html>\`);
});

app.post('/registrar', async (req, res) => {
    const { nombre, edad, peso, estatura, password, objetivo, sexo, padecimientos } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const p = \`Eres un experto médico deportivo. Crea una rutina para \${nombre} (\${sexo}, \${edad} años, \${peso}kg). Sufre de: \${padecimientos}. Evita riesgos. Responde en HTML.\`;
    const consejo = await llamarGroq(p);
    const { data, error } = await supabase.from('usuarios').insert([{
        nombre, edad, peso, estatura, sexo, padecimientos, password: hashed, objetivo, consejo_ia: consejo
    }]).select();
    
    if (error) return res.send("Error al registrar: " + error.message);
    res.setHeader('Set-Cookie', \`uid=\${data[0].id}; Path=/; HttpOnly; Max-Age=86400\`);
    res.redirect('/dashboard');
});

app.post('/login', async (req, res) => {
    const { nombre, password } = req.body;
    const { data: u } = await supabase.from('usuarios').select('*').eq('nombre', nombre).single();
    if (u && await bcrypt.compare(password, u.password)) {
        res.setHeader('Set-Cookie', \`uid=\${u.id}; Path=/; HttpOnly; Max-Age=86400\`);
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

app.listen(PORT,'0.0.0.0', app.listen(PORT,'0.0.0.0', () => console.log('Servidor en puerto ' + PORT));() => console.log('Servidor en puerto ' + PORT));
