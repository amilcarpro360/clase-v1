const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const webpush = require('web-push');
const app = express();

// CONFIGURACIÓN
cloudinary.config({ cloud_name: 'dvlbsl16g', api_key: '721617469253873', api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' });
mongoose.connect('mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0');

webpush.setVapidDetails('mailto:amilcarvaleromartinez33@gmail.com', 'BNmECJg52bN_RRCUhq5AD-YUllgurBcHptGOzp7OMYra91_QsRinoicJgrg0N_RseSpcYvGokul1ht2Os4TiGbs', 'Jt46xVYDT17wM3TXqZ-j3VuOw8apU5iE-RZWvLjfoFM');

const storage = new CloudinaryStorage({ cloudinary, params: { folder: 'clase_hub' } });
const upload = multer({ storage });

// MODELOS
const User = mongoose.model('User', {
    username: { type: String, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },
    photo: { type: String, default: 'https://i.imgur.com/6VBx3io.png' },
    themeColor: { type: String, default: '#6366f1' },
    isBanned: { type: Boolean, default: false }
});

const Post = mongoose.model('Post', {
    author: String, authorId: String, authorImg: String, 
    type: String, content: String, title: String, fileUrl: String, 
    comments: [{ author: String, content: String, img: String }],
    date: { type: Date, default: Date.now }
});

const Config = mongoose.model('Config', { splash: { type: String, default: 'ClassHub' } });

app.use(express.json()); app.use(express.urlencoded({ extended: true })); app.use(cookieParser());

// RESTRICCIÓN DE DUDAS (Viernes 18:00 a Lunes 08:00) 
const canPostDuda = () => {
    const now = new Date();
    const day = now.getDay(); // 0: Dom, 5: Vie, 1: Lun
    const hour = now.getHours();
    if ((day === 5 && hour >= 18) || day === 6 || day === 0 || (day === 1 && hour < 8)) return false;
    return true;
};

// RUTAS DE SESIÓN 
app.post('/auth/register', async (req, res) => {
    const { username, password, pin } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const role = pin === '2845' ? 'admin' : 'user'; // Código Admin 
    try {
        const u = await User.create({ username, password: hashed, role });
        res.cookie('userId', u._id).redirect('/');
    } catch { res.send("Error"); }
});

app.post('/auth/login', async (req, res) => {
    const u = await User.findOne({ username: req.body.username });
    if (u && !u.isBanned && await bcrypt.compare(req.body.password, u.password)) {
        res.cookie('userId', u._id).redirect('/');
    } else { res.send("Error de acceso"); }
});

// ACCIONES DE CONTENIDO 
app.post('/post', upload.single('archivo'), async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    if (!user) return res.redirect('/');
    if (req.body.type === 'duda' && !canPostDuda()) return res.send("Solo puedes poner una duda fuera del horario restringido.");

    await Post.create({
        author: user.username, authorId: user._id, authorImg: user.photo,
        type: req.body.type, content: req.body.content, title: req.body.title || '',
        fileUrl: req.file ? req.file.path : ''
    });
    res.redirect('/');
});

app.post('/comment/:id', upload.single('img'), async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    const post = await Post.findById(req.params.id);
    post.comments.push({ author: user.username, content: req.body.text, img: req.file ? req.file.path : '' });
    await post.save();
    res.redirect('/');
});

// INTERFAZ 
app.get('/', async (req, res) => {
    const user = req.cookies.userId ? await User.findById(req.cookies.userId) : null;
    const posts = await Post.find().sort({ date: -1 });
    const users = await User.find();
    const config = await Config.findOne() || { splash: "Bienvenido" };

    res.send(`
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
            :root { --main: ${user ? user.themeColor : '#6366f1'}; }
            body { font-family: sans-serif; background: #f0f2f5; margin: 0; padding-bottom: 70px; }
            .card { background: white; margin: 10px; padding: 15px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .nav { position: fixed; bottom: 0; width: 100%; background: white; display: flex; justify-content: space-around; padding: 10px 0; border-top: 1px solid #ddd; }
            .btn { background: var(--main); color: white; border: none; padding: 10px; border-radius: 8px; width: 100%; cursor: pointer; }
            .hidden { display: none; }
            .user-row { display: flex; align-items: center; gap: 10px; padding: 10px; border-bottom: 1px solid #eee; }
            .user-row img { width: 40px; height: 40px; border-radius: 50%; }
        </style>
    </head>
    <body>
        ${!user ? `
            <div class="card" style="margin-top:50px;">
                <h2>Iniciar Sesión</h2>
                <form action="/auth/login" method="POST"><input name="username" placeholder="Usuario" style="width:100%; margin:5px 0; padding:10px;"><input name="password" type="password" placeholder="Contraseña" style="width:100%; margin:5px 0; padding:10px;"><button class="btn">Entrar</button></form>
                <hr>
                <h2>Registrarse</h2>
                <form action="/auth/register" method="POST"><input name="username" placeholder="Usuario" style="width:100%; margin:5px 0; padding:10px;"><input name="password" type="password" placeholder="Contraseña" style="width:100%; margin:5px 0; padding:10px;"><input name="pin" placeholder="PIN Admin (Opcional)" style="width:100%; margin:5px 0; padding:10px;"><button class="btn" style="background:#555">Crear Cuenta</button></form>
            </div>
        ` : `
            <div id="splash" style="position:fixed; inset:0; background:var(--main); color:white; display:flex; justify-content:center; align-items:center; z-index:9999;"><h1>${config.splash}</h1></div>
            
            <div id="content">
                <section id="apuntes" class="tab">
                    <div class="card">
                        <form action="/post" method="POST" enctype="multipart/form-data">
                            <input type="hidden" name="type" value="apunte">
                            <textarea name="content" placeholder="Link o texto..." style="width:100%;"></textarea>
                            <input type="file" name="archivo"><button class="btn">Subir</button>
                        </form>
                    </div>
                    ${posts.filter(p => p.type === 'apunte').map(p => `<div class="card"><b>${p.author}:</b><p>${p.content}</p></div>`).join('')}
                </section>

                <section id="fechas" class="tab hidden">
                    <div class="card">
                        <form action="/post" method="POST">
                            <input type="hidden" name="type" value="fecha">
                            <input name="title" placeholder="Título del evento" required style="width:100%; margin-bottom:5px;">
                            <input type="date" name="content" required style="width:100%;">
                            <button class="btn">Añadir Fecha</button>
                        </form>
                    </div>
                    ${posts.filter(p => p.type === 'fecha').map(p => `<div class="card"><b>${p.content}</b> - ${p.title}</div>`).join('')}
                </section>

                ${user.role === 'admin' ? `
                <section id="admin" class="tab hidden">
                    <div class="card">
                        <h3>Gestión de Usuarios</h3>
                        ${users.map(u => `
                            <div class="user-row">
                                <img src="${u.photo}"> 
                                <div><b>${u.username}</b><br><small>${u.role}</small></div>
                            </div>
                        `).join('')}
                    </div>
                </section>
                ` : ''}
            </div>

            <nav class="nav">
                <button onclick="tab('apuntes')">Apuntes</button>
                <button onclick="tab('fechas')">Fechas</button>
                <button onclick="tab('dudas')">Dudas</button>
                <button onclick="tab('config')">Config</button>
                ${user.role === 'admin' ? `<button onclick="tab('admin')">Admin</button>` : ''}
            </nav>

            <script>
                function tab(id){ document.querySelectorAll('.tab').forEach(t=>t.classList.add('hidden')); document.getElementById(id).classList.remove('hidden'); }
                setTimeout(()=>document.getElementById('splash').style.display='none', 1500);
            </script>
        `}
    </body>
    </html>
    `);
});

app.listen(process.env.PORT || 3000);
