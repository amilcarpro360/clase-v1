const express = require('express');
const mongoose = require('mongoose');
const session = require('cookie-session');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const webpush = require('web-push');

const app = express();

// --- 1. CONFIGURACIÓN DE APIS ---
const MONGO_URI = "mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0"; // [cite: 1]
cloudinary.config({ 
  cloud_name: 'dvlbsl16g', api_key: '721617469253873', api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});

// Configuración de Notificaciones (VAPID) 
const vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:ejemplo@web.com', vapidKeys.publicKey, vapidKeys.privateKey);

app.use(express.json());
app.use(session({ name: 'session', keys: ['2845-secret'], maxAge: 24 * 60 * 60 * 1000 }));

// --- 2. MODELOS ---
const User = mongoose.model('User', new mongoose.Schema({
    username: String,
    password: { type: String, required: true },
    role: { type: String, default: 'user' }, // admin si usa 2845 
    profilePic: { type: String, default: 'https://via.placeholder.com/150' },
    isBanned: { type: Boolean, default: false }, // 
    banUntil: Date,
    config: { color: { type: String, default: '#2c3e50' }, splashText: { type: String, default: 'Bienvenido' } }
}));

const Post = mongoose.model('Post', new mongoose.Schema({
    type: String, // apuntes, dudas, fechas [cite: 1]
    title: String,
    content: String,
    fileUrl: String,
    author: String,
    comments: [{ author: String, text: String, img: String }], // [cite: 1]
    createdAt: { type: Date, default: Date.now }
}));

// --- 3. LÓGICA DE RESTRICCIÓN (Punto 6) ---
const checkWeekend = () => {
    const now = new Date();
    const day = now.getDay(); 
    const hour = now.getHours();
    // Viernes 6pm (18h) hasta Lunes 8am 
    return (day === 5 && hour >= 18) || day === 6 || day === 0 || (day === 1 && hour < 8);
};

// --- 4. RUTAS API ---

// Registro: Admin con código 2845 
app.post('/api/auth/register', async (req, res) => {
    const { username, password, code } = req.body;
    const role = (code === "2845") ? 'admin' : 'user';
    const user = new User({ username, password, role });
    await user.save();
    res.json({ success: true });
});

// Gestión de Dudas con Restricción [cite: 1, 3]
app.post('/api/dudas', async (req, res) => {
    if (checkWeekend()) {
        const count = await Post.countDocuments({ type: 'duda', author: req.session.user, createdAt: { $gte: new Date().setHours(0,0,0,0) } });
        if (count >= 1) return res.status(403).send("Límite de fin de semana alcanzado.");
    }
    const post = new Post({ ...req.body, type: 'duda' });
    await post.save();
    res.json(post);
});

// --- 5. FRONTEND INTEGRADO ---
app.get('*', async (req, res) => {
    const config = await User.findOne({ role: 'admin' }); // Para el splash dinámico 
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Plataforma Escolar</title>
    <style>
        :root { --main-bg: #f0f2f5; --user-color: #2c3e50; }
        body { font-family: sans-serif; margin: 0; background: var(--main-bg); }
        nav { background: var(--user-color); color: white; display: flex; justify-content: space-around; padding: 15px; position: sticky; top: 0; }
        .tab { display: none; padding: 20px; }
        .active { display: block; }
        /* Gestor: Foto a la izquierda  */
        .user-row { display: flex; align-items: center; background: white; padding: 10px; margin: 5px 0; border-radius: 8px; }
        .user-row img { width: 50px; height: 50px; border-radius: 50%; margin-right: 15px; border: 2px solid var(--user-color); }
        #splash { position: fixed; top: 0; width: 100%; height: 100%; background: white; display: flex; justify-content: center; align-items: center; z-index: 1000; }
    </style>
</head>
<body>
    <div id="splash"><h1>${config?.config.splashText || 'Cargando...'}</h1></div> <nav>
        <div onclick="show('apuntes')">Apuntes</div>
        <div onclick="show('fechas')">Fechas</div>
        <div onclick="show('dudas')">Dudas</div>
        <div onclick="show('config')">Configuración</div>
        <div id="admin-nav" onclick="show('admin')">Gestor</div>
    </nav>

    <div id="apuntes" class="tab active">
        <h2>Subir Apuntes (PDF/Videos/Links)</h2> <input type="file" id="fileInp">
        <button onclick="upload()">Publicar</button>
    </div>

    <div id="admin" class="tab">
        <h2>Gestor de Usuarios</h2> <div id="userList">
            </div>
    </div>

    <script>
        function show(id) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.getElementById(id).classList.add('active');
        }

        // Splash screen automático 
        setTimeout(() => document.getElementById('splash').style.display = 'none', 2000);

        // Notificaciones reales 
        if ('Notification' in window) {
            Notification.requestPermission().then(res => {
                if(res === 'granted') console.log('Notificaciones activas tipo YouTube');
            });
        }
    </script>
</body>
</html>
    `);
});

mongoose.connect(MONGO_URI).then(() => {
    app.listen(process.env.PORT || 3000, () => console.log("Servidor listo"));
});
