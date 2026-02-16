const express = require('express');
const mongoose = require('mongoose');
const webpush = require('web-push');
const cloudinary = require('cloudinary').v2;
const path = require('path');

const app = express();
app.use(express.json());

// CONFIGURACIONES (Tus Keys)
cloudinary.config({ cloud_name: 'dvlbsl16g', api_key: '721617469253873', api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' });
webpush.setVapidDetails('mailto:amilcarvaleromartinez33@gmail.com', 'BOYDkx8i4CkqIwTEM_C3zi1r2XLs6CDhCahdUPRASD8UH7V0_bqsgY5IBvbaR_pze7guyfEk89cMKLO5du56z8M', '4W4KYN5QhFWFV0I0XMgj0XgQv86JPjJLU9G4_nkxueQ');
mongoose.connect('mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0');

// MODELOS [cite: 1, 2]
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true }, password: { type: String },
    role: { type: String, default: 'user' }, profilePic: { type: String, default: '' },
    isBanned: { type: Boolean, default: false }, pushSubscription: Object
}));

const Post = mongoose.model('Post', new mongoose.Schema({
    author: String, content: String, type: String, fileUrl: String, createdAt: { type: Date, default: Date.now }
}));

const Config = mongoose.model('Config', new mongoose.Schema({ splashText: { type: String, default: 'BIENVENIDO' } }));

// REGLA FIN DE SEMANA (Punto 6) 
const isWeekendRestricted = async (username) => {
    const now = new Date();
    const isWeekend = (now.getDay() === 5 && now.getHours() >= 18) || now.getDay() === 6 || now.getDay() === 0 || (now.getDay() === 1 && now.getHours() < 8);
    if (isWeekend) {
        const count = await Post.countDocuments({ author: username, type: 'dudas', createdAt: { $gte: new Date(Date.now() - 48*60*60*1000) } });
        return count >= 1;
    }
    return false;
};

// RUTAS API 
app.post('/api/auth', async (req, res) => {
    const { username, password, code, action } = req.body;
    if (action === 'register') {
        const role = (code === '2845') ? 'admin' : 'user'; // Código admin 2845
        const user = new User({ username, password, role });
        await user.save();
        return res.json(user);
    }
    const user = await User.findOne({ username, password });
    if (!user || user.isBanned) return res.status(401).send("Error");
    res.json(user);
});

app.post('/api/posts', async (req, res) => {
    if (req.body.type === 'dudas' && await isWeekendRestricted(req.body.author)) return res.status(403).send("Límite Finde");
    const post = new Post(req.body);
    await post.save();
    res.json(post);
});

app.get('/api/data', async (req, res) => {
    const posts = await Post.find().sort({createdAt: -1});
    const config = await Config.findOne() || await Config.create({});
    const users = await User.find();
    res.json({ posts, config, users });
});

// FRONTEND [cite: 1, 2, 3]
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Web Clase</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="https://upload-widget.cloudinary.com/global/all.js"></script>
    <style>
        :root { --main: #3498db; }
        body { font-family: sans-serif; margin: 0; background: #f0f0f0; }
        #splash { position: fixed; inset: 0; background: var(--main); color: white; display: flex; justify-content: center; align-items: center; z-index: 5000; }
        .nav { display: flex; background: #333; overflow-x: auto; position: sticky; top: 0; }
        .tab { color: white; padding: 15px; flex: 1; text-align: center; cursor: pointer; white-space: nowrap; }
        .section { display: none; padding: 20px; }
        .active { display: block; }
        .card { background: white; padding: 15px; margin-bottom: 10px; border-radius: 8px; border-left: 5px solid var(--main); }
        .user-row { display: flex; align-items: center; padding: 10px; background: white; margin-bottom: 5px; }
        .user-row img { width: 40px; height: 40px; border-radius: 50%; margin-right: 15px; }
    </style>
</head>
<body>
    <div id="splash"><h1 id="splash-txt">CARGANDO...</h1></div>

    <div id="auth-ui" style="padding: 40px; text-align: center;">
        <h2>Acceso a Clase</h2>
        <input id="u" placeholder="Usuario"><br>
        <input id="p" type="password" placeholder="Contraseña"><br>
        <input id="c" placeholder="Código Admin"><br><br>
        <button onclick="auth('login')">Entrar</button>
        <button onclick="auth('register')">Registrarse</button>
    </div>

    <div id="app-ui" style="display:none">
        <div class="nav">
            <div class="tab" onclick="go('apuntes')">Apuntes</div>
            <div class="tab" onclick="go('fechas')">Fechas</div>
            <div class="tab" onclick="go('dudas')">Dudas</div>
            <div class="tab" onclick="go('config')">Perfil</div>
            <div id="adm-btn" class="tab" style="display:none; background:red" onclick="go('admin')">Admin</div>
        </div>

        <section id="apuntes" class="section active">
            <h2>📚 Apuntes</h2>
            <button onclick="upload('apuntes')">Subir Archivo</button>
            <div id="list-apuntes"></div>
        </section>

        <section id="fechas" class="section">
            <h2>📅 Calendario</h2>
            <input type="date" id="f-date"> <input id="f-title" placeholder="Título">
            <button onclick="postF()">Añadir</button>
            <div id="list-fechas"></div>
        </section>

        <section id="dudas" class="section">
            <h2>❓ Dudas</h2>
            <textarea id="d-txt" placeholder="Tu duda..."></textarea>
            <button onclick="upload('dudas')">Enviar con Foto</button>
            <div id="list-dudas"></div>
        </section>

        <section id="config" class="section">
            <h2>⚙️ Configuración</h2>
            <button onclick="setupPush()">🔔 Activar Notificaciones Reales</button><br><br>
            <button onclick="location.reload()" style="background:red; color:white">Cerrar Sesión</button>
        </section>

        <section id="admin" class="section">
            <h2>🛡️ Gestor de Usuarios</h2>
            <div id="list-users"></div>
        </section>
    </div>

    <script>
        let me = null;

        async function init() {
            try {
                const res = await fetch('/api/data');
                const data = await res.json();
                document.getElementById('splash-txt').innerText = data.config.splashText;
                renderPosts(data.posts);
                renderUsers(data.users);
            } catch (e) { console.error(e); }
            setTimeout(() => document.getElementById('splash').style.display = 'none', 2000);
        }

        async function auth(action) {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ username: u.value, password: p.value, code: c.value, action })
            });
            if(res.ok) {
                me = await res.json();
                document.getElementById('auth-ui').style.display='none';
                document.getElementById('app-ui').style.display='block';
                if(me.role === 'admin') document.getElementById('adm-btn').style.display='block';
            } else { alert("Error"); }
        }

        function upload(type) {
            cloudinary.openUploadWidget({ cloudName: 'dvlbsl16g', uploadPreset: 'ml_default' }, async (err, result) => {
                if (!err && result.event === 'success') {
                    await fetch('/api/posts', {
                        method: 'POST',
                        headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({ author: me.username, type, fileUrl: result.info.secure_url, content: d_txt.value })
                    });
                    location.reload();
                }
            });
        }

        function renderPosts(posts) {
            posts.forEach(p => {
                const div = document.createElement('div');
                div.className = 'card';
                div.innerHTML = '<b>' + p.author + ':</b><p>' + (p.content || '') + '</p>' + (p.fileUrl ? '<img src="'+p.fileUrl+'" style="width:100%">' : '');
                if(document.getElementById('list-' + p.type)) document.getElementById('list-' + p.type).appendChild(div);
            });
        }

        function renderUsers(users) {
            users.forEach(u => {
                const div = document.createElement('div');
                div.className = 'user-row';
                div.innerHTML = '<img src="'+(u.profilePic || 'https://via.placeholder.com/40')+'"> <span>'+u.username+' ('+u.role+')</span>';
                document.getElementById('list-users').appendChild(div);
            });
        }

        function go(id) {
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.getElementById(id).classList.add('active');
        }

        async function setupPush() {
            const reg = await navigator.serviceWorker.register('/sw.js');
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: 'BOYDkx8i4CkqIwTEM_C3zi1r2XLs6CDhCahdUPRASD8UH7V0_bqsgY5IBvbaR_pze7guyfEk89cMKLO5du56z8M'
            });
            alert("Notificaciones configuradas");
        }

        init();
    </script>
</body>
</html>
    `);
});

app.get('/sw.js', (req, res) => res.sendFile(path.join(__dirname, 'sw.js')));
app.listen(process.env.PORT || 3000, () => console.log("Puerto OK"));
