const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs'); // Asegúrate de haber hecho el npm install
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const webpush = require('web-push');
const app = express();

// --- CONFIGURACIÓN DE APIS ---
cloudinary.config({ cloud_name: 'dvlbsl16g', api_key: '721617469253873', api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' });

mongoose.connect('mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0')
  .then(() => console.log("MongoDB Conectado"));

// FIX VAPID: Esto elimina el error "Vapid subject is not a valid URL"
webpush.setVapidDetails(
    'mailto:amilcarvaleromartinez33@gmail.com', 
    'BNmECJg52bN_RRCUhq5AD-YUllgurBcHptGOzp7OMYra91_QsRinoicJgrg0N_RseSpcYvGokul1ht2Os4TiGbs', 
    'Jt46xVYDT17wM3TXqZ-j3VuOw8apU5iE-RZWvLjfoFM'
);

const storage = new CloudinaryStorage({ cloudinary, params: { folder: 'clase_hub' } });
const upload = multer({ storage });

// --- MODELOS ---
const User = mongoose.model('User', {
    username: { type: String, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' }, 
    themeColor: { type: String, default: '#6366f1' }
});

const Post = mongoose.model('Post', {
    author: String, authorId: String, type: String, content: String, title: String, fileUrl: String, date: { type: Date, default: Date.now }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- RUTAS DE LOGIN Y REGISTRO ---
app.post('/auth/register', async (req, res) => {
    const { username, password, pin } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const role = pin === '2845' ? 'admin' : 'user';
    try {
        const u = await User.create({ username, password: hashed, role });
        res.cookie('userId', u._id).redirect('/');
    } catch { res.send("<script>alert('Usuario ya existe'); window.location='/';</script>"); }
});

app.post('/auth/login', async (req, res) => {
    const u = await User.findOne({ username: req.body.username });
    if (u && await bcrypt.compare(req.body.password, u.password)) {
        res.cookie('userId', u._id).redirect('/');
    } else { res.send("<script>alert('Datos incorrectos'); window.location='/';</script>"); }
});

app.get('/logout', (req, res) => res.clearCookie('userId').redirect('/'));

// --- RUTA DE PUBLICACIÓN (DUDAS, FECHAS, APUNTES) ---
app.post('/post', upload.single('archivo'), async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    if(!user) return res.redirect('/');
    await Post.create({
        author: user.username, authorId: user._id, 
        type: req.body.type, content: req.body.content, 
        title: req.body.title || '', fileUrl: req.file ? req.file.path : ''
    });
    res.redirect('/');
});

// --- INTERFAZ ---
app.get('/', async (req, res) => {
    const user = req.cookies.userId ? await User.findById(req.cookies.userId) : null;
    const posts = await Post.find().sort({ date: -1 });

    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ClassHub</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
            :root { --main: ${user ? user.themeColor : '#6366f1'}; }
            body { font-family: sans-serif; background: #f0f2f5; margin: 0; padding-bottom: 80px; }
            .card { background: white; margin: 10px; padding: 15px; border-radius: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            nav { position: fixed; bottom: 0; width: 100%; background: white; display: flex; justify-content: space-around; padding: 10px 0; border-top: 1px solid #ddd; }
            .btn { background: var(--main); color: white; border: none; padding: 10px; border-radius: 10px; width: 100%; font-weight: bold; cursor: pointer; }
            .hidden { display: none; }
            input, textarea { width: 100%; padding: 10px; margin: 5px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; }
        </style>
    </head>
    <body>
        ${!user ? `
            <div class="card" style="margin-top:50px; text-align:center;">
                <h2>ClassHub</h2>
                <div id="btns">
                    <button class="btn" onclick="auth('login')">Entrar</button>
                    <button class="btn" onclick="auth('reg')" style="background:#888; margin-top:10px;">Registrarse</button>
                </div>
                <form id="f-login" action="/auth/login" method="POST" class="hidden">
                    <input name="username" placeholder="Usuario" required>
                    <input name="password" type="password" placeholder="Contraseña" required>
                    <button class="btn">Entrar</button>
                </form>
                <form id="f-reg" action="/auth/register" method="POST" class="hidden">
                    <input name="username" placeholder="Tu Nombre" required>
                    <input name="password" type="password" placeholder="Contraseña" required>
                    <input name="pin" type="password" placeholder="PIN Admin (Opcional)">
                    <button class="btn">Crear Cuenta</button>
                </form>
            </div>
            <script>function auth(m){ document.getElementById('btns').classList.add('hidden'); document.getElementById('f-login').classList.toggle('hidden', m!=='login'); document.getElementById('f-reg').classList.toggle('hidden', m!=='reg'); }</script>
        ` : `
            <nav>
                <button onclick="tab('apuntes')">Apuntes</button>
                <button onclick="tab('fechas')">Fechas</button>
                <button onclick="tab('dudas')">Dudas</button>
                <button onclick="location.href='/logout'">Salir</button>
            </nav>
            <div id="apuntes" class="tab-content">
                <div class="card">
                    <form action="/post" method="POST" enctype="multipart/form-data">
                        <input type="hidden" name="type" value="apunte">
                        <textarea name="content" placeholder="Comparte algo..."></textarea>
                        <input type="file" name="archivo"><button class="btn">Subir</button>
                    </form>
                </div>
                ${posts.filter(p => p.type === 'apunte').map(p => `<div class="card"><b>${p.author}</b><p>${p.content}</p></div>`).join('')}
            </div>
            <div id="fechas" class="tab-content hidden">
                <div class="card">
                    <form action="/post" method="POST">
                        <input type="hidden" name="type" value="fecha">
                        <input type="date" name="content" required>
                        <input type="text" name="title" placeholder="Evento" required>
                        <button class="btn">Guardar Fecha</button>
                    </form>
                </div>
                ${posts.filter(p => p.type === 'fecha').map(p => `<div class="card"><b>${p.content}</b>: ${p.title}</div>`).join('')}
            </div>
            <script>function tab(id){ document.querySelectorAll('.tab-content').forEach(s=>s.classList.add('hidden')); document.getElementById(id).classList.remove('hidden'); }</script>
        `}
    </body>
    </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor en línea"));
