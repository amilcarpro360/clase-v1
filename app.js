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

// --- 3. MODELOS ---
const CommentSchema = new mongoose.Schema({ autor: String, texto: String, timestamp: String });

const Item = mongoose.model('Item', { 
    tipo: String, titulo: String, link: String, asignatura: String, autor: String, timestamp: String,
    comentarios: [CommentSchema]
});

const User = mongoose.model('User', { 
    user: String, pass: String, rol: String, 
    color: { type: String, default: '#6c5ce7' },
    avatar: { type: String, default: '' }
});

app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secreto-clase-definitivo', resave: false, saveUninitialized: false }));

// --- 4. LÓGICA DE USUARIOS Y AJUSTES ---
app.post('/auth', async (req, res) => {
    const { user, pass, pin, accion } = req.body;
    if (accion === 'registro') {
        if (await User.countDocuments() >= 40) return res.send('Límite de 40 alcanzado.');
        const rol = (pin === '2845') ? 'admin' : 'estudiante';
        await new User({ user, pass, rol }).save();
        return res.send('Registrado con éxito. <a href="/">Entrar</a>');
    }
    const u = await User.findOne({ user, pass });
    if (u) { req.session.u = u.user; req.session.rol = u.rol; res.redirect('/'); }
    else res.send('Datos incorrectos.');
});

// NUEVA LÓGICA DE AJUSTES CON FILTRO DE IMAGEN
app.post('/ajustes', upload.single('avatar'), async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    let update = { color: req.body.color };

    if (req.file) {
        // SEGURIDAD: Solo permitir archivos que empiecen por "image/"
        if (!req.file.mimetype.startsWith('image/')) {
            return res.send('❌ Error: Solo puedes subir imágenes (JPG, PNG, etc). <a href="/">Volver</a>');
        }

        const r = await new Promise((res) => {
            let s = cloudinary.uploader.upload_stream({ folder: "avatares" }, (e, resu) => res(resu));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        update.avatar = r.secure_url;
    }
    await User.findOneAndUpdate({ user: req.session.u }, update);
    res.redirect('/');
});

// --- 5. LÓGICA DE CONTENIDO ---
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
        tipo: req.body.tipo, titulo: req.body.titulo, asignatura: req.body.asignatura,
        link: url, autor: req.session.u, timestamp: new Date().toLocaleString() 
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

// --- 6. INTERFAZ ---
app.get('/', async (req, res) => {
    if (!req.session.u) return res.send(`<body style="font-family:sans-serif; background:#6c5ce7; display:flex; justify-content:center; align-items:center; height:100vh;"><form action="/auth" method="POST" style="background:white; padding:30px; border-radius:20px; width:280px; text-align:center;"><h2>🎓 Aula Virtual</h2><input name="user" placeholder="Usuario" required style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:1px solid #ddd;"><input name="pass" type="password" placeholder="Contraseña" required style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:1px solid #ddd;"><input name="pin" placeholder="PIN Admin" style="width:100%; padding:10px; margin-bottom:15px; border-radius:5px; border:1px solid #ddd;"><button name="accion" value="login" style="width:100%; background:#6c5ce7; color:white; padding:10px; border:none; border-radius:5px; cursor:pointer; font-weight:bold;">Entrar</button><button name="accion" value="registro" style="background:none; border:none; color:gray; margin-top:10px; cursor:pointer;">Crear cuenta</button></form></body>`);

    const userLog = await User.findOne({ user: req.session.u });
    const todos = await Item.find();
    const todosUsuarios = req.session.rol === 'admin' ? await User.find() : [];
    const color = userLog.color || '#6c5ce7';

    const asigOptions = `<option value="Matemáticas">Matemáticas</option><option value="Lengua">Lengua</option><option value="Historia">Historia</option><option value="Inglés">Inglés</option><option value="Ciencias">Ciencias</option><option value="Otra">Otra</option>`;

    const renderPosts = (tipo) => todos.filter(i => i.tipo === tipo).reverse().map(i => `
        <div style="background:white; padding:15px; margin-bottom:15px; border-radius:15px; border-left:8px solid ${color}; box-shadow:0 2px 10px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="background:#f0f0f0; padding:3px 8px; border-radius:5px; font-size:0.7em; font-weight:bold; color:#555;">${i.asignatura || 'General'}</span>
                <small style="color:#aaa;">${i.timestamp}</small>
            </div>
            <h3 style="margin:10px 0; color:#333;">${i.titulo}</h3>
            ${i.link ? (i.link.includes('.mp4') || i.link.includes('.mov') ? `<video src="${i.link}" controls style="width:100%; border-radius:10px;"></video>` : `<a href="${i.link}" target="_blank" style="color:${color}; font-weight:bold; text-decoration:none; display:block; padding:10px; background:#f9f9f9; border-radius:8px; text-align:center;">📂 Abrir Archivo / Vídeo</a>`) : ''}
            
            <div style="background:#f8f9fa; padding:15px; border-radius:12px; margin-top:15px;">
                <b style="font-size:0.9em; color:#555;">💬 Comentarios:</b>
                <div style="max-height:200px; overflow-y:auto; margin-top:10px;">
                    ${i.comentarios.map(c => `<div style="font-size:0.85em; margin-top:8px; background:white; padding:8px; border-radius:8px; border:1px solid #eee;"><b>${c.autor}:</b> ${c.texto}</div>`).join('')}
                </div>
                <form action="/comentar/${i._id}" method="POST" style="margin-top:15px;">
                    <textarea name="texto" placeholder="Escribe un comentario..." required style="width:100%; height:70px; padding:10px; border-radius:10px; border:1px solid #ddd; font-family:sans-serif; resize:none; box-sizing:border-box;"></textarea>
                    <button style="background:${color}; color:white; border:none; padding:10px; width:100%; border-radius:10px; margin-top:8px; cursor:pointer; font-weight:bold;">Enviar Comentario</button>
                </form>
            </div>
            <div style="margin-top:12px; font-size:0.8em; color:#888;">Subido por: <b>${i.autor}</b> ${(i.autor === req.session.u || req.session.rol === 'admin') ? `<form action="/eliminar/${i._id}" method="POST" style="display:inline; float:right;"><button style="background:#ff7675; color:white; border:none; padding:4px 10px; border-radius:6px; cursor:pointer;">Borrar</button></form>` : ''}</div>
        </div>`).join('');

    res.send(`
        <html>
        <head>
            <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family:sans-serif; background:#f0f2f5; margin:0; }
                nav { background:${color}; color:white; padding:15px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 10px rgba(0,0,0,0.1); }
                .tabs { display:flex; background:white; position:sticky; top:0; z-index:100; box-shadow:0 2px 5px rgba(0,0,0,0.05); }
                .tab { flex:1; text-align:center; padding:15px; cursor:pointer; font-weight:bold; color:#888; border-bottom:3px solid transparent; font-size:1.2em; }
                .tab.active { color:${color}; border-bottom-color:${color}; }
                .container { max-width:550px; margin:20px auto; padding:0 15px; }
                .section { display:none; } .section.active { display:block; }
                input, button, select, textarea { width:100%; padding:12px; margin-bottom:10px; border-radius:10px; border:1px solid #ddd; box-sizing:border-box; font-size:1em; }
                .avatar-nav { width:40px; height:40px; border-radius:50%; object-fit:cover; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.2); }
            </style>
        </head>
        <body>
            <nav>
                <div style="display:flex; align-items:center;"><img src="${userLog.avatar || 'https://via.placeholder.com/150'}" class="avatar-nav"><b style="margin-left:12px; font-size:1.1em;">${req.session.u}</b></div>
                <a href="/salir" style="color:white; text-decoration:none; font-weight:bold; font-size:0.9em; background:rgba(0,0,0,0.1); padding:8px 15px; border-radius:20px;">Salir</a>
            </nav>
            <div class="tabs">
                <div class="tab active" onclick="ver('apuntes', this)">📂</div>
                <div class="tab" onclick="ver('fechas', this)">📅</div>
                <div class="tab" onclick="ver('dudas', this)">❓</div>
                ${req.session.rol === 'admin' ? '<div class="tab" onclick="ver(\'admin\', this)">👑</div>' : ''}
                <div class="tab" onclick="ver('perfil', this)">⚙️</div>
            </div>
            <div class="container">
                <div id="sec-apuntes" class="section active">
                    <form action="/publicar" method="POST" enctype="multipart/form-data" style="background:white; padding:20px; border-radius:20px; box-shadow:0 4px 15px rgba(0,0,0,0.05); margin-bottom:25px;">
                        <input type="hidden" name="tipo" value="apunte">
                        <input name="titulo" placeholder="Nombre del archivo/tema" required>
                        <select name="asignatura">${asigOptions}</select>
                        <p style="font-size:0.8em; color:gray; margin-bottom:5px;">Sube tu archivo (PDF, Foto, Vídeo):</p>
                        <input type="file" name="archivo" required style="border:none; padding:0;">
                        <button style="background:${color}; color:white; border:none; font-weight:bold; padding:15px; font-size:1.1em; cursor:pointer;">📤 Publicar en la Clase</button>
                    </form>
                    ${renderPosts('apunte')}
                </div>

                <div id="sec-fechas" class="section">
                    <form action="/publicar" method="POST" style="background:white; padding:20px; border-radius:20px; margin-bottom:25px;">
                        <input type="hidden" name="tipo" value="fecha">
                        <input name="titulo" placeholder="¿Qué examen o entrega hay?" required>
                        <input type="date" name="fecha" required>
                        <button style="background:#e84393; color:white; border:none; font-weight:bold; padding:15px;">📌 Guardar Fecha</button>
                    </form>
                    ${renderPosts('fecha')}
                </div>

                <div id="sec-dudas" class="section">
                    <form action="/publicar" method="POST" style="background:white; padding:20px; border-radius:20px; margin-bottom:25px;">
                        <input type="hidden" name="tipo" value="duda">
                        <textarea name="titulo" placeholder="Escribe aquí tu duda para que te ayuden..." required style="height:100px;"></textarea>
                        <select name="asignatura">${asigOptions}</select>
                        <button style="background:#00b894; color:white; border:none; font-weight:bold; padding:15px;">❓ Lanzar Pregunta</button>
                    </form>
                    ${renderPosts('duda')}
                </div>

                <div id="sec-admin" class="section">
                    <div style="background:white; padding:25px; border-radius:20px; box-shadow:0 4px 15px rgba(0,0,0,0.05);">
                        <h3 style="margin-top:0;">👥 Control de Usuarios (${todosUsuarios.length}/40)</h3>
                        <div style="max-height:400px; overflow-y:auto;">
                            ${todosUsuarios.map(u => `<div style="padding:12px; border-bottom:1px solid #eee; display:flex; justify-content:space-between;"><b>${u.user}</b> <span style="font-size:0.8em; color:gray;">Rol: ${u.rol}</span></div>`).join('')}
                        </div>
                    </div>
                </div>

                <div id="sec-perfil" class="section">
                    <div style="background:white; padding:25px; border-radius:20px; box-shadow:0 4px 15px rgba(0,0,0,0.05);">
                        <h3 style="margin-top:0;">🎨 Personalización</h3>
                        <form action="/ajustes" method="POST" enctype="multipart/form-data">
                            <label style="display:block; margin-bottom:8px; font-weight:bold; color:#555;">Color del Aula:</label>
                            <select name="color">
                                <option value="#6c5ce7" ${color==='#6c5ce7'?'selected':''}>Morado</option>
                                <option value="#00b894" ${color==='#00b894'?'selected':''}>Verde Esmeralda</option>
                                <option value="#e84393" ${color==='#e84393'?'selected':''}>Rosa Intenso</option>
                                <option value="#0984e3" ${color==='#0984e3'?'selected':''}>Azul Eléctrico</option>
                                <option value="#2d3436" ${color==='#2d3436'?'selected':''}>Modo Oscuro</option>
                            </select>
                            <label style="display:block; margin:15px 0 8px 0; font-weight:bold; color:#555;">Nueva Foto de Perfil:</label>
                            <input type="file" name="avatar" accept="image/*" style="border:none; padding:0;">
                            <button style="background:${color}; color:white; border:none; font-weight:bold; margin-top:20px; padding:15px;">💾 Guardar Cambios</button>
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
                    window.scrollTo(0,0);
                }
            </script>
        </body>
        </html>`);
});

app.listen(PORT, () => console.log('Aula Virtual a toda potencia'));
