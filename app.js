const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs'); // Para encriptar contraseñas
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const webpush = require('web-push');
const app = express();

// --- 1. CONFIGURACIÓN ---
cloudinary.config({ cloud_name: 'dvlbsl16g', api_key: '721617469253873', api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' });
mongoose.connect('mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0');

const vapidKeys = {
    publicKey: 'BNmECJg52bN_RRCUhq5AD-YUllgurBcHptGOzp7OMYra91_QsRinoicJgrg0N_RseSpcYvGokul1ht2Os4TiGbs',
    privateKey: 'Jt46xVYDT17wM3TXqZ-j3VuOw8apU5iE-RZWvLjfoFM'
};
webpush.setVapidDetails('mailto:amilcarvaleromartinez33@gmail.com', vapidKeys.publicKey, vapidKeys.privateKey);

const storage = new CloudinaryStorage({ cloudinary, params: { folder: 'clase_hub' } });
const upload = multer({ storage });

// --- 2. MODELOS ---
const User = mongoose.model('User', {
    username: { type: String, unique: true },
    password: { type: String, required: true },
    role: String, 
    photo: { type: String, default: 'https://i.imgur.com/6VBx3io.png' },
    themeColor: { type: String, default: '#6366f1' }
});

const Post = mongoose.model('Post', {
    authorId: String, author: String, type: String, content: String, title: String, fileUrl: String, date: { type: Date, default: Date.now }
});

const Config = mongoose.model('Config', { splashText: { type: String, default: "¡Bienvenidos a ClassHub!" } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- 3. RUTAS DE AUTENTICACIÓN ---

// Registro
app.post('/auth/register', async (req, res) => {
    const { username, password, adminCode } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const role = adminCode === '2845' ? 'admin' : 'user'; // Tu PIN confidencial
    
    try {
        const user = await User.create({ username, password: hashedPassword, role });
        res.cookie('userId', user._id).redirect('/');
    } catch (e) { res.send("<script>alert('El usuario ya existe'); window.location='/';</script>"); }
});

// Inicio de Sesión
app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
        res.cookie('userId', user._id).redirect('/');
    } else {
        res.send("<script>alert('Datos incorrectos'); window.location='/';</script>");
    }
});

app.get('/logout', (req, res) => { res.clearCookie('userId').redirect('/'); });

// --- 4. RUTAS DE CONTENIDO (POSTS) ---

app.post('/post', upload.single('archivo'), async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    if (!user) return res.redirect('/');
    
    await Post.create({
        authorId: user._id, author: user.username, 
        type: req.body.type, content: req.body.content, 
        title: req.body.title || '', fileUrl: req.file ? req.file.path : ''
    });
    res.redirect('/');
});

app.post('/delete-post/:id', async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    const post = await Post.findById(req.params.id);
    if (user && post && (user.role === 'admin' || post.authorId === user._id.toString())) {
        await Post.findByIdAndDelete(req.params.id);
    }
    res.redirect('/');
});

// --- 5. INTERFAZ ---
app.get('/', async (req, res) => {
    const user = req.cookies.userId ? await User.findById(req.cookies.userId) : null;
    const posts = await Post.find().sort({ date: -1 });
    const users = await User.find();
    const config = await Config.findOne() || { splashText: "¡Bienvenidos!" };

    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ClassHub</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
            :root { --main: ${user ? user.themeColor : '#6366f1'}; }
            body { font-family: sans-serif; background: #f8fafc; margin: 0; padding-bottom: 80px; color: #333; }
            #splash { position: fixed; inset: 0; background: var(--main); color: white; display: flex; justify-content: center; align-items: center; z-index: 9999; }
            .card { background: white; margin: 12px; padding: 15px; border-radius: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); position: relative; }
            nav { position: fixed; bottom: 0; width: 100%; background: white; display: flex; justify-content: space-around; padding: 12px 0; border-top: 1px solid #eee; z-index: 1000; }
            .btn { background: var(--main); color: white; border: none; padding: 12px; border-radius: 12px; width: 100%; font-weight: bold; cursor: pointer; margin-top:10px; }
            .hidden { display: none; }
            .nav-item { background: none; border: none; color: #64748b; font-size: 0.7rem; display: flex; flex-direction: column; align-items: center; }
            .nav-item.active { color: var(--main); }
            input, textarea { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #ddd; border-radius: 10px; box-sizing: border-box; }
        </style>
    </head>
    <body>
        ${!user ? `
            <div id="auth-container" class="card" style="margin-top:80px; text-align:center;">
                <h1 style="color:var(--main)">ClassHub</h1>
                <div id="btn-group" style="display:flex; gap:10px;">
                    <button class="btn" onclick="showAuth('login')">Iniciar Sesión</button>
                    <button class="btn" onclick="showAuth('register')" style="background:#64748b">Registrarse</button>
                </div>

                <form id="login-form" action="/auth/login" method="POST" class="hidden">
                    <input name="username" placeholder="Usuario" required>
                    <input name="password" type="password" placeholder="Contraseña" required>
                    <button class="btn">Entrar</button>
                    <p onclick="showAuth('main')" style="cursor:pointer; font-size:0.8rem; color:grey;">Volver</p>
                </form>

                <form id="register-form" action="/auth/register" method="POST" class="hidden">
                    <input name="username" placeholder="Elige Usuario" required>
                    <input name="password" type="password" placeholder="Contraseña" required>
                    <input name="adminCode" type="password" placeholder="PIN Admin (opcional)">
                    <button class="btn">Crear Cuenta</button>
                    <p onclick="showAuth('main')" style="cursor:pointer; font-size:0.8rem; color:grey;">Volver</p>
                </form>
            </div>
            <script>
                function showAuth(mode) {
                    document.getElementById('btn-group').classList.toggle('hidden', mode !== 'main');
                    document.getElementById('login-form').classList.toggle('hidden', mode !== 'login');
                    document.getElementById('register-form').classList.toggle('hidden', mode !== 'register');
                }
            </script>
        ` : `
            <div id="splash"><h1>${config.splashText}</h1></div>
            
            <div class="container">
                <section id="apuntes" class="tab-content">
                    <div class="card">
                        <form action="/post" method="POST" enctype="multipart/form-data">
                            <input type="hidden" name="type" value="apunte">
                            <textarea name="content" placeholder="Publicar apuntes..."></textarea>
                            <input type="file" name="archivo"><button class="btn">Compartir</button>
                        </form>
                    </div>
                    ${posts.filter(p => p.type === 'apunte').map(p => `
                        <div class="card">
                            <strong>${p.author}</strong><p>${p.content}</p>
                            ${p.fileUrl ? `<img src="${p.fileUrl}" style="width:100%; border-radius:12px;">` : ''}
                        </div>
                    `).join('')}
                </section>

                <section id="fechas" class="tab-content hidden">
                    <div class="card">
                        <h3>📅 Calendario de Clase</h3>
                        <form action="/post" method="POST">
                            <input type="hidden" name="type" value="fecha">
                            <input type="date" name="content" required>
                            <input type="text" name="title" placeholder="Título del Examen/Entrega" required>
                            <button class="btn">Añadir Fecha</button>
                        </form>
                    </div>
                    ${posts.filter(p => p.type === 'fecha').map(p => `
                        <div class="card" style="border-left:5px solid var(--main)">
                            <b>${p.content}</b> - ${p.title}
                        </div>
                    `).join('')}
                </section>

                <section id="dudas" class="tab-content hidden">
                    <div class="card">
                        <form action="/post" method="POST">
                            <input type="hidden" name="type" value="duda">
                            <textarea name="content" placeholder="¿Qué no entiendes?"></textarea>
                            <button class="btn">Lanzar Duda</button>
                        </form>
                    </div>
                    ${posts.filter(p => p.type === 'duda').map(p => `
                        <div class="card"><b>${p.author}:</b> ${p.content}</div>
                    `).join('')}
                </section>

                <section id="config" class="tab-content hidden">
                    <div class="card">
                        <button class="btn" onclick="location.href='/logout'" style="background:#64748b">Cerrar Sesión</button>
                    </div>
                </section>
            </div>

            <nav>
                <button class="nav-item active" onclick="tab('apuntes', this)"><i class="fas fa-book"></i><span>Apuntes</span></button>
                <button class="nav-item" onclick="tab('fechas', this)"><i class="fas fa-calendar"></i><span>Fechas</span></button>
                <button class="nav-item" onclick="tab('dudas', this)"><i class="fas fa-question"></i><span>Dudas</span></button>
                <button class="nav-item" onclick="tab('config', this)"><i class="fas fa-cog"></i><span>Config</span></button>
                ${user.role === 'admin' ? `<button class="nav-item" onclick="tab('admin', this)"><i class="fas fa-user-shield"></i><span>Admin</span></button>` : ''}
            </nav>

            <script>
                function tab(id, btn) {
                    document.querySelectorAll('.tab-content').forEach(s => s.classList.add('hidden'));
                    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
                    document.getElementById(id).classList.remove('hidden');
                    btn.classList.add('active');
                }
                window.onload = () => setTimeout(() => document.getElementById('splash').style.display = 'none', 1200);
            </script>
        `}
    </body>
    </html>
    `);
});

app.listen(process.env.PORT || 3000);
