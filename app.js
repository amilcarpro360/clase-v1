const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');

const app = express();
const PORT = process.env.PORT || 10000;

// 1. CONFIGURACIÓN DE APIS (Cloudinary)
cloudinary.config({ 
    cloud_name: 'dvlbsl16g', api_key: '721617469253873', api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});
const upload = multer();

// 2. CONEXIÓN A MONGO (Asegúrate de que tu IP esté permitida en MongoDB Atlas)
mongoose.connect('mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0')
    .then(() => console.log("🔥 Base de datos conectada"))
    .catch(err => console.log("❌ Error DB:", err));

// 3. MODELOS DE DATOS
const User = mongoose.model('User', { 
    user: String, pass: String, rol: String, baneadoHasta: Date,
    historialLikes: { type: Map, of: String, default: {} } 
});
const Post = mongoose.model('Post', { titulo: String, imagen: String, autor: String, likes: { type: Number, default: 0 }, fecha: { type: Date, default: Date.now } });
const Config = mongoose.model('Config', { logoUrl: String });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secreto-maximo-2026', resave: false, saveUninitialized: false }));

// --- PETICIÓN 8: CONTROL HORARIO ---
app.use((req, res, next) => {
    const ahora = new Date();
    const dia = ahora.getDay(); 
    const hora = ahora.getHours();
    // Bloqueo: Viernes 18h a Lunes 08h
    const cerrado = (dia === 5 && hora >= 18) || (dia === 6) || (dia === 0) || (dia === 1 && hora < 8);
    if (cerrado && req.path === '/publicar' && req.method === 'POST') {
        return res.send("<script>alert('🔒 Fuera de horario escolar (Vie 18h - Lun 08h)'); window.location='/';</script>");
    }
    next();
});

// --- RUTAS DE ACCIÓN ---
app.post('/publicar', upload.single('archivo'), async (req, res) => {
    let url = '';
    if (req.file) {
        const r = await new Promise((rs) => {
            const s = cloudinary.uploader.upload_stream({ folder: 'aula' }, (err, resu) => rs(resu));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        url = r.secure_url;
    }
    await new Post({ titulo: req.body.titulo, imagen: url, autor: req.session.u }).save();
    console.log(`🔔 NOTIFICACIÓN: ${req.session.u} ha publicado una duda.`); // PETICIÓN 2
    res.redirect('/');
});

app.post('/like/:id', async (req, res) => {
    const u = await User.findOne({ user: req.session.u });
    const hoy = new Date().toDateString();
    if (u.historialLikes.get(req.params.id) === hoy) return res.send("<script>alert('Ya votaste hoy'); window.location='/';</script>");
    await Post.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } });
    u.historialLikes.set(req.params.id, hoy); // PETICIÓN 5
    await u.save();
    res.redirect('/');
});

app.post('/admin/cmd', async (req, res) => {
    if (req.session.rol !== 'admin') return res.redirect('/');
    const { accion, id, val } = req.body;
    if (accion === 'logo') await Config.findOneAndUpdate({}, { logoUrl: val }, { upsert: true }); // PETICIÓN 3
    if (accion === 'ban') { // PETICIÓN 7
        let d = new Date(); d.setHours(d.getHours() + parseInt(val));
        await User.findByIdAndUpdate(id, { baneadoHasta: d });
    }
    if (accion === 'del') await User.findByIdAndDelete(id); // PETICIÓN 6
    res.redirect('/');
});

// --- INTERFAZ VISUAL (DISEÑO CURRADO) ---
app.get('/', async (req, res) => {
    const conf = await Config.findOne() || { logoUrl: 'https://cdn-icons-png.flaticon.com/512/3449/3449692.png' };
    
    const htmlHead = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Aula Virtual 2026</title>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap" rel="stylesheet">
        <style>
            :root { --grad: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
            body { margin: 0; font-family: 'Poppins', sans-serif; background: var(--grad); min-height: 100vh; color: #333; }
            
            /* Navbar */
            .nav { background: rgba(255,255,255,0.15); backdrop-filter: blur(15px); padding: 15px 8%; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.2); color: white; position: sticky; top: 0; z-index: 100; }
            .nav b { font-size: 1.2rem; display: flex; align-items: center; }
            .nav img { margin-right: 10px; border-radius: 50%; background: white; padding: 2px; }

            /* Tarjeta Principal */
            .main-container { max-width: 850px; margin: 40px auto; background: rgba(255,255,255,0.95); border-radius: 30px; box-shadow: 0 25px 50px rgba(0,0,0,0.3); overflow: hidden; }
            
            /* Pestañas */
            .tab-box { display: flex; background: #edf2f7; padding: 5px; }
            .tab-btn { flex: 1; padding: 15px; border: none; background: none; cursor: pointer; font-weight: 600; color: #718096; border-radius: 20px; transition: 0.3s; }
            .tab-btn.active { background: white; color: #667eea; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
            
            .content-section { display: none; padding: 40px; animation: slideUp 0.4s ease-out; }
            .content-section.active { display: block; }
            @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

            /* Posts */
            .post-card { background: white; border: 1px solid #e2e8f0; border-radius: 20px; padding: 25px; margin-bottom: 25px; transition: 0.3s; }
            .post-card:hover { transform: scale(1.02); box-shadow: 0 10px 20px rgba(0,0,0,0.05); }
            .post-img { width: 100%; border-radius: 15px; margin: 15px 0; object-fit: cover; max-height: 400px; }
            
            /* Formulario */
            input, textarea { width: 100%; padding: 15px; margin: 10px 0; border: 2px solid #e2e8f0; border-radius: 12px; font-family: inherit; box-sizing: border-box; }
            input:focus { border-color: #667eea; outline: none; }
            .btn-pro { background: var(--grad); color: white; border: none; padding: 15px 30px; border-radius: 12px; cursor: pointer; font-weight: 600; width: 100%; transition: 0.3s; }
            .btn-pro:hover { opacity: 0.9; transform: translateY(-2px); }

            /* Admin */
            .admin-row { display: flex; justify-content: space-between; align-items: center; padding: 15px; background: #f8fafc; margin-bottom: 10px; border-radius: 12px; }
            .badge { padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; color: white; background: #667eea; }
        </style>
    </head>
    <body>
    `;

    if (!req.session.u) {
        return res.send(htmlHead + `
            <div style="height: 100vh; display: flex; justify-content: center; align-items: center;">
                <div style="background: white; padding: 50px; border-radius: 40px; text-align: center; width: 380px; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">
                    <img src="${conf.logoUrl}" width="100" style="margin-bottom: 20px;">
                    <h2 style="margin-bottom: 30px; color: #2d3748;">Aula Virtual</h2>
                    <form action="/auth" method="POST">
                        <input name="user" placeholder="Usuario" required>
                        <input name="pass" type="password" placeholder="Contraseña" required>
                        <input name="pin" placeholder="PIN Admin (Opcional)">
                        <button class="btn-pro" name="m" value="in">Entrar</button>
                        <p style="margin: 20px 0 10px; font-size: 0.9rem;">¿No tienes cuenta?</p>
                        <button class="btn-pro" name="m" value="reg" style="background: #48bb78;">Registrarse</button>
                    </form>
                </div>
            </div>
        </body></html>`);
    }

    const posts = await Post.find().sort({ fecha: -1 });
    const users = req.session.rol === 'admin' ? await User.find() : [];

    res.send(htmlHead + `
        <div class="nav">
            <b><img src="${conf.logoUrl}" width="35"> AULA VIRTUAL 2026</b>
            <div>
                <span style="margin-right: 20px;">👤 ${req.session.u} <span class="badge">${req.session.rol}</span></span>
                <a href="/salir" style="color: white; text-decoration: none; font-weight: 600;">Cerrar Sesión</a>
            </div>
        </div>

        <div class="main-container">
            <div class="tab-box">
                <button class="tab-btn active" onclick="showTab(event, 'muro')">📖 Muro de Clase</button>
                <button class="tab-btn" onclick="showTab(event, 'publicar')">✍️ Nueva Duda</button>
                ${req.session.rol === 'admin' ? '<button class="tab-btn" onclick="showTab(event, \'admin\')">🛠️ Gestión</button>' : ''}
            </div>

            <div id="muro" class="content-section active">
                ${posts.length === 0 ? '<p style="text-align:center; color:#a0aec0;">No hay dudas publicadas aún.</p>' : ''}
                ${posts.map(p => `
                    <div class="post-card">
                        <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                            <span style="font-weight:600; color:#4a5568;">@${p.autor}</span>
                            <span style="font-size:0.8rem; color:#a0aec0;">${p.fecha.toLocaleString()}</span>
                        </div>
                        <p style="font-size:1.1rem; line-height:1.6;">${p.titulo}</p>
                        ${p.imagen ? `<img src="${p.imagen}" class="post-img">` : ''}
                        <div style="margin-top:20px; border-top:1px solid #f7fafc; pt:15px;">
                            <form action="/like/${p._id}" method="POST">
                                <button style="background:#ebf4ff; color:#3182ce; border:none; padding:10px 20px; border-radius:30px; cursor:pointer; font-weight:600;">💡 Es útil (${p.likes})</button>
                            </form>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div id="publicar" class="content-section">
                <h3 style="margin-top:0;">Comparte tu duda con la clase</h3>
                <form action="/publicar" method="POST" enctype="multipart/form-data">
                    <textarea name="titulo" rows="5" placeholder="Describe tu duda de forma detallada..." required></textarea>
                    <p style="font-size:0.9rem; color:#718096;">Sube una captura o imagen de referencia (Opcional):</p>
                    <input type="file" name="archivo" accept="image/*">
                    <button class="btn-pro" type="submit">Publicar ahora</button>
                </form>
            </div>

            <div id="admin" class="content-section">
                <h3>Panel de Administración</h3>
                <div style="background:#fffaf0; padding:20px; border-radius:15px; border:1px solid #feebc8; margin-bottom:30px;">
                    <h4 style="margin-top:0;">Configuración de Marca</h4>
                    <form action="/admin/cmd" method="POST">
                        <input name="val" placeholder="URL de la imagen del Logo">
                        <button class="btn-pro" name="accion" value="logo">Actualizar Logo</button>
                    </form>
                </div>

                <h4>Gestión de Usuarios</h4>
                ${users.map(u => `
                    <div class="admin-row">
                        <span><b>${u.user}</b> <small>(${u.rol})</small></span>
                        <form action="/admin/cmd" method="POST" style="margin:0; display:flex; align-items:center;">
                            <input type="hidden" name="id" value="${u._id}">
                            <input name="val" placeholder="Hrs" style="width:50px; margin:0 10px; padding:5px;">
                            <button name="accion" value="ban" style="background:#ecc94b; color:white; border:none; padding:8px 15px; border-radius:8px; cursor:pointer; margin-right:5px;">Ban</button>
                            <button name="accion" value="del" style="background:#f56565; color:white; border:none; padding:8px 15px; border-radius:8px; cursor:pointer;">Eliminar</button>
                        </form>
                    </div>
                `).join('')}
            </div>
        </div>

        <script>
            function showTab(evt, name) {
                var i, content, btns;
                content = document.getElementsByClassName("content-section");
                for (i = 0; i < content.length; i++) content[i].className = "content-section";
                btns = document.getElementsByClassName("tab-btn");
                for (i = 0; i < btns.length; i++) btns[i].className = "tab-btn";
                document.getElementById(name).className = "content-section active";
                evt.currentTarget.className = "tab-btn active";
            }
        </script>
    </body></html>`);
});

// AUTH
app.post('/auth', async (req, res) => {
    const { user, pass, pin, m } = req.body;
    if (m === 'reg') {
        const rol = (pin === '2845') ? 'admin' : 'estudiante';
        await new User({ user, pass, rol }).save();
        return res.send("<script>alert('Cuenta creada'); window.location='/';</script>");
    }
    const u = await User.findOne({ user, pass });
    if (u && (!u.baneadoHasta || u.baneadoHasta < new Date())) {
        req.session.u = u.user; req.session.rol = u.rol; res.redirect('/');
    } else {
        res.send("<script>alert('Acceso denegado o baneado'); window.location='/';</script>");
    }
});

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(PORT, () => console.log('🚀 Sistema listo en puerto ' + PORT));
