const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const app = express();

const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN ---
cloudinary.config({ 
  cloud_name: 'dvlbsl16g', 
  api_key: '721617469253873', 
  api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});

mongoose.connect("mongodb+srv://admin:biblio1789@cluster0.5de0hkj.mongodb.net/?appName=Cluster0")
  .then(() => console.log("✅ Conexión recuperada"));

const upload = multer({ storage: multer.memoryStorage() });

// --- MODELOS ---
const Post = mongoose.model('Post', { titulo: String, materia: String, archivo: String, autor: String, fecha: String, comentarios: { type: Array, default: [] } });
const User = mongoose.model('User', { user: String, pass: String, rol: String });
const Prestacion = mongoose.model('Prestacion', { alumno: String, cargo: String, fecha: String });

app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'clase-v1-fix', resave: false, saveUninitialized: false }));

// --- LÓGICA DE PRESTACIONES (CARGOS) ---

// 1. Borrar prestación (Lo que me pediste originalmente)
app.post('/borrar-prestacion/:id', async (req, res) => {
    // Solo borramos si hay sesión iniciada
    if (req.session.uid) {
        await Prestacion.findByIdAndDelete(req.params.id);
    }
    res.redirect('/');
});

// 2. Asignar prestación con FECHA
app.post('/asignar-cargo', async (req, res) => {
    const ahora = new Date().toLocaleString('es-ES', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
    });
    
    await new Prestacion({ 
        alumno: req.session.u, 
        cargo: req.body.cargo, 
        fecha: ahora 
    }).save();
    res.redirect('/');
});

// --- OTRAS RUTAS ---
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

// --- INTERFAZ ESTILO CLASE-V1 ---
app.get('/', async (req, res) => {
    if (!req.session.uid) return res.send('<body style="background:#1a1a1a;color:white;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;"><form action="/auth" method="POST" style="background:white;padding:30px;border-radius:15px;color:black;"><h2>Entrar a Clase</h2><input name="user" placeholder="Usuario" required><br><input name="pass" type="password" placeholder="Contraseña" required><br><input name="pin" placeholder="PIN Admin (Opcional)"><br><button name="accion" value="login" style="background:#2c3e50;color:white;width:100%;padding:10px;margin-top:10px;border:none;border-radius:5px;cursor:pointer;">Entrar</button><button name="accion" value="registro" style="width:100%;margin-top:5px;border:none;background:none;color:#777;cursor:pointer;">Registrarme</button></form></body>');

    const u = await User.findById(req.session.uid);
    const prestaciones = await Prestacion.find().sort({ _id: -1 });

    res.send(`
    <html>
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { margin:0; font-family:sans-serif; background:#1a1a1a; color:#333; }
            .header { background:#2c3e50; padding:15px; color:white; display:flex; justify-content:space-between; align-items:center; }
            .nav { background:white; display:flex; justify-content:center; gap:50px; padding:15px; border-bottom:1px solid #ddd; }
            .icon { cursor:pointer; font-size:1.6em; opacity:0.3; }
            .icon.active { opacity:1; color:#2c3e50; }
            .container { max-width:500px; margin:20px auto; padding:0 15px; }
            .card { background:white; padding:15px; border-radius:15px; margin-bottom:15px; position:relative; box-shadow:0 4px 10px rgba(0,0,0,0.3); }
            input, select { width:100%; padding:12px; margin:8px 0; border:1px solid #ddd; border-radius:8px; box-sizing:border-box; }
            .btn-main { background:#2c3e50; color:white; border:none; padding:12px; border-radius:8px; width:100%; font-weight:bold; cursor:pointer; }
            .fecha-tag { display:block; color:#999; font-size:0.75em; margin-top:5px; font-style:italic; }
            .del-link { color:#ff7675; text-decoration:none; font-size:0.8em; font-weight:bold; }
        </style>
    </head>
    <body>
        <div class="header"><b>👾 ${u.user}</b> <a href="/salir" style="color:white;text-decoration:none;font-size:0.8em;">Salir</a></div>
        
        <div class="nav">
            <div class="icon active" onclick="ver('archivo', this)">📂</div>
            <div class="icon" onclick="ver('prestaciones', this)">❓</div>
            <div class="icon" onclick="ver('ajustes', this)">⚙️</div>
        </div>

        <div class="container">
            <div id="archivo" class="section">
                <div class="card">
                    <form action="/asignar-cargo" method="POST">
                        <input name="cargo" placeholder="Nombre de la prestación o cargo" required>
                        <button class="btn-main">✅ Asignarme este Cargo</button>
                    </form>
                </div>
            </div>

            <div id="prestaciones" class="section" style="display:none;">
                <h3 style="color:white; text-align:center;">Cargos de Clase</h3>
                ${prestaciones.map(p => `
                    <div class="card">
                        <div style="display:flex; justify-content:space-between;">
                            <b>${p.cargo}</b>
                            <form action="/borrar-prestacion/${p._id}" method="POST" style="margin:0;">
                                <button type="submit" class="del-link" style="background:none;border:none;cursor:pointer;">Borrar</button>
                            </form>
                        </div>
                        <div style="font-size:0.9em; margin-top:5px;">👤 ${p.alumno}</div>
                        <span class="fecha-tag">📅 Asignado: ${p.fecha}</span>
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

app.listen(PORT, () => console.log('Servidor Clase-V1 Listo'));
