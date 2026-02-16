const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const webpush = require('web-push');
const app = express();

// --- CONFIGURACIÓN ---
cloudinary.config({ cloud_name: 'dvlbsl16g', api_key: '721617469253873', api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' });
mongoose.connect('mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0');

webpush.setVapidDetails('mailto:amilcarvaleromartinez33@gmail.com', 'BNmECJg52bN_RRCUhq5AD-YUllgurBcHptGOzp7OMYra91_QsRinoicJgrg0N_RseSpcYvGokul1ht2Os4TiGbs', 'Jt46xVYDT17wM3TXqZ-j3VuOw8apU5iE-RZWvLjfoFM');

const storage = new CloudinaryStorage({ cloudinary, params: { folder: 'clase_hub' } });
const upload = multer({ storage });

// --- MODELOS ---
const User = mongoose.model('User', {
    username: { type: String, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },
    photo: { type: String, default: 'https://i.imgur.com/6VBx3io.png' },
    themeColor: { type: String, default: '#6366f1' },
    isBanned: { type: Boolean, default: false },
    penaltyUntil: Date
});

const Post = mongoose.model('Post', {
    author: String, authorId: String, authorImg: String, type: String, content: String, title: String, fileUrl: String, date: { type: Date, default: Date.now }
});

const Config = mongoose.model('Config', { splash: { type: String, default: '¡Bienvenidos a ClassHub!' } });

app.use(express.json()); app.use(express.urlencoded({ extended: true })); app.use(cookieParser());

// --- LÓGICA DE CONTROL ---
const checkPenalty = (user) => {
    if (user.isBanned) return "Estás baneado permanentemente.";
    if (user.penaltyUntil && user.penaltyUntil > new Date()) return `Estás penalizado hasta: ${user.penaltyUntil.toLocaleString()}`;
    return null;
};

// --- RUTAS ADMIN ---
app.post('/admin/user-action', async (req, res) => {
    const admin = await User.findById(req.cookies.userId);
    if (!admin || admin.role !== 'admin') return res.redirect('/');
    
    const { userId, action, time } = req.body;
    if (action === 'delete') await User.findByIdAndDelete(userId);
    if (action === 'ban') await User.findByIdAndUpdate(userId, { isBanned: true });
    if (action === 'penalty') {
        let date = new Date();
        date.setHours(date.getHours() + parseInt(time));
        await User.findByIdAndUpdate(userId, { penaltyUntil: date });
    }
    res.redirect('/');
});

// --- RUTAS BÁSICAS ---
app.post('/auth/register', async (req, res) => {
    const { username, password, pin } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const role = pin === '2845' ? 'admin' : 'user';
    try {
        const u = await User.create({ username, password: hashed, role });
        res.cookie('userId', u._id).redirect('/');
    } catch { res.send("Usuario ya existe"); }
});

app.post('/auth/login', async (req, res) => {
    const u = await User.findOne({ username: req.body.username });
    if (u && await bcrypt.compare(req.body.password, u.password)) {
        res.cookie('userId', u._id).redirect('/');
    } else { res.send("Error"); }
});

app.post('/post', upload.single('archivo'), async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    const error = checkPenalty(user);
    if (error) return res.send(`<script>alert('${error}'); window.location='/';</script>`);
    
    await Post.create({
        author: user.username, authorId: user._id, authorImg: user.photo,
        type: req.body.type, content: req.body.content, title: req.body.title || '',
        fileUrl: req.file ? req.file.path : ''
    });
    res.redirect('/');
});

// --- INTERFAZ ---
app.get('/', async (req, res) => {
    const user = req.cookies.userId ? await User.findById(req.cookies.userId) : null;
    const posts = await Post.find().sort({ date: -1 });
    const users = await User.find();
    const conf = await Config.findOne() || { splash: 'ClassHub' };

    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
            :root { --main: ${user ? user.themeColor : '#6366f1'}; }
            body { font-family: 'Segoe UI', sans-serif; background: #f4f7f6; margin: 0; padding-bottom: 70px; }
            #splash { position: fixed; inset: 0; background: var(--main); color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 9999; }
            .nav-bar { position: fixed; bottom: 0; width: 100%; background: white; display: flex; justify-content: space-around; padding: 10px 0; border-top: 2px solid var(--main); }
            .card { background: white; margin: 15px; padding: 20px; border-radius: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
            .user-row { display: flex; align-items: center; gap: 15px; padding: 15px; border-bottom: 1px solid #eee; }
            .user-row img { width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid var(--main); }
            .btn { background: var(--main); color: white; border: none; padding: 12px; border-radius: 12px; width: 100%; font-weight: bold; cursor: pointer; }
            .btn-admin { padding: 5px 10px; font-size: 0.7rem; margin: 2px; }
            .hidden { display: none; }
            input, textarea { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 10px; box-sizing: border-box; }
        </style>
    </head>
    <body>
        ${!user ? `
            <div class="card" style="margin-top:100px; text-align:center;">
                <h1 style="color:var(--main)">ClassHub</h1>
                <div id="auth-btns">
                    <button class="btn" onclick="show('login')">Entrar</button>
                    <button class="btn" onclick="show('reg')" style="background:#555; margin-top:10px;">Registrarse</button>
                </div>
                <form id="f-login" class="hidden" action="/auth/login" method="POST">
                    <input name="username" placeholder="Usuario">
                    <input name="password" type="password" placeholder="Contraseña">
                    <button class="btn">Entrar</button>
                </form>
                <form id="f-reg" class="hidden" action="/auth/register" method="POST">
                    <input name="username" placeholder="Nuevo Usuario">
                    <input name="password" type="password" placeholder="Contraseña">
                    <input name="pin" type="password" placeholder="Código Admin">
                    <button class="btn">Registrarse</button>
                </form>
            </div>
            <script>function show(id){ document.getElementById('auth-btns').classList.add('hidden'); document.getElementById('f-'+id).classList.remove('hidden'); }</script>
        ` : `
            <div id="splash">
                <img src="${user.photo}" style="width:80px; height:80px; border-radius:50%; border:3px solid white; margin-bottom:15px;">
                <h1>${conf.splash}</h1>
                <p>Hola, ${user.username}</p>
            </div>

            <div id="content">
                <section id="apuntes" class="tab">
                    <div class="card">
                        <form action="/post" method="POST" enctype="multipart/form-data">
                            <input type="hidden" name="type" value="apunte">
                            <textarea name="content" placeholder="Escribe un link, texto o sube archivos..."></textarea>
                            <input type="file" name="archivo" accept="image/*,video/*,.pdf">
                            <button class="btn">Publicar Apunte</button>
                        </form>
                    </div>
                    ${posts.filter(p => p.type === 'apunte').map(p => `
                        <div class="card">
                            <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                                <img src="${p.authorImg}" style="width:30px; height:30px; border-radius:50%;">
                                <strong>${p.author}</strong>
                            </div>
                            <p>${p.content}</p>
                            ${p.fileUrl ? `<a href="${p.fileUrl}" target="_blank" style="color:var(--main); font-weight:bold;">Ver archivo adjunto</a>` : ''}
                        </div>
                    `).join('')}
                </section>

                <section id="fechas" class="tab hidden">
                    <div class="card">
                        <h3>📅 Añadir Fecha</h3>
                        <form action="/post" method="POST">
                            <input type="hidden" name="type" value="fecha">
                            <input type="text" name="title" placeholder="Título (ej: Examen Mates)" required>
                            <input type="date" name="content" required>
                            <button class="btn">Guardar en Calendario</button>
                        </form>
                    </div>
                    ${posts.filter(p => p.type === 'fecha').map(p => `
                        <div class="card" style="border-left: 8px solid var(--main);">
                            <h4 style="margin:0;">${p.title}</h4>
                            <small>${p.content}</small>
                        </div>
                    `).join('')}
                </section>

                ${user.role === 'admin' ? `
                <section id="admin" class="tab hidden">
                    <div class="card">
                        <h3>👥 Lista de Usuarios</h3>
                        ${users.map(u => `
                            <div class="user-row">
                                <img src="${u.photo}">
                                <div style="flex:1">
                                    <strong>${u.username}</strong><br>
                                    <small>${u.role} ${u.isBanned ? '(BANEADO)' : ''}</small>
                                </div>
                                <div>
                                    <form action="/admin/user-action" method="POST">
                                        <input type="hidden" name="userId" value="${u._id}">
                                        <button name="action" value="penalty" class="btn btn-admin">Penalizar 2h</button>
                                        <input type="hidden" name="time" value="2">
                                        <button name="action" value="ban" class="btn btn-admin" style="background:orange">Bannear</button>
                                        <button name="action" value="delete" class="btn btn-admin" style="background:red">Eliminar</button>
                                    </form>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </section>
                ` : ''}
            </div>

            <div class="nav-bar">
                <button onclick="tab('apuntes')"><i class="fas fa-book"></i></button>
                <button onclick="tab('fechas')"><i class="fas fa-calendar"></i></button>
                <button onclick="tab('dudas')"><i class="fas fa-question"></i></button>
                <button onclick="tab('config')"><i class="fas fa-cog"></i></button>
                ${user.role === 'admin' ? `<button onclick="tab('admin')"><i class="fas fa-user-shield"></i></button>` : ''}
            </div>

            <script>
                function tab(id){
                    document.querySelectorAll('.tab').forEach(t => t.classList.add('hidden'));
                    document.getElementById(id).classList.remove('hidden');
                }
                setTimeout(() => document.getElementById('splash').style.display='none', 1500);
            </script>
        `}
    </body>
    </html>
    `);
});

app.listen(process.env.PORT || 3000);
