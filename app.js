const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const webpush = require('web-push');

const app = express();
const PORT = process.env.PORT || 8080;

// ==========================================
// 1. CONFIGURACIÓN DE APIS Y SERVICIOS
// ==========================================
cloudinary.config({ 
    cloud_name: 'dvlbsl16g', 
    api_key: '721617469253873', 
    api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});

const upload = multer();

// ==========================================
// 2. MODELOS DE BASE DE DATOS (MongoDB)
// ==========================================
mongoose.connect('mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0');

const User = mongoose.model('User', { 
    user: String, 
    pass: String, 
    rol: { type: String, default: 'estudiante' },
    baneadoHasta: { type: Date, default: null },
    reaccionesHoy: { type: Map, of: String, default: {} } 
});

const Post = mongoose.model('Post', { 
    titulo: String, 
    imagenUrl: String, 
    autor: String, 
    fecha: { type: Date, default: Date.now },
    likes: { type: Number, default: 0 }
});

const GlobalConfig = mongoose.model('GlobalConfig', { logoUrl: String });

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secreto-clase-2026', resave: false, saveUninitialized: false }));

// ==========================================
// 3. LÓGICA DE LAS 8 PETICIONES
// ==========================================

// PETICIÓN 8: Control Horario (Viernes 18h a Lunes 08h)
const middlewareHorario = (req, res, next) => {
    const ahora = new Date();
    const dia = ahora.getDay(); 
    const hora = ahora.getHours();
    
    // Bloqueo: Viernes(5) tarde, Sábado(6), Domingo(0), Lunes(1) mañana
    const cerrado = (dia === 5 && hora >= 18) || (dia === 6) || (dia === 0) || (dia === 1 && hora < 8);
    
    if (cerrado && req.path === '/publicar' && req.method === 'POST') {
        return res.status(403).send("<h1>🔒 Horario Cerrado</h1><p>El aula abre los lunes a las 8:00 AM.</p>");
    }
    next();
};

app.use(middlewareHorario);

// PETICIÓN 1, 2 y 4: Publicar con Foto y Notificar
app.post('/publicar', upload.single('archivo'), async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    
    let img = "";
    if (req.file) {
        const result = await new Promise((resolve) => {
            const stream = cloudinary.uploader.upload_stream({ folder: 'aula' }, (err, res) => resolve(res));
            streamifier.createReadStream(req.file.buffer).pipe(stream);
        });
        img = result.secure_url;
    }

    await new Post({ titulo: req.body.titulo, imagenUrl: img, autor: req.session.u }).save();
    console.log("📢 Notificación enviada a la clase"); // Simulación de Notificación
    res.redirect('/');
});

// PETICIÓN 5: Reacción Limitada (1 al día por post)
app.post('/like/:id', async (req, res) => {
    const user = await User.findOne({ user: req.session.u });
    const hoy = new Date().toDateString();
    
    if (user.reaccionesHoy.get(req.params.id) === hoy) {
        return res.send("<script>alert('Ya reaccionaste hoy a esto'); window.location='/';</script>");
    }

    await Post.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } });
    user.reaccionesHoy.set(req.params.id, hoy);
    await user.save();
    res.redirect('/');
});

// PETICIÓN 3, 6 y 7: Panel Admin (Logo, Borrar y Banear)
app.post('/admin/action', async (req, res) => {
    if (req.session.rol !== 'admin') return res.redirect('/');

    const { accion, targetId, extra } = req.body;

    if (accion === 'cambiarLogo') {
        await GlobalConfig.findOneAndUpdate({}, { logoUrl: extra }, { upsert: true });
    } else if (accion === 'banear') {
        let fin = new Date();
        fin.setHours(fin.getHours() + parseInt(extra));
        await User.findByIdAndUpdate(targetId, { baneadoHasta: fin });
    } else if (accion === 'eliminar') {
        await User.findByIdAndDelete(targetId);
    }
    res.redirect('/');
});

// ==========================================
// 4. RUTAS DE VISTA (Interfaz)
// ==========================================

app.get('/', async (req, res) => {
    const config = await GlobalConfig.findOne() || { logoUrl: 'https://cdn-icons-png.flaticon.com/512/3449/3449692.png' };
    
    if (!req.session.u) {
        return res.send(`
            <body style="font-family:sans-serif; text-align:center; background:#f4f4f4;">
                <img src="${config.logoUrl}" width="120">
                <h2>Acceso Aula Virtual</h2>
                <form action="/login" method="POST" style="display:inline-block; background:white; padding:20px; border-radius:10px;">
                    <input name="user" placeholder="Usuario" required><br><br>
                    <input name="pass" type="password" placeholder="Clave" required><br><br>
                    <input name="pin" placeholder="PIN Admin (opcional)"><br><br>
                    <button name="tipo" value="in">Entrar</button>
                    <button name="tipo" value="reg">Registrarse</button>
                </form>
            </body>
        `);
    }

    const posts = await Post.find().sort({ fecha: -1 });
    const usuarios = req.session.rol === 'admin' ? await User.find() : [];

    res.send(`
        <body style="font-family:sans-serif; margin:0; background:#eee;">
            <nav style="background:#2c3e50; color:white; padding:15px; display:flex; justify-content:space-between;">
                <span><img src="${config.logoUrl}" width="30"> Bienvenido, ${req.session.u}</span>
                <a href="/logout" style="color:white;">Salir</a>
            </nav>
            <div style="max-width:800px; margin:20px auto;">
                <form action="/publicar" method="POST" enctype="multipart/form-data" style="background:white; padding:20px; border-radius:10px;">
                    <textarea name="titulo" placeholder="Escribe tu duda..." style="width:100%;" required></textarea><br>
                    <input type="file" name="archivo"><br><br>
                    <button style="width:100%; background:#27ae60; color:white; border:none; padding:10px;">Publicar Dudas</button>
                </form>

                ${posts.map(p => `
                    <div style="background:white; padding:15px; margin-top:15px; border-radius:10px;">
                        <b>${p.autor}</b> <small>${p.fecha.toLocaleString()}</small>
                        <p>${p.titulo}</p>
                        ${p.imagenUrl ? `<img src="${p.imagenUrl}" style="width:100%;">` : ''}
                        <form action="/like/${p._id}" method="POST">
                            <button>💡 Es útil (${p.likes})</button>
                        </form>
                    </div>
                `).join('')}

                ${req.session.rol === 'admin' ? `
                    <div style="background:#34495e; color:white; padding:20px; margin-top:40px; border-radius:10px;">
                        <h3>🛠️ Configuración de Administrador</h3>
                        <form action="/admin/action" method="POST">
                            <input name="extra" placeholder="URL del nuevo logo">
                            <button name="accion" value="cambiarLogo">Actualizar Logo</button>
                        </form>
                        <hr>
                        <h4>Usuarios en el sistema:</h4>
                        ${usuarios.map(u => `
                            <div style="margin-bottom:10px;">
                                ${u.user} (${u.rol})
                                <form action="/admin/action" method="POST" style="display:inline;">
                                    <input type="hidden" name="targetId" value="${u._id}">
                                    <input name="extra" placeholder="Horas Ban" style="width:60px;">
                                    <button name="accion" value="banear">Ban</button>
                                    <button name="accion" value="eliminar" style="color:red;">X</button>
                                </form>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        </body>
    `);
});

// Autenticación básica
app.post('/login', async (req, res) => {
    const { user, pass, pin, tipo } = req.body;
    if (tipo === 'reg') {
        const rol = (pin === '2845') ? 'admin' : 'estudiante';
        await new User({ user, pass, rol }).save();
        return res.send("Registrado. <a href='/'>Volver</a>");
    }
    const u = await User.findOne({ user, pass });
    if (u && (!u.baneadoHasta || u.baneadoHasta < new Date())) {
        req.session.u = u.user; req.session.rol = u.rol; res.redirect('/');
    } else {
        res.send("Baneado o datos mal. <a href='/'>Volver</a>");
    }
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(PORT, '0.0.0.0', () => console.log('Aula Virtual Activa en ' + PORT));
