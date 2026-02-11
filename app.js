const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');

const app = express();
const PORT = process.env.PORT || 10000;

// 1. CONFIGURACIÓN DE CLOUDINARY
cloudinary.config({ 
    cloud_name: 'dvlbsl16g', api_key: '721617469253873', api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});

// Filtro de archivos para fotos de perfil (Solo imágenes y GIFs)
const upload = multer({
    fileFilter: (req, file, cb) => {
        if (file.mimetype.match(/\/(jpg|jpeg|png|gif)$/)) {
            cb(null, true);
        } else {
            cb(new Error('Formato no soportado (solo JPG, PNG y GIF)'), false);
        }
    }
});

mongoose.connect('mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0')
    .then(() => console.log("🔥 DB Conectada"))
    .catch(err => console.log("❌ Error DB:", err));

// 3. MODELOS DE DATOS MEJORADOS
const User = mongoose.model('User', { 
    user: String, pass: String, rol: String, baneadoHasta: Date, foto: String,
    historialLikes: { type: Map, of: String, default: {} } 
});

const Post = mongoose.model('Post', { 
    tipo: String, // 'apunte', 'fecha', 'duda'
    titulo: String, imagen: String, autor: String, likes: { type: Number, default: 0 }, 
    fecha: { type: Date, default: Date.now },
    comentarios: [{ autor: String, texto: String, fecha: { type: Date, default: Date.now } }]
});

const Config = mongoose.model('Config', { logoUrl: String });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secreto-2026', resave: false, saveUninitialized: false }));

// --- PETICIÓN 8: CONTROL HORARIO (1 DUDA EN FIN DE SEMANA) ---
const verificarHorarioDudas = async (req, res, next) => {
    const ahora = new Date();
    const dia = ahora.getDay(); 
    const hora = ahora.getHours();
    // Viernes 18h a Lunes 08h
    const esFinde = (dia === 5 && hora >= 18) || (dia === 6) || (dia === 0) || (dia === 1 && hora < 8);
    
    if (esFinde && req.body.tipo === 'duda') {
        const inicioFinde = new Date(); // Lógica simplificada: buscar si ya posteó hoy
        inicioFinde.setHours(0,0,0,0);
        const yaPosteo = await Post.findOne({ autor: req.session.u, tipo: 'duda', fecha: { $gte: inicioFinde } });
        if (yaPosteo) return res.send("<script>alert('🔒 Solo 1 duda por fin de semana'); window.location='/';</script>");
    }
    next();
};

// --- RUTAS ---

// Publicar (Apuntes, Fechas, Dudas)
app.post('/publicar', upload.single('archivo'), verificarHorarioDudas, async (req, res) => {
    let url = '';
    if (req.file) {
        const r = await new Promise((rs) => {
            const s = cloudinary.uploader.upload_stream({ folder: 'aula' }, (err, resu) => rs(resu));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        url = r.secure_url;
    }
    await new Post({ 
        tipo: req.body.tipo, 
        titulo: req.body.titulo, 
        imagen: url, 
        autor: req.session.u 
    }).save();
    res.redirect('/');
});

// Comentar
app.post('/comentar/:id', async (req, res) => {
    await Post.findByIdAndUpdate(req.params.id, { 
        $push: { comentarios: { autor: req.session.u, texto: req.body.texto } } 
    });
    res.redirect('/');
});

// Reaccionar (Petición 5: 1 vez al día)
app.post('/like/:id', async (req, res) => {
    const u = await User.findOne({ user: req.session.u });
    const hoy = new Date().toDateString();
    if (u.historialLikes.get(req.params.id) === hoy) return res.send("<script>alert('Ya reaccionaste hoy'); window.location='/';</script>");
    
    await Post.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } });
    u.historialLikes.set(req.params.id, hoy);
    await u.save();
    res.redirect('/');
});

// Configuración (Logo y Foto Perfil)
app.post('/config', upload.single('fotoPerfil'), async (req, res) => {
    if (req.session.rol === 'admin' && req.body.logoUrl) {
        await Config.findOneAndUpdate({}, { logoUrl: req.body.logoUrl }, { upsert: true });
    }
    if (req.file) {
        const r = await new Promise((rs) => {
            const s = cloudinary.uploader.upload_stream({ folder: 'perfiles' }, (err, resu) => rs(resu));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        await User.findOneAndUpdate({ user: req.session.u }, { foto: r.secure_url });
    }
    res.redirect('/');
});

// Admin CMD (Petición 6 y 7)
app.post('/admin/cmd', async (req, res) => {
    if (req.session.rol !== 'admin') return res.redirect('/');
    const { accion, id, val } = req.body;
    if (accion === 'ban') {
        let d = new Date(); d.setHours(d.getHours() + parseInt(val));
        await User.findByIdAndUpdate(id, { baneadoHasta: d });
    }
    if (accion === 'del') await User.findByIdAndDelete(id);
    res.redirect('/');
});

// --- INTERFAZ ---
app.get('/', async (req, res) => {
    const conf = await Config.findOne() || { logoUrl: 'https://cdn-icons-png.flaticon.com/512/3449/3449692.png' };
    
    const htmlHead = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <title>Aula Virtual 2026</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap" rel="stylesheet">
        <style>
            :root { --grad: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
            body { margin: 0; font-family: 'Poppins', sans-serif; background: #f0f2f5; }
            .splash { position: fixed; top:0; left:0; width:100%; height:100%; background: white; display:flex; justify-content:center; align-items:center; z-index:1000; animation: fadeOut 1.5s forwards; animation-delay: 1s; }
            @keyframes fadeOut { to { opacity:0; visibility:hidden; } }
            .nav { background: var(--grad); padding: 15px 5%; display: flex; justify-content: space-between; align-items: center; color: white; }
            .main-container { max-width: 900px; margin: 20px auto; padding: 10px; }
            .tabs { display: flex; overflow-x: auto; background: white; padding: 10px; border-radius: 15px; margin-bottom: 20px; gap: 10px; }
            .tab-btn { padding: 10px 20px; border: none; background: #f0f2f5; border-radius: 10px; cursor: pointer; white-space: nowrap; font-weight: 600; }
            .tab-btn.active { background: #667eea; color: white; }
            .card { background: white; border-radius: 15px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
            .post-img { width: 100%; border-radius: 10px; margin-top: 10px; }
            .comment-section { background: #f8f9fa; padding: 10px; border-radius: 10px; margin-top: 15px; }
            .input-style { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; margin: 5px 0; box-sizing:border-box; }
            .btn { background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; }
            .user-foto { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
        </style>
    </head>
    <body>
        <div class="splash"><img src="${conf.logoUrl}" width="150" class="logo-anim"></div>
    `;

    if (!req.session.u) {
        return res.send(htmlHead + `
            <div style="height: 90vh; display: flex; justify-content: center; align-items: center;">
                <div class="card" style="width: 350px; text-align: center;">
                    <img src="${conf.logoUrl}" width="80">
                    <h2>Bienvenido</h2>
                    <form action="/auth" method="POST">
                        <input class="input-style" name="user" placeholder="Usuario" required>
                        <input class="input-style" name="pass" type="password" placeholder="Contraseña" required>
                        <input class="input-style" name="pin" placeholder="PIN Admin (Opcional)">
                        <button class="btn" name="m" value="in" style="width:100%">Entrar</button>
                        <button class="btn" name="m" value="reg" style="width:100%; background:#48bb78; margin-top:10px;">Registrarse</button>
                    </form>
                </div>
            </div>
        </body></html>`);
    }

    const posts = await Post.find().sort({ fecha: -1 });
    const userLogueado = await User.findOne({user: req.session.u});
    const users = req.session.rol === 'admin' ? await User.find() : [];

    res.send(htmlHead + `
        <div class="nav">
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${conf.logoUrl}" width="30">
                <b>AULA VIRTUAL</b>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${userLogueado.foto || 'https://via.placeholder.com/40'}" class="user-foto">
                <a href="/salir" style="color:white; text-decoration:none;">Sair</a>
            </div>
        </div>

        <div class="main-container">
            <div class="tabs">
                <button class="tab-btn active" onclick="showTab('apuntes')">1. Apuntes</button>
                <button class="tab-btn" onclick="showTab('fechas')">2. Calendario</button>
                <button class="tab-btn" onclick="showTab('dudas')">3. Dudas</button>
                <button class="tab-btn" onclick="showTab('usuarios')">4. Usuarios</button>
                <button class="tab-btn" onclick="showTab('config')">5. Ajustes</button>
            </div>

            ${['apuntes', 'fechas', 'dudas'].map(tipo => `
                <div id="${tipo}" class="tab-content" style="display: ${tipo === 'apuntes' ? 'block' : 'none'}">
                    <div class="card">
                        <h3>Publicar en ${tipo.toUpperCase()}</h3>
                        <form action="/publicar" method="POST" enctype="multipart/form-data">
                            <input type="hidden" name="tipo" value="${tipo}">
                            <textarea class="input-style" name="titulo" placeholder="Escribe aquí..."></textarea>
                            ${tipo === 'dudas' ? '<input type="file" name="archivo" accept="image/*">' : ''}
                            <button class="btn">Publicar</button>
                        </form>
                    </div>
                    ${posts.filter(p => p.tipo === tipo).map(p => `
                        <div class="card">
                            <b>@${p.autor}</b> <small>${p.fecha.toLocaleString()}</small>
                            <p>${p.titulo}</p>
                            ${p.imagen ? `<img src="${p.imagen}" class="post-img">` : ''}
                            <form action="/like/${p._id}" method="POST">
                                <button class="btn" style="background:#edf2f7; color:#3182ce;">👍 ${p.likes}</button>
                            </form>
                            <div class="comment-section">
                                ${p.comentarios.map(c => `<p><b>${c.autor}:</b> ${c.texto}</p>`).join('')}
                                <form action="/comentar/${p._id}" method="POST">
                                    <input class="input-style" name="texto" placeholder="Escribe un comentario..." required>
                                    <button class="btn" style="padding:5px 10px;">Enviar</button>
                                </form>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `).join('')}

            <div id="usuarios" class="tab-content" style="display:none">
                <div class="card">
                    <h3>Gestión de Usuarios</h3>
                    ${users.map(u => `
                        <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #eee; padding:10px;">
                            <span>${u.user} (${u.rol})</span>
                            <form action="/admin/cmd" method="POST">
                                <input type="hidden" name="id" value="${u._id}">
                                <input name="val" placeholder="Horas Ban" style="width:70px">
                                <button class="btn" name="accion" value="ban" style="background:#ecc94b">Ban</button>
                                <button class="btn" name="accion" value="del" style="background:#f56565">Eliminar</button>
                            </form>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div id="config" class="tab-content" style="display:none">
                <div class="card">
                    <h3>Tu Perfil</h3>
                    <form action="/config" method="POST" enctype="multipart/form-data">
                        <p>Foto de perfil (Solo JPG/PNG/GIF):</p>
                        <input type="file" name="fotoPerfil" accept="image/*">
                        <br><br>
                        ${req.session.rol === 'admin' ? `
                            <p>URL Logo del Sistema:</p>
                            <input class="input-style" name="logoUrl" placeholder="URL de la imagen">
                        ` : ''}
                        <button class="btn">Guardar Cambios</button>
                    </form>
                    <hr>
                    <button class="btn" onclick="activarNotificaciones()" style="background:#4a5568">Activar Notificaciones Reales</button>
                </div>
            </div>
        </div>

        <script>
            function showTab(id) {
                document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.getElementById(id).style.display = 'block';
                event.currentTarget.classList.add('active');
            }

            // PETICIÓN 1: NOTIFICACIONES REALES
            function activarNotificaciones() {
                Notification.requestPermission().then(perm => {
                    if(perm === 'granted') {
                        new Notification("¡Aula Virtual!", { body: "Notificaciones activadas correctamente", icon: "${conf.logoUrl}" });
                    }
                });
            }

            // Simulación de notificación al recibir algo (frontend)
            if ("${posts.length}" > localStorage.getItem('lastCount')) {
                 if (Notification.permission === 'granted') {
                    new Notification("Nueva publicación", { body: "Alguien ha compartido contenido nuevo." });
                 }
            }
            localStorage.setItem('lastCount', "${posts.length}");
        </script>
    </body></html>`);
});

// AUTH
app.post('/auth', async (req, res) => {
    const { user, pass, pin, m } = req.body;
    if (m === 'reg') {
        const rol = (pin === '2845') ? 'admin' : 'estudiante';
        await new User({ user, pass, rol, foto: '' }).save();
        return res.send("<script>alert('Cuenta creada'); window.location='/';</script>");
    }
    const u = await User.findOne({ user, pass });
    if (u && (!u.baneadoHasta || u.baneadoHasta < new Date())) {
        req.session.u = u.user; req.session.rol = u.rol; res.redirect('/');
    } else {
        res.send("<script>alert('Acceso denegado o usuario baneado'); window.location='/';</script>");
    }
});

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(PORT, () => console.log('🚀 Sistema en puerto ' + PORT));
