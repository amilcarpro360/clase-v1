const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const app = express();

// He cambiado el puerto a 4000 para evitar el error de "puerto ocupado"
const PORT = process.env.PORT || 4000;

// --- 1. CONFIGURACIÓN CLOUDINARY ---
cloudinary.config({ 
    cloud_name: 'dvlbsl16g', 
    api_key: '721617469253873', 
    api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});

const upload = multer(); 

// --- 2. CONEXIÓN MONGODB ---
const MONGO_URI = "mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0"; 
mongoose.connect(MONGO_URI).then(() => console.log("¡Conectado con éxito a MongoDB!"));

// --- 3. MODELOS ---
const CommentSchema = new mongoose.Schema({ autor: String, texto: String, timestamp: String });

const Item = mongoose.model('Item', { 
    tipo: String, 
    titulo: String, 
    link: String, 
    asignatura: String, 
    autor: String, 
    timestamp: String,
    fechaExamen: String,
    comentarios: [CommentSchema]
});

const User = mongoose.model('User', { 
    user: String, pass: String, rol: String, 
    color: { type: String, default: '#6c5ce7' },
    avatar: { type: String, default: '' }
});

app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secreto-clase-definitivo', resave: false, saveUninitialized: false }));

// --- 4. LÓGICA DE USUARIOS ---
app.post('/auth', async (req, res) => {
    const { user, pass, pin, accion } = req.body;
    if (accion === 'registro') {
        if (await User.countDocuments() >= 40) return res.send('Límite de 40 alumnos alcanzado.');
        const rol = (pin === '2845') ? 'admin' : 'estudiante';
        await new User({ user, pass, rol }).save();
        return res.send('Registrado correctamente. <a href="/">Inicia sesión aquí</a>');
    }
    const u = await User.findOne({ user, pass });
    if (u) { req.session.u = u.user; req.session.rol = u.rol; res.redirect('/'); }
    else res.send('Usuario o contraseña incorrectos.');
});

app.post('/ajustes', upload.single('avatar'), async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    let update = { color: req.body.color };

    if (req.file) {
        if (!req.file.mimetype.startsWith('image/')) {
            return res.send('❌ Error: El archivo debe ser una imagen. <a href="/">Volver</a>');
        }
        const r = await new Promise((resolve) => {
            let s = cloudinary.uploader.upload_stream({ folder: "avatares" }, (e, resu) => resolve(resu));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        update.avatar = r.secure_url;
    }
    await User.findOneAndUpdate({ user: req.session.u }, update);
    res.redirect('/');
});

// --- 5. LÓGICA DE PUBLICACIONES ---
app.post('/publicar', upload.single('archivo'), async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    let url = "";
    if (req.file) {
        const r = await new Promise((resolve) => {
            let s = cloudinary.uploader.upload_stream({ folder: "clase", resource_type: "auto" }, (err, res) => resolve(res));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        url = r.secure_url;
    }
    await new Item({ 
        tipo: req.body.tipo, 
        titulo: req.body.titulo, 
        asignatura: req.body.asignatura,
        fechaExamen: req.body.fecha || '', 
        link: url, 
        autor: req.session.u, 
        timestamp: new Date().toLocaleString() 
    }).save();
    res.redirect('/');
});

app.post('/comentar/:id', async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    await Item.findByIdAndUpdate(req.params.id, {
        $push: { comentarios: { autor: req.session.u, texto: req.body.texto, timestamp: new Date().toLocaleTimeString() } }
    });
    res.redirect('/');
});

app.post('/eliminar/:id', async (req, res) => {
    const post = await Item.findById(req.params.id);
    if (post && (post.autor === req.session.u || req.session.rol === 'admin')) await Item.findByIdAndDelete(req.params.id);
    res.redirect('/');
});

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });

// --- 6. INTERFAZ VISUAL ---
app.get('/', async (req, res) => {
    if (!req.session.u) return res.send(`<head><title>Entrar | Aula Virtual</title></head><body style="font-family:sans-serif; background:#6c5ce7; display:flex; justify-content:center; align-items:center; height:100vh;"><form action="/auth" method="POST" style="background:white; padding:30px; border-radius:20px; width:280px; text-align:center;"><h2>🎓 Aula Virtual</h2><input name="user" placeholder="Usuario" required style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:1px solid #ddd;"><input name="pass" type="password" placeholder="Contraseña" required style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:1px solid #ddd;"><input name="pin" placeholder="PIN Admin (Opcional)" style="width:100%; padding:10px; margin-bottom:15px; border-radius:5px; border:1px solid #ddd;"><button name="accion" value="login" style="width:100%; background:#6c5ce7; color:white; padding:10px; border:none; border-radius:5px; cursor:pointer; font-weight:bold;">Entrar</button><button name="accion" value="registro" style="background:none; border:none; color:gray; margin-top:10px; cursor:pointer;">Crear cuenta nueva</button></form></body>`);

    const userLog = await User.findOne({ user: req.session.u });
    const todos = await Item.find();
    const todosUsuarios = req.session.rol === 'admin' ? await User.find() : [];
    const color = userLog.color || '#6c5ce7';

    const asigOptions = `<option value="Matemáticas">Matemáticas</option><option value="Lengua">Lengua</option><option value="Historia">Historia</option><option value="Inglés">Inglés</option><option value="Ciencias">Ciencias</option><option value="Otra">Otra</option>`;

    const renderPosts = (tipo) => todos.filter(i => i.tipo === tipo).reverse().map(i => `
        <div style="background:white; padding:15px; margin-bottom:15px; border-radius:15px; border-left:8px solid ${tipo === 'fecha' ? '#e84393' : color}; box-shadow:0 2px 10px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="background:#f0f0f0; padding:3px 8px; border-radius:5px; font-size:0.7em; font-weight:bold; color:#555;">${i.asignatura || 'General'}</span>
                <small style="color:#aaa;">${i.timestamp}</small>
            </div>
            ${i.tipo === 'fecha' ? `<h3 style="margin:10px 0; color:#e84393;">📌 EXAMEN: ${i.titulo}</h3><p style="font-weight:bold; background:#fff5f5; padding:5px; border-radius:5px; display:inline-block;">📅 Fecha: ${i.fechaExamen}</p>` : `<h3 style="margin:10px 0; color:#333;">${i.titulo}</h3>`}
            ${i.link ? (i.link.includes('.mp4') || i.link.includes('.mov') ? `<video src="${i.link}" controls style="width:100%; border-radius:10px;"></video>` : `<a href="${i.link}" target="_blank" style="color:${color}; font-weight:bold; text-decoration:none; display:block; padding:12px; background:#f9f9f9; border-radius:8px; text-align:center; border:1px dashed ${color};">📂 Ver Archivo Adjunto</a>`) : ''}
            <div style="background:#f8f9fa; padding:15px; border-radius:12px; margin-top:15px;">
                <b style="font-size:0.8em; color:#888;">COMENTARIOS:</b>
                <div style="max-height:150px; overflow-y:auto; margin-top:10px;">
                    ${i.comentarios.map(c => `<div style="font-size:0.85em; margin-bottom:5px; background:white; padding:8px; border-radius:8px; border:1px solid #eee;"><b>${c.autor}:</b> ${c.texto}</div>`).join('')}
                </div>
                <form action="/comentar/${i._id}" method="POST" style="margin-top:10px; display:flex; gap:5px;">
                    <input name="texto" placeholder="Escribe algo..." required style="margin-bottom:0; padding:8px;">
                    <button style="background:${color}; color:white; border:none; width:80px; margin-bottom:0; padding:8px; cursor:pointer;">OK</button>
                </form>
            </div>
            <div style="margin-top:12px; font-size:0.8em; color:#888;">Por: <b>${i.autor}</b> ${(i.autor === req.session.u || req.session.rol === 'admin') ? `<form action="/eliminar/${i._id}" method="POST" style="display:inline; float:right;"><button style="background:#ff7675; color:white; border:none; padding:4px 10px; border-radius:6px; cursor:pointer;">Borrar</button></form>` : ''}</div>
        </div>`).join('');

    res.send(`
        <html>
        <head>
            <title>Aula Virtual | ${req.session.u}</title>
            <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family:sans-serif; background:#f0f2f5; margin:0; padding-bottom:50px; }
                nav { background:${color}; color:white; padding:15px; display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:1000; }
                .tabs { display:flex; background:white; margin-bottom:20px; box-shadow:0 2px 5px rgba(0,0,0,0.1); }
                .tab { flex:1; text-align:center; padding:15px; cursor:pointer; font-weight:bold; color:#888; border-bottom:3px solid transparent; }
                .tab.active { color:${color}; border-bottom-color:${color}; }
                .container { max-width:550px; margin:0 auto; padding:0 15px; }
                .section { display:none; } .section.active { display:block; }
                input, button, select, textarea { width:100%; padding:12px; margin-bottom:10px; border-radius:10px; border:1px solid #ddd; box-sizing:border-box; }
                .avatar-nav { width:35px; height:35px; border-radius:50%; object-fit:cover; border:2px solid white; }
            </style>
        </head>
        <body>
            <nav>
                <div style="display:flex; align-items:center;"><img src="${userLog.avatar || 'https://via.placeholder.com/150'}" class="avatar-nav"><b style="margin-left:10px;">${req.session.u}</b></div>
                <a href="/salir" style="color:white; text-decoration:none; font-size:0.8em; opacity:0.8;">Cerrar Sesión</a>
            </nav>
            <div class="tabs">
                <div class="tab active" onclick="ver('apuntes', this)">Archivos</div>
                <div class="tab" onclick="ver('fechas', this)">Fechas</div>
                <div class="tab" onclick="ver('dudas', this)">Dudas</div>
                <div class="tab" onclick="ver('perfil', this)">Perfil</div>
                ${req.session.rol === 'admin' ? '<div class="tab" onclick="ver(\'admin\', this)">Admin</div>' : ''}
            </div>
            <div class="container">
                <div id="sec-apuntes" class="section active">
                    <form action="/publicar" method="POST" enctype="multipart/form-data" style="background:white; padding:20px; border-radius:20px; margin-bottom:20px;">
                        <input type="hidden" name="tipo" value="apunte">
                        <input name="titulo" placeholder="Título del apunte" required>
                        <select name="asignatura">${asigOptions}</select>
                        <input type="file" name="archivo" required style="border:none;">
                        <button style="background:${color}; color:white; font-weight:bold; border:none; cursor:pointer;">📤 Subir a la Clase</button>
                    </form>
                    ${renderPosts('apunte')}
                </div>
                <div id="sec-fechas" class="section">
                    <form action="/publicar" method="POST" style="background:white; padding:20px; border-radius:20px; margin-bottom:20px;">
                        <input type="hidden" name="tipo" value="fecha">
                        <input name="titulo" placeholder="¿Qué examen o entrega hay?" required>
                        <input type="date" name="fecha" required>
                        <select name="asignatura">${asigOptions}</select>
                        <button style="background:#e84393; color:white; border:none; font-weight:bold; cursor:pointer;">📌 Añadir al Calendario</button>
                    </form>
                    ${renderPosts('fecha')}
                </div>
                <div id="sec-dudas" class="section">
                    <form action="/publicar" method="POST" style="background:white; padding:20px; border-radius:20px; margin-bottom:20px;">
                        <input type="hidden" name="tipo" value="duda">
                        <textarea name="titulo" placeholder="Escribe tu pregunta aquí..." required style="height:80px;"></textarea>
                        <select name="asignatura">${asigOptions}</select>
                        <button style="background:#00b894; color:white; border:none; font-weight:bold; cursor:pointer;">❓ Lanzar Duda</button>
                    </form>
                    ${renderPosts('duda')}
                </div>
                <div id="sec-perfil" class="section">
                    <div style="background:white; padding:20px; border-radius:20px;">
                        <h3>Ajustes de Perfil</h3>
                        <form action="/ajustes" method="POST" enctype="multipart/form-data">
                            <label>Color de interfaz:</label>
                            <select name="color">
                                <option value="#6c5ce7" ${color==='#6c5ce7'?'selected':''}>Morado</option>
                                <option value="#00b894" ${color==='#00b894'?'selected':''}>Verde</option>
                                <option value="#e84393" ${color==='#e84393'?'selected':''}>Rosa</option>
                                <option value="#0984e3" ${color==='#0984e3'?'selected':''}>Azul</option>
                                <option value="#2d3436" ${color==='#2d3436'?'selected':''}>Negro</option>
                            </select>
                            <label>Foto de perfil:</label>
                            <input type="file" name="avatar" accept="image/*">
                            <button style="background:${color}; color:white; border:none; cursor:pointer; font-weight:bold; margin-top:10px;">💾 Guardar Cambios</button>
                        </form>
                    </div>
                </div>
                <div id="sec-admin" class="section">
                    <div style="background:white; padding:20px; border-radius:20px;">
                        <h3>Usuarios Registrados (${todosUsuarios.length}/40)</h3>
                        ${todosUsuarios.map(u => `<div style="padding:10px; border-bottom:1px solid #eee;"><b>${u.user}</b> - Rol: ${u.rol}</div>`).join('')}
                    </div>
                </div>
            </div>
            <script>
                function ver(id, el) {
                    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.getElementById('sec-' + id).classList.add('active');
                    el.classList.add('active');
                    window.scrollTo(0,0);
                }
            </script>
        </body>
        </html>`);
});

app.listen(PORT, () => console.log('Servidor corriendo en el puerto ' + PORT));
