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
const Item = mongoose.model('Item', { 
    tipo: String, titulo: String, link: String, fecha: String, autor: String, timestamp: String 
});
const User = mongoose.model('User', { user: String, pass: String, rol: String });

app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secreto-clase-pro', resave: false, saveUninitialized: false }));

// --- 4. LÓGICA DE REGISTRO Y LOGIN (CON LÍMITE DE 40) ---
app.post('/auth', async (req, res) => {
    const { user, pass, pin, accion } = req.body;

    if (accion === 'registro') {
        const totalUsuarios = await User.countDocuments();
        
        // Cerrojo de seguridad para 40 usuarios
        if (totalUsuarios >= 40) {
            return res.send('<body style="font-family:sans-serif; text-align:center; padding-top:50px;"><h2 style="color:red;">❌ Límite de 40 usuarios alcanzado.</h2><a href="/">Volver</a></body>');
        }

        const rol = (pin === '1789') ? 'admin' : 'estudiante';
        await new User({ user, pass, rol }).save();
        return res.send('<body style="font-family:sans-serif; text-align:center; padding-top:50px;"><h2>Cuenta creada ✅</h2><a href="/">Volver a entrar</a></body>');
    }

    const u = await User.findOne({ user, pass });
    if (u) { 
        req.session.u = u.user; 
        req.session.rol = u.rol; 
        res.redirect('/'); 
    } else {
        res.send('Usuario o contraseña incorrectos. <a href="/">Volver</a>');
    }
});

// --- 5. LÓGICA DE PUBLICACIÓN (ARCHIVOS Y TEXTO) ---
app.post('/publicar', upload.single('archivo'), async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    
    let urlDestino = req.body.link || ""; 

    try {
        if (req.file) {
            const result = await new Promise((resolve, reject) => {
                let cld_upload_stream = cloudinary.uploader.upload_stream({ folder: "aula_virtual" }, (error, result) => {
                    if (result) resolve(result); else reject(error);
                });
                streamifier.createReadStream(req.file.buffer).pipe(cld_upload_stream);
            });
            urlDestino = result.secure_url;
        }

        await new Item({ 
            tipo: req.body.tipo, 
            titulo: req.body.titulo, 
            link: urlDestino, 
            fecha: req.body.fecha, 
            autor: req.session.u,
            timestamp: new Date().toLocaleString() 
        }).save();
        
        res.redirect('/');
    } catch (err) {
        res.send('Error al subir archivo. <a href="/">Volver</a>');
    }
});

app.post('/eliminar/:id', async (req, res) => {
    const post = await Item.findById(req.params.id);
    if (post && (post.autor === req.session.u || req.session.rol === 'admin')) {
        await Item.findByIdAndDelete(req.params.id);
    }
    res.redirect('/');
});

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });

// --- 6. INTERFAZ VISUAL "PRO" ---
app.get('/', async (req, res) => {
    if (!req.session.u) return res.send(`
        <body style="font-family:'Segoe UI',sans-serif; background:#6c5ce7; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
            <div style="background:white; padding:30px; border-radius:20px; width:300px; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
                <h2 style="color:#2d3436;">🎓 Aula Virtual</h2>
                <form action="/auth" method="POST">
                    <input name="user" placeholder="Usuario" style="width:100%; padding:12px; margin-bottom:10px; border-radius:8px; border:1px solid #ddd;" required>
                    <input name="pass" type="password" placeholder="Contraseña" style="width:100%; padding:12px; margin-bottom:10px; border-radius:8px; border:1px solid #ddd;" required>
                    <input name="pin" placeholder="PIN Admin (opcional)" style="width:100%; padding:12px; margin-bottom:15px; border-radius:8px; border:1px solid #ddd;">
                    <button name="accion" value="login" style="width:100%; background:#6c5ce7; color:white; padding:12px; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Entrar</button>
                    <button name="accion" value="registro" style="width:100%; background:none; border:none; color:#636e72; margin-top:15px; cursor:pointer;">Crear cuenta</button>
                </form>
            </div>
        </body>`);

    const todos = await Item.find();
    const htmlItems = (tipo, color) => todos.filter(i => i.tipo === tipo).reverse().map(i => `
        <div style="background:white; padding:15px; margin-bottom:12px; border-radius:12px; border-left:6px solid ${color}; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between;">
                <b>${i.titulo}</b>
                ${i.fecha ? `<span style="background:#ffeaa7; padding:2px 6px; border-radius:4px; font-size:0.8em;">${i.fecha}</span>` : ''}
            </div>
            ${i.link ? `<a href="${i.link}" target="_blank" style="color:#6c5ce7; text-decoration:none; display:block; margin-top:8px; font-weight:500;">📁 Ver Archivo / Link</a>` : ''}
            <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
                <small style="color:#888;">👤 ${i.autor}</small>
                ${(i.autor === req.session.u || req.session.rol === 'admin') ? 
                    `<form action="/eliminar/${i._id}" method="POST" style="margin:0;"><button style="background:#ff7675; color:white; border:none; padding:4px 8px; border-radius:5px; cursor:pointer; font-size:0.8em;">Borrar</button></form>` : ''}
            </div>
        </div>`).join('');

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Aula Virtual</title>
            <style>
                body { font-family:sans-serif; background:#f4f7f6; margin:0; }
                nav { background:#6c5ce7; color:white; padding:15px; display:flex; justify-content:space-between; align-items:center; }
                .tabs { display:flex; background:white; position:sticky; top:0; z-index:10; box-shadow:0 2px 5px rgba(0,0,0,0.1); }
                .tab { flex:1; text-align:center; padding:15px; cursor:pointer; font-weight:bold; color:#666; border-bottom:3px solid transparent; }
                .tab.active { color:#6c5ce7; border-bottom-color:#6c5ce7; }
                .container { max-width:500px; margin:20px auto; padding:0 15px; }
                .section { display:none; }
                .section.active { display:block; }
                .card-form { background:white; padding:15px; border-radius:12px; margin-bottom:20px; box-shadow:0 2px 10px rgba(0,0,0,0.05); }
                input, button, select { width:100%; padding:12px; margin-bottom:10px; border-radius:8px; border:1px solid #ddd; box-sizing:border-box; }
            </style>
        </head>
        <body>
            <nav><span><b>${req.session.u}</b></span> <a href="/salir" style="color:white; text-decoration:none;">Salir</a></nav>
            <div class="tabs">
                <div id="t-apuntes" class="tab active" onclick="ver('apuntes')">📂 Apuntes</div>
                <div id="t-fechas" class="tab" onclick="ver('fechas')">📅 Fechas</div>
                <div id="t-dudas" class="tab" onclick="ver('dudas')">❓ Dudas</div>
            </div>
            <div class="container">
                <div id="sec-apuntes" class="section active">
                    <div class="card-form">
                        <form action="/publicar" method="POST" enctype="multipart/form-data">
                            <input type="hidden" name="tipo" value="apunte">
                            <input name="titulo" placeholder="Nombre de la materia/tema" required>
                            <input type="file" name="archivo" style="border:none; padding:0;">
                            <input name="link" placeholder="O pega un link (OneDrive/Web)">
                            <button style="background:#6c5ce7; color:white; border:none; font-weight:bold;">Publicar</button>
                        </form>
                    </div>
                    ${htmlItems('apunte', '#6c5ce7')}
                </div>
                <div id="sec-fechas" class="section">
                    <div class="card-form">
                        <form action="/publicar" method="POST">
                            <input type="hidden" name="tipo" value="fecha">
                            <input name="titulo" placeholder="¿Qué examen o entrega hay?" required>
                            <input type="date" name="fecha" required>
                            <button style="background:#e84393; color:white; border:none; font-weight:bold;">Guardar Fecha</button>
                        </form>
                    </div>
                    ${htmlItems('fecha', '#e84393')}
                </div>
                <div id="sec-dudas" class="section">
                    <div class="card-form">
                        <form action="/publicar" method="POST">
                            <input type="hidden" name="tipo" value="duda">
                            <input name="titulo" placeholder="Escribe tu pregunta para la clase..." required>
                            <button style="background:#00b894; color:white; border:none; font-weight:bold;">Enviar Pregunta</button>
                        </form>
                    </div>
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

app.listen(PORT, () => console.log('¡Servidor en marcha!'));
