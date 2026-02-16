const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const webpush = require('web-push');
const app = express();

// --- 1. CONFIGURACIÓN DE APIS (Tus llaves reales) ---
cloudinary.config({ 
  cloud_name: 'dvlbsl16g', 
  api_key: '721617469253873', 
  api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});

mongoose.connect('mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0')
  .then(() => console.log("Base de datos conectada con éxito"));

const vapidKeys = {
    publicKey: 'BNmECJg52bN_RRCUhq5AD-YUllgurBcHptGOzp7OMYra91_QsRinoicJgrg0N_RseSpcYvGokul1ht2Os4TiGbs',
    privateKey: 'Jt46xVYDT17wM3TXqZ-j3VuOw8apU5iE-RZWvLjfoFM'
};

webpush.setVapidDetails(
    'mailto:amilcarvaleromartinez33@gmail.com', // Prefijo mailto corregido
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

const storage = new CloudinaryStorage({ 
    cloudinary, 
    params: { folder: 'clase_hub', allowed_formats: ['jpg', 'png', 'pdf', 'mp4'] } 
});
const upload = multer({ storage });

// --- 2. MODELOS ---
const User = mongoose.model('User', {
    username: String,
    role: { type: String, default: 'user' },
    photo: { type: String, default: 'https://i.imgur.com/6VBx3io.png' },
    themeColor: { type: String, default: '#6366f1' },
    pushSubscription: Object
});

const Post = mongoose.model('Post', {
    author: String, authorImg: String, type: String, content: String, title: String, fileUrl: String,
    date: { type: Date, default: Date.now }
});

let globalSplashText = "¡Bienvenidos a ClassHub!"; // Configurable por Admin

// --- 3. MIDDLEWARES Y LOGICA ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Regla 6: Restricción de dudas (Viernes 18:00 a Lunes 08:00)
const checkDudaLimit = async (user) => {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const isWeekend = (day === 5 && hour >= 18) || day === 6 || day === 0 || (day === 1 && hour < 8);
    if (!isWeekend) return true;
    const startOfDay = new Date().setHours(0,0,0,0);
    const count = await Post.countDocuments({ author: user.username, type: 'duda', date: { $gte: startOfDay } });
    return count < 1;
};

// --- 4. RUTAS DEL SERVIDOR ---
app.post('/register', async (req, res) => {
    const role = req.body.code === '2845' ? 'admin' : 'user';
    const user = await User.create({ username: req.body.username, role });
    res.cookie('userId', user._id).redirect('/');
});

app.post('/post', upload.single('archivo'), async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    if (!user) return res.redirect('/');

    if (req.body.type === 'duda' && !(await checkDudaLimit(user))) {
        return res.send("<script>alert('Límite de 1 duda en fin de semana'); window.location='/';</script>");
    }

    await Post.create({
        author: user.username, authorImg: user.photo,
        type: req.body.type, content: req.body.content, title: req.body.titulo || '',
        fileUrl: req.file ? req.file.path : ''
    });

    // Enviar Notificación Push (Estilo YouTube)
    const subs = await User.find({ pushSubscription: { $exists: true } });
    subs.forEach(s => {
        webpush.sendNotification(s.pushSubscription, JSON.stringify({ 
            title: `Nuevo en ${req.body.type}`, body: `${user.username} ha publicado.` 
        })).catch(() => {});
    });
    res.redirect('/');
});

app.post('/subscribe', async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    if(user) { user.pushSubscription = req.body; await user.save(); }
    res.status(201).json({});
});

app.get('/sw.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.send(`self.addEventListener('push', e => { 
        const data = e.data.json(); 
        self.registration.showNotification(data.title, { body: data.body, icon: 'https://i.imgur.com/6VBx3io.png' }); 
    });`);
});

// --- 5. INTERFAZ HTML INTEGRADA (Las 5 pestañas) ---
app.get('/', async (req, res) => {
    const user = req.cookies.userId ? await User.findById(req.cookies.userId) : null;
    const posts = await Post.find().sort({ date: -1 });
    const users = await User.find();

    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ClassHub Pro</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
            :root { --main: ${user ? user.themeColor : '#6366f1'}; }
            body { font-family: 'Inter', sans-serif; background: #f8fafc; margin: 0; padding-bottom: 70px; }
            #splash { position: fixed; inset: 0; background: var(--main); color: white; display: flex; justify-content: center; align-items: center; z-index: 9999; transition: 0.8s; }
            nav { position: fixed; bottom: 0; width: 100%; background: white; display: flex; justify-content: space-around; padding: 12px 0; border-top: 1px solid #e2e8f0; z-index: 1000; }
            .card { background: white; margin: 12px; padding: 15px; border-radius: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
            .user-item { display: flex; align-items: center; gap: 15px; padding: 10px; border-bottom: 1px solid #f1f5f9; }
            .user-item img { width: 45px; height: 45px; border-radius: 50%; object-fit: cover; }
            .btn { background: var(--main); color: white; border: none; padding: 12px; border-radius: 12px; width: 100%; font-weight: bold; cursor: pointer; }
            .hidden { display: none; }
            .nav-item { background: none; border: none; color: #64748b; display: flex; flex-direction: column; align-items: center; font-size: 0.7rem; cursor: pointer; }
            .nav-item.active { color: var(--main); }
            input, textarea { width: 100%; padding: 10px; margin: 5px 0; border: 1px solid #e2e8f0; border-radius: 8px; box-sizing: border-box; }
        </style>
    </head>
    <body>
        ${!user ? `
            <div class="card" style="margin-top:100px; text-align:center;">
                <h1 style="color:var(--main)">ClassHub</h1>
                <form action="/register" method="POST">
                    <input name="username" placeholder="Tu Nombre" required>
                    <input name="code" placeholder="Código Admin (2845)">
                    <button class="btn">Entrar</button>
                </form>
            </div>
        ` : `
            <div id="splash"><h1>${globalSplashText}</h1></div>
            
            <div class="container">
                <section id="apuntes" class="tab-content">
                    <div class="card">
                        <form action="/post" method="POST" enctype="multipart/form-data">
                            <input type="hidden" name="type" value="apunte">
                            <textarea name="content" placeholder="Sube apuntes, enlaces o fotos..."></textarea>
                            <input type="file" name="archivo">
                            <button class="btn">Publicar en Apuntes</button>
                        </form>
                    </div>
                    ${posts.filter(p => p.type === 'apunte').map(p => `
                        <div class="card">
                            <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                                <img src="${p.authorImg}" style="width:30px; height:30px; border-radius:50%;">
                                <strong>${p.author}</strong>
                            </div>
                            <p>${p.content}</p>
                            ${p.fileUrl ? `<img src="${p.fileUrl}" style="width:100%; border-radius:12px;">` : ''}
                        </div>
                    `).join('')}
                </section>

                <section id="fechas" class="tab-content hidden">
                    <div class="card">
                        <h3>📅 Nuevo Evento / Examen</h3>
                        <form action="/post" method="POST">
                            <input type="hidden" name="type" value="fecha">
                            <input type="date" name="content" required>
                            <input type="text" name="titulo" placeholder="Título del evento" required>
                            <button class="btn">Guardar Fecha</button>
                        </form>
                    </div>
                    ${posts.filter(p => p.type === 'fecha').map(p => `
                        <div class="card" style="border-left: 5px solid var(--main);">
                            <strong>${p.content}</strong> - ${p.title}
                        </div>
                    `).join('')}
                </section>

                <section id="dudas" class="tab-content hidden">
                    <div class="card">
                        <form action="/post" method="POST">
                            <input type="hidden" name="type" value="duda">
                            <textarea name="content" placeholder="¿Tienes alguna duda?"></textarea>
                            <button class="btn">Lanzar Pregunta</button>
                        </form>
                    </div>
                    ${posts.filter(p => p.type === 'duda').map(p => `<div class="card"><b>${p.author}:</b> ${p.content}</div>`).join('')}
                </section>

                <section id="admin" class="tab-content hidden">
                    <div class="card">
                        <h3>👥 Gestión de Usuarios</h3>
                        ${users.map(u => `
                            <div class="user-item">
                                <img src="${u.photo}">
                                <div style="flex:1"><b>${u.username}</b> <br> <small>${u.role}</small></div>
                                <button style="color:red; background:none; border:none; cursor:pointer;"><i class="fas fa-trash"></i></button>
                            </div>
                        `).join('')}
                    </div>
                </section>
            </div>

            <nav>
                <button class="nav-item active" onclick="tab('apuntes', this)"><i class="fas fa-book"></i><span>Apuntes</span></button>
                <button class="nav-item" onclick="tab('fechas', this)"><i class="fas fa-calendar"></i><span>Fechas</span></button>
                <button class="nav-item" onclick="tab('dudas', this)"><i class="fas fa-question"></i><span>Dudas</span></button>
                <button class="nav-item" onclick="tab('config', this)"><i class="fas fa-cog"></i><span>Config</span></button>
                ${user.role === 'admin' ? '<button class="nav-item" onclick="tab(\'admin\', this)"><i class="fas fa-user-shield"></i><span>Admin</span></button>' : ''}
            </nav>

            <script>
                function tab(id, btn) {
                    document.querySelectorAll('.tab-content').forEach(s => s.classList.add('hidden'));
                    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
                    document.getElementById(id).classList.remove('hidden');
                    btn.classList.add('active');
                }
                window.onload = async () => {
                    setTimeout(() => document.getElementById('splash').style.display = 'none', 1500);
                    if ('serviceWorker' in navigator) {
                        const sw = await navigator.serviceWorker.register('/sw.js');
                        const sub = await sw.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: urlBase64ToUint8Array('${vapidKeys.publicKey}')
                        });
                        fetch('/subscribe', { method: 'POST', body: JSON.stringify(sub), headers: {'content-type':'application/json'} });
                    }
                }
                function urlBase64ToUint8Array(base64String) {
                    const padding = '='.repeat((4 - base64String.length % 4) % 4);
                    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
                    const rawData = window.atob(base64);
                    const outputArray = new Uint8Array(rawData.length);
                    for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
                    return outputArray;
                }
            </script>
        `}
    </body>
    </html>
    `);
});

app.listen(process.env.PORT || 3000);
