const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const app = express();

const PORT = process.env.PORT || 3000;

// --- 1. PEGA TU LINK DE MONGODB AQUÍ ---
const MONGO_URI = "mongodb+srv://TU_USUARIO:TU_CONTRASEÑA@cluster0.jbyog90.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI).then(() => console.log("¡Conectado al mongolo!"));

// --- 2. MODELOS DE DATOS ---
const Item = mongoose.model('Item', { 
    tipo: String, 
    titulo: String, 
    link: String, 
    fecha: String, 
    autor: String,
    timestamp: String 
});
const User = mongoose.model('User', { user: String, pass: String, rol: String });

app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secreto-clase', resave: false, saveUninitialized: false }));

// --- 3. RUTAS DE LÓGICA ---
app.post('/auth', async (req, res) => {
    const { user, pass, pin, accion } = req.body;
    if (accion === 'registro') {
        const rol = (pin === '1789') ? 'admin' : 'estudiante';
        await new User({ user, pass, rol }).save();
        return res.send(`<body style="font-family:sans-serif; text-align:center; padding-top:50px;"><h2>Cuenta de ${rol} creada ✅</h2><a href="/">Volver a entrar</a></body>`);
    }
    const u = await User.findOne({ user, pass });
    if (u) { req.session.u = u.user; req.session.rol = u.rol; res.redirect('/'); }
    else res.send('Usuario o contraseña mal. <a href="/">Volver</a>');
});

app.post('/publicar', async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    const { tipo, titulo, link, fecha } = req.body;
    await new Item({ 
        tipo, 
        titulo, 
        link, 
        fecha, 
        autor: req.session.u,
        timestamp: new Date().toLocaleString() 
    }).save();
    res.redirect('/');
});

app.post('/eliminar/:id', async (req, res) => {
    const post = await Item.findById(req.params.id);
    if (post && (post.autor === req.session.u || req.session.rol === 'admin')) {
        await Item.findByIdAndDelete(req.params.id);
    }
    res.redirect('/');
});

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });

// --- 4. LA INTERFAZ "PRO" (HTML/CSS) ---
app.get('/', async (req, res) => {
    if (!req.session.u) return res.send(`
        <body style="font-family:'Segoe UI',sans-serif; background:#6c5ce7; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
            <div style="background:white; padding:30px; border-radius:20px; width:320px; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
                <h2 style="color:#2d3436;">🎓 Aula Virtual</h2>
                <form action="/auth" method="POST">
                    <input name="user" placeholder="Usuario" style="width:100%; padding:12px; margin-bottom:10px; border-radius:8px; border:1px solid #ddd;" required>
                    <input name="pass" type="password" placeholder="Contraseña" style="width:100%; padding:12px; margin-bottom:10px; border-radius:8px; border:1px solid #ddd;" required>
                    <input name="pin" placeholder="PIN Admin (opcional)" style="width:100%; padding:12px; margin-bottom:15px; border-radius:8px; border:1px solid #ddd;">
                    <button name="accion" value="login" style="width:100%; background:#6c5ce7; color:white; padding:12px; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Entrar</button>
                    <button name="accion" value="registro" style="width:100%; background:none; border:none; color:#636e72; margin-top:15px; cursor:pointer; font-size:0.9em;">¿No tienes cuenta? Regístrate</button>
                </form>
            </div>
        </body>`);

    const todos = await Item.find();
    
    // Filtramos por tipo para las secciones
    const htmlItems = (tipo, color) => todos.filter(i => i.tipo === tipo).reverse().map(i => `
        <div style="background:white; padding:15px; margin-bottom:12px; border-radius:12px; border-left:6px solid ${color}; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <b style="font-size:1.1em; color:#2d3436;">${i.titulo}</b>
                ${i.fecha ? `<span style="background:#ffeaa7; color:#d35400; padding:2px 8px; border-radius:5px; font-size:0.8em; font-weight:bold;">${i.fecha}</span>` : ''}
            </div>
            ${i.link ? `<a href="${i.link}" target="_blank" style="display:block; margin-top:8px; color:#6c5ce7; text-decoration:none; font-weight:500;">🔗 Ver en OneDrive</a>` : ''}
            <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
                <small style="color:#b2bec3;">👤 ${i.autor} • ${i.timestamp.split(',')[0]}</small>
                ${(i.autor === req.session.u || req.session.rol === 'admin') ? 
                    `<form action="/eliminar/${i._id}" method="POST" style="margin:0;"><button style="background:#ff7675; color:white; border:none; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:0.8em;">Borrar</button></form>` : ''}
            </div>
        </div>`).join('');

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Aula Virtual Pro</title>
            <style>
                body { font-family:'Segoe UI',sans-serif; background:#f4f7f6; margin:0; padding-bottom:30px; }
                nav { background:#6c5ce7; color:white; padding:15px 20px; display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:100; box-shadow:0 2px 10px rgba(0,0,0,0.1); }
                .tabs { display:flex; background:white; position:sticky; top:56px; z-index:90; box-shadow:0 2px 5px rgba(0,0,0,0.05); }
                .tab { flex:1; text-align:center; padding:15px; cursor:pointer; font-weight:bold; color:#636e72; border-bottom:3px solid transparent; }
                .tab.active { color:#6c5ce7; border-bottom-color:#6c5ce7; }
                .container { max-width:600px; margin:20px auto; padding:0 15px; }
                .section { display:none; }
                .section.active { display:block; }
                .form-card { background:white; padding:20px; border-radius:15px; margin-bottom:25px; box-shadow:0 4px 15px rgba(0,0,0,0.05); }
                input, select, button { width:100%; padding:12px; margin-bottom:10px; border-radius:8px; border:1px solid #ddd; box-sizing:border-box; }
                .btn-post { background:#6c5ce7; color:white; border:none; font-weight:bold; cursor:pointer; margin-top:5px; }
            </style>
        </head>
        <body>
            <nav>
                <span><b>${req.session.rol === 'admin' ? '⭐ ' : ''}${req.session.u}</b></span>
                <a href="/salir" style="color:white; text-decoration:none; font-size:0.9em; background:rgba(255,255,255,0.2); padding:5px 12px; border-radius:20px;">Cerrar Sesión</a>
            </nav>

            <div class="tabs">
                <div id="t-apuntes" class="tab active" onclick="ver('apuntes')">📂 Apuntes</div>
                <div id="t-fechas" class="tab" onclick="ver('fechas')">📅 Fechas</div>
                <div id="t-dudas" class="tab" onclick="ver('dudas')">❓ Dudas</div>
            </div>

            <div class="container">
                <div id="sec-apuntes" class="section active">
                    <div class="form-card">
                        <h3 style="margin-top:0;">📚 Subir Apunte</h3>
                        <form action="/publicar" method="POST">
                            <input type="hidden" name="tipo" value="apunte">
                            <input name="titulo" placeholder="Nombre del tema o materia" required>
                            <input name="link" placeholder="Link de OneDrive/Drive" required>
                            <button class="btn-post">Publicar Apunte</button>
                        </form>
                    </div>
                    ${htmlItems('apunte', '#6c5ce7')}
                </div>

                <div id="sec-fechas" class="section">
                    <div class="form-card">
                        <h3 style="margin-top:0;">📅 Añadir Examen/Trabajo</h3>
                        <form action="/publicar" method="POST">
                            <input type="hidden" name="tipo" value="fecha">
                            <input name="titulo" placeholder="¿Qué examen hay?" required>
                            <input type="date" name="fecha" required>
                            <button class="btn-post" style="background:#e84393;">Guardar Fecha</button>
                        </form>
                    </div>
                    ${htmlItems('fecha', '#e84393')}
                </div>

                <div id="sec-dudas" class="section">
                    <div class="form-card">
                        <h3 style="margin-top:0;">❓ Preguntar a la Clase</h3>
                        <form action="/publicar" method="POST">
                            <input type="hidden" name="tipo" value="duda">
                            <input name="titulo" placeholder="Escribe tu duda aquí..." required>
                            <button class="btn-post" style="background:#00b894;">Publicar Duda</button>
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

app.listen(PORT, () => console.log('Servidor corriendo en el puerto ' + PORT));
