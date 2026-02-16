const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
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
    username: String, role: String, photo: String, themeColor: { type: String, default: '#6366f1' }, pushSubscription: Object
});

const Post = mongoose.model('Post', {
    authorId: String, author: String, type: String, content: String, title: String, fileUrl: String, date: { type: Date, default: Date.now }
});

const Config = mongoose.model('Config', { splashText: { type: String, default: "¡Bienvenidos a ClassHub!" } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- 3. RUTAS DE LÓGICA ---

// Eliminar Post (Admin borra todo, User solo lo suyo)
app.post('/delete-post/:id', async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    const post = await Post.findById(req.params.id);
    if (user && post && (user.role === 'admin' || post.authorId === user._id.toString())) {
        await Post.findByIdAndDelete(req.params.id);
    }
    res.redirect('/');
});

// Cambiar Configuración
app.post('/update-config', async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    if (!user) return res.redirect('/');
    
    // Cambiar color del usuario
    if (req.body.color) {
        user.themeColor = req.body.color;
        await user.save();
    }
    
    // Cambiar Splash (Solo Admin)
    if (user.role === 'admin' && req.body.splash) {
        await Config.findOneAndUpdate({}, { splashText: req.body.splash }, { upsert: true });
    }
    res.redirect('/');
});

app.post('/register', async (req, res) => {
    const role = req.body.code === '2845' ? 'admin' : 'user';
    const user = await User.create({ username: req.body.username, role, photo: 'https://i.imgur.com/6VBx3io.png' });
    res.cookie('userId', user._id).redirect('/');
});

app.post('/post', upload.single('archivo'), async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    if (!user) return res.redirect('/');
    await Post.create({
        authorId: user._id, author: user.username, type: req.body.type, 
        content: req.body.content, title: req.body.titulo || '', fileUrl: req.file ? req.file.path : ''
    });
    res.redirect('/');
});

// --- 4. INTERFAZ ---
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
            body { font-family: sans-serif; background: #f8fafc; margin: 0; padding-bottom: 80px; }
            #splash { position: fixed; inset: 0; background: var(--main); color: white; display: flex; justify-content: center; align-items: center; z-index: 9999; transition: 0.8s; }
            nav { position: fixed; bottom: 0; width: 100%; background: white; display: flex; justify-content: space-around; padding: 12px 0; border-top: 1px solid #e2e8f0; }
            .card { background: white; margin: 12px; padding: 15px; border-radius: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); position: relative; }
            .btn { background: var(--main); color: white; border: none; padding: 10px; border-radius: 10px; cursor: pointer; font-weight: bold; width: 100%; }
            .nav-item { background: none; border: none; color: #64748b; font-size: 0.7rem; display: flex; flex-direction: column; align-items: center; cursor: pointer; }
            .nav-item.active { color: var(--main); }
            .delete-btn { position: absolute; top: 10px; right: 10px; color: #ff4d4d; cursor: pointer; background: none; border: none; }
            .hidden { display: none; }
            input, textarea { width: 100%; padding: 10px; margin: 8px 0; border: 1px solid #ddd; border-radius: 8px; }
        </style>
    </head>
    <body>
        ${!user ? `
            <div class="card" style="margin-top:100px; text-align:center;">
                <h2>ClassHub</h2>
                <form action="/register" method="POST">
                    <input name="username" placeholder="Tu Nombre" required>
                    <input name="code" placeholder="Código Admin">
                    <button class="btn">Entrar</button>
                </form>
            </div>
        ` : `
            <div id="splash"><h1>${config.splashText}</h1></div>
            
            <div class="container">
                <section id="apuntes" class="tab-content">
                    <div class="card">
                        <form action="/post" method="POST" enctype="multipart/form-data">
                            <input type="hidden" name="type" value="apunte">
                            <textarea name="content" placeholder="Sube algo..."></textarea>
                            <input type="file" name="archivo"><button class="btn">Publicar</button>
                        </form>
                    </div>
                    ${posts.filter(p => p.type === 'apunte').map(p => `
                        <div class="card">
                            ${(user.role === 'admin' || p.authorId === user._id.toString()) ? `<form action="/delete-post/${p._id}" method="POST"><button class="delete-btn"><i class="fas fa-trash"></i></button></form>` : ''}
                            <strong>${p.author}</strong><p>${p.content}</p>
                            ${p.fileUrl ? `<img src="${p.fileUrl}" style="width:100%; border-radius:12px;">` : ''}
                        </div>
                    `).join('')}
                </section>

                <section id="config" class="tab-content hidden">
                    <div class="card">
                        <h3>Personalización</h3>
                        <form action="/update-config" method="POST">
                            <label>Tu color de tema:</label>
                            <input type="color" name="color" value="${user.themeColor}" style="height:50px;">
                            ${user.role === 'admin' ? `
                                <hr>
                                <label>Mensaje de Bienvenida (Splash):</label>
                                <input type="text" name="splash" value="${config.splashText}">
                            ` : ''}
                            <button class="btn" style="margin-top:10px;">Guardar Cambios</button>
                        </form>
                    </div>
                </section>

                <section id="admin" class="tab-content hidden">
                    <div class="card">
                        <h3>Usuarios</h3>
                        ${users.map(u => `<div style="display:flex; align-items:center; gap:10px; padding:10px; border-bottom:1px solid #eee;"><img src="${u.photo}" style="width:40px; border-radius:50%;"><b>${u.username}</b></div>`).join('')}
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
                window.onload = () => setTimeout(() => document.getElementById('splash').style.display = 'none', 1500);
            </script>
        `}
    </body>
    </html>
    `);
});

app.listen(process.env.PORT || 3000);
