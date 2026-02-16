const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const webpush = require('web-push');
const app = express();

// 1. CONFIGURACIÓN (Usa variables de entorno en Render para seguridad)
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0'; // Tu link de MongoDB
cloudinary.config({ 
  cloud_name: process.env.CLOUD_NAME || 'dvlbsl16g', 
  api_key: process.env.CLOUD_KEY || '721617469253873', 
  api_secret: process.env.CLOUD_SECRET || 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});

// Configuración de Notificaciones (Genera tus llaves una vez y ponlas fijas)
const vapidKeys = {
    publicKey: 'BNmECJg52bN_RRCUhq5AD-YUllgurBcHptGOzp7OMYra91_QsRinoicJgrg0N_RseSpcYvGokul1ht2Os4TiGbs', 
    privateKey: 'Jt46xVYDT17wM3TXqZ-j3VuOw8apU5iE-RZWvLjfoFM'
};
// Si no tienes llaves, el servidor las genera, pero en Render se perderían. 
// Es mejor usar webpush.generateVAPIDKeys() una vez y copiar los strings aquí.
webpush.setVapidDetails('amilcarvaleromartinez33@gmail.com', vapidKeys.publicKey, vapidKeys.privateKey);

const storage = new CloudinaryStorage({ cloudinary, params: { folder: 'classhub_render' } });
const upload = multer({ storage });

// 2. MODELOS
mongoose.connect(MONGO_URI).then(() => console.log("Conectado a la nube"));

const User = mongoose.model('User', {
    username: String,
    role: { type: String, default: 'user' },
    photo: { type: String, default: 'https://i.imgur.com/6VBx3io.png' },
    themeColor: { type: String, default: '#6366f1' },
    pushSubscription: Object
});

const Post = mongoose.model('Post', {
    author: String, type: String, content: String, fileUrl: String, date: { type: Date, default: Date.now }
});

let splashMsg = "Cargando ClassHub...";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 3. RUTAS
app.post('/subscribe', async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    if(user) { user.pushSubscription = req.body; await user.save(); }
    res.status(201).json({});
});

app.post('/register', async (req, res) => {
    const role = req.body.code === '2845' ? 'admin' : 'user';
    const user = await User.create({ username: req.body.username, role });
    res.cookie('userId', user._id).redirect('/');
});

app.post('/post', upload.single('archivo'), async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    if(!user) return res.redirect('/');
    
    await Post.create({
        author: user.username,
        type: req.body.type,
        content: req.body.content,
        fileUrl: req.file ? req.file.path : ''
    });

    // Enviar notis a todos
    const subs = await User.find({ pushSubscription: { $exists: true } });
    subs.forEach(s => {
        webpush.sendNotification(s.pushSubscription, JSON.stringify({ 
            title: "¡Nueva publicación!", 
            body: `${user.username} ha subido contenido.` 
        })).catch(e => console.log("Error de noti"));
    });

    res.redirect('/');
});

// Service Worker para Render
app.get('/sw.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.send(`
        self.addEventListener('push', e => {
            const data = e.data.json();
            self.registration.showNotification(data.title, {
                body: data.body,
                icon: 'https://i.imgur.com/6VBx3io.png'
            });
        });
    `);
});

// 4. DISEÑO Y HTML
app.get('/', async (req, res) => {
    const user = req.cookies.userId ? await User.findById(req.cookies.userId) : null;
    const posts = await Post.find().sort({ date: -1 });
    const users = await User.find();

    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ClassHub</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
            :root { --main: ${user ? user.themeColor : '#6366f1'}; }
            body { font-family: sans-serif; background: #f0f2f5; margin: 0; padding-bottom: 70px; }
            #splash { position: fixed; inset: 0; background: var(--main); color: white; display: flex; justify-content: center; align-items: center; z-index: 9999; transition: 0.8s; }
            nav { position: fixed; bottom: 0; width: 100%; background: white; display: flex; justify-content: space-around; padding: 10px 0; border-top: 1px solid #ddd; }
            .card { background: white; margin: 10px; padding: 15px; border-radius: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            .btn { background: var(--main); color: white; border: none; padding: 10px; width: 100%; border-radius: 10px; cursor: pointer; }
            .hidden { display: none; }
            .nav-btn { background: none; border: none; color: #666; font-size: 0.8rem; cursor: pointer; }
            .nav-btn.active { color: var(--main); }
        </style>
    </head>
    <body>
    ${!user ? `
        <div class="card" style="margin-top:50px; text-align:center;">
            <h2>Bienvenido a Clase</h2>
            <form action="/register" method="POST">
                <input name="username" placeholder="Tu Nombre" required style="width:90%; padding:10px; margin-bottom:10px;">
                <input name="code" placeholder="Código Admin" style="width:90%; padding:10px; margin-bottom:10px;">
                <button class="btn">Entrar</button>
            </form>
        </div>
    ` : `
        <div id="splash"><h1>${splashMsg}</h1></div>
        <div class="container">
            <section id="apuntes" class="tab-content">
                <div class="card">
                    <form action="/post" method="POST" enctype="multipart/form-data">
                        <input type="hidden" name="type" value="apunte">
                        <textarea name="content" placeholder="Escribe algo..."></textarea>
                        <input type="file" name="archivo">
                        <button class="btn">Publicar</button>
                    </form>
                </div>
                ${posts.map(p => `<div class="card"><b>${p.author}</b><p>${p.content}</p>${p.fileUrl ? `<img src="${p.fileUrl}" style="width:100%; border-radius:10px;">`:''}</div>`).join('')}
            </section>
        </div>
        <nav>
            <button class="nav-btn active" onclick="tab('apuntes')"><i class="fas fa-book"></i><br>Apuntes</button>
            <button class="nav-btn" onclick="tab('dudas')"><i class="fas fa-question"></i><br>Dudas</button>
            <button class="nav-btn" onclick="tab('config')"><i class="fas fa-cog"></i><br>Config</button>
            ${user.role === 'admin' ? '<button class="nav-btn" onclick="tab(\'admin\')"><i class="fas fa-user-shield"></i><br>Admin</button>':''}
        </nav>
        <script>
            function tab(id) {
                document.querySelectorAll('.tab-content').forEach(s => s.classList.add('hidden'));
                document.getElementById(id).classList.remove('hidden');
            }
            window.onload = () => {
                setTimeout(() => document.getElementById('splash').style.opacity = '0', 1000);
                setTimeout(() => document.getElementById('splash').style.display = 'none', 1800);
                
                // Activar Notis YouTube
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.register('/sw.js').then(sw => {
                        sw.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: urlBase64ToUint8Array('${vapidKeys.publicKey}')
                        }).then(sub => {
                            fetch('/subscribe', { method: 'POST', body: JSON.stringify(sub), headers: {'content-type':'application/json'} });
                        });
                    });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor corriendo"));
