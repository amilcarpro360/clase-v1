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
    historialLikes: { type: Map, of: String, default: {} } 
});

const Post = mongoose.model('Post', { 
    tipo: String, titulo: String, imagen: String, video: String, urlExtra: String, 
    autor: String, likes: { type: Number, default: 0 }, 
    fechaPost: Date, // Para el calendario
    fechaCreacion: { type: Date, default: Date.now },
    comentarios: [{ autor: String, texto: String, fecha: { type: Date, default: Date.now } }]
});

const Config = mongoose.model('Config', { logoIconUrl: String, splashImgUrl: String });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'aula-ultra-secret', resave: false, saveUninitialized: false }));

// --- ACCIONES DE CONTENIDO ---

app.post('/publicar', upload.single('archivo'), async (req, res) => {
    let mediaUrl = '';
    let isVideo = req.file && req.file.mimetype.startsWith('video/');
    
    if (req.file) {
        const r = await new Promise((rs) => {
            const options = isVideo ? { resource_type: "video", folder: 'aula_videos' } : { folder: 'aula_fotos' };
            const s = cloudinary.uploader.upload_stream(options, (err, resu) => rs(resu));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        mediaUrl = r.secure_url;
    }

    await new Post({ 
        tipo: req.body.tipo, 
        titulo: req.body.titulo, 
        imagen: isVideo ? '' : mediaUrl,
        video: isVideo ? mediaUrl : '',
        urlExtra: req.body.urlExtra || '',
        autor: req.session.u,
        fechaPost: req.body.fechaPost ? new Date(req.body.fechaPost) : new Date()
    }).save();
    res.redirect('/');
});

app.post('/eliminar/:id', async (req, res) => {
    const p = await Post.findById(req.params.id);
    if (req.session.rol === 'admin' || p.autor === req.session.u) {
        await Post.findByIdAndDelete(req.params.id);
    }
    res.redirect('/');
});

app.post('/admin/user-cmd', async (req, res) => {
    if (req.session.rol !== 'admin') return res.redirect('/');
    const { accion, id, val } = req.body;
    if (accion === 'ban') {
        let d = new Date(); d.setHours(d.getHours() + parseInt(val));
        await User.findByIdAndUpdate(id, { baneadoHasta: d });
    }
    if (accion === 'del') await User.findByIdAndDelete(id);
    if (accion === 'makeAdmin') await User.findByIdAndUpdate(id, { rol: 'admin' });
    res.redirect('/');
});

app.post('/config-sistema', upload.single('splashFile'), async (req, res) => {
    if (req.session.rol !== 'admin') return res.redirect('/');
    if (req.file) {
        const r = await new Promise((rs) => {
            const s = cloudinary.uploader.upload_stream({ folder: 'sistema' }, (err, resu) => rs(resu));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        await Config.findOneAndUpdate({}, { splashImgUrl: r.secure_url }, { upsert: true });
    }
    if (req.body.logoIconUrl) {
        await Config.findOneAndUpdate({}, { logoIconUrl: req.body.logoIconUrl }, { upsert: true });
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
            .hide-splash { opacity:0; pointer-events:none; transform: scale(1.2); }
            .nav { background: white; padding: 12px 5%; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; sticky; top:0; z-index:100; }
            .avatar { width:35px; height:35px; border-radius:50%; object-fit:cover; background:#eee; border: 2px solid var(--p); }
            .tabs { display:flex; gap:8px; padding:15px; overflow-x:auto; max-width:900px; margin:0 auto; }
            .tab-btn { padding:12px 20px; border:none; border-radius:15px; background:white; cursor:pointer; font-weight:600; color:#64748b; white-space:nowrap; box-shadow:0 2px 4px rgba(0,0,0,0.05); }
            .tab-btn.active { background:var(--p); color:white; }
            .container { max-width:700px; margin:0 auto; padding:0 15px 100px; }
            .card { background:white; border-radius:24px; padding:20px; margin-bottom:20px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); position:relative; }
            .post-media { width:100%; border-radius:15px; margin:10px 0; max-height:450px; object-fit:cover; }
            input, textarea, select { width:100%; padding:14px; margin:8px 0; border:1px solid #e2e8f0; border-radius:14px; box-sizing:border-box; font-size:15px; }
            .btn-del { position:absolute; top:15px; right:15px; background:#fee2e2; color:#ef4444; border:none; border-radius:10px; padding:5px 10px; cursor:pointer; font-size:12px; }
            .btn-p { background:var(--p); color:white; border:none; padding:15px; border-radius:14px; width:100%; cursor:pointer; font-weight:600; }
            .user-item { display:flex; align-items:center; gap:15px; padding:15px; background:#f8fafc; border-radius:15px; margin-bottom:10px; flex-wrap:wrap; }
        </style>
    </head>
    <body onload="setTimeout(()=>document.getElementById('splash').classList.add('hide-splash'),1500)">
        <div id="splash">
            <img src="${conf.splashImgUrl}" style="max-width:200px; border-radius:30px; margin-bottom:20px;">
            <h2 style="color:var(--p)">Bienvenido a Clase</h2>
        </div>`;

    if (!req.session.u) {
        html += `
        <div style="height:100vh; display:flex; justify-content:center; align-items:center; padding:20px;">
            <div class="card" style="width:100%; max-width:380px; text-align:center;">
                <img src="${conf.logoIconUrl}" width="70" style="margin-bottom:15px">
                <form action="/auth" method="POST">
                    <input name="user" placeholder="Tu nombre de usuario" required>
                    <input name="pass" type="password" placeholder="Tu contraseña" required>
                    <input name="pin" placeholder="PIN Secreto (Solo Admin)">
                    <button class="btn-p">Iniciar Sesión / Registrar</button>
                    <p style="font-size:12px; color:#94a3b8; margin-top:15px;">Aula Virtual v2.6 - 2026</p>
                </form>
            </div>
        </div>`;
    } else {
        html += `
        <div class="nav">
            <div style="font-weight:bold; display:flex; align-items:center; gap:10px;">
                <img src="${conf.logoIconUrl}" width="30"> AULA 2026
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${me.foto || 'https://via.placeholder.com/150'}" class="avatar">
                <span style="font-weight:600;">${req.session.u}</span>
                <a href="/salir" style="text-decoration:none; color:#94a3b8; font-size:20px;">✕</a>
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
                            <textarea name="titulo" placeholder="¿Qué quieres decir?" required></textarea>
                            
                            ${tipo === 'fechas' ? '<b>Fecha del evento:</b><input type="date" name="fechaPost" required>' : ''}
                            ${tipo === 'apuntes' ? '<input name="urlExtra" placeholder="URL externa (YouTube, Drive, etc.)">' : ''}
                            
                            <p style="font-size:12px; margin:0;">Subir Foto/Vídeo/GIF:</p>
                            <input type="file" name="archivo" accept="image/*,video/*">
                            <button class="btn-p">Subir a la clase</button>
                        </form>
                    </div>

                    ${posts.filter(p => p.tipo === tipo).map(p => `
                        <div class="card">
                            ${(req.session.rol === 'admin' || p.autor === req.session.u) ? `
                                <form action="/eliminar/${p._id}" method="POST">
                                    <button class="btn-del">Borrar</button>
                                </form>` : ''}
                            
                            <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                                <small><b>@${p.autor}</b> • ${p.fechaCreacion.toLocaleDateString()}</small>
                                ${p.fechaPost ? `<span style="background:#e0e7ff; color:var(--p); padding:2px 8px; border-radius:10px; font-size:11px;">📅 ${p.fechaPost.toLocaleDateString()}</span>` : ''}
                            </div>
                            
                            <p style="font-size:17px; margin:5px 0;">${p.titulo}</p>
                            
                            ${p.imagen ? `<img src="${p.imagen}" class="post-media">` : ''}
                            ${p.video ? `<video src="${p.video}" controls class="post-media"></video>` : ''}
                            ${p.urlExtra ? `<a href="${p.urlExtra}" target="_blank" style="color:var(--p); word-break:break-all;">🔗 Enlace externo</a>` : ''}
                            
                            <form action="/like/${p._id}" method="POST" style="margin-top:10px;">
                                <button class="tab-btn" style="box-shadow:none; padding:8px 15px;">💡 Útil (${p.likes})</button>
                            </form>
                        </div>
                    `).join('')}
                </div>
            `).join('')}

            <div id="t4" class="section" style="display:none">
                <div class="card">
                    <h3>Control de Alumnos</h3>
                    ${users.map(u => `
                        <div class="user-item">
                            <img src="${u.foto || 'https://via.placeholder.com/150'}" class="avatar" style="width:50px; height:50px;">
                            <div style="flex:1">
                                <b>${u.user}</b> <br> <small>${u.rol}</small>
                            </div>
                            <form action="/admin/user-cmd" method="POST" style="display:flex; gap:5px;">
                                <input type="hidden" name="id" value="${u._id}">
                                ${u.rol !== 'admin' ? '<button name="accion" value="makeAdmin" style="background:#4f46e5; color:white; border:none; border-radius:8px; padding:5px 10px; cursor:pointer;">Hacer Admin</button>' : ''}
                                <button name="accion" value="del" style="background:#ef4444; color:white; border:none; border-radius:8px; padding:5px 10px; cursor:pointer;">X</button>
                            </form>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div id="t5" class="section" style="display:none">
                <div class="card">
                    <h3>Mi Perfil</h3>
                    <form action="/perfil" method="POST" enctype="multipart/form-data">
                        <input type="file" name="foto" accept="image/*">
                        <button class="btn-p">Cambiar mi Foto de Perfil</button>
                    </form>
                </div>
                ${req.session.rol === 'admin' ? `
                <div class="card">
                    <h3>Personalización del Sistema</h3>
                    <form action="/config-sistema" method="POST" enctype="multipart/form-data">
                        <p>Logo de la pestaña (URL):</p>
                        <input name="logoIconUrl" value="${conf.logoIconUrl}">
                        <p>Imagen del Splash de carga (Subir archivo):</p>
                        <input type="file" name="splashFile" accept="image/*">
                        <button class="btn-p" style="background:#1e293b">Actualizar Sistema</button>
                    </form>
                </div>` : ''}
            </div>
        </div>`;
    }

    html += `
        <script>
            function tab(id) {
                document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.getElementById(id).style.display = 'block';
                event.target.classList.add('active');
            }
        </script>
    </body></html>`;
    res.send(html);
});

// AUTH
app.post('/auth', async (req, res) => {
    const { user, pass, pin, m } = req.body;
    let u = await User.findOne({ user, pass });
    if (!u) {
        const rol = (pin === '2845') ? 'admin' : 'estudiante';
        u = await new User({ user, pass, rol }).save();
    }
    if (!u.baneadoHasta || u.baneadoHasta < new Date()) {
        req.session.u = u.user; req.session.rol = u.rol; res.redirect('/');
    } else {
        res.send("<script>alert('Estás baneado temporalmente'); window.location='/';</script>");
    }
});

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.post('/like/:id', async (req, res) => {
    const u = await User.findOne({ user: req.session.u });
    const hoy = new Date().toDateString();
    if (u.historialLikes.get(req.params.id) === hoy) return res.send("<script>alert('Voto diario agotado'); window.location='/';</script>");
    await Post.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } });
    u.historialLikes.set(req.params.id, hoy);
    await u.save();
    res.redirect('/');
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

app.listen(PORT, () => console.log('🚀 Aula Virtual 2026 lista en puerto ' + PORT));
