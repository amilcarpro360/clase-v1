const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const app = express();

// --- CONFIGURACIÓN ---
cloudinary.config({ 
  cloud_name: 'dvlbsl16g', 
  api_key: '721617469253873', 
  api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});

// Cambia esta URL si has cambiado de base de datos
mongoose.connect("mongodb+srv://admin:biblio1789@cluster0.5de0hkj.mongodb.net/claseV1?retryWrites=true&w=majority")
  .then(() => console.log("✅ Conectado a MongoDB"))
  .catch(err => console.error("❌ Error de conexión:", err));

const upload = multer({ storage: multer.memoryStorage() });

// --- MODELOS ---
const Post = mongoose.model('Post', { titulo: String, materia: String, archivo: String, autor: String, fecha: String });
const User = mongoose.model('User', { user: String, pass: String, rol: String });
const Prestacion = mongoose.model('Prestacion', { alumno: String, cargo: String, fecha: String });

app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secreto-clase', resave: false, saveUninitialized: false }));

// --- FUNCIONES AUXILIARES ---
const subirACloudinary = (buffer) => {
    return new Promise((resolve, reject) => {
        let stream = cloudinary.uploader.upload_stream({ folder: "clase_v1" }, (error, result) => {
            if (result) resolve(result.secure_url);
            else reject(error);
        });
        streamifier.createReadStream(buffer).pipe(stream);
    });
};

// --- RUTAS ---

// 1. Registro/Login básico
app.post('/auth', async (req, res) => {
    const { user, pass, pin, accion } = req.body;
    if (accion === 'registro') {
        const rol = (pin === '2845') ? 'admin' : 'alumno';
        const nuevo = new User({ user, pass, rol });
        await nuevo.save();
        req.session.uid = nuevo._id; req.session.rol = nuevo.rol; req.session.u = nuevo.user;
    } else {
        const u = await User.findOne({ user, pass });
        if (u) { req.session.uid = u._id; req.session.rol = u.rol; req.session.u = u.user; }
    }
    res.redirect('/');
});

// 2. Publicar (Lo de la Carpeta 📂)
app.post('/publicar', upload.single('archivo'), async (req, res) => {
    let url = "";
    if (req.file) url = await subirACloudinary(req.file.buffer);
    const fechaPost = new Date().toLocaleString();
    await new Post({ ...req.body, archivo: url, autor: req.session.u, fecha: fechaPost }).save();
    res.redirect('/');
});

// 3. Asignar Prestación (Lo de la Interrogación ❓)
app.post('/asignar-prestacion', async (req, res) => {
    const ahora = new Date().toLocaleString('es-ES');
    await new Prestacion({ alumno: req.session.u, cargo: req.body.cargo, fecha: ahora }).save();
    res.redirect('/');
});

// 4. Borrar Prestación (Solo Admin)
app.post('/admin/borrar-pres/:id', async (req, res) => {
    if (req.session.rol === 'admin') await Prestacion.findByIdAndDelete(req.params.id);
    res.redirect('/');
});

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });

// --- VISTA ---
app.get('/', async (req, res) => {
    if (!req.session.uid) {
        return res.send(`
            <body style="background:#1a1a1a; color:white; font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh;">
                <form action="/auth" method="POST" style="background:#fff; padding:20px; border-radius:10px; color:#333;">
                    <h2>Clase-V1 Login</h2>
                    <input name="user" placeholder="Usuario" required style="width:100%; margin-bottom:10px; padding:8px;">
                    <input name="pass" type="password" placeholder="Pass" required style="width:100%; margin-bottom:10px; padding:8px;">
                    <input name="pin" placeholder="PIN (Solo admin)" style="width:100%; margin-bottom:10px; padding:8px;">
                    <button name="accion" value="login" style="width:100%; background:#2c3e50; color:white; border:none; padding:10px; cursor:pointer;">Entrar</button>
                    <button name="accion" value="registro" style="width:100%; background:#eee; border:none; padding:10px; margin-top:5px; cursor:pointer;">Registrarme</button>
                </form>
            </body>
        `);
    }

    const posts = await Post.find().sort({ _id: -1 });
    const prestaciones = await Prestacion.find().sort({ _id: -1 });

    res.send(`
    <html>
    <head>
        <style>
            body { margin:0; font-family:sans-serif; background:#1a1a1a; }
            .header { background:#2c3e50; padding:15px; color:white; display:flex; justify-content:space-between; }
            .nav { background:white; display:flex; justify-content:center; gap:50px; padding:15px; }
            .container { max-width:500px; margin:20px auto; padding:0 20px; }
            .card { background:white; padding:20px; border-radius:15px; margin-bottom:15px; }
            .section { display:none; }
            .active { display:block; }
        </style>
    </head>
    <body>
        <div class="header"><b>👾 ${req.session.u}</b> <a href="/salir" style="color:white;">Salir</a></div>
        <div class="nav">
            <span onclick="ver('archivo')" style="cursor:pointer; font-size:1.5em;">📂</span>
            <span onclick="ver('pres')" style="cursor:pointer; font-size:1.5em;">❓</span>
            <span onclick="ver('ajustes')" style="cursor:pointer; font-size:1.5em;">⚙️</span>
        </div>

        <div class="container">
            <div id="archivo" class="section active">
                <div class="card">
                    <form action="/publicar" method="POST" enctype="multipart/form-data">
                        <input name="titulo" placeholder="Nombre del tema">
                        <select name="materia"><option>Matemáticas</option><option>Lengua</option></select>
                        <input type="file" name="archivo">
                        <button style="width:100%; background:#2c3e50; color:white; border-radius:5px; padding:10px;">Publicar</button>
                    </form>
                </div>
                ${posts.map(p => `<div class="card"><h3>${p.titulo}</h3><a href="${p.archivo}" target="_blank">Abrir archivo</a></div>`).join('')}
            </div>

            <div id="pres" class="section">
                <h2 style="color:white;">Prestaciones de Clase</h2>
                ${prestaciones.map(p => `
                    <div class="card">
                        <b>${p.cargo}</b> - ${p.alumno}<br>
                        <small style="color:gray;">📅 Fecha: ${p.fecha}</small>
                        ${req.session.rol === 'admin' ? `
                        <form action="/admin/borrar-pres/${p._id}" method="POST" style="display:inline;">
                            <button style="background:red; color:white; border:none; border-radius:3px; padding:2px 8px; cursor:pointer;">Borrar</button>
                        </form>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>

        <script>
            function ver(id) {
                document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
                document.getElementById(id).style.display = 'block';
            }
        </script>
    </body>
    </html>`);
});

const PORT_FINAL = process.env.PORT || 3000;
app.listen(PORT_FINAL, () => console.log('Servidor arriba en puerto ' + PORT_FINAL));
