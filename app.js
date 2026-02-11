const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const webpush = require('web-push');
const app = express();

const PORT = process.env.PORT || 8080;

// 1. CONFIGURACIONES
cloudinary.config({ cloud_name: 'dvlbsl16g', api_key: '721617469253873', api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' });
const upload = multer();
const vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:admin@clase.com', vapidKeys.publicKey, vapidKeys.privateKey);

// 2. BASE DE DATOS
mongoose.connect("mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0")
    .then(() => console.log("✅ Aula Virtual conectada en Koyeb"));

const User = mongoose.model('User', { 
    user: String, pass: String, rol: String, 
    color: { type: String, default: '#6c5ce7' },
    avatar: { type: String, default: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png' },
    baneadoHasta: { type: Date, default: null },
    suscripcionPush: Object 
});

const Item = mongoose.model('Item', { 
    tipo: String, titulo: String, link: String, autor: String, 
    timestamp: String, reacciones: { type: [String], default: [] } 
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secreto-clase-pro', resave: false, saveUninitialized: false }));

// 3. MIDDLEWARE DE BANEO
const checkBan = async (req, res, next) => {
    if (req.session.u) {
        const u = await User.findOne({ user: req.session.u });
        if (u && u.baneadoHasta && u.baneadoHasta > new Date()) {
            return res.send('<body style="font-family:sans-serif;text-align:center;padding:50px;"><h1>🚫 ACCESO RESTRINGIDO</h1><p>Baneado hasta: ' + u.baneadoHasta.toLocaleString() + '</p><a href="/salir">Cerrar sesión</a></body>');
        }
    }
    next();
};

// 4. RUTAS DE NOTIFICACIONES Y AUTH
app.get('/sw.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.send("self.addEventListener('push', e => { const d = e.data.json(); self.registration.showNotification(d.title, { body: d.body, icon: 'https://cdn-icons-png.flaticon.com/512/3449/3449692.png' }); });");
});

app.post('/auth', async (req, res) => {
    const { user, pass, pin, accion } = req.body;
    if (accion === 'registro') {
        const rol = (pin === '2845') ? 'admin' : 'estudiante';
        await new User({ user, pass, rol }).save();
        return res.send('¡Cuenta creada! <a href="/">Entrar ahora</a>');
    }
    const u = await User.findOne({ user, pass });
    if (u) { req.session.u = u.user; req.session.rol = u.rol; res.redirect('/'); }
    else res.send('Datos incorrectos. <a href="/">Volver</a>');
});

// 5. PUBLICAR Y REACCIONAR
app.post('/publicar', checkBan, upload.single('archivo'), async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    let url = "";
    if (req.file) {
        const r = await new Promise((res) => {
            let s = cloudinary.uploader.upload_stream({ folder: "clase" }, (e, rs) => res(rs));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        url = r.secure_url;
    }
    await new Item({ tipo: req.body.tipo, titulo: req.body.titulo, link: url, autor: req.session.u, timestamp: new Date().toLocaleString() }).save();
    
    // Notificar a todos
    const suscritos = await User.find({ suscripcionPush: { $exists: true } });
    suscritos.forEach(u => {
        webpush.sendNotification(u.suscripcionPush, JSON.stringify({ title: 'Nueva publicación', body: req.session.u + ' ha subido algo.' })).catch(() => {});
    });
    res.redirect('/');
});

app.post('/reaccionar/:id', async (req, res) => {
    const post = await Item.findById(req.params.id);
    if (!post.reacciones.includes(req.session.u)) {
        await Item.findByIdAndUpdate(req.params.id, { $push: { reacciones: req.session.u } });
    }
    res.redirect('/');
});

// 6. RUTAS DE ADMINISTRADOR
app.post('/admin/ban', async (req, res) => {
    if (req.session.rol !== 'admin') return res.redirect('/');
    let f = new Date();
    if (req.body.tiempo === '2d') f.setDate(f.getDate() + 2);
    else if (req.body.tiempo === '1w') f.setDate(f.getDate() + 7);
    else if (req.body.tiempo === 'perm') f.setFullYear(f.getFullYear() + 99);
    else f = null;
    await User.findByIdAndUpdate(req.body.id, { baneadoHasta: f });
    res.redirect('/');
});

app.post('/admin/borrar', async (req, res) => {
    if (req.session.rol === 'admin') await User.findByIdAndDelete(req.body.id);
    res.redirect('/');
});

app.post('/suscribirse', async (req, res) => {
    await User.findOneAndUpdate({ user: req.session.u }, { suscripcionPush: req.body });
    res.status(201).json({});
});

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });

// 7. INTERFAZ VISUAL
app.get('/', async (req, res) => {
    if (!req.session.u) {
        return res.send(`
            <head>
                <title>Aula Virtual</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { margin:0; font-family:sans-serif; background:#6c5ce7; display:flex; justify-content:center; align-items:center; height:100vh; }
                    #sp { position:fixed; top:0; left:0; width:100%; height:100%; background:#6c5ce7; display:flex; flex-direction:column; justify-content:center; align-items:center; z-index:100; color:white; }
                    form { background:white; padding:40px; border-radius:30px; width:300px; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.3); }
                    input { width:100%; padding:12px; margin:10px 0; border:1px solid #ddd; border-radius:10px; }
                    button { width:100%; padding:12px; border:none; border-radius:10px; cursor:pointer; font-weight:bold; background:#6c5ce7; color:white; }
                </style>
            </head>
            <body>
                <div id="sp"><img src="https://cdn-icons-png.flaticon.com/512/3449/3449692.png" width="80"><h1>Aula Virtual</h1></div>
                <form action="/auth" method="POST">
                    <h2>Entrar</h2>
                    <input name="user" placeholder="Usuario" required>
                    <input name="pass" type="password" placeholder="Pass" required>
                    <input name="pin" placeholder="PIN Admin (Si registras)">
                    <button name="accion" value="login">LOGIN</button>
                    <button name="accion" value="registro" style="background:none; color:gray; margin-top:10px;">Crear cuenta</button>
                </form>
                <script>setTimeout(() => document.getElementById('sp').style.display='none', 2000);</script>
            </body>`);
    }

    const items = await Item.find();
    const uLog = await User.findOne({ user: req.session.u });
    const todosU = req.session.rol === 'admin' ? await User.find() : [];
    const color = uLog.color || '#6c5ce7';

    let html = `
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family:sans-serif; background:#f0f2f5; margin:0; }
            nav { background:\${color}; color:white; padding:15px; display:flex; justify-content:space-between; position:sticky; top:0; z-index:50; }
            .container { max-width:500px; margin:auto; padding:10px; }
            .card { background:white; padding:15px; border-radius:15px; margin-bottom:15px; box-shadow:0 2px 5px rgba(0,0,0,0.1); }
            .tab-btn { flex:1; padding:15px; text-align:center; background:white; cursor:pointer; border-bottom:2px solid #ddd; }
            .active { border-bottom:4px solid \${color}; color:\${color}; }
        </style>
    </head>
    <body>
        <nav><b>🎓 Aula Virtual</b> <a href="/salir" style="color:white; text-decoration:none;">Salir</a></nav>
        
        <div style="display:flex;">
            <div id="t1" class="tab-btn active" onclick="ver('home', 't1')">🏠</div>
            <div id="t2" class="tab-btn" onclick="ver('perfil', 't2')">👤</div>
            \${req.session.rol === 'admin' ? '<div id="t3" class="tab-btn" onclick="ver(\'admin\', \'t3\')">👑</div>' : ''}
        </div>

        <div class="container">
            <div id="sec-home" class="section">
                <button onclick="activar()" style="width:100%; background:#ff7675; color:white; border:none; padding:12px; border-radius:10px; margin-bottom:15px; font-weight:bold; cursor:pointer;">🔔 ACTIVAR NOTIFICACIONES</button>
                
                <form action="/publicar" method="POST" enctype="multipart/form-data" class="card">
                    <select name="tipo" style="width:100%; margin-bottom:10px;"><option value="apunte">Apunte</option><option value="duda">Duda</option></select>
                    <input name="titulo" placeholder="¿Qué quieres compartir?" required style="width:100%; margin-bottom:10px;">
                    <input type="file" name="archivo" style="margin-bottom:10px;">
                    <button style="width:100%; background:\${color}; color:white; padding:10px; border:none; border-radius:5px;">Publicar</button>
                </form>

                \${items.reverse().map(i => \`
                    <div class="card">
                        <b>\${i.autor}:</b> \${i.titulo}
                        \${i.link ? \`<img src="\${i.link}" style="width:100%; border-radius:10px; margin-top:10px;">\` : ''}
                        <form action="/reaccionar/\${i._id}" method="POST">
                            <button style="background:#eee; border:none; padding:5px 15px; border-radius:20px; margin-top:10px; cursor:pointer;">💡 Útil (\${i.reacciones.length})</button>
                        </form>
                    </div>
                \`).join('')}
            </div>

            <div id="sec-perfil" class="section" style="display:none;">
                <div class="card" style="text-align:center;">
                    <img src="\${uLog.avatar}" width="100" style="border-radius:50%; border:3px solid \${color};">
                    <h2>\${uLog.user}</h2>
                    <p>Estado: \${uLog.rol}</p>
                </div>
            </div>

            <div id="sec-admin" class="section" style="display:none;">
                <h3>Gestión de Usuarios</h3>
                \${todosU.map(u => \`
                    <div class="card" style="display:flex; align-items:center; gap:10px;">
                        <img src="\${u.avatar}" width="40" style="border-radius:50%;">
                        <div style="flex:1;"><b>\${u.user}</b></div>
                        <form action="/admin/ban" method="POST" style="margin:0;">
                            <input type="hidden" name="id" value="\${u._id}">
                            <select name="tiempo" onchange="this.form.submit()" style="font-size:10px;">
                                <option>Ban...</option>
                                <option value="2d">2d</option><option value="1w">1s</option><option value="perm">P</option>
                            </select>
                        </form>
                        <form action="/admin/borrar" method="POST" style="margin:0;">
                            <input type="hidden" name="id" value="\${u._id}">
                            <button style="background:red; color:white; border:none; padding:5px; border-radius:5px;">🗑️</button>
                        </form>
                    </div>
                \`).join('')}
            </div>
        </div>

        <script>
            function ver(id, tId) {
                document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
                document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
                document.getElementById('sec-' + id).style.display = 'block';
                document.getElementById(tId).classList.add('active');
            }
            async function activar() {
                const p = await Notification.requestPermission();
                if (p === 'granted') {
                    const r = await navigator.serviceWorker.register('/sw.js');
                    const s = await r.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: '\${vapidKeys.publicKey}'
                    });
                    await fetch('/suscribirse', {
                        method: 'POST',
                        body: JSON.stringify(s),
                        headers: { 'Content-Type': 'application/json' }
                    });
                    alert('✅ Notificaciones activas');
                }
            }
        </script>
    </body>
    </html>`;
    res.send(html);
});

app.listen(PORT, '0.0.0.0', () => console.log("🚀 Aula lista en puerto " + PORT));
