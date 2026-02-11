const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const webpush = require('web-push');
const app = express();

// Cambiado a 5000 para evitar el error EADDRINUSE de tus capturas
const PORT = process.env.PORT || 5000;

// --- CONFIGURACIÓN NOTIFICACIONES (VAPID) ---
const vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:admin@clase.com', vapidKeys.publicKey, vapidKeys.privateKey);

// --- 1. CONFIGURACIÓN CLOUDINARY ---
cloudinary.config({ 
    cloud_name: 'dvlbsl16g', 
    api_key: '721617469253873', 
    api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});

const upload = multer(); 

// --- 2. CONEXIÓN MONGODB ---
const MONGO_URI = "mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0"; 
mongoose.connect(MONGO_URI).then(() => console.log("¡Conectado a la base de datos!"));

// --- 3. MODELOS ---
const CommentSchema = new mongoose.Schema({ autor: String, texto: String, timestamp: String });

const Item = mongoose.model('Item', { 
    tipo: String, titulo: String, link: String, asignatura: String, autor: String, timestamp: String,
    fechaExamen: String, comentarios: [CommentSchema],
    reacciones: { type: [String], default: [] } 
});

const User = mongoose.model('User', { 
    user: String, pass: String, rol: String, 
    color: { type: String, default: '#6c5ce7' },
    avatar: { type: String, default: '' },
    baneadoHasta: { type: Date, default: null },
    suscripcionPush: Object 
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secreto-clase-definitivo', resave: false, saveUninitialized: false }));

// RUTA PARA EL SERVICE WORKER
app.get('/sw.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.send(`
        self.addEventListener('push', e => {
            const data = e.data.json();
            self.registration.showNotification(data.title, {
                body: data.body,
                icon: 'https://cdn-icons-png.flaticon.com/512/3449/3449692.png'
            });
        });
    `);
});

// --- MIDDLEWARE BANEO ---
const checkBan = async (req, res, next) => {
    if (req.session.u) {
        const u = await User.findOne({ user: req.session.u });
        if (u && u.baneadoHasta && u.baneadoHasta > new Date()) {
            return res.send(\`<h1>🚫 Acceso Denegado</h1><p>Baneado hasta: \${u.baneadoHasta.toLocaleString()}</p><a href="/salir">Cerrar sesión</a>\`);
        }
    }
    next();
};

// --- 4. LÓGICA DE NOTIFICACIONES ---
app.post('/suscribirse', async (req, res) => {
    if (!req.session.u) return res.sendStatus(401);
    await User.findOneAndUpdate({ user: req.session.u }, { suscripcionPush: req.body });
    res.status(201).json({});
});

async function enviarNotificacionGlobal(titulo, cuerpo) {
    const usuarios = await User.find({ suscripcionPush: { $exists: true } });
    const payload = JSON.stringify({ title: titulo, body: cuerpo });
    usuarios.forEach(u => {
        webpush.sendNotification(u.suscripcionPush, payload).catch(() => {});
    });
}

// --- 5. LÓGICA DE USUARIOS Y CONTENIDO ---
app.post('/auth', async (req, res) => {
    const { user, pass, pin, accion } = req.body;
    if (accion === 'registro') {
        const rol = (pin === '2845') ? 'admin' : 'estudiante';
        await new User({ user, pass, rol }).save();
        return res.send('Registrado con éxito. <a href="/">Entrar</a>');
    }
    const u = await User.findOne({ user, pass });
    if (u) { req.session.u = u.user; req.session.rol = u.rol; res.redirect('/'); }
    else res.send('Datos incorrectos.');
});

app.post('/publicar', checkBan, upload.single('archivo'), async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    
    // Restricción Finde (Viernes 18h - Lunes 08h)
    const ahora = new Date();
    const dia = ahora.getDay(); 
    const hora = ahora.getHours();
    const esFinde = (dia === 5 && hora >= 18) || (dia === 6) || (dia === 0) || (dia === 1 && hora < 8);

    if (req.body.tipo === 'duda' && esFinde) {
        const yaPregunto = await Item.findOne({ tipo: 'duda', autor: req.session.u, timestamp: { $regex: ahora.toLocaleDateString() } });
        if (yaPregunto) return res.send('⚠️ Solo una duda por persona los fines de semana.');
    }

    let url = "";
    if (req.file) {
        const r = await new Promise((resolve) => {
            let s = cloudinary.uploader.upload_stream({ folder: "clase", resource_type: "auto" }, (e, resu) => resolve(resu));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        url = r.secure_url;
    }
    
    await new Item({ 
        tipo: req.body.tipo, titulo: req.body.titulo, asignatura: req.body.asignatura,
        link: url, autor: req.session.u, timestamp: ahora.toLocaleString() 
    }).save();

    enviarNotificacionGlobal(`Nueva publicación`, `\${req.session.u} subió algo nuevo.`);
    res.redirect('/');
});

app.post('/reaccionar/:id', async (req, res) => {
    const post = await Item.findById(req.params.id);
    if (!post.reacciones.includes(req.session.u)) {
        await Item.findByIdAndUpdate(req.params.id, { $push: { reacciones: req.session.u } });
    }
    res.redirect('/');
});

app.post('/banear/:id', async (req, res) => {
    if (req.session.rol !== 'admin') return res.redirect('/');
    let fecha = new Date();
    if (req.body.tiempo === '2d') fecha.setDate(fecha.getDate() + 2);
    else if (req.body.tiempo === '1w') fecha.setDate(fecha.getDate() + 7);
    else if (req.body.tiempo === 'perm') fecha.setFullYear(fecha.getFullYear() + 99);
    else fecha = null;
    await User.findByIdAndUpdate(req.params.id, { baneadoHasta: fecha });
    res.redirect('/');
});

app.post('/borrar-cuenta/:id', async (req, res) => {
    if (req.session.rol === 'admin') await User.findByIdAndDelete(req.params.id);
    res.redirect('/');
});

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });

// --- 6. INTERFAZ ---
app.get('/', async (req, res) => {
    if (!req.session.u) return res.send(\`
        <head><title>Aula Virtual</title><link rel="icon" href="https://cdn-icons-png.flaticon.com/512/3449/3449692.png"></head>
        <body style="font-family:sans-serif; background:#6c5ce7; margin:0; display:flex; justify-content:center; align-items:center; height:100vh;">
            <div id="splash" style="position:fixed; top:0; left:0; width:100%; height:100%; background:#6c5ce7; display:flex; flex-direction:column; justify-content:center; align-items:center; z-index:99; color:white;">
                <img src="https://cdn-icons-png.flaticon.com/512/3449/3449692.png" width="80"><h1>Aula Virtual</h1>
            </div>
            <form action="/auth" method="POST" style="background:white; padding:30px; border-radius:20px; width:280px; text-align:center;">
                <h2>🎓 Entrar</h2>
                <input name="user" placeholder="Usuario" required style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:1px solid #ddd;">
                <input name="pass" type="password" placeholder="Contraseña" required style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:1px solid #ddd;">
                <button name="accion" value="login" style="width:100%; background:#6c5ce7; color:white; padding:10px; border:none; border-radius:5px; cursor:pointer;">Entrar</button>
            </form>
            <script>setTimeout(() => document.getElementById('splash').style.display='none', 1500);</script>
        </body>\`);

    const userLog = await User.findOne({ user: req.session.u });
    const todos = await Item.find();
    const todosUsuarios = req.session.rol === 'admin' ? await User.find() : [];
    const color = userLog.color || '#6c5ce7';

    res.send(\`
        <html>
        <head>
            <title>Aula Virtual</title>
            <link rel="icon" href="https://cdn-icons-png.flaticon.com/512/3449/3449692.png">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family:sans-serif; background:#f0f2f5; margin:0; }
                nav { background:\${color}; color:white; padding:15px; display:flex; justify-content:space-between; }
                .tabs { display:flex; background:white; position:sticky; top:0; z-index:10; box-shadow:0 2px 5px rgba(0,0,0,0.1); }
                .tab { flex:1; text-align:center; padding:15px; cursor:pointer; font-weight:bold; color:#aaa; }
                .tab.active { border-bottom:3px solid \${color}; color:\${color}; }
                .container { max-width:500px; margin:20px auto; padding:10px; }
                .section { display:none; } .section.active { display:block; }
                .card { background:white; padding:15px; border-radius:15px; margin-bottom:15px; box-shadow:0 2px 10px rgba(0,0,0,0.05); }
                input, select, button, textarea { border-radius:10px; border:1px solid #ddd; padding:12px; margin-bottom:10px; width:100%; box-sizing:border-box; }
            </style>
        </head>
        <body>
            <nav><b>🎓 \${req.session.u}</b> <a href="/salir" style="color:white; text-decoration:none; font-size:0.8em;">Cerrar Sesión</a></nav>
            <div class="tabs">
                <div class="tab active" onclick="ver('apuntes', this)">📂</div>
                <div class="tab" onclick="ver('dudas', this)">❓</div>
                <div class="tab" onclick="ver('perfil', this)">⚙️</div>
                \${req.session.rol === 'admin' ? '<div class="tab" onclick="ver(\'admin\', this)">👑</div>' : ''}
            </div>
            
            <div class="container">
                <div id="sec-apuntes" class="section active">
                    <form action="/publicar" method="POST" enctype="multipart/form-data" class="card">
                        <input type="hidden" name="tipo" value="apunte"><input name="titulo" placeholder="Título del archivo..." required>
                        <input type="file" name="archivo" required><button style="background:\${color}; color:white; border:none;">📤 Subir</button>
                    </form>
                    \${todos.filter(i=>i.tipo==='apunte').reverse().map(i=>\`<div class="card" style="border-left:5px solid \${color};"><b>\${i.titulo}</b><br><small>\${i.autor} - \${i.timestamp}</small></div>\`).join('')}
                </div>

                <div id="sec-dudas" class="section">
                    <form action="/publicar" method="POST" enctype="multipart/form-data" class="card">
                        <input type="hidden" name="tipo" value="duda"><textarea name="titulo" placeholder="Escribe tu duda o pregunta..." required></textarea>
                        <input type="file" name="archivo" accept="image/*">
                        <button style="background:#00b894; color:white; border:none;">Lanzar Pregunta</button>
                    </form>
                    \${todos.filter(i=>i.tipo==='duda').reverse().map(i=>\`
                        <div class="card">
                            <b>\${i.autor}:</b> \${i.titulo}<br>
                            \${i.link ? \`<img src="\${i.link}" style="width:100%; border-radius:10px; margin-top:10px;">\` : ''}
                            <form action="/reaccionar/\${i._id}" method="POST" style="margin-top:10px;">
                                <button style="width:auto; padding:5px 15px; background:#f0f0f0; border:none; border-radius:20px;">💡 Útil (\${i.reacciones.length})</button>
                            </form>
                        </div>
                    \`).join('')}
                </div>

                <div id="sec-perfil" class="section">
                    <div class="card" style="text-align:center;">
                        <img src="\${userLog.avatar || 'https://via.placeholder.com/100'}" width="100" style="border-radius:50%; border:3px solid \${color};">
                        <h3>Ajustes</h3>
                        <button onclick="activarNotificaciones()" style="background:#ff7675; color:white; border:none; margin-bottom:15px;">🔔 Activar Avisos al Móvil</button>
                        <form action="/ajustes" method="POST" enctype="multipart/form-data">
                            <select name="color"><option value="#6c5ce7">Morado</option><option value="#2d3436">Negro</option><option value="#00b894">Verde</option></select>
                            <input type="file" name="avatar">
                            <button style="background:\${color}; color:white; border:none;">Guardar Cambios</button>
                        </form>
                    </div>
                </div>

                <div id="sec-admin" class="section">
                    <h3>Alumnos Registrados (\${todosUsuarios.length})</h3>
                    \${todosUsuarios.map(u => \`
                        <div class="card" style="display:flex; align-items:center; gap:10px; padding:10px;">
                            <img src="\${u.avatar || 'https://via.placeholder.com/40'}" width="40" height="40" style="border-radius:50%;">
                            <div style="flex:1;"><b>\${u.user}</b></div>
                            <form action="/banear/\${u._id}" method="POST" style="margin:0; width:90px;">
                                <select name="tiempo" onchange="this.form.submit()" style="font-size:0.7em; padding:5px; margin:0;">
                                    <option>Baneo...</option><option value="2d">2 Días</option><option value="1w">1 Semana</option><option value="perm">Perm</option><option value="unban">Quitar</option>
                                </select>
                            </form>
                            <form action="/borrar-cuenta/\${u._id}" method="POST" style="margin:0; width:40px;">
                                <button style="background:red; color:white; border:none; padding:5px; margin:0;">🗑️</button>
                            </form>
                        </div>
                    \`).join('')}
                </div>
            </div>

            <script>
                function ver(id, el) {
                    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.getElementById('sec-' + id).classList.add('active');
                    el.classList.add('active');
                }

                async function activarNotificaciones() {
                    const permission = await Notification.requestPermission();
                    if (permission === 'granted') {
                        const registration = await navigator.serviceWorker.register('/sw.js');
                        const subscription = await registration.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: '\${vapidKeys.publicKey}'
                        });
                        await fetch('/suscribirse', {
                            method: 'POST',
                            body: JSON.stringify(subscription),
                            headers: { 'Content-Type': 'application/json' }
                        });
                        alert('✅ Notificaciones activadas en este dispositivo');
                    }
                }
            </script>
        </body>
        </html>\`);
});

app.listen(PORT, () => console.log('Aula Virtual funcionando en el puerto ' + PORT));
