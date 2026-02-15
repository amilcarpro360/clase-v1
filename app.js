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
    user: String, pass: String, rol: String, baneadoHasta: Date, foto: String,
    historialLikes: { type: Map, of: String, default: {} },
    fcmToken: String // <-- Añadido para guardar el permiso de notis
});

const Post = mongoose.model('Post', { 
    tipo: String, titulo: String, imagen: String, video: String, urlExtra: String, 
    autor: String, likes: { type: Number, default: 0 }, 
    fechaPost: Date, 
    fechaCreacion: { type: Date, default: Date.now },
    comentarios: [{ autor: String, texto: String, fecha: { type: Date, default: Date.now } }]
});

const Config = mongoose.model('Config', { logoIconUrl: String, splashImgUrl: String });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'aula-ultra-secret', resave: false, saveUninitialized: false }));

// --- NUEVA RUTA PARA GUARDAR EL TOKEN ---
app.post('/save-token', async (req, res) => {
    if (req.session.u) {
        await User.findOneAndUpdate({ user: req.session.u }, { fcmToken: req.body.token });
        res.json({ ok: true });
    } else {
        res.status(401).send("No logueado");
    }
});

// Comentar
app.post('/comentar/:id', async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    await Post.findByIdAndUpdate(req.params.id, { 
        $push: { comentarios: { autor: req.session.u, texto: req.body.texto } } 
    });
    res.redirect('/');
});

app.post('/publicar', upload.single('archivo'), async (req, res) => {
    let mediaUrl = '';
    let isVideo = req.file && req.file.mimetype.startsWith('video/');
    
    if (req.file) {
        const r = await new Promise((rs) => {
            const options = isVideo ? { resource_type: "video", folder: 'aula' } : { folder: 'aula' };
            const s = cloudinary.uploader.upload_stream(options, (err, resu) => rs(resu));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        mediaUrl = r.secure_url;
    }

    await new Post({ 
        tipo: req.body.tipo, titulo: req.body.titulo, 
        imagen: isVideo ? '' : mediaUrl, video: isVideo ? mediaUrl : '',
        urlExtra: req.body.urlExtra || '', autor: req.session.u,
        fechaPost: req.body.fechaPost ? new Date(req.body.fechaPost) : new Date()
    }).save();
    res.redirect('/');
});

app.post('/eliminar/:id', async (req, res) => {
    const p = await Post.findById(req.params.id);
    if (req.session.rol === 'admin' || (p && p.autor === req.session.u)) {
        await Post.findByIdAndDelete(req.params.id);
    }
    res.redirect('/');
});

// --- INTERFAZ ---
app.get('/', async (req, res) => {
    const conf = await Config.findOne() || { 
        logoIconUrl: 'https://cdn-icons-png.flaticon.com/512/3449/3449692.png',
        splashImgUrl: 'https://cdn-icons-png.flaticon.com/512/3449/3449692.png'
    };
    const posts = await Post.find().sort({ fechaCreacion: -1 });
    const users = req.session.rol === 'admin' ? await User.find() : [];
    const me = req.session.u ? await User.findOne({ user: req.session.u }) : null;

    let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Aula Virtual</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
        <style>
            :root { --p: #6366f1; --bg: #f1f5f9; }
            body { margin:0; font-family:'Outfit',sans-serif; background:var(--bg); }
            #splash { position:fixed; inset:0; background:white; z-index:9999; display:flex; flex-direction:column; justify-content:center; align-items:center; transition:0.8s; }
            .hide-splash { opacity:0; pointer-events:none; transform: scale(1.1); }
            .nav { background: white; padding: 12px 5%; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; position:sticky; top:0; z-index:100; }
            .avatar { width:35px; height:35px; border-radius:50%; object-fit:cover; background:#eee; }
            .tabs { display:flex; gap:8px; padding:15px; overflow-x:auto; max-width:900px; margin:0 auto; }
            .tab-btn { padding:12px 20px; border:none; border-radius:15px; background:white; cursor:pointer; font-weight:600; color:#64748b; white-space:nowrap; }
            .tab-btn.active { background:var(--p); color:white; }
            .container { max-width:700px; margin:0 auto; padding:0 15px 100px; }
            .card { background:white; border-radius:24px; padding:20px; margin-bottom:20px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); position:relative; }
            .post-media { width:100%; border-radius:15px; margin:10px 0; }
            input, textarea { width:100%; padding:12px; margin:8px 0; border:1px solid #e2e8f0; border-radius:12px; box-sizing:border-box; }
            .btn-p { background:var(--p); color:white; border:none; padding:14px; border-radius:12px; width:100%; cursor:pointer; font-weight:600; }
            .comment-box { background:#f8fafc; padding:10px; border-radius:12px; margin-top:8px; font-size:0.9rem; border-left:3px solid var(--p); }
        </style>
    </head>
    <body onload="setTimeout(()=>document.getElementById('splash').classList.add('hide-splash'),1500)">
        <div id="splash"><img src="${conf.splashImgUrl}" style="max-width:180px; border-radius:20px;"></div>`;

    if (!req.session.u) {
        html += `<div style="height:100vh; display:flex; justify-content:center; align-items:center;"><div class="card" style="width:350px; text-align:center;">
            <img src="${conf.logoIconUrl}" width="60"><form action="/auth" method="POST">
            <input name="user" placeholder="Usuario"><input name="pass" type="password" placeholder="Pass">
            <input name="pin" placeholder="PIN Admin (Opcional)"><button class="btn-p">Entrar</button></form></div></div>`;
    } else {
        html += `
        <div class="nav">
            <b><img src="${conf.logoIconUrl}" width="25"> AULA 2026</b>
            <div style="display:flex; align-items:center; gap:8px;">
                <img src="${me.foto || 'https://via.placeholder.com/150'}" class="avatar">
                <span>${req.session.u}</span><a href="/salir" style="text-decoration:none;">✕</a>
            </div>
        </div>
        <div class="tabs">
            <button class="tab-btn active" onclick="tab('t1')">📚 Apuntes</button>
            <button class="tab-btn" onclick="tab('t2')">📅 Fechas</button>
            <button class="tab-btn" onclick="tab('t3')">❓ Dudas</button>
            <button class="tab-btn" onclick="tab('t4')">👥 Usuarios</button>
            <button class="tab-btn" onclick="tab('t5')">⚙️ Ajustes</button>
        </div>
        <div class="container">
            ${['apuntes', 'fechas', 'dudas'].map((tipo, i) => `
                <div id="t${i+1}" class="section" style="display:${i===0?'block':'none'}">
                    <div class="card">
                        <h3>Publicar en ${tipo}</h3>
                        <form action="/publicar" method="POST" enctype="multipart/form-data">
                            <input type="hidden" name="tipo" value="${tipo}">
                            <textarea name="titulo" placeholder="¿Qué compartes?" required></textarea>
                            ${tipo === 'fechas' ? '<input type="date" name="fechaPost" required>' : ''}
                            ${tipo === 'apuntes' ? '<input name="urlExtra" placeholder="Link externo">' : ''}
                            <input type="file" name="archivo" accept="image/*,video/*">
                            <button class="btn-p">Publicar</button>
                        </form>
                    </div>
                    ${posts.filter(p => p.tipo === tipo).map(p => `
                        <div class="card">
                            ${(req.session.rol === 'admin' || p.autor === req.session.u) ? `<form action="/eliminar/${p._id}" method="POST"><button style="position:absolute;top:10px;right:10px;border:none;background:#fee2e2;color:#ef4444;border-radius:8px;padding:5px;">Borrar</button></form>` : ''}
                            <small><b>@${p.autor}</b> ${p.fechaPost ? '📅 '+p.fechaPost.toLocaleDateString() : ''}</small>
                            <p>${p.titulo}</p>
                            ${p.imagen ? `<img src="${p.imagen}" class="post-media">` : ''}
                            ${p.video ? `<video src="${p.video}" controls class="post-media"></video>` : ''}
                            ${p.urlExtra ? `<a href="${p.urlExtra}" target="_blank">🔗 Ver enlace</a>` : ''}
                            
                            <div style="margin-top:15px; border-top:1px solid #eee; padding-top:10px;">
                                ${p.comentarios.map(c => `<div class="comment-box"><b>${c.autor}:</b> ${c.texto}</div>`).join('')}
                                <form action="/comentar/${p._id}" method="POST" style="display:flex; gap:5px; margin-top:10px;">
                                    <input name="texto" placeholder="Escribe un comentario..." required style="margin:0; flex:1;">
                                    <button class="btn-p" style="width:auto; padding:0 15px;">➔</button>
                                </form>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `).join('')}

            <div id="t4" class="section" style="display:none">
                <div class="card">
                    <h3>Gestión de Usuarios</h3>
                    ${users.map(u => `
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px; background:#f8fafc; padding:10px; border-radius:15px;">
                            <img src="${u.foto || 'https://via.placeholder.com/150'}" class="avatar">
                            <div style="flex:1"><b>${u.user}</b> <small>(${u.rol})</small></div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div id="t5" class="section" style="display:none">
                <div class="card">
                    <h3>Ajustes</h3>
                    <button class="btn-p" onclick="pedirPermisoNotis()" style="background:#10b981; margin-bottom:15px;">🔔 Activar Notificaciones</button>
                    <form action="/perfil" method="POST" enctype="multipart/form-data">
                        <p>Foto Perfil:</p><input type="file" name="foto" accept="image/*"><button class="btn-p">Guardar</button>
                    </form>
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
                storageBucket: "aulavirtual1of.firebasestorage.app",
                messagingSenderId: "397072596716",
                appId: "1:397072596716:web:c04730aedbcc3e9fc42fc9"
            };

            const app = initializeApp(firebaseConfig);
            const messaging = getMessaging(app);

            window.pedirPermisoNotis = async () => {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    const token = await getToken(messaging, { vapidKey: 'TU_VAPID_KEY_AQUI' });
                    if (token) {
                        await fetch('/save-token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ token })
                        });
                        alert("¡Notificaciones activadas!");
                    }
                }
            };

            onMessage(messaging, (payload) => {
                new Notification(payload.notification.title, { body: payload.notification.body });
            });
        </script>
        `;
    }

    html += `<script>function tab(id){document.querySelectorAll('.section').forEach(s=>s.style.display='none');document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));document.getElementById(id).style.display='block';event.target.classList.add('active');}</script></body></html>`;
    res.send(html);
});

app.post('/auth', async (req, res) => {
    const { user, pass, pin } = req.body;
    let u = await User.findOne({ user, pass });
    if (!u) {
        const rol = (pin === '2845') ? 'admin' : 'estudiante';
        u = await new User({ user, pass, rol }).save();
    }
    if (!u.baneadoHasta || u.baneadoHasta < new Date()) {
        req.session.u = u.user; req.session.rol = u.rol; res.redirect('/');
    } else {
        res.send("<script>alert('Baneado'); window.location='/';</script>");
    }
});

app.post('/perfil', upload.single('foto'), async (req, res) => {
    if (req.file) {
        const r = await new Promise((rs) => {
            const s = cloudinary.uploader.upload_stream({ folder: 'perfiles' }, (err, resu) => rs(resu));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        await User.findOneAndUpdate({ user: req.session.u }, { foto: r.secure_url });
    }
    res.redirect('/');
});

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(PORT, () => console.log('🚀 Aula Virtual con Notificaciones lista'));
