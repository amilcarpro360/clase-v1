const express = require('express');
const mongoose = require('mongoose');
const webpush = require('web-push');
const cloudinary = require('cloudinary').v2;
const path = require('path');

const app = express();
app.use(express.json());

// --- TUS CREDENCIALES ---
cloudinary.config({ 
  cloud_name: 'dvlbsl16g', 
  api_key: '721617469253873', 
  api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});

webpush.setVapidDetails(
    'mailto:amilcarvaleromartinez33@gmail.com',
    'BOYDkx8i4CkqIwTEM_C3zi1r2XLs6CDhCahdUPRASD8UH7V0_bqsgY5IBvbaR_pze7guyfEk89cMKLO5du56z8M',
    '4W4KYN5QhFWFV0I0XMgj0XgQv86JPjJLU9G4_nkxueQ'
);

mongoose.connect('mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0');

// --- ESQUEMAS ---
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String },
    role: { type: String, default: 'user' },
    profilePic: { type: String, default: 'https://via.placeholder.com/150' },
    themeColor: { type: String, default: '#3498db' },
    isBanned: { type: Boolean, default: false },
    pushSubscription: Object
}));

const Post = mongoose.model('Post', new mongoose.Schema({
    author: String,
    content: String,
    type: String, // apuntes, dudas, fechas
    fileUrl: String,
    createdAt: { type: Date, default: Date.now }
}));

const Config = mongoose.model('Config', new mongoose.Schema({
    splashText: { type: String, default: 'BIENVENIDO A LA CLASE' }
}));

// --- LÓGICA DE FIN DE SEMANA (Punto 6) ---
const checkWeekend = async (username) => {
    const now = new Date();
    const day = now.getDay(); // 0:Dom, 5:Vie, 1:Lun
    const hour = now.getHours();
    const isWeekend = (day === 5 && hour >= 18) || (day === 6) || (day === 0) || (day === 1 && hour < 8);
    
    if (isWeekend) {
        const count = await Post.countDocuments({ author: username, type: 'dudas', createdAt: { $gte: new Date(Date.now() - 48*60*60*1000) } });
        return count >= 1;
    }
    return false;
};

// --- RUTAS API ---
app.post('/api/auth', async (req, res) => {
    const { username, password, code, action } = req.body;
    if (action === 'register') {
        const role = (code === '2845') ? 'admin' : 'user'; // Código Admin 2845
        const user = new User({ username, password, role });
        await user.save();
        res.json(user);
    } else {
        const user = await User.findOne({ username, password });
        if (!user || user.isBanned) return res.status(401).send("Error de acceso o baneado");
        res.json(user);
    }
});

app.post('/api/posts', async (req, res) => {
    if (req.body.type === 'dudas' && await checkWeekend(req.body.author)) {
        return res.status(403).send("Límite de fin de semana: solo 1 duda");
    }
    const post = new Post(req.body);
    await post.save();
    res.json(post);
});

app.post('/api/subscribe', async (req, res) => {
    await User.findOneAndUpdate({ username: req.body.username }, { pushSubscription: req.body.sub });
    res.sendStatus(201);
});

// --- INTERFAZ (HTML/CSS/JS) ---
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
        body { font-family: sans-serif; margin: 0; background: #eee; }
        #splash { position: fixed; inset: 0; background: var(--main); color: white; display: flex; justify-content: center; align-items: center; z-index: 3000; transition: 0.5s; }
        .nav { display: flex; background: #222; position: sticky; top: 0; z-index: 100; }
        .tab { color: white; padding: 15px; flex: 1; text-align: center; cursor: pointer; font-size: 12px; }
        .section { display: none; padding: 20px; }
        .active { display: block; }
        .card { background: white; padding: 15px; margin-bottom: 10px; border-radius: 8px; position: relative; }
        .user-item { display: flex; align-items: center; background: white; padding: 10px; margin: 5px 0; }
        .user-item img { width: 40px; height: 40px; border-radius: 50%; margin-right: 15px; }
    </style>
</head>
<body>
    <div id="splash"><h1>CARGANDO...</h1></div>

    <div id="login-ui" style="padding: 50px; text-align: center;">
        <h2>Mi Clase</h2>
        <input id="u" placeholder="Usuario"><br>
        <input id="p" type="password" placeholder="Contraseña"><br>
        <input id="c" placeholder="Código Admin (opcional)"><br>
        <button onclick="auth('login')">Entrar</button>
        <button onclick="auth('register')">Registrarse</button>
    </div>

    <div id="main-ui" style="display:none">
        <div class="nav">
            <div class="tab" onclick="show('apuntes')">📚 Apuntes</div>
            <div class="tab" onclick="show('fechas')">📅 Fechas</div>
            <div class="tab" onclick="show('dudas')">❓ Dudas</div>
            <div class="tab" onclick="show('config')">⚙️ Perfil</div>
            <div id="adm-tab" class="tab" style="display:none; background:red" onclick="show('admin')">🛡️ Admin</div>
        </div>

        <section id="apuntes" class="section active">
            <h2>Apuntes</h2>
            <button onclick="subir('apuntes')">Subir Material</button>
            <div id="list-apuntes"></div>
        </section>

        <section id="fechas" class="section">
            <h2>Fechas</h2>
            <input type="date" id="f-date"> <input id="f-title" placeholder="Evento">
            <button onclick="postFecha()">Añadir</button>
            <div id="list-fechas"></div>
        </section>

        <section id="dudas" class="section">
            <h2>Dudas</h2>
            <textarea id="d-txt" placeholder="Tu pregunta..."></textarea>
            <button onclick="subir('dudas')">Enviar con Imagen</button>
            <div id="list-dudas"></div>
        </section>

        <section id="config" class="section">
            <h2>Configuración</h2>
            <button onclick="setupPush()">🔔 Activar Notificaciones</button>
            <input type="color" onchange="document.documentElement.style.setProperty('--main', this.value)">
            <button onclick="location.reload()">Cerrar Sesión</button>
        </section>

        <section id="admin" class="section">
            <h2>Gestor de Usuarios</h2>
            <div id="list-users"></div>
        </section>
    </div>

    <script>
        let me = null;

        async function auth(action) {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ username: u.value, password: p.value, code: c.value, action })
            });
            if (res.ok) {
                me = await res.json();
                document.getElementById('login-ui').style.display = 'none';
                document.getElementById('main-ui').style.display = 'block';
                if(me.role === 'admin') document.getElementById('adm-tab').style.display = 'block';
                document.documentElement.style.setProperty('--main', me.themeColor);
                init();
            }
        }

        function subir(type) {
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

        async function setupPush() {
            const reg = await navigator.serviceWorker.register('/sw.js');
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: 'BOYDkx8i4CkqIwTEM_C3zi1r2XLs6CDhCahdUPRASD8UH7V0_bqsgY5IBvbaR_pze7guyfEk89cMKLO5du56z8M'
            });
            await fetch('/api/subscribe', { method:'POST', body: JSON.stringify({ username: me.username, sub }), headers:{'Content-Type':'application/json'} });
            alert("Notis activas");
        }

        function show(id) {
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.getElementById(id).classList.add('active');
        }

        function init() {
            setTimeout(() => splash.style.display='none', 2000);
        }
    </script>
</body>
</html>
    `);
});

app.get('/sw.js', (req, res) => res.sendFile(path.join(__dirname, 'sw.js')));
app.listen(process.env.PORT || 3000);
