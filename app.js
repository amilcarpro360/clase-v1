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

// Corregido mailto para evitar error en Render
webpush.setVapidDetails('mailto:amilcarvaleromartinez33@gmail.com', 'BNmECJg52bN_RRCUhq5AD-YUllgurBcHptGOzp7OMYra91_QsRinoicJgrg0N_RseSpcYvGokul1ht2Os4TiGbs', 'Jt46xVYDT17wM3TXqZ-j3VuOw8apU5iE-RZWvLjfoFM');

const storage = new CloudinaryStorage({ cloudinary, params: { folder: 'clase_hub' } });
const upload = multer({ storage });

// --- MODELOS ---
const User = mongoose.model('User', {
    username: { type: String, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },
    photo: { type: String, default: 'https://i.imgur.com/6VBx3io.png' },
    themeColor: { type: String, default: '#6366f1' }
});

const Post = mongoose.model('Post', {
    author: String, authorId: String, authorImg: String, type: String, content: String, title: String, fileUrl: String, date: { type: Date, default: Date.now }
});

app.use(express.json()); app.use(express.urlencoded({ extended: true })); app.use(cookieParser());

// --- RUTAS DE CONFIGURACIÓN ---
app.post('/update-user', upload.single('nuevaFoto'), async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    if (!user) return res.redirect('/');
    if (req.body.color) user.themeColor = req.body.color;
    if (req.file) user.photo = req.file.path;
    await user.save();
    res.redirect('/');
});

app.post('/delete-my-account', async (req, res) => {
    const userId = req.cookies.userId;
    await User.findByIdAndDelete(userId);
    await Post.deleteMany({ authorId: userId });
    res.clearCookie('userId').redirect('/');
});

// --- RESTO DE RUTAS (Login, Register, Post) ---
app.post('/auth/register', async (req, res) => {
    const { username, password, pin } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const role = pin === '2845' ? 'admin' : 'user';
    try {
        const u = await User.create({ username, password: hashed, role });
        res.cookie('userId', u._id).redirect('/');
    } catch { res.send("Error: El usuario ya existe"); }
});

app.post('/auth/login', async (req, res) => {
    const u = await User.findOne({ username: req.body.username });
    if (u && await bcrypt.compare(req.body.password, u.password)) {
        res.cookie('userId', u._id).redirect('/');
    } else { res.send("Credenciales incorrectas"); }
});

app.get('/logout', (req, res) => res.clearCookie('userId').redirect('/'));

app.post('/post', upload.single('archivo'), async (req, res) => {
    const user = await User.findById(req.cookies.userId);
    if (!user) return res.redirect('/');
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

    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
            :root { --main: ${user ? user.themeColor : '#6366f1'}; }
            body { font-family: sans-serif; background: #f4f7f6; margin: 0; padding-bottom: 70px; }
            .card { background: white; margin: 15px; padding: 15px; border-radius: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); position: relative; }
            .nav-bar { position: fixed; bottom: 0; width: 100%; background: white; display: flex; justify-content: space-around; padding: 10px 0; border-top: 1px solid #ddd; }
            .btn { background: var(--main); color: white; border: none; padding: 12px; border-radius: 10px; width: 100%; font-weight: bold; cursor: pointer; margin-top:10px; }
            .btn-danger { background: #ff4d4d; }
            .hidden { display: none; }
            input, textarea { width: 100%; padding: 10px; margin: 5px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; }
        </style>
    </head>
    <body>
        ${!user ? `
            <div class="card" style="margin-top:100px; text-align:center;">
                <h1>ClassHub</h1>
                <form action="/auth/login" method="POST">
                    <input name="username" placeholder="Usuario" required>
                    <input name="password" type="password" placeholder="Contraseña" required>
                    <button class="btn">Iniciar Sesión</button>
                </form>
                <hr>
                <form action="/auth/register" method="POST">
                    <input name="username" placeholder="Nuevo Usuario" required>
                    <input name="password" type="password" placeholder="Contraseña" required>
                    <input name="pin" type="password" placeholder="PIN Admin (Opcional)">
                    <button class="btn" style="background:#888">Registrarse</button>
                </form>
            </div>
        ` : `
            <div id="content">
                <section id="dudas" class="tab">
                    <div class="card">
                        <h3>❓ Preguntar algo</h3>
                        <form action="/post" method="POST">
                            <input type="hidden" name="type" value="duda">
                            <textarea name="content" placeholder="¿Qué duda tienes?" required></textarea>
                            <button class="btn">Publicar Duda</button>
                        </form>
                    </div>
                    ${posts.filter(p => p.type === 'duda').map(p => `
                        <div class="card">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <img src="${p.authorImg}" style="width:30px; height:30px; border-radius:50%;">
                                <strong>${p.author}</strong>
                            </div>
                            <p>${p.content}</p>
                        </div>
                    `).join('')}
                </section>

                <section id="config" class="tab hidden">
                    <div class="card">
                        <h3>⚙️ Mi Perfil</h3>
                        <form action="/update-user" method="POST" enctype="multipart/form-data">
                            <label>Foto de perfil:</label>
                            <input type="file" name="nuevaFoto">
                            <label>Color del tema:</label>
                            <input type="color" name="color" value="${user.themeColor}" style="height:40px;">
                            <button class="btn">Guardar Cambios</button>
                        </form>
                        <hr>
                        <button class="btn" onclick="location.href='/logout'" style="background:#888">Cerrar Sesión</button>
                        <form action="/delete-my-account" method="POST" onsubmit="return confirm('¿Seguro que quieres borrar tu cuenta?')">
                            <button class="btn btn-danger">Eliminar mi cuenta</button>
                        </form>
                    </div>
                </section>
            </div>

            <nav class="nav-bar">
                <button onclick="tab('apuntes')"><i class="fas fa-book"></i></button>
                <button onclick="tab('fechas')"><i class="fas fa-calendar"></i></button>
                <button onclick="tab('dudas')"><i class="fas fa-question"></i></button>
                <button onclick="tab('config')"><i class="fas fa-cog"></i></button>
            </nav>

            <script>
                function tab(id){
                    document.querySelectorAll('.tab').forEach(t => t.classList.add('hidden'));
                    document.getElementById(id).classList.remove('hidden');
                }
            </script>
        `}
    </body>
    </html>
    `);
});

app.listen(process.env.PORT || 3000);
