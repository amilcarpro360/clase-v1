const express = require('express');
const mongoose = require('mongoose');
const webpush = require('web-push');
const cloudinary = require('cloudinary').v2;
const path = require('path');

const app = express();
app.use(express.json());

// --- CONFIGURACIONES CON TUS KEYS ---
cloudinary.config({ 
  cloud_name: 'dvlbsl16g', 
  api_key: '721617469253873', 
  api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});

const vapidKeys = {
    publicKey: 'BOYDkx8i4CkqIwTEM_C3zi1r2XLs6CDhCahdUPRASD8UH7V0_bqsgY5IBvbaR_pze7guyfEk89cMKLO5du56z8M',
    privateKey: '4W4KYN5QhFWFV0I0XMgj0XgQv86JPjJLU9G4_nkxueQ'
};
webpush.setVapidDetails('mailto:amilcarvaleromartinez33@gmail.com', vapidKeys.publicKey, vapidKeys.privateKey);

mongoose.connect('mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0')
    .then(() => console.log("✅ MongoDB Atlas Conectado"));

// --- MODELOS ---
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String },
    role: { type: String, default: 'user' },
    profilePic: { type: String, default: 'https://via.placeholder.com/150' },
    themeColor: { type: String, default: '#3498db' },
    isBanned: { type: Boolean, default: false },
    banUntil: { type: Date, default: null },
    pushSubscription: Object
});
const User = mongoose.model('User', UserSchema);

const PostSchema = new mongoose.Schema({
    author: String,
    content: String,
    type: String, // 'apunte', 'duda', 'fecha'
    fileUrl: String,
    title: String,
    date: Date,
    createdAt: { type: Date, default: Date.now }
});
const Post = mongoose.model('Post', PostSchema);

const AppConfig = mongoose.model('AppConfig', new mongoose.Schema({
    splashText: { type: String, default: 'BIENVENIDO A LA CLASE' }
}));

// --- LÓGICA DE NEGOCIO ---

// Función para enviar notificaciones a todos
async function notifyAll(title, body) {
    const users = await User.find({ pushSubscription: { $exists: true } });
    users.forEach(user => {
        webpush.sendNotification(user.pushSubscription, JSON.stringify({ title, body }))
            .catch(err => console.error("Error enviando noti:", err));
    });
}

// --- RUTAS API ---

app.post('/api/auth', async (req, res) => {
    const { username, password, adminCode, action } = req.body;
    if (action === 'register') {
        const role = (adminCode === '2845') ? 'admin' : 'user';
        try {
            const user = new User({ username, password, role });
            await user.save();
            res.json(user);
        } catch (e) { res.status(400).send("Usuario ya existe"); }
    } else {
        const user = await User.findOne({ username, password });
        if (!user) return res.status(401).send("Datos incorrectos");
        if (user.isBanned && (!user.banUntil || user.banUntil > new Date())) {
            return res.status(403).send("Estás baneado");
        }
        res.json(user);
    }
});

app.post('/api/posts', async (req, res) => {
    const { author, content, type, fileUrl, title, date } = req.body;
    
    // Regla Fin de Semana (Viernes 6pm - Lunes 8am)
    if (type === 'duda') {
        const now = new Date();
        const day = now.getDay();
        const hour = now.getHours();
        const isWeekend = (day === 5 && hour >= 18) || (day === 6) || (day === 0) || (day === 1 && hour < 8);
        
        if (isWeekend) {
            const lastFri = new Date(); // Aproximación de inicio de finde
            const count = await Post.countDocuments({ author, type: 'duda', createdAt: { $gt: new Date(now - 48*60*60*1000) } });
            if (count >= 1) return res.status(403).send("Límite de 1 duda el fin de semana alcanzado.");
        }
    }

    const post = new Post({ author, content, type, fileUrl, title, date });
    await post.save();
    notifyAll("Nueva publicación", `${author} ha subido un ${type}`);
    res.json(post);
});

app.get('/api/data', async (req, res) => {
    const posts = await Post.find().sort({ createdAt: -1 });
    const users = await User.find({}, 'username profilePic role isBanned');
    const config = await AppConfig.findOne() || await AppConfig.create({});
    res.json({ posts, users, config });
});

app.post('/api/subscribe', async (req, res) => {
    await User.findOneAndUpdate({ username: req.body.username }, { pushSubscription: req.body.subscription });
    res.status(201).json({});
});

app.post('/api/admin/action', async (req, res) => {
    const { targetUser, action, time } = req.body;
    if (action === 'delete_user') await User.deleteOne({ username: targetUser });
    if (action === 'ban') {
        const banDate = time ? new Date(Date.now() + time * 60000) : null;
        await User.findOneAndUpdate({ username: targetUser }, { isBanned: true, banUntil: banDate });
    }
    if (action === 'unban') await User.findOneAndUpdate({ username: targetUser }, { isBanned: false });
    res.json({ ok: true });
});

// --- FRONTEND (HTML/CSS/JS) ---
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Web Clase</title>
    <script src="https://upload-widget.cloudinary.com/global/all.js"></script>
    <style>
        :root { --main: #3498db; --bg: #f0f2f5; }
        body { font-family: 'Segoe UI', sans-serif; margin: 0; background: var(--bg); transition: 0.3s; }
        #splash { position: fixed; inset: 0; background: var(--main); color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 3000; font-size: 2em; text-align: center; }
        #auth-screen { position: fixed; inset: 0; background: white; z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .nav { display: flex; background: #2c3e50; position: sticky; top: 0; z-index: 100; overflow-x: auto; }
        .nav-btn { color: white; padding: 15px; flex: 1; text-align: center; cursor: pointer; min-width: 90px; transition: 0.2s; font-size: 14px; }
        .nav-btn:hover { background: #34495e; }
        .section { display: none; padding: 20px; max-width: 800px; margin: auto; }
        .active { display: block; }
        .card { background: white; padding: 15px; margin-bottom: 15px; border-radius: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .user-row { display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 1px solid #ddd; }
        .user-row img { width: 45px; height: 45px; border-radius: 50%; margin-right: 15px; object-fit: cover; }
        button { background: var(--main); color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer; }
        input, textarea { padding: 10px; margin: 5px 0; width: 100%; box-sizing: border-box; border-radius: 8px; border: 1px solid #ccc; }
    </style>
</head>
<body>

    <div id="splash"><h1 id="splash-text">CARGANDO...</h1></div>

    <div id="auth-screen">
        <h2>Mi Clase Online</h2>
        <input type="text" id="user" placeholder="Nombre de usuario">
        <input type="password" id="pass" placeholder="Contraseña">
        <input type="text" id="acode" placeholder="Código Admin (si tienes)">
        <button onclick="auth('login')">Entrar</button>
        <button onclick="auth('register')" style="background:none; color:var(--main)">Crear cuenta nueva</button>
    </div>

    <div class="nav">
        <div class="nav-btn" onclick="tab('apuntes')">📚 Apuntes</div>
        <div class="nav-btn" onclick="tab('fechas')">📅 Fechas</div>
        <div class="nav-btn" onclick="tab('dudas')">❓ Dudas</div>
        <div class="nav-btn" onclick="tab('config')">⚙️ Perfil</div>
        <div id="adm-btn" class="nav-btn" style="display:none; background:#c0392b" onclick="tab('admin')">🛡️ Admin</div>
    </div>

    <div id="apuntes" class="section active">
        <h2>Apuntes y Material</h2>
        <button onclick="subir('apunte')">➕ Subir Archivo/Link</button>
        <div id="list-apuntes"></div>
    </div>

    <div id="fechas" class="section">
        <h2>Calendario Escolar</h2>
        <div class="card">
            <input type="text" id="f-title" placeholder="Título (Ej: Examen Mates)">
            <input type="date" id="f-date">
            <button onclick="postFecha()">Añadir Fecha</button>
        </div>
        <div id="list-fechas"></div>
    </div>

    <div id="dudas" class="section">
        <h2>Dudas y Deberes</h2>
        <textarea id="duda-val" placeholder="¿Qué hay que hacer de...?"></textarea>
        <button onclick="subir('duda')">Preguntar con Imagen / Texto</button>
        <div id="list-dudas"></div>
    </div>

    <div id="config" class="section">
        <h2>Configuración</h2>
        <div class="card">
            <button onclick="setupPush()">🔔 ACTIVAR NOTIFICACIONES REALES</button>
            <hr>
            <p>Color de tema:</p>
            <input type="color" onchange="changeColor(this.value)">
            <button onclick="subirPerfil()" style="margin-top:10px;">Cambiar Foto de Perfil</button>
            <button onclick="logout()" style="background:#e74c3c; width:100%; margin-top:20px;">Cerrar Sesión</button>
        </div>
    </div>

    <div id="admin" class="section">
        <h2>Gestor de Usuarios</h2>
        <div id="list-users" class="card"></div>
    </div>

    <script>
        let me = null;
        const cloudName = 'dvlbsl16g';

        // 1. Splash & Init
        async function init() {
            const res = await fetch('/api/data');
            const data = await res.json();
            document.getElementById('splash-text').innerText = data.config.splashText;
            renderPosts(data.posts);
            renderUsers(data.users);
            setTimeout(() => document.getElementById('splash').style.display='none', 2500);
        }

        // 2. Auth
        async function auth(action) {
            const body = { 
                username: document.getElementById('user').value, 
                password: document.getElementById('pass').value,
                adminCode: document.getElementById('acode').value,
                action 
            };
            const res = await fetch('/api/auth', { method: 'POST', body: JSON.stringify(body), headers: {'Content-Type':'application/json'} });
            if (res.ok) {
                me = await res.json();
                document.getElementById('auth-screen').style.display = 'none';
                if(me.role === 'admin') document.getElementById('adm-btn').style.display = 'block';
                document.documentElement.style.setProperty('--main', me.themeColor);
            } else { alert(await res.text()); }
        }

        // 3. Cloudinary
        function subir(type) {
            cloudinary.openUploadWidget({ cloudName, uploadPreset: 'ml_default' }, (err, res) => {
                if (!err && res.event === 'success') {
                    savePost(type, res.info.secure_url);
                }
            });
        }

        async function savePost(type, url) {
            const content = document.getElementById('duda-val').value;
            await fetch('/api/posts', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ author: me.username, content, type, fileUrl: url })
            });
            location.reload();
        }

        // 4. Notificaciones Push
        async function setupPush() {
            const reg = await navigator.serviceWorker.register('/sw.js');
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: 'BOYDkx8i4CkqIwTEM_C3zi1r2XLs6CDhCahdUPRASD8UH7V0_bqsgY5IBvbaR_pze7guyfEk89cMKLO5du56z8M'
            });
            await fetch('/api/subscribe', {
                method: 'POST',
                body: JSON.stringify({ username: me.username, subscription: sub }),
                headers: {'Content-Type':'application/json'}
            });
            alert("¡Notificaciones activadas!");
        }

        function tab(id) {
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.getElementById(id).classList.add('active');
        }

        function renderPosts(posts) {
            posts.forEach(p => {
                const div = document.createElement('div');
                div.className = 'card';
                div.innerHTML = '<b>' + p.author + ':</b> <p>' + (p.content || '') + '</p>' + (p.fileUrl ? '<img src="'+p.fileUrl+'" style="width:100%">' : '');
                if(p.type === 'apunte') document.getElementById('list-apuntes').appendChild(div);
                if(p.type === 'duda') document.getElementById('list-dudas').appendChild(div);
            });
        }

        function renderUsers(users) {
            users.forEach(u => {
                const div = document.createElement('div');
                div.className = 'user-row';
                div.innerHTML = '<div style="display:flex; align-items:center"><img src="'+u.profilePic+'"> <b>'+u.username+'</b> ('+u.role+')</div>';
                if(me && me.role === 'admin') {
                    div.innerHTML += '<div><button onclick="adminAct(\''+u.username+'\', \'ban\', 60)" style="background:orange">Ban 1h</button> <button onclick="adminAct(\''+u.username+'\', \'delete_user\')" style="background:red">Eliminar</button></div>';
                }
                document.getElementById('list-users').appendChild(div);
            });
        }

        async function adminAct(targetUser, action, time) {
            await fetch('/api/admin/action', { method: 'POST', body: JSON.stringify({ targetUser, action, time }), headers: {'Content-Type':'application/json'} });
            location.reload();
        }

        function logout() { location.reload(); }
        init();
    </script>
</body>
</html>
    `);
});

app.get('/sw.js', (req, res) => res.sendFile(path.join(__dirname, 'sw.js')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Web corriendo en puerto ${PORT}`));
