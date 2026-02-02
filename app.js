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

mongoose.connect("mongodb+srv://admin:biblio1789@cluster0.5de0hkj.mongodb.net/?appName=Cluster0")
  .then(() => console.log("🚀 Clase-V1: Funcionando Correctamente"));

const upload = multer({ storage: multer.memoryStorage() });

// --- MODELOS ---
const Post = mongoose.model('Post', { titulo: String, materia: String, archivo: String, autor: String, fecha: String, comentarios: { type: Array, default: [] } });
const User = mongoose.model('User', { user: String, pass: String, rol: String });
const Prestacion = mongoose.model('Prestacion', { alumno: String, cargo: String, fecha: String });

app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'clase-v1-secret', resave: false, saveUninitialized: false }));

// --- ACCIONES ---

// Guardar prestación con FECHA (Lo que querías)
app.post('/asignar-prestacion', async (req, res) => {
    const ahora = new Date().toLocaleString('es-ES', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
    });
    await new Prestacion({ alumno: req.session.u, cargo: req.body.cargo, fecha: ahora }).save();
    res.redirect('/');
});

// Borrar prestación (Botón para limpiar la lista)
app.post('/admin/borrar-prestacion/:id', async (req, res) => {
    if (req.session.rol === 'admin') await Prestacion.findByIdAndDelete(req.params.id);
    res.redirect('/');
});

// Auth y Publicar (Igual que en tu imagen)
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

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });

// --- INTERFAZ (Fiel a tu captura) ---
app.get('/', async (req, res) => {
    if (!req.session.uid) return res.send('<body style="background:#1a1a1a;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;"><form action="/auth" method="POST" style="background:white;padding:20px;border-radius:10px;color:black;"><h2>Login</h2><input name="user" placeholder="Usuario"><br><input name="pass" type="password" placeholder="Pass"><br><input name="pin" placeholder="PIN Admin"><br><button name="accion" value="login">Entrar</button><button name="accion" value="registro">Registrar</button></form></body>');

    const u = await User.findById(req.session.uid);
    const prestaciones = await Prestacion.find().sort({ _id: -1 });

    res.send(`
    <html>
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { margin:0; font-family:sans-serif; background:#1a1a1a; color:#333; }
            .header { background:#2c3e50; padding:15px; color:white; display:flex; justify-content:space-between; align-items:center; }
            .nav { background:white; display:flex; justify-content:center; gap:40px; padding:15px; border-bottom:1px solid #ddd; }
            .icon { cursor:pointer; font-size:1.5em; opacity:0.4; }
            .icon.active { opacity:1; color:#2c3e50; }
            .container { max-width:500px; margin:20px auto; padding:0 15px; }
            .card { background:white; padding:15px; border-radius:15px; margin-bottom:15px; position:relative; }
            .fecha { display:block; color:gray; font-size:0.8em; margin-top:5px; }
            .btn-del { position:absolute; top:10px; right:10px; background:#ff7675; color:white; border:none; padding:5px; border-radius:5px; cursor:pointer; }
        </style>
    </head>
    <body>
        <div class="header"><b>👾 ${u.user}</b> <a href="/salir" style="color:white;text-decoration:none;">Salir</a></div>
        <div class="nav">
            <div class="icon active" onclick="ver('archivo', this)">📂</div>
            <div class="icon" onclick="ver('pres', this)">❓</div>
            <div class="icon" onclick="ver('ajustes', this)">⚙️</div>
        </div>

        <div class="container">
            <div id="archivo" class="section">
                <div class="card">
                    <form action="/asignar-prestacion" method="POST">
                        <input name="cargo" placeholder="Nombre del Cargo/Prestación" style="width:100%;padding:10px;margin-bottom:10px;">
                        <button style="width:100%;padding:10px;background:#2c3e50;color:white;border:none;border-radius:5px;">✅ Asignarme este Cargo</button>
                    </form>
                </div>
            </div>

            <div id="pres" class="section" style="display:none;">
                <h2 style="color:white;text-align:center;">Lista de Prestaciones</h2>
                ${prestaciones.map(p => `
                    <div class="card">
                        ${req.session.rol === 'admin' ? `<form action="/admin/borrar-prestacion/${p._id}" method="POST"><button class="btn-del">Borrar</button></form>` : ''}
                        <b>${p.cargo}</b><br>
                        <span>Alumno: ${p.alumno}</span>
                        <span class="fecha">📅 Fecha: ${p.fecha}</span>
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

app.listen(PORT, () => console.log('Servidor ONLINE'));
