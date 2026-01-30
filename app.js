const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const app = express();

const PORT = process.env.PORT || 3000;

// --- 1. CONFIGURACIÓN CLOUDINARY ---
cloudinary.config({ 
  cloud_name: 'dvlbsl16g', 
  api_key: '721617469253873', 
  api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});

const upload = multer(); 

// --- 2. CONEXIÓN MONGODB ---
const MONGO_URI = "mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0"; 
mongoose.connect(MONGO_URI).then(() => console.log("¡Conectado al mongolo!"));

// --- 3. MODELOS DE DATOS ---
const CommentSchema = new mongoose.Schema({ autor: String, texto: String, timestamp: String });

const Item = mongoose.model('Item', { 
    tipo: String, titulo: String, link: String, fecha: String, autor: String, timestamp: String,
    comentarios: [CommentSchema]
});

const User = mongoose.model('User', { 
    user: String, pass: String, rol: String, 
    color: { type: String, default: '#6c5ce7' },
    avatar: { type: String, default: '' }
});

app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secreto-clase-ultra', resave: false, saveUninitialized: false }));

// --- 4. LÓGICA DE USUARIOS ---
app.post('/auth', async (req, res) => {
    const { user, pass, pin, accion } = req.body;
    if (accion === 'registro') {
        const total = await User.countDocuments();
        if (total >= 40) return res.send('Límite alcanzado. <a href="/">Volver</a>');
        const rol = (pin === '2845') ? 'admin' : 'estudiante'; // NUEVA CONTRASEÑA ADMIN
        await new User({ user, pass, rol }).save();
        return res.send('Cuenta creada ✅. <a href="/">Entrar</a>');
    }
    const u = await User.findOne({ user, pass });
    if (u) { req.session.u = u.user; req.session.rol = u.rol; res.redirect('/'); }
    else res.send('Fallo. <a href="/">Volver</a>');
});

app.post('/ajustes', upload.single('avatar'), async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    let updateData = { color: req.body.color };
    if (req.file) {
        const result = await new Promise((resolve) => {
            let s = cloudinary.uploader.upload_stream({ folder: "avatares" }, (err, res) => resolve(res));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        updateData.avatar = result.secure_url;
    }
    await User.findOneAndUpdate({ user: req.session.u }, updateData);
    res.redirect('/');
});

// --- 5. COMENTARIOS Y PUBLICACIONES ---
app.post('/comentar/:id', async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    await Item.findByIdAndUpdate(req.params.id, {
        $push: { comentarios: { autor: req.session.u, texto: req.body.texto, timestamp: new Date().toLocaleTimeString() } }
    });
    res.redirect('/');
});

app.post('/publicar', upload.single('archivo'), async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    let url = req.body.link || "";
    if (req.file) {
        const r = await new Promise((resolve) => {
            let s = cloudinary.uploader.upload_stream({ folder: "clase" }, (err, res) => resolve(res));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        url = r.secure_url;
    }
    await new Item({ tipo: req.body.tipo, titulo: req.body.titulo, link: url, fecha: req.body.fecha, autor: req.session.u, timestamp: new Date().toLocaleString() }).save();
    res.redirect('/');
});

app.post('/eliminar/:id', async (req, res) => {
    const post = await Item.findById(req.params.id);
    if (post && (post.autor === req.session.u || req.session.rol === 'admin')) await Item.findByIdAndDelete(req.params.id);
    res.redirect('/');
});

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });

// --- 6. INTERFAZ ---
app.get('/', async (req, res) => {
    if (!req.session.u) return res.send(`
        <body style="font-family:sans-serif; background:#6c5ce7; display:flex; justify-content:center; align-items:center; height:100vh;">
            <form action="/auth" method="POST" style="background:white; padding:30px; border-radius:20px; width:280px; text-align:center;">
                <h2>🎓 Aula Pro</h2>
                <input name="user" placeholder="Usuario" required style="width:100%; padding:10px; margin-bottom:10px;">
                <input name="pass" type="password" placeholder="Contraseña" required style="width:100%; padding:10px; margin-bottom:10px;">
                <input name="pin" placeholder="PIN Admin" style="width:100%; padding:10px; margin-bottom:15px;">
                <button name="accion" value="login" style="width:100%; background:#6c5ce7; color:white; padding:10px; border:none; border-radius:5px;">Entrar</button>
                <button name="accion" value="registro" style="background:none; border:none; color:gray; margin-top:10px;">Crear cuenta</button>
            </form>
        </body>`);

    const userLog = await User.findOne({ user: req.session.u });
    const todos = await Item.find();
    const color = userLog.color || '#6c5ce7';

    const renderPosts = (tipo) => todos.filter(i => i.tipo === tipo).reverse().map(i => `
        <div style="background:white; padding:15px; margin-bottom:15px; border-radius:15px; border-left:8px solid ${color}; box-shadow:0 4px 6px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between;"><b>${i.titulo}</b> <small>${i.fecha || ''}</small></div>
            ${i.link ? `<a href="${i.link}" target="_blank" style="color:${color}; display:block; margin:10px 0;">🖼️ Ver Archivo</a>` : ''}
            <div style="background:#f8f9fa; padding:10px; border-radius:10px; margin-top:10px;">
                <small>💬 Comentarios:</small>
                ${i.comentarios.map(c => `<div style="font-size:0.8em; margin-top:5px;"><b>${c.autor}:</b> ${c.texto}</div>`).join('')}
                <form action="/comentar/${i._id}" method="POST" style="margin-top:10px; display:flex;">
                    <input name="texto" placeholder="Escribe un comentario..." required style="flex:1; padding:5px; border:1px solid #ddd; border-radius:5px;">
                    <button style="background:${color}; color:white; border:none; padding:5px; margin-left:5px; border-radius:5px;">></button>
                </form>
            </div>
            <div style="margin-top:10px; font-size:0.7em; color:gray;">Subido por ${i.autor} ${(i.autor === req.session.u || req.session.rol === 'admin') ? `<form action="/eliminar/${i._id}" method="POST" style="display:inline; float:right;"><button style="background:red; color:white; border:none; padding:2px 5px; border-radius:3px;">Borrar</button></form>` : ''}</div>
        </div>`).join('');

    res.send(`
        <html>
        <head>
            <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family:sans-serif; background:#f0f2f5; margin:0; }
                nav { background:${color}; color:white; padding:15px; display:flex; justify-content:space-between; align-items:center; }
                .tabs { display:flex; background:white; position:sticky; top:0; z-index:10; }
                .tab { flex:1; text-align:center; padding:15px; cursor:pointer; font-weight:bold; color:#666; border-bottom:3px solid transparent; }
                .tab.active { color:${color}; border-bottom-color:${color}; }
                .container { max-width:500px; margin:20px auto; padding:0 15px; }
                .section { display:none; } .section.active { display:block; }
                input, button, select { width:100%; padding:10px; margin-bottom:10px; border-radius:8px; border:1px solid #ddd; }
                .avatar { width:40px; height:40px; border-radius:50%; object-fit:cover; border:2px solid white; }
            </style>
        </head>
        <body>
            <nav>
                <div style="display:flex; align-items:center;">
                    <img src="${userLog.avatar || 'https://via.placeholder.com/40'}" class="avatar">
                    <b style="margin-left:10px;">${req.session.u}</b>
                </div>
                <a href="/salir" style="color:white; text-decoration:none;">Salir</a>
            </nav>
            <div class="tabs">
                <div class="tab active" onclick="ver('apuntes', this)">📂</div>
                <div class="tab" onclick="ver('fechas', this)">📅</div>
                <div class="tab" onclick="ver('dudas', this)">❓</div>
                <div class="tab" onclick="ver('perfil', this)">⚙️</div>
            </div>
            <div class="container">
                <div id="sec-apuntes" class="section active">
                    <form action="/publicar" method="POST" enctype="multipart/form-data" style="background:white; padding:15px; border-radius:15px; margin-bottom:20px;">
                        <input type="hidden" name="tipo" value="apunte"><input name="titulo" placeholder="Título" required>
                        <input type="file" name="archivo" style="border:none;">
                        <button style="background:${color}; color:white; border:none; font-weight:bold;">Publicar Foto/PDF</button>
                    </form>
                    ${renderPosts('apunte')}
                </div>
                <div id="sec-fechas" class="section">
                    <form action="/publicar" method="POST" style="background:white; padding:15px; border-radius:15px; margin-bottom:20px;">
                        <input type="hidden" name="tipo" value="fecha"><input name="titulo" placeholder="¿Qué examen hay?" required>
                        <input type="date" name="fecha" required>
                        <button style="background:#e84393; color:white; border:none; font-weight:bold;">Guardar Fecha</button>
                    </form>
                    ${renderPosts('fecha')}
                </div>
                <div id="sec-dudas" class="section">${renderPosts('duda')}</div>
                <div id="sec-perfil" class="section">
                    <div style="background:white; padding:20px; border-radius:15px;">
                        <h3>🎨 Personalización</h3>
                        <form action="/ajustes" method="POST" enctype="multipart/form-data">
                            <label>Color del tema:</label>
                            <select name="color">
                                <option value="#6c5ce7" ${color==='#6c5ce7'?'selected':''}>Morado</option>
                                <option value="#00b894" ${color==='#00b894'?'selected':''}>Verde</option>
                                <option value="#e84393" ${color==='#e84393'?'selected':''}>Rosa</option>
                                <option value="#0984e3" ${color==='#0984e3'?'selected':''}>Azul</option>
                            </select>
                            <label>Foto de perfil:</label>
                            <input type="file" name="archivo" style="border:none;">
                            <button style="background:${color}; color:white; border:none; font-weight:bold; margin-top:10px;">Guardar Cambios</button>
                        </form>
                    </div>
                </div>
            </div>
            <script>
                function ver(id, el) {
                    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.getElementById('sec-' + id).classList.add('active');
                    el.classList.add('active');
                }
            </script>
        </body>
        </html>`);
});

app.listen(PORT, () => console.log('¡Servidor en marcha!'));
