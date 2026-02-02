const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const app = express();

const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN (Tus credenciales de Cloudinary) ---
cloudinary.config({ 
  cloud_name: 'dvlbsl16g', 
  api_key: '721617469253873', 
  api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});

// Conexión a tu base de datos de clase
mongoose.connect("mongodb+srv://admin:clase1789@cluster0.5de0hkj.mongodb.net/?appName=Cluster0")
  .then(() => console.log("🚀 Clase-V1: Sistema de Fechas Activado"));

const upload = multer({ storage: multer.memoryStorage() });

// --- MODELOS ---
const Post = mongoose.model('Post', { titulo: String, materia: String, archivo: String, autor: String, fecha: String, comentarios: { type: Array, default: [] } });
const User = mongoose.model('User', { user: String, pass: String, rol: String });
const Prestacion = mongoose.model('Prestacion', { alumno: String, cargo: String, fecha: String }); // El modelo ahora incluye fecha

app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'clase-v1-secret', resave: false, saveUninitialized: false }));

// --- RUTAS DE CLASE ---

// Asignar prestación (El alumno se apunta a un cargo)
app.post('/asignar-prestacion', async (req, res) => {
    // Generamos la fecha y hora actual en formato español
    const fechaRegistro = new Date().toLocaleString('es-ES', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
    });
    
    await new Prestacion({ 
        alumno: req.session.u, 
        cargo: req.body.cargo, 
        fecha: fechaRegistro // Guardamos el momento exacto
    }).save();
    
    res.redirect('/');
});

// Borrar prestación (Solo para el Admin/Amílcar)
app.post('/admin/borrar-prestacion/:id', async (req, res) => {
    if (req.session.rol === 'admin') {
        await Prestacion.findByIdAndDelete(req.params.id);
    }
    res.redirect('/');
});

// --- INTERFAZ (Respetando el estilo de tu imagen) ---
app.get('/', async (req, res) => {
    if (!req.session.uid) return res.send('Redirigiendo al login...');

    const posts = await Post.find().sort({ _id: -1 });
    const prestaciones = await Prestacion.find().sort({ _id: -1 });
    const u = await User.findById(req.session.uid);

    res.send(`
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { margin:0; font-family:sans-serif; background:#1a1a1a; color:#333; }
            .header { background:#2c3e50; padding:15px; display:flex; justify-content:space-between; align-items:center; color:white; }
            .nav-icons { background:#fff; display:flex; justify-content:center; gap:40px; padding:15px; border-bottom:1px solid #ddd; }
            .icon { cursor:pointer; font-size:1.5em; opacity:0.4; }
            .icon.active { opacity:1; color:#e91e63; }
            .container { max-width:600px; margin:20px auto; padding:0 15px; }
            .card { background:white; padding:20px; border-radius:15px; margin-bottom:20px; box-shadow:0 4px 6px rgba(0,0,0,0.1); position:relative; }
            .fecha-prestacion { display:block; margin-top:8px; color:#888; font-size:0.8em; font-style:italic; }
            .btn-borrar { position:absolute; top:15px; right:15px; background:#ff7675; color:white; border:none; border-radius:5px; cursor:pointer; padding:5px 10px; }
        </style>
    </head>
    <body>
        <div class="header">
            <div><b>👾 ${u.user}</b></div>
            <form action="/salir" method="GET" style="margin:0;"><button style="background:#2c3e50; color:white; border:1px solid white; cursor:pointer; border-radius:5px; padding:5px 10px;">Salir</button></form>
        </div>

        <div class="nav-icons">
            <div class="icon active" onclick="ver('archivo', this)">📂</div>
            <div class="icon" onclick="ver('prestaciones', this)">❓</div>
            <div class="icon" onclick="ver('ajustes', this)">⚙️</div>
        </div>

        <div class="container">
            <div id="archivo" class="section">
                <div class="card">
                    <form action="/publicar" method="POST" enctype="multipart/form-data">
                        <input name="titulo" placeholder="Nombre del archivo/tema" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ddd; border-radius:8px;">
                        <select name="materia" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ddd; border-radius:8px;">
                            <option>Matemáticas</option><option>Lengua</option>
                        </select>
                        <button style="width:100%; padding:12px; background:#2c3e50; color:white; border:none; border-radius:8px; font-weight:bold;">📬 Publicar en la Clase</button>
                    </form>
                </div>
                </div>

            <div id="prestaciones" class="section" style="display:none;">
                <h2 style="color:white; text-align:center;">Cargos de Clase</h2>
                ${prestaciones.map(p => `
                    <div class="card">
                        ${req.session.rol === 'admin' ? `<form action="/admin/borrar-prestacion/${p._id}" method="POST"><button class="btn-borrar">Borrar</button></form>` : ''}
                        <b style="font-size:1.1em; color:#2c3e50;">${p.cargo}</b><br>
                        <span>Asignado a: ${p.alumno}</span>
                        <span class="fecha-prestacion">📅 Registrado el: ${p.fecha}</span>
                    </div>
                `).join('')}
            </div>
        </div>

        <script>
            function ver(id, el) {
                document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
                document.querySelectorAll('.icon').forEach(i => i.classList.remove('active'));
                document.getElementById(id).style.display = 'block';
                el.classList.add('active');
            }
        </script>
    </body>
    </html>`);
});

app.listen(PORT, () => console.log('Clase-V1 Funcionando'));
