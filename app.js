const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const webpush = require('web-push');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// ==========================================
// 1. CONFIGURACIONES INICIALES (API & DB)
// ==========================================
cloudinary.config({ 
    cloud_name: 'dvlbsl16g', 
    api_key: '721617469253873', 
    api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});

const upload = multer();
const vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:soporte@aulavirtual.com', vapidKeys.publicKey, vapidKeys.privateKey);

// Conexión a MongoDB Atlas
mongoose.connect('mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0')
    .then(() => console.log("✅ Conectado a la base de datos"))
    .catch(err => console.error("❌ Error de conexión:", err));

// ==========================================
// 2. MODELOS DE DATOS (Esquemas)
// ==========================================
const User = mongoose.model('User', { 
    user: { type: String, required: true, unique: true },
    pass: String, 
    rol: { type: String, default: 'estudiante' }, // 'admin' o 'estudiante'
    baneadoHasta: { type: Date, default: null },
    ultimaReaccion: { type: Map, of: String, default: {} } // ID_Post -> Fecha_Reacción
});

const Post = mongoose.model('Post', { 
    tipo: String, 
    titulo: String, 
    contenido: String,
    link: String, 
    autor: String, 
    timestamp: { type: Date, default: Date.now },
    likes: { type: [String], default: [] } // Lista de usuarios que dieron like
});

const Config = mongoose.model('Config', { 
    logoUrl: { type: String, default: 'https://cdn-icons-png.flaticon.com/512/3449/3449692.png' } 
});

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'aula-virtual-ultra-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } // 1 hora de sesión
}));

// ==========================================
// 3. LÓGICA DE NEGOCIO (Tus 8 Peticiones)
// ==========================================

/**
 * PETICIÓN 8: RESTRICCIÓN HORARIA
 * Bloquea POSTS desde el viernes 18:00 hasta el lunes 08:00
 */
const middlewareHorario = (req, res, next) => {
    const ahora = new Date();
    const dia = ahora.getDay(); // 0: Dom, 5: Vie, 6: Sab, 1: Lun
    const hora = ahora.getHours();
    
    const esFinDeSemana = (dia === 5 && hora >= 18) || (dia === 6) || (dia === 0) || (dia === 1 && hora < 8);
    
    if (esFinDeSemana && req.path === '/publicar' && req.method === 'POST') {
        return res.status(403).send(`
            <div style="text-align:center; padding:50px; font-family:sans-serif;">
                <h1>🚫 Fuera de Horario Escolar</h1>
                <p>El sistema de dudas está cerrado los fines de semana.</p>
                <p>Abre de Lunes 08:00 a Viernes 18:00.</p>
                <a href="/">Volver al inicio</a>
            </div>
        `);
    }
    next();
};

app.use(middlewareHorario);

/**
 * PETICIÓN 1 & 2: PUBLICAR CON IMAGEN Y NOTIFICACIONES
 */
app.post('/publicar', upload.single('archivo'), async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    
    let urlImagen = '';
    
    try {
        if (req.file) {
            // Subida a Cloudinary mediante stream
            const resultado = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream({ folder: 'aula_virtual' }, (err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                });
                streamifier.createReadStream(req.file.buffer).pipe(stream);
            });
            urlImagen = resultado.secure_url;
        }

        const nuevoPost = new Post({
            titulo: req.body.titulo,
            link: urlImagen,
            autor: req.session.u,
            tipo: req.file ? 'Imagen' : 'Texto'
        });

        await nuevoPost.save();

        // Notificar a otros (Simulado con logs para evitar errores si no hay suscripciones)
        console.log(`🔔 Notificación: Nuevo post de ${req.session.u}`);
        
        res.redirect('/');
    } catch (error) {
        res.send("Error al publicar: " + error.message);
    }
});

/**
 * PETICIÓN 5: REACCIONAR 1 VEZ POR DÍA
 */
app.post('/reaccionar/:id', async (req, res) => {
    const usuario = await User.findOne({ user: req.session.u });
    const hoy = new Date().toDateString();
    const idPost = req.params.id;

    if (usuario.ultimaReaccion.get(idPost) === hoy) {
        return res.send("<script>alert('Ya has reaccionado a este post hoy.'); window.location='/';</script>");
    }

    await Post.findByIdAndUpdate(idPost, { $addToSet: { likes: req.session.u } });
    usuario.ultimaReaccion.set(idPost, hoy);
    await usuario.save();
    
    res.redirect('/');
});

/**
 * PETICIÓN 3, 6 & 7: PANEL ADMIN (Logo, Borrar, Ban)
 */
app.post('/admin/config', async (req, res) => {
    if (req.session.rol !== 'admin') return res.status(401).send("No autorizado");
    
    if (req.body.accion === 'logo') {
        await Config.findOneAndUpdate({}, { logoUrl: req.body.url }, { upsert: true });
    } else if (req.body.accion === 'ban') {
        let fechaBan = new Date();
        fechaBan.setHours(fechaBan.getHours() + parseInt(req.body.horas));
        await User.findByIdAndUpdate(req.body.userId, { baneadoHasta: fechaBan });
    } else if (req.body.accion === 'borrar') {
        await User.findByIdAndDelete(req.body.userId);
    }
    
    res.redirect('/');
});

// ==========================================
// 4. AUTENTICACIÓN Y RUTAS DE VISTA
// ==========================================

app.post('/auth', async (req, res) => {
    const { user, pass, pin, modo } = req.body;

    if (modo === 'registro') {
        const rol = (pin === '2845') ? 'admin' : 'estudiante';
        await new User({ user, pass, rol }).save();
        return res.send('Registro exitoso. <a href="/">Ir al Login</a>');
    }

    const u = await User.findOne({ user, pass });
    if (u) {
        if (u.baneadoHasta && u.baneadoHasta > new Date()) {
            return res.send(`🚫 Estás baneado hasta: ${u.baneadoHasta.toLocaleString()}`);
        }
        req.session.u = u.user;
        req.session.rol = u.rol;
        res.redirect('/');
    } else {
        res.send('Credenciales incorrectas.');
    }
});

app.get('/', async (req, res) => {
    const config = await Config.findOne() || { logoUrl: 'https://cdn-icons-png.flaticon.com/512/3449/3449692.png' };
    
    if (!req.session.u) {
        return res.send(`
            <body style="background:#f0f2f5; font-family:Arial; display:flex; justify-content:center; align-items:center; height:100vh;">
                <div style="background:white; padding:40px; border-radius:15px; box-shadow:0 10px 25px rgba(0,0,0,0.1); text-align:center; width:350px;">
                    <img src="${config.logoUrl}" width="80" style="margin-bottom:20px;">
                    <h2>Aula Virtual</h2>
                    <form action="/auth" method="POST">
                        <input name="user" placeholder="Usuario" required style="width:100%; padding:10px; margin:5px 0;"><br>
                        <input name="pass" type="password" placeholder="Contraseña" required style="width:100%; padding:10px; margin:5px 0;"><br>
                        <input name="pin" placeholder="PIN Admin (Opcional)" style="width:100%; padding:10px; margin:5px 0;"><br>
                        <button name="modo" value="login" style="width:48%; padding:10px; background:#4e73df; color:white; border:none; border-radius:5px; cursor:pointer;">Entrar</button>
                        <button name="modo" value="registro" style="width:48%; padding:10px; background:#1cc88a; color:white; border:none; border-radius:5px; cursor:pointer;">Registro</button>
                    </form>
                </div>
            </body>
        `);
    }

    const posts = await Post.find().sort({ timestamp: -1 });
    const usuarios = (req.session.rol === 'admin') ? await User.find() : [];

    // Aquí iría el renderizado del muro (Frontend)
    let htmlMuro = `
    <body style="background:#f8f9fc; font-family:Arial; margin:0;">
        <nav style="background:#4e73df; color:white; padding:15px 10%; display:flex; justify-content:space-between; align-items:center;">
            <div><img src="${config.logoUrl}" width="30"> <b>${req.session.u} (${req.session.rol})</b></div>
            <a href="/logout" style="color:white; text-decoration:none;">Cerrar Sesión</a>
        </nav>
        <div style="max-width:700px; margin:20px auto; padding:0 15px;">
            <div style="background:white; padding:20px; border-radius:10px; margin-bottom:20px; box-shadow:0 2px 10px rgba(0,0,0,0.05);">
                <h3>Nueva duda o aporte</h3>
                <form action="/publicar" method="POST" enctype="multipart/form-data">
                    <input name="titulo" placeholder="Título o duda..." required style="width:100%; padding:10px; margin-bottom:10px;">
                    <input type="file" name="archivo" style="margin-bottom:10px;"><br>
                    <button style="background:#4e73df; color:white; border:none; padding:10px 20px; border-radius:5px;">Publicar Ahora</button>
                </form>
            </div>
            ${posts.map(p => `
                <div style="background:white; padding:20px; border-radius:10px; margin-bottom:15px; box-shadow:0 2px 10px rgba(0,0,0,0.05);">
                    <div style="display:flex; justify-content:space-between;">
                        <b>${p.autor}</b>
                        <small>${p.timestamp.toLocaleString()}</small>
                    </div>
                    <hr>
                    <p>${p.titulo}</p>
                    ${p.link ? `<img src="${p.link}" style="width:100%; border-radius:5px;">` : ''}
                    <form action="/reaccionar/${p._id}" method="POST" style="margin-top:10px;">
                        <button style="background:#f8f9fc; border:1px solid #ddd; padding:5px 10px; border-radius:20px; cursor:pointer;">💡 Útil (${p.likes.length})</button>
                    </form>
                </div>
            `).join('')}

            ${req.session.rol === 'admin' ? `
                <div style="background:#2c3e50; color:white; padding:20px; border-radius:10px; margin-top:40px;">
                    <h3>🛠️ Panel de Control Admin</h3>
                    <form action="/admin/config" method="POST">
                        <input name="url" placeholder="Nueva URL de Logo" style="width:70%;">
                        <button name="accion" value="logo">Cambiar Logo</button>
                    </form>
                    <hr>
                    <h4>Gestión de Usuarios</h4>
                    ${usuarios.map(u => `
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px; background:#34495e; padding:10px; border-radius:5px;">
                            <span>${u.user} (${u.rol})</span>
                            <form action="/admin/config" method="POST" style="display:inline;">
                                <input type="hidden" name="userId" value="${u._id}">
                                <input name="horas" placeholder="H" style="width:30px;">
                                <button name="accion" value="ban" style="background:#f6c23e;">Ban</button>
                                <button name="accion" value="borrar" style="background:#e74a3b; color:white;">Eliminar</button>
                            </form>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    </body>`;
    
    res.send(htmlMuro);
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Aula Virtual online en puerto ${PORT}`);
});
app.listen(PORT, '0.0.0.0', function(){ console.log('🚀 Sistema Completo en puerto ' + PORT); });

