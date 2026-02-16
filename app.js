const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs'); // <--- Asegúrate de hacer el npm install
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const webpush = require('web-push');
const app = express();

// --- CONFIGURACIÓN ---
cloudinary.config({ cloud_name: 'dvlbsl16g', api_key: '721617469253873', api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' });
mongoose.connect('mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0');

// FIX VAPID: El mailto: es lo que arregla el error de tu captura
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
    role: String, 
    themeColor: { type: String, default: '#6366f1' },
    photo: { type: String, default: 'https://i.imgur.com/6VBx3io.png' }
});

const Post = mongoose.model('Post', {
    author: String, authorId: String, type: String, content: String, title: String, fileUrl: String, date: { type: Date, default: Date.now }
});

const Config = mongoose.model('Config', { splash: { type: String, default: '¡Bienvenidos!' } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- RUTAS DE ACCESO ---
app.post('/auth/register', async (req, res) => {
    const { username, password, pin } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const role = pin === '2845' ? 'admin' : 'user'; // Tu PIN confidencial
    try {
        const u = await User.create({ username, password: hashed, role });
        res.cookie('userId', u._id).redirect('/');
    } catch { res.send("<script>alert('Usuario ya existe'); window.location='/';</script>"); }
});

app.post('/auth/login', async (req, res) => {
    const u = await User.findOne({ username: req.body.username });
    if (u && await bcrypt.compare(req.body.password, u.password)) {
        res.cookie('userId', u._id).redirect('/');
    } else { res.send("<script>alert('Error'); window.location='/';</script>"); }
});

app.get('/logout', (req, res) => res.clearCookie('userId').redirect('/'));

// --- CONTENIDO ---
app.post('/post', upload.single('archivo'), async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    if(!user) return res.redirect('/');
    await Post.create({
        author: user.username, authorId: user._id, type: req.body.type,
        content: req.body.content, title: req.body.title || '', fileUrl: req.file ? req.file.path : ''
    });
    res.redirect('/');
});

// Borrado (Petición: Eliminar cosas antiguas)
app.post('/delete/:id', async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    const post = await Post.findById(req.params.id);
    if (user && post && (user.role === 'admin' || post.authorId === user._id.toString())) {
        await Post.findByIdAndDelete(req.params.id);
    }
    res.redirect('/');
});

// --- INTERFAZ ---
app.get('/', async (req, res) => {
    const user = req.cookies.userId ? await User.findById(req.cookies.userId) : null;
    const posts = await Post.find().sort({ date: -1 });
    const conf = await Config.findOne() || { splash: 'ClassHub' };

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
            #splash { position: fixed; inset: 0; background: var(--main); color: white; display: flex; justify-content: center; align-items: center; z-index: 9999; }
            .card { background: white; margin: 10px; padding: 15px; border-radius: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); position: relative; }
            nav { position: fixed; bottom: 0; width: 100%; background: white; display: flex; justify-content: space-around; padding: 10px 0; border-top: 1px solid #ddd; }
            .btn { background: var(--main); color: white; border: none; padding: 10px; border-radius: 10px; width: 100%; font-weight: bold; margin-top: 5px; cursor: pointer; }
            .hidden { display: none; }
            .nav-item { background: none; border: none; color: #888; font-size: 0.7rem; display: flex; flex-direction: column; align-items: center; }
            .nav-item.active { color: var(--main); }
            input, textarea { width: 100%; padding: 10px; margin: 5px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; }
            .del { position: absolute; top: 10px; right: 10px; color: red; background: none; border: none; }
        </style>
    </head>
    <body>
        ${!user ? `
            <div class="card" style="margin-top:100px; text-align:center;">
                <h1>ClassHub</h1>
                <div id="btns">
                    <button class="btn" onclick="auth('login')">Entrar</button>
                    <button class="btn" onclick="auth('reg')" style="background:#888">Registrarse</button>
                </div>
                <form id="f-login" action="/auth/login" method="POST" class="hidden">
                    <input name="username" placeholder="Usuario" required>
                    <input name="password" type="password" placeholder="Contraseña" required>
                    <button class="btn">Iniciar Sesión</button>
                </form>
                <form id="f-reg" action="/auth/register" method="POST" class="hidden">
                    <input name="username" placeholder="Tu Nombre" required>
                    <input name="password" type="password" placeholder="Contraseña" required>
                    <input name="pin" type="password" placeholder="PIN Admin (Opcional)">
                    <button class="btn">Crear Cuenta</button>
                </form>
            </div>
            <script>
                function auth(m) {
                    document.getElementById('btns').classList.add('hidden');
                    document.getElementById('f-login').classList.toggle('hidden', m !== 'login');
                    document.getElementById('f-reg').classList.toggle('hidden', m !== 'reg');
                }
            </script>
        ` : `
            <div id="splash"><h1>${conf.splash}</h1></div>
            <div class="container">
                <section id="apuntes" class="tab-content">
                    <div class="card">
                        <form action="/post" method="POST" enctype="multipart/form-data">
                            <input type="hidden" name="type" value="apunte">
                            <textarea name="content" placeholder="¿Qué quieres compartir?"></textarea>
                            <input type="file" name="archivo"><button class="btn">Subir Apunte</button>
                        </form>
                    </div>
                    ${posts.filter(p => p.type === 'apunte').map(p => `
                        <div class="card">
                            ${(user.role === 'admin' || p.authorId === user._id.toString()) ? `<form action="/delete/${p._id}" method="POST"><button class="del"><i class="fas fa-trash"></i></button></form>` : ''}
                            <strong>${p.author}</strong><p>${p.content}</p>
                            ${p.fileUrl ? `<img src="${p.fileUrl}" style="width:100%; border-radius:10px;">` : ''}
                        </div>
                    `).join('')}
                </section>

                <section id="fechas" class="tab-content hidden">
                    <div class="card">
                        <h3>📅 Nueva Fecha</h3>
                        <form action="/post" method="POST">
                            <input type="hidden" name="type" value="fecha">
                            <input type="date" name="content" required>
                            <input type="text" name="title" placeholder="Título (Examen, Tarea...)" required>
                            <button class="btn">Añadir al Calendario</button>
                        </form>
                    </div>
                    ${posts.filter(p => p.type === 'fecha').map(p => `<div class="card"><b>${p.content}</b>: ${p.title}</div>`).join('')}
                </section>

                <section id="dudas" class="tab-content hidden">
                    <div class="card">
                        <form action="/post" method="POST">
                            <input type="hidden" name="type" value="duda">
                            <textarea name="content" placeholder="Escribe tu duda aquí..."></textarea>
                            <button class="btn">Enviar Pregunta</button>
                        </form>
                    </div>
                    ${posts.filter(p => p.type === 'duda').map(p => `<div class="card"><b>${p.author}:</b> ${p.content}</div>`).join('')}
                </section>

                <section id="config" class="tab-content hidden">
                    <div class="card">
                        <h3>Configuración</h3>
                        <form action="/update-theme" method="POST">
                            <label>Cambiar color del tema:</label>
                            <input type="color" name="color" value="${user.themeColor}">
                            <button class="btn">Guardar Color</button>
                        </form>
                        <hr>
                        <button class="btn" onclick="location.href='/logout'" style="background:#888">Cerrar Sesión</button>
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
                window.onload = () => setTimeout(() => document.getElementById('splash').style.display = 'none', 1200);
            </script>
        `}
    </body>
    </html>
    `);
});

app.listen(process.env.PORT || 3000);
