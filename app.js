const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const app = express();

const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN CLOUDINARY ---
cloudinary.config({ 
  cloud_name: 'dvlbsl16g', 
  api_key: '721617469253873', 
  api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' // <--- PON TU API SECRET AQUÍ
});

const upload = multer(); // Configuración para recibir archivos en memoria

// --- CONEXIÓN MONGODB ---
const MONGO_URI = "mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0"; // <--- PON TU LINK DE SIEMPRE
mongoose.connect(MONGO_URI).then(() => console.log("¡Conectado al mongolo!"));

// --- MODELO ---
const Item = mongoose.model('Item', { 
    tipo: String, titulo: String, link: String, fecha: String, autor: String, timestamp: String 
});
const User = mongoose.model('User', { user: String, pass: String, rol: String });

app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secreto-clase', resave: false, saveUninitialized: false }));

// --- LÓGICA DE SUBIDA A CLOUDINARY ---
app.post('/publicar', upload.single('archivo'), async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    
    let urlArchivo = req.body.link || ""; // Si no hay archivo, usamos el link de texto

    if (req.file) {
        // Si hay un archivo, lo subimos a Cloudinary
        const result = await new Promise((resolve, reject) => {
            let cld_upload_stream = cloudinary.uploader.upload_stream({ folder: "clase" }, (error, result) => {
                if (result) resolve(result); else reject(error);
            });
            streamifier.createReadStream(req.file.buffer).pipe(cld_upload_stream);
        });
        urlArchivo = result.secure_url;
    }

    await new Item({ 
        tipo: req.body.tipo, 
        titulo: req.body.titulo, 
        link: urlArchivo, 
        fecha: req.body.fecha, 
        autor: req.session.u,
        timestamp: new Date().toLocaleString() 
    }).save();
    
    res.redirect('/');
});

// --- RUTAS DE SIEMPRE (Auth y Eliminar) ---
app.post('/auth', async (req, res) => {
    const { user, pass, pin, accion } = req.body;
    if (accion === 'registro') {
        const rol = (pin === '1789') ? 'admin' : 'estudiante';
        await new User({ user, pass, rol }).save();
        return res.send('Cuenta creada. <a href="/">Volver</a>');
    }
    const u = await User.findOne({ user, pass });
    if (u) { req.session.u = u.user; req.session.rol = u.rol; res.redirect('/'); }
    else res.send('Error. <a href="/">Volver</a>');
});

app.post('/eliminar/:id', async (req, res) => {
    const post = await Item.findById(req.params.id);
    if (post && (post.autor === req.session.u || req.session.rol === 'admin')) {
        await Item.findByIdAndDelete(req.params.id);
    }
    res.redirect('/');
});

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });

// --- INTERFAZ ACTUALIZADA ---
app.get('/', async (req, res) => {
    if (!req.session.u) return res.send(`
        <body style="font-family:sans-serif; background:#6c5ce7; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
            <div style="background:white; padding:30px; border-radius:20px; width:300px; text-align:center;">
                <h2>🎓 Aula Virtual</h2>
                <form action="/auth" method="POST">
                    <input name="user" placeholder="Usuario" style="width:100%; padding:10px; margin-bottom:10px;" required>
                    <input name="pass" type="password" placeholder="Contraseña" style="width:100%; padding:10px; margin-bottom:10px;" required>
                    <input name="pin" placeholder="PIN Admin (opcional)" style="width:100%; padding:10px; margin-bottom:15px;">
                    <button name="accion" value="login" style="width:100%; background:#6c5ce7; color:white; padding:10px; border:none; border-radius:5px; cursor:pointer;">Entrar</button>
                    <button name="accion" value="registro" style="width:100%; background:none; border:none; color:#666; margin-top:10px; cursor:pointer;">Crear cuenta</button>
                </form>
            </div>
        </body>`);

    const todos = await Item.find();
    const htmlItems = (tipo, color) => todos.filter(i => i.tipo === tipo).reverse().map(i => `
        <div style="background:white; padding:15px; margin-bottom:10px; border-radius:12px; border-left:6px solid ${color}; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
            <b>${i.titulo}</b> ${i.fecha ? `<small style="float:right;">📅 ${i.fecha}</small>` : ''} <br>
            ${i.link ? `<a href="${i.link}" target="_blank" style="color:#6c5ce7; text-decoration:none; display:block; margin-top:5px;">📁 Ver Archivo/Link</a>` : ''}
            <div style="margin-top:10px; font-size:0.8em; color:#888;">
                Por: ${i.autor}
                ${(i.autor === req.session.u || req.session.rol === 'admin') ? `<form action="/eliminar/${i._id}" method="POST" style="display:inline; float:right;"><button style="background:red; color:white; border:none; padding:2px 5px; border-radius:3px; cursor:pointer;">Borrar</button></form>` : ''}
            </div>
        </div>`).join('');

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Aula Virtual Pro</title>
            <style>
                body { font-family:sans-serif; background:#f4f7f6; margin:0; }
                nav { background:#6c5ce7; color:white; padding:15px; display:flex; justify-content:space-between; }
                .tabs { display:flex; background:white; }
                .tab { flex:1; text-align:center; padding:15px; cursor:pointer; font-weight:bold; color:#666; border-bottom:3px solid transparent; }
                .tab.active { color:#6c5ce7; border-bottom-color:#6c5ce7; }
                .container { max-width:500px; margin:20px auto; padding:0 15px; }
                .section { display:none; }
                .section.active { display:block; }
                input, button, select { width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:1px solid #ddd; box-sizing:border-box; }
            </style>
        </head>
        <body>
            <nav><b>${req.session.u}</b> <a href="/salir" style="color:white; text-decoration:none;">Salir</a></nav>
            <div class="tabs">
                <div id="t-apuntes" class="tab active" onclick="ver('apuntes')">📂 Apuntes</div>
                <div id="t-fechas" class="tab" onclick="ver('fechas')">📅 Fechas</div>
                <div id="t-dudas" class="tab" onclick="ver('dudas')">❓ Dudas</div>
            </div>
            <div class="container">
                <div id="sec-apuntes" class="section active">
                    <form action="/publicar" method="POST" enctype="multipart/form-data" style="background:white; padding:15px; border-radius:10px; margin-bottom:20px;">
                        <input type="hidden" name="tipo" value="apunte">
                        <input name="titulo" placeholder="Título del apunte" required>
                        <p style="font-size:0.8em; margin:0 0 5px 0; color:#666;">Sube un archivo (PDF, Foto...):</p>
                        <input type="file" name="archivo" accept="image/*,application/pdf">
                        <input name="link" placeholder="O pega un link de OneDrive">
                        <button style="background:#6c5ce7; color:white; border:none; font-weight:bold;">Publicar</button>
                    </form>
                    ${htmlItems('apunte', '#6c5ce7')}
                </div>
                <div id="sec-fechas" class="section">
                    <form action="/publicar" method="POST" style="background:white; padding:15px; border-radius:10px; margin-bottom:20px;">
                        <input type="hidden" name="tipo" value="fecha">
                        <input name="titulo" placeholder="¿Qué examen hay?" required>
                        <input type="date" name="fecha" required>
                        <button style="background:#e84393; color:white; border:none; font-weight:bold;">Guardar</button>
                    </form>
                    ${htmlItems('fecha', '#e84393')}
                </div>
                <div id="sec-dudas" class="section">
                    <form action="/publicar" method="POST" style="background:white; padding:15px; border-radius:10px; margin-bottom:20px;">
                        <input type="hidden" name="tipo" value="duda">
                        <input name="titulo" placeholder="Tu pregunta..." required>
                        <button style="background:#00b894; color:white; border:none; font-weight:bold;">Preguntar</button>
                    </form>
                    ${htmlItems('duda', '#00b894')}
                </div>
            </div>
            <script>
                function ver(id) {
                    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.getElementById('sec-' + id).classList.add('active');
                    document.getElementById('t-' + id).classList.add('active');
                }
            </script>
        </body>
        </html>`);
});

app.listen(PORT, () => console.log('Web lista'));
