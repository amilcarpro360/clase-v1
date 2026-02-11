const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');

const app = express();
const PORT = process.env.PORT || 10000;

// 1. CONFIGURACIÓN DE APIS
cloudinary.config({ 
    cloud_name: 'dvlbsl16g', api_key: '721617469253873', api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});
const upload = multer();

mongoose.connect('mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0');

// 2. MODELOS
const User = mongoose.model('User', { 
    user: String, pass: String, rol: String, baneadoHasta: Date,
    historialReacciones: { type: Map, of: String, default: {} } 
});
const Post = mongoose.model('Post', { titulo: String, imagen: String, autor: String, likes: { type: Number, default: 0 }, fecha: { type: Date, default: Date.now } });
const Config = mongoose.model('Config', { logoUrl: String });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'render-ultra-secret', resave: false, saveUninitialized: false }));

// --- PETICIÓN 8: RESTRICCIÓN HORARIA (Middleware) ---
app.use((req, res, next) => {
    const ahora = new Date();
    const dia = ahora.getDay(); 
    const hora = ahora.getHours();
    const bloqueo = (dia === 5 && hora >= 18) || (dia === 6) || (dia === 0) || (dia === 1 && hora < 8);
    
    if (bloqueo && req.path === '/publicar' && req.method === 'POST') {
        return res.send("<script>alert('🔒 Aula cerrada: De Viernes 18h a Lunes 08h'); window.location='/';</script>");
    }
    next();
});

// --- LÓGICA DE RUTAS (Peticiones 1, 2, 3, 5, 6, 7) ---
app.post('/publicar', upload.single('archivo'), async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    let img = '';
    if (req.file) {
        const r = await new Promise((rs) => {
            const s = cloudinary.uploader.upload_stream({ folder: 'aula_render' }, (err, resu) => rs(resu));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        img = r.secure_url;
    }
    await new Post({ titulo: req.body.titulo, imagen: img, autor: req.session.u }).save();
    console.log("🔔 NOTIFICACIÓN: Nuevo post creado por " + req.session.u);
    res.redirect('/');
});

app.post('/like/:id', async (req, res) => {
    const u = await User.findOne({ user: req.session.u });
    const hoy = new Date().toDateString();
    if (u.historialReacciones.get(req.params.id) === hoy) return res.send("<script>alert('Ya votaste hoy'); window.location='/';</script>");
    await Post.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } });
    u.historialReacciones.set(req.params.id, hoy);
    await u.save();
    res.redirect('/');
});

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

// --- VISTA PRINCIPAL CON DISEÑO "CURRADO" ---
app.get('/', async (req, res) => {
    const c = await Config.findOne() || { logoUrl: 'https://cdn-icons-png.flaticon.com/512/3449/3449692.png' };
    
    // ESTILOS CSS CON FONDO BONITO Y PESTAÑAS
    const css = `
        <style>
            body { 
                margin: 0; font-family: 'Segoe UI', sans-serif; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                min-height: 100vh; color: #333;
            }
            .navbar { background: rgba(255,255,255,0.1); backdrop-filter: blur(10px); padding: 15px 10%; display: flex; justify-content: space-between; align-items: center; color: white; border-bottom: 1px solid rgba(255,255,255,0.2); }
            .container { max-width: 800px; margin: 30px auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 15px 35px rgba(0,0,0,0.2); }
            
            /* PESTAÑAS */
            .tabs { display: flex; background: #f8f9fa; border-bottom: 1px solid #ddd; }
            .tab-btn { flex: 1; padding: 15px; border: none; background: none; cursor: pointer; font-weight: bold; color: #666; transition: 0.3s; }
            .tab-btn.active { color: #667eea; border-bottom: 3px solid #667eea; background: white; }
            .tab-content { display: none; padding: 30px; }
            .tab-content.active { display: block; }

            .post-card { border: 1px solid #eee; padding: 20px; border-radius: 15px; margin-bottom: 20px; transition: 0.3s; }
            .post-card:hover { transform: translateY(-5px); box-shadow: 0 5px 15px rgba(0,0,0,0.05); }
            input, textarea { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; }
            button { background: #667eea; color: white; border: none; padding: 12px 25px; border-radius: 8px; cursor: pointer; font-weight: bold; }
            .admin-section { background: #f1f3f9; padding: 20px; border-radius: 10px; margin-top: 20px; }
        </style>
    `;

    if (!req.session.u) {
        return res.send(css + `
            <div style="display:flex; justify-content:center; align-items:center; height:100vh;">
                <div style="background:white; padding:40px; border-radius:20px; text-align:center; width:350px;">
                    <img src="${c.logoUrl}" width="80">
                    <h2 style="color:#444">Aula Virtual Pro</h2>
                    <form action="/auth" method="POST">
                        <input name="user" placeholder="Usuario" required>
                        <input name="pass" type="password" placeholder="Contraseña" required>
                        <input name="pin" placeholder="PIN Admin (Opcional)">
                        <button name="m" value="in" style="width:100%">Iniciar Sesión</button>
                        <button name="m" value="reg" style="width:100%; margin-top:10px; background:#48bb78;">Registrarse</button>
                    </form>
                </div>
            </div>
        `);
    }

    const posts = await Post.find().sort({ fecha: -1 });
    const users = req.session.rol === 'admin' ? await User.find() : [];

    res.send(css + `
        <nav class="navbar">
            <div style="display:flex; align-items:center;"><img src="${c.logoUrl}" width="35" style="margin-right:10px;"> <b>AULA VIRTUAL</b></div>
            <div><span>${req.session.u} (${req.session.rol})</span> | <a href="/salir" style="color:white; text-decoration:none; font-weight:bold;">Salir</a></div>
        </nav>

        <div class="container">
            <div class="tabs">
                <button class="tab-btn active" onclick="openTab(event, 'muro')">📋 Muro de Dudas</button>
                <button class="tab-btn" onclick="openTab(event, 'publicar')">✍️ Publicar</button>
                ${req.session.rol === 'admin' ? '<button class="tab-btn" onclick="openTab(event, \'admin\')">⚙️ Panel Admin</button>' : ''}
            </div>

            <div id="muro" class="tab-content active">
                ${posts.map(p => `
                    <div class="post-card">
                        <div style="display:flex; justify-content:space-between; color: #888; font-size:0.8em;">
                            <b>${p.autor}</b> <span>${p.fecha.toLocaleString()}</span>
                        </div>
                        <p style="font-size:1.1em; color:#2d3748;">${p.titulo}</p>
                        ${p.imagen ? `<img src="${p.imagen}" style="width:100%; border-radius:10px; margin:10px 0;">` : ''}
                        <form action="/like/${p._id}" method="POST">
                            <button style="background:#edf2f7; color:#4a5568;">💡 Es útil (${p.likes})</button>
                        </form>
                    </div>
                `).join('')}
            </div>

            <div id="publicar" class="tab-content">
                <h3>¿En qué tienes dudas hoy?</h3>
                <form action="/publicar" method="POST" enctype="multipart/form-data">
                    <textarea name="titulo" rows="4" placeholder="Escribe aquí tu pregunta o aporte..." required></textarea>
                    <label>Adjuntar imagen (Opcional):</label>
                    <input type="file" name="archivo" accept="image/*">
                    <button type="submit">Publicar en la Clase</button>
                </form>
            </div>

            <div id="admin" class="tab-content">
                <div class="admin-section">
                    <h4>Identidad Visual</h4>
                    <form action="/admin" method="POST">
                        <input name="val" placeholder="URL de la imagen del Logo">
                        <button name="accion" value="logo">Actualizar Logo</button>
                    </form>
                </div>
                <div class="admin-section">
                    <h4>Gestión de Alumnos (Ban/Eliminar)</h4>
                    ${users.map(u => `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #ddd;">
                            <span>${u.user}</span>
                            <form action="/admin" method="POST" style="margin:0;">
                                <input type="hidden" name="id" value="${u._id}">
                                <input name="val" placeholder="Horas" style="width:50px; margin:0 5px; padding:5px;">
                                <button name="accion" value="ban" style="background:#f6ad55; padding:5px 10px;">Ban</button>
                                <button name="accion" value="del" style="background:#f56565; padding:5px 10px;">X</button>
                            </form>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>

        <script>
            function openTab(evt, tabName) {
                var i, tabcontent, tablinks;
                tabcontent = document.getElementsByClassName("tab-content");
                for (i = 0; i < tabcontent.length; i++) tabcontent[i].style.display = "none";
                tablinks = document.getElementsByClassName("tab-btn");
                for (i = 0; i < tablinks.length; i++) tablinks[i].className = tablinks[i].className.replace(" active", "");
                document.getElementById(tabName).style.display = "block";
                evt.currentTarget.className += " active";
            }
        </script>
    `);
});

app.post('/auth', async (req, res) => {
    const { user, pass, pin, m } = req.body;
    if (m === 'reg') {
        await new User({ user, pass, rol: (pin === '2845' ? 'admin' : 'estudiante') }).save();
        return res.send("<script>alert('Registrado con éxito'); window.location='/';</script>");
    }
    const u = await User.findOne({ user, pass });
    if (u && (!u.baneadoHasta || u.baneadoHasta < new Date())) {
        req.session.u = u.user; req.session.rol = u.rol; res.redirect('/');
    } else res.send("<script>alert('Baneado o datos mal'); window.location='/';</script>");
});

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.listen(PORT, () => console.log('Servidor en Render listo'));
