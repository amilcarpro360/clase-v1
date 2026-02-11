const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');

const app = express();
const PORT = process.env.PORT || 10000; // Render usa el 10000 por defecto

// 1. CONFIGURACIÓN
cloudinary.config({ 
    cloud_name: 'dvlbsl16g', api_key: '721617469253873', api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});
const upload = multer();

mongoose.connect('mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0');

const User = mongoose.model('User', { 
    user: String, pass: String, rol: String, 
    baneadoHasta: Date,
    historialReacciones: { type: Map, of: String, default: {} } 
});
const Post = mongoose.model('Post', { titulo: String, imagen: String, autor: String, likes: { type: Number, default: 0 }, fecha: { type: Date, default: Date.now } });
const Config = mongoose.model('Config', { logoUrl: String });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'render-secret-key', resave: false, saveUninitialized: false }));

// --- PETICIÓN 8: HORARIO (Vie 18h a Lun 08h) ---
app.use((req, res, next) => {
    const ahora = new Date();
    const dia = ahora.getDay(); 
    const hora = ahora.getHours();
    const bloqueo = (dia === 5 && hora >= 18) || (dia === 6) || (dia === 0) || (dia === 1 && hora < 8);
    
    if (bloqueo && req.path === '/publicar' && req.method === 'POST') {
        return res.send("<h1>🔒 Sistema cerrado por fin de semana</h1>");
    }
    next();
});

// --- PETICIÓN 1, 2 y 4: SUBIR Y NOTIFICAR ---
app.post('/publicar', upload.single('archivo'), async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    let img = '';
    if (req.file) {
        const r = await new Promise((res) => {
            const s = cloudinary.uploader.upload_stream({ folder: 'render_clase' }, (err, result) => res(result));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        img = r.secure_url;
    }
    await new Post({ titulo: req.body.titulo, imagen: img, autor: req.session.u }).save();
    console.log("🔔 Notificación: Nuevo post en Render");
    res.redirect('/');
});

// --- PETICIÓN 5: REACCIÓN 1 VEZ AL DÍA ---
app.post('/like/:id', async (req, res) => {
    const u = await User.findOne({ user: req.session.u });
    const hoy = new Date().toDateString();
    if (u.historialReacciones.get(req.params.id) === hoy) {
        return res.send("<script>alert('Ya votaste hoy'); window.location='/';</script>");
    }
    await Post.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } });
    u.historialReacciones.set(req.params.id, hoy);
    await u.save();
    res.redirect('/');
});

// --- PETICIÓN 3, 6 y 7: ADMIN ---
app.post('/admin', async (req, res) => {
    if (req.session.rol !== 'admin') return res.redirect('/');
    const { accion, id, val } = req.body;
    if (accion === 'logo') await Config.findOneAndUpdate({}, { logoUrl: val }, { upsert: true });
    if (accion === 'ban') {
        let d = new Date(); d.setHours(d.getHours() + parseInt(val));
        await User.findByIdAndUpdate(id, { baneadoHasta: d });
    }
    if (accion === 'del') await User.findByIdAndDelete(id);
    res.redirect('/');
});

// --- VISTA Y LOGIN ---
app.get('/', async (req, res) => {
    const c = await Config.findOne() || { logoUrl: 'https://cdn-icons-png.flaticon.com/512/3449/3449692.png' };
    if (!req.session.u) return res.send(`
        <body style="text-align:center; font-family:sans-serif; background:#f0f0f0; padding-top:50px;">
            <img src="${c.logoUrl}" width="80">
            <h2>Aula Virtual (Render)</h2>
            <form action="/auth" method="POST">
                <input name="user" placeholder="Usuario"><br>
                <input name="pass" type="password" placeholder="Pass"><br>
                <input name="pin" placeholder="PIN Admin"><br>
                <button name="m" value="in">Entrar</button> <button name="m" value="reg">Registrar</button>
            </form>
        </body>`);

    const posts = await Post.find().sort({ fecha: -1 });
    const users = req.session.rol === 'admin' ? await User.find() : [];
    res.send(`
        <body style="font-family:sans-serif; margin:0; background:#fafafa;">
            <nav style="background:#000; color:white; padding:15px; display:flex; justify-content:space-between;">
                <span><img src="${c.logoUrl}" width="25"> <b>${req.session.u}</b></span>
                <a href="/salir" style="color:white;">Cerrar Sesión</a>
            </nav>
            <div style="max-width:600px; margin:auto; padding:20px;">
                <form action="/publicar" method="POST" enctype="multipart/form-data" style="background:white; padding:15px; border-radius:8px; border:1px solid #ddd;">
                    <textarea name="titulo" style="width:100%" placeholder="Escribe tu duda..."></textarea><br><br>
                    <input type="file" name="archivo"><br><br>
                    <button style="background:#000; color:white; border:none; padding:10px 20px; border-radius:5px;">Publicar</button>
                </form>
                ${posts.map(p => `
                    <div style="background:white; padding:15px; margin-top:15px; border-radius:8px; border:1px solid #ddd;">
                        <b>${p.autor}</b> <small>${p.fecha.toLocaleString()}</small>
                        <p>${p.titulo}</p>
                        ${p.imagen ? `<img src="${p.imagen}" style="width:100%; border-radius:5px;">`:''}
                        <form action="/like/${p._id}" method="POST" style="margin-top:10px;">
                            <button style="background:#eee; border:none; padding:5px 10px; border-radius:15px; cursor:pointer;">💡 Útil (${p.likes})</button>
                        </form>
                    </div>`).join('')}
                ${req.session.rol === 'admin' ? `
                    <div style="background:#f9f9f9; padding:20px; border:2px dashed #ccc; margin-top:40px;">
                        <h3>Panel Administrador</h3>
                        <form action="/admin" method="POST"><input name="val" placeholder="URL Logo"><button name="accion" value="logo">Cambiar Logo</button></form>
                        <hr>
                        ${users.map(u => `<div>${u.user} <form action="/admin" method="POST" style="display:inline;"><input type="hidden" name="id" value="${u._id}"><input name="val" placeholder="H" style="width:30px;"><button name="accion" value="ban">Ban</button><button name="accion" value="del">X</button></form></div>`).join('')}
                    </div>` : ''}
            </div>
        </body>`);
});

app.post('/auth', async (req, res) => {
    const { user, pass, pin, m } = req.body;
    if (m === 'reg') {
        await new User({ user, pass, rol: (pin === '2845' ? 'admin' : 'estudiante') }).save();
        return res.send("Registrado. <a href='/'>Login</a>");
    }
    const u = await User.findOne({ user, pass });
    if (u && (!u.baneadoHasta || u.baneadoHasta < new Date())) {
        req.session.u = u.user; req.session.rol = u.rol; res.redirect('/');
    } else res.send("Error de acceso.");
});

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.listen(PORT, () => console.log('Render listo'));
