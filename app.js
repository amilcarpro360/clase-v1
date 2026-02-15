const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');

const app = express();
const PORT = process.env.PORT || 10000;

// 1. CONFIGURACIÓN CLOUDINARY
cloudinary.config({ 
    cloud_name: 'dvlbsl16g', api_key: '721617469253873', api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});

const upload = multer({ storage: multer.memoryStorage() });

// 2. CONEXIÓN DB
mongoose.connect('mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0')
    .then(() => console.log("🔥 Aula Virtual 2026 Conectada"))
    .catch(err => console.log("❌ Error DB:", err));

// 3. MODELOS
const User = mongoose.model('User', { 
    user: String, pass: String, rol: String, foto: String, fcmToken: String 
});

const Post = mongoose.model('Post', { 
    tipo: String, titulo: String, imagen: String, autor: String, 
    fechaCreacion: { type: Date, default: Date.now }
});

const Config = mongoose.model('Config', { logoIconUrl: String, splashImgUrl: String });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'aula-ultra-secret', resave: false, saveUninitialized: false }));

// --- SERVICE WORKER ---
app.get('/firebase-messaging-sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.send(`
        importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
        importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');
        firebase.initializeApp({
            apiKey: "AIzaSyCjv9izSETcQqL6Ad0sN8LDAX81FabWmvY",
            projectId: "aulavirtual1of",
            messagingSenderId: "397072596716",
            appId: "1:397072596716:web:c04730aedbcc3e9fc42fc9"
        });
        const messaging = firebase.messaging();
        messaging.onBackgroundMessage((p) => {
            self.registration.showNotification(p.notification.title, { body: p.notification.body, icon: '/logo.png' });
        });
    `);
});

app.post('/save-token', async (req, res) => {
    if (req.session.u) {
        await User.findOneAndUpdate({ user: req.session.u }, { fcmToken: req.body.token });
        res.json({ ok: true });
    } else { res.sendStatus(401); }
});

app.post('/publicar', upload.single('archivo'), async (req, res) => {
    let mediaUrl = '';
    if (req.file) {
        const r = await new Promise((rs) => {
            const s = cloudinary.uploader.upload_stream({ folder: 'aula' }, (err, resu) => rs(resu));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        mediaUrl = r.secure_url;
    }
    await new Post({ tipo: req.body.tipo, titulo: req.body.titulo, imagen: mediaUrl, autor: req.session.u }).save();
    res.redirect('/');
});

// --- INTERFAZ CON DISEÑO MEJORADO ---
app.get('/', async (req, res) => {
    const conf = await Config.findOne() || { 
        logoIconUrl: 'https://cdn-icons-png.flaticon.com/512/3449/3449692.png',
        splashImgUrl: 'https://cdn-icons-png.flaticon.com/512/3449/3449692.png'
    };
    const posts = await Post.find().sort({ fechaCreacion: -1 });
    const me = req.session.u ? await User.findOne({ user: req.session.u }) : null;

    let html = `<!DOCTYPE html><html lang="es"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aula Virtual 2026</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <style>
        :root { --primary: #6366f1; --accent: #f43f5e; --bg: #f8fafc; --card: #ffffff; --text: #1e293b; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin:0; font-family:'Outfit', sans-serif; background:var(--bg); color:var(--text); overflow-x:hidden; }
        
        /* Splash Screen */
        #splash { position:fixed; inset:0; background:white; z-index:9999; display:flex; flex-direction:column; justify-content:center; align-items:center; transition:0.6s cubic-bezier(0.4, 0, 0.2, 1); }
        .hide-splash { opacity:0; pointer-events:none; transform: scale(1.1); }
        
        /* Navbar */
        .nav { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(12px); padding: 12px 6%; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(0,0,0,0.05); position:sticky; top:0; z-index:100; }
        .nav b { font-weight:800; font-size:1.2rem; letter-spacing:-0.5px; display:flex; align-items:center; gap:8px; }
        
        /* Container & Cards */
        .container { max-width:650px; margin:0 auto; padding:20px 15px 100px; }
        .card { background:var(--card); border-radius:28px; padding:24px; margin-bottom:20px; border:1px solid rgba(0,0,0,0.03); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); transition: 0.3s; }
        .card:active { transform: scale(0.99); }
        
        /* Inputs & Buttons */
        input, textarea { width:100%; padding:14px 18px; margin:8px 0; border:2px solid #f1f5f9; border-radius:16px; font-family:inherit; font-size:1rem; transition:0.3s; outline:none; background:#f8fafc; }
        input:focus { border-color: var(--primary); background:white; }
        .btn-p { background:var(--primary); color:white; border:none; padding:16px; border-radius:18px; width:100%; cursor:pointer; font-weight:600; font-size:1rem; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); transition:0.3s; }
        .btn-p:hover { background: #4f46e5; }

        /* Tabs Floating */
        .tabs { display:flex; gap:10px; padding:10px; overflow-x:auto; background:white; border-radius:20px; margin-bottom:20px; box-shadow: 0 4px 10px rgba(0,0,0,0.03); scrollbar-width: none; }
        .tab-btn { padding:10px 20px; border:none; border-radius:14px; background:transparent; color:#64748b; font-weight:600; cursor:pointer; white-space:nowrap; transition:0.3s; }
        .tab-btn.active { background:var(--primary); color:white; }

        /* Feed Posts */
        .post-header { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
        .post-avatar { width:40px; height:40px; border-radius:50%; background:#e2e8f0; object-fit:cover; }
        .post-img { width:100%; border-radius:20px; margin-top:10px; display:block; }
        .post-author { font-weight:600; font-size:0.95rem; }
        .post-time { color:#94a3b8; font-size:0.8rem; }
    </style>
    </head>
    <body onload="setTimeout(()=>document.getElementById('splash').classList.add('hide-splash'),1200)">
        <div id="splash">
            <img src="${conf.splashImgUrl}" width="120" style="border-radius:30px; box-shadow:0 20px 40px rgba(0,0,0,0.1)">
            <p style="margin-top:20px; font-weight:600; color:#6366f1;">Cargando Aula Virtual...</p>
        </div>`;

    if (!req.session.u) {
        html += `<div style="height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:20px;">
            <div class="card" style="width:100%; max-width:380px; text-align:center; padding:40px 30px;">
                <img src="${conf.logoIconUrl}" width="70" style="margin-bottom:20px;">
                <h2 style="margin:0 0 10px; font-weight:800;">¡Hola de nuevo!</h2>
                <p style="color:#64748b; margin-bottom:30px;">Identifícate para entrar a clase.</p>
                <form action="/auth" method="POST">
                    <input name="user" placeholder="Nombre de usuario" required autocomplete="off">
                    <input name="pass" type="password" placeholder="Contraseña" required>
                    <button class="btn-p" style="margin-top:10px;">Entrar ahora</button>
                </form>
            </div>
        </div>`;
    } else {
        html += `
        <div class="nav">
            <b><img src="${conf.logoIconUrl}" width="28"> AULA 2026</b>
            <div style="display:flex; align-items:center; gap:12px;">
                <img src="${me.foto || 'https://api.dicebear.com/7.x/avataaars/svg?seed='+req.session.u}" class="post-avatar" style="width:32px; height:32px;">
                <a href="/salir" style="text-decoration:none; background:#fee2e2; color:#ef4444; width:30px; height:30px; display:flex; align-items:center; justify-content:center; border-radius:10px; font-weight:bold;">✕</a>
            </div>
        </div>

        <div class="container">
            <div class="tabs">
                <button class="tab-btn active" onclick="tab('t1', this)">📚 Apuntes</button>
                <button class="tab-btn" onclick="tab('t2', this)">📅 Fechas</button>
                <button class="tab-btn" onclick="tab('t5', this)">⚙️ Ajustes</button>
            </div>

            <div id="t1" class="section">
                <div class="card" style="border: 2px dashed #e2e8f0; background: #fbfcfe;">
                    <h3 style="margin-top:0;">Nueva publicación</h3>
                    <form action="/publicar" method="POST" enctype="multipart/form-data">
                        <input type="hidden" name="tipo" value="apuntes">
                        <textarea name="titulo" placeholder="¿Qué quieres compartir con la clase?" required rows="2"></textarea>
                        <div style="display:flex; gap:10px; align-items:center;">
                           <input type="file" name="archivo" id="f1" style="display:none" onchange="document.getElementById('lab').innerText='✅ Foto lista'">
                           <label id="lab" for="f1" style="flex:1; background:#fff; padding:12px; border-radius:14px; text-align:center; border:1px solid #e2e8f0; cursor:pointer; font-size:0.9rem;">📷 Añadir imagen</label>
                           <button class="btn-p" style="width:120px; padding:12px;">Subir</button>
                        </div>
                    </form>
                </div>

                ${posts.map(p => `
                    <div class="card">
                        <div class="post-header">
                            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${p.autor}" class="post-avatar">
                            <div>
                                <div class="post-author">@${p.autor}</div>
                                <div class="post-time">${new Date(p.fechaCreacion).toLocaleDateString()}</div>
                            </div>
                        </div>
                        <p style="margin:0; line-height:1.6; font-size:1.05rem;">${p.titulo}</p>
                        ${p.imagen ? `<img src="${p.imagen}" class="post-img">` : ''}
                    </div>
                `).join('')}
            </div>

            <div id="t5" class="section" style="display:none">
                <div class="card" style="text-align:center;">
                    <div style="background:#f0f9ff; width:70px; height:70px; border-radius:24px; display:flex; align-items:center; justify-content:center; margin:0 auto 20px;">
                        <span style="font-size:2rem;">🔔</span>
                    </div>
                    <h3 style="margin:0;">Notificaciones Push</h3>
                    <p style="color:#64748b; font-size:0.9rem; margin-bottom:25px;">Activa los avisos para enterarte cuando publiquen fechas de exámenes o nuevos apuntes.</p>
                    <button class="btn-p" onclick="activarNotis()" style="background:#10b981; box-shadow:0 4px 12px rgba(16, 185, 129, 0.2);">Activar ahora</button>
                </div>
            </div>
        </div>

        <script type="module">
            import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
            import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
            
            const firebaseConfig = { 
                apiKey: "AIzaSyCjv9izSETcQqL6Ad0sN8LDAX81FabWmvY", 
                authDomain: "aulavirtual1of.firebaseapp.com", 
                projectId: "aulavirtual1of", 
                messagingSenderId: "397072596716", 
                appId: "1:397072596716:web:c04730aedbcc3e9fc42fc9" 
            };
            
            const app = initializeApp(firebaseConfig);
            const messaging = getMessaging(app);

            window.activarNotis = async () => {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    const token = await getToken(messaging, { 
                        vapidKey: 'BHGq3Rd2nOh5OOFcQ_kmNRtK6HHoub8LpCKH14hWa0PbIlA4iE1a0mI86iT_CAX4N4GC7wkCfY1Q1lxMtvnGkWs' 
                    });
                    if (token) {
                        await fetch('/save-token', { 
                            method: 'POST', 
                            headers: { 'Content-Type': 'application/json' }, 
                            body: JSON.stringify({ token }) 
                        });
                        alert("¡Genial! Notificaciones activadas.");
                    }
                }
            };
            onMessage(messaging, (p) => { new Notification(p.notification.title, { body: p.notification.body }); });
        </script>
        `;
    }
    html += `
    <script>
        function tab(id, btn){
            document.querySelectorAll('.section').forEach(s=>s.style.display='none');
            document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
            document.getElementById(id).style.display='block';
            btn.classList.add('active');
            window.scrollTo({top:0, behavior:'smooth'});
        }
    </script></body></html>`;
    res.send(html);
});

// Auth
app.post('/auth', async (req, res) => {
    const { user, pass } = req.body;
    let u = await User.findOne({ user, pass });
    if (!u) u = await new User({ user, pass, rol: 'estudiante' }).save();
    req.session.u = u.user; req.session.rol = u.rol; res.redirect('/');
});

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });

// --- GESTIÓN DE PUERTO ---
const server = app.listen(PORT, () => {
    console.log('🚀 Sistema de Aula 2026 arrancado');
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') { process.exit(1); }
});
