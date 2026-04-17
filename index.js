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

// --- LÓGICA DE IA ---
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
    const data = await response.json();
    return data.choices[0].message.content;
}

// --- ESTILOS MAESTROS ---
const styles = `
    :root { --bg: #0f0f0f; --card: #1a1a1a; --accent: #00d4ff; --sec: #ff8800; --text: #eee; --danger: #cc3333; }
    * { box-sizing: border-box; transition: transform 0.2s ease, left 0.3s ease; }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; overflow-x: hidden; }
    body.zoom-mode { font-size: 1.25rem; }
    .app-container { padding: 20px; max-width: 1200px; margin: 0 auto; }
    
    .navbar { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; background: var(--card); border-bottom: 1px solid #333; position: sticky; top: 0; z-index: 100; }
    .menu-btn { font-size: 1.8rem; cursor: pointer; color: var(--accent); background: none; border: none; padding: 0; width: auto; }
    
    .sidebar { position: fixed; top: 0; left: -300px; width: 280px; height: 100%; background: var(--card); box-shadow: 5px 0 15px rgba(0,0,0,0.5); z-index: 200; padding: 20px; display: flex; flex-direction: column; overflow-y: auto; }
    .sidebar.active { left: 0; }
    .sidebar-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: none; z-index: 150; }
    .sidebar-overlay.active { display: block; }
    
    .card { background: var(--card); padding: 25px; border-radius: 20px; margin-bottom: 20px; }
    input, select, textarea { background: #222; border: 1px solid #444; color: #fff; padding: 12px; border-radius: 10px; width: 100%; margin-bottom: 15px; font-family: inherit; }
    button { padding: 14px; background: var(--accent); border: none; color: #000; font-weight: bold; cursor: pointer; border-radius: 10px; width: 100%; }
    
    .audio-panel { background: #222; padding: 15px; border-radius: 15px; margin-top: 10px; border: 1px solid var(--accent); }
    .note-item { border-bottom: 1px solid #333; padding: 10px 0; font-size: 0.9rem; }
    .note-date { color: var(--accent); font-size: 0.75rem; display: block; }
`;

// --- HELPERS ---
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
    res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>${styles}</style></head>
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
                <textarea name="padecimientos" placeholder="Lesiones o enfermedades..."></textarea>
                <input name="password" type="password" placeholder="Contraseña" required>
                <button>Registrar</button>
            </form>
        </div>
    </body></html>`);
});

app.get('/dashboard', async (req, res) => {
    const user = await getUsuario(req);
    if (!user) return res.redirect('/');

    const { data: notas } = await supabase.from('notas').select('*').eq('usuario_id', user.id).order('fecha', { ascending: false });

    res.send(`
    <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Panel | EN-FORMA</title><style>${styles}</style></head>
    <body>
        <div class="sidebar-overlay" id="overlay" onclick="toggleMenu()"></div>
        <div class="sidebar" id="sidebar">
            <h2 style="color:var(--accent);">Menú</h2>
            <button onclick="toggleZoom()" style="background:#333; margin-bottom:10px;">🔍 Ajustar Zoom</button>
            
            <div class="audio-panel">
                <p style="margin:0 0 10px 0; font-size:0.8rem; color:var(--accent);">🎧 ENTRENADOR PERSONAL</p>
                <select id="voiceSelect" style="font-size:0.8rem; padding:5px;"><option value="female">Voz Femenina</option><option value="male">Voz Masculina</option></select>
                <button onclick="hablarRutina()" style="padding:8px; font-size:0.8rem;">🔊 Narrar Rutina</button>
                
                <p style="margin:15px 0 5px 0; font-size:0.8rem; color:var(--accent);">🎶 MÚSICA AMBIENTE</p>
                <select id="musicSelect" onchange="cambiarMusica()" style="font-size:0.8rem; padding:5px;">
                    <option value="none">Silencio</option>
                    <option value="yoga">Feng Shui / Yoga</option>
                    <option value="clasica">Clásica</option>
                    <option value="rock">Rock Motivado</option>
                </select>
                <audio id="bgMusic" loop></audio>
            </div>

            <h3 style="margin-top:20px;">Diario Fitness</h3>
            <form action="/guardar-nota" method="POST">
                <textarea name="contenido" placeholder="Ej: Hoy entrené con energía, sin dolor de rodilla." style="height:60px; font-size:0.8rem;" required></textarea>
                <button style="padding:8px; font-size:0.8rem;">Guardar Apunte</button>
            </form>
            <div style="margin-top:15px;">
                ${notas?.map(n => `<div class="note-item"><span class="note-date">${new Date(n.fecha).toLocaleDateString()}</span>${n.contenido}</div>`).join('') || 'Sin notas aún'}
            </div>

            <form action="/logout" method="POST" style="margin-top:auto;"><button style="background:var(--danger); color:white;">Cerrar Sesión</button></form>
        </div>

        <div class="navbar"><button class="menu-btn" onclick="toggleMenu()">☰</button><h3 style="color:var(--accent);">EN-FORMA AI</h3><div></div></div>

        <div class="app-container">
            <div class="card" style="border-left:5px solid var(--accent);">
                <h2>Tu Plan Adaptado</h2>
                <div id="rutinaTexto" style="line-height:1.6;">${user.consejo_ia}</div>
            </div>
        </div>

        <script>
            function toggleMenu(){
                document.getElementById('sidebar').classList.toggle('active');
                document.getElementById('overlay').classList.toggle('active');
            }
            function toggleZoom(){ document.body.classList.toggle('zoom-mode'); }

            function hablarRutina() {
                const texto = document.getElementById('rutinaTexto').innerText;
                const synth = window.speechSynthesis;
                const utternace = new SpeechSynthesisUtterance(texto);
                const voices = synth.getVoices();
                const selected = document.getElementById('voiceSelect').value;
                // Intento de buscar voces según género (depende del navegador)
                utternace.voice = voices.find(v => selected === 'female' ? v.name.includes('Helena') : v.name.includes('Pablo')) || voices[0];
                utternace.rate = 0.9;
                synth.speak(utternace);
            }

            const musicLinks = {
                yoga: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", // Ejemplo
                clasica: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
                rock: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3"
            };

            function cambiarMusica() {
                const player = document.getElementById('bgMusic');
                const choice = document.getElementById('musicSelect').value;
                if(choice === 'none') { player.pause(); } 
                else { player.src = musicLinks[choice]; player.play(); }
            }
        </script>
    </body></html>`);
});

app.post('/registrar', async (req, res) => {
    const { nombre, edad, peso, estatura, password, objetivo, sexo, padecimientos } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const prompt = `Como experto médico deportivo, crea una rutina para ${nombre} (${sexo}, ${edad} años, ${peso}kg). Sufre de: ${padecimientos}. EVITA ejercicios que dañen su condición. Usa HTML simple.`;
    const consejo = await llamarGroq(prompt);
    const { data } = await supabase.from('usuarios').insert([{
        nombre, edad, peso, estatura, sexo, padecimientos, password: hashed, objetivo, consejo_ia: consejo,
        session_token: crypto.randomBytes(32).toString('hex'), historial_peso: [{fecha: new Date().toLocaleDateString(), peso}]
    }]).select();
    res.setHeader('Set-Cookie', `uid=${data[0].id}; Path=/; HttpOnly; Max-Age=86400`);
    res.redirect('/dashboard');
});

app.post('/login', async (req, res) => {
    const { nombre, password } = req.body;
    const { data: u } = await supabase.from('usuarios').select('*').eq('nombre', nombre).single();
    if (u && await bcrypt.compare(password, u.password)) {
        res.setHeader('Set-Cookie', `uid=${u.id}; Path=/; HttpOnly; Max-Age=86400`);
        return res.redirect('/dashboard');
    }
    res.send("Error");
});

app.post('/guardar-nota', async (req, res) => {
    const user = await getUsuario(req);
    if (user) {
        await supabase.from('notas').insert([{ usuario_id: user.id, contenido: req.body.contenido }]);
    }
    res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'uid=; Path=/; Max-Age=0');
    res.redirect('/');
});

app.listen(PORT, () => console.log('Puerto: ' + PORT));