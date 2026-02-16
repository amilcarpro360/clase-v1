const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const webpush = require('web-push');
const app = express();

// --- 1. CONFIGURACIÓN CLOUDINARY (Pega tus llaves aquí cuando las tengas) ---
cloudinary.config({ 
  cloud_name: 'TU_CLOUD_NAME', 
  api_key: 'TU_API_KEY', 
  api_secret: 'TU_API_SECRET' 
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'classhub', allowed_formats: ['jpg', 'png', 'pdf', 'mp4'] },
});
const upload = multer({ storage: storage });

// --- 2. CONFIGURACIÓN NOTIFICACIONES (VAPID) ---
const vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:tu-email@gmail.com', vapidKeys.publicKey, vapidKeys.privateKey);

// --- 3. MODELOS DE DATOS ---
mongoose.connect('mongodb://localhost:27017/claseDB').then(() => console.log("MongoDB Conectado"));

const User = mongoose.model('User', {
    username: String,
    role: { type: String, default: 'user' },
    photo: { type: String, default: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png' },
    themeColor: { type: String, default: '#4A90E2' },
    pushSubscription: Object,
    bannedUntil: Date
});

const Post = mongoose.model('Post', {
    author: String,
    type: String, // 'apunte', 'duda', 'fecha'
    content: String,
    fileUrl: String,
    createdAt: { type: Date, default: Date.now }
});

let globalSplashText = "Bienvenido a ClassHub"; // Configurable por admin

// --- 4. MIDDLEWARES ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Función para regla horaria (Regla 6)
const canPostDuda = (userPosts) => {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const isWeekend = (day === 5 && hour >= 18) || day === 6 || day === 0 || (day === 1 && hour < 8);
    if (!isWeekend) return true;
    return userPosts.filter(p => p.type === 'duda' && p.createdAt > new Date().setHours(0,0,0,0)).length < 1;
};

// --- 5. RUTAS ---

// Registro y Admin Code
app.post('/register', async (req, res) => {
    const { username, code } = req.body;
    const role = (code === '2845') ? 'admin' : 'user';
    const user = await User.create({ username, role });
    res.cookie('userId', user._id).redirect('/');
});

// Publicar (Apuntes/Dudas) + Cloudinary + Notificación
app.post('/post', upload.single('archivo'), async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    if (!user || (user.bannedUntil && user.bannedUntil > new Date())) return res.send("Baneado.");

    const userPosts = await Post.find({ author: user.username });
    if (req.body.type === 'duda' && !canPostDuda(userPosts)) {
        return res.send("<script>alert('Límite de 1 duda en fin de semana'); window.location='/';</script>");
    }

    await Post.create({
        author: user.username,
        type: req.body.type,
        content: req.body.content,
        fileUrl: req.file ? req.file.path : ''
    });

    // Enviar notificación a todos
    const subs = await User.find({ pushSubscription: { $exists: true } });
    subs.forEach(s => {
        webpush.sendNotification(s.pushSubscription, JSON.stringify({ 
            title: `Nuevo en ${req.body.type}`, 
            body: `${user.username} ha publicado algo.` 
        })).catch(() => {});
    });

    res.redirect('/');
});

// Suscripción a notificaciones
app.post('/subscribe', async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    if (user) {
        user.pushSubscription = req.body;
        await user.save();
        res.status(201).json({});
    }
});

// Service Worker dinámico
app.get('/sw.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.send(`
        self.addEventListener('push', e => {
            const data = e.data.json();
            self.registration.showNotification(data.title, { body: data.body, icon: 'https://cdn-icons-png.flaticon.com/512/1154/1154047.png' });
        });
    `);
});

// --- 6. INTERFAZ HTML INTEGRADA ---
app.get('/', async (req, res) => {
    const user = req.cookies.userId ? await User.findById(req.cookies.userId) : null;
    const posts = await Post.find().sort({ createdAt: -1 });
    const allUsers = user?.role === 'admin' ? await User.find() : [];

    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>ClassHub</title>
        <style>
            :root { --main: ${user ? user.themeColor : '#4A90E2'}; }
            body { font-family: 'Segoe UI', sans-serif; margin: 0; background: #f0f2f5; }
            #splash { position: fixed; inset: 0; background: var(--main); color: white; display: flex; justify-content: center; align-items: center; z-index: 9000; transition: 1s; font-size: 24px; font-weight: bold; }
            nav { background: white; padding: 15px; display: flex; justify-content: center; gap: 15px; position: sticky; top: 0; box-shadow: 0 2px 5px rgba(0,0,0,0.1); z-index: 1000; }
            .tab-btn { border: none; background: none; padding: 10px; cursor: pointer; font-weight: bold; color: #666; }
            .tab-btn.active { color: var(--main); border-bottom: 3px solid var(--main); }
            .container { max-width: 600px; margin: 20px auto; padding: 0 10px; }
            .card { background: white; border-radius: 12px; padding: 15px; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
            .user-item { display: flex; align-items: center; gap: 15px; padding: 10px; border-bottom: 1px solid #eee; }
            .user-item img { width: 50px; height: 50px; border-radius: 50%; object-fit: cover; }
            .hidden { display: none; }
            input, textarea { width: 100%; padding: 10px; margin: 5px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; }
            .btn { background: var(--main); color: white; border: none; padding: 10px; border-radius: 8px; width: 100%; cursor: pointer; font-weight: bold; }
        </style>
    </head>
    <body>
        ${!user ? `
            <div class="container" style="margin-top:100px; text-align:center;">
                <div class="card">
                    <h2>Bienvenido</h2>
                    <form action="/register" method="POST">
                        <input name="username" placeholder="Tu Nombre" required>
                        <input name="code" placeholder="Código Admin (opcional)">
                        <button class="btn">Entrar</button>
                    </form>
                </div>
            </div>
        ` : `
            <div id="splash">${globalSplashText}</div>
            <nav>
                <button class="tab-btn active" onclick="showTab('apuntes')">Apuntes</button>
                <button class="tab-btn" onclick="showTab('fechas')">Fechas</button>
                <button class="tab-btn" onclick="showTab('dudas')">Dudas</button>
                <button class="tab-btn" onclick="showTab('config')">Config</button>
                ${user.role === 'admin' ? '<button class="tab-btn" onclick="showTab(\'admin\')">👤 Gestión</button>' : ''}
            </nav>

            <div class="container">
                <section id="apuntes" class="tab-content">
                    <form class="card" action="/post" method="POST" enctype="multipart/form-data">
                        <input type="hidden" name="type" value="apunte">
                        <textarea name="content" placeholder="Escribe algo..."></textarea>
                        <input type="file" name="archivo">
                        <button class="btn">Subir Apunte</button>
                    </form>
                    ${posts.filter(p => p.type === 'apunte').map(p => `<div class="card"><b>${p.author}</b><p>${p.content}</p>${p.fileUrl ? `<img src="${p.fileUrl}" style="width:100%; border-radius:8px;">` : ''}</div>`).join('')}
                </section>

                <section id="admin" class="tab-content hidden">
                    <div class="card">
                        <h3>Gestión de Usuarios</h3>
                        ${allUsers.map(u => `
                            <div class="user-item">
                                <img src="${u.photo}">
                                <div style="flex:1"><b>${u.username}</b><br><small>${u.role}</small></div>
                                <button onclick="alert('Baneado')" style="color:red">Ban</button>
                            </div>
                        `).join('')}
                    </div>
                </section>
            </div>

            <script>
                function showTab(id) {
                    document.querySelectorAll('.tab-content').forEach(s => s.classList.add('hidden'));
                    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                    document.getElementById(id).classList.remove('hidden');
                    event.currentTarget.classList.add('active');
                }

                window.onload = async () => {
                    setTimeout(() => document.getElementById('splash').style.display = 'none', 1500);
                    
                    // Registro de notificaciones
                    if ('serviceWorker' in navigator) {
                        const sw = await navigator.serviceWorker.register('/sw.js');
                        const sub = await sw.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: '${vapidKeys.publicKey}'
                        });
                        await fetch('/subscribe', { method: 'POST', body: JSON.stringify(sub), headers: {'content-type': 'application/json'} });
                    }
                }
            </script>
        `}
    </body>
    </html>
    `);
});

app.listen(3000, () => console.log("Servidor en http://localhost:3000"));
