const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const webpush = require('web-push');
const app = express();

// Usamos el puerto que asigne Render o el 10000 para evitar el error EADDRINUSE
const PORT = process.env.PORT || 10000;

// Configuración Cloudinary
cloudinary.config({ cloud_name: 'dvlbsl16g', api_key: '721617469253873', api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' });
const upload = multer();

// VAPID Keys para Notificaciones
const vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:admin@clase.com', vapidKeys.publicKey, vapidKeys.privateKey);

// Conexión MongoDB
mongoose.connect("mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0")
    .then(() => console.log("Base de datos lista"))
    .catch(err => console.log("Error DB:", err));

// Modelos
const User = mongoose.model('User', { 
    user: String, pass: String, rol: String, 
    avatar: { type: String, default: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png' },
    baneadoHasta: Date,
    suscripcionPush: Object 
});
const Item = mongoose.model('Item', { tipo: String, titulo: String, link: String, autor: String, timestamp: String, reacciones: [String] });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'clase-secreta', resave: false, saveUninitialized: false }));

// --- RUTAS ---

app.get('/sw.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.send("self.addEventListener('push', e => { const data = e.data.json(); self.registration.showNotification(data.title, { body: data.body, icon: 'https://cdn-icons-png.flaticon.com/512/3449/3449692.png' }); });");
});

app.post('/auth', async (req, res) => {
    const { user, pass, pin, accion } = req.body;
    if (accion === 'registro') {
        const rol = (pin === '2845') ? 'admin' : 'estudiante';
        await new User({ user, pass, rol }).save();
        return res.send('Registrado con exito. <a href="/">Volver</a>');
    }
    const u = await User.findOne({ user, pass });
    if (u) { req.session.u = u.user; req.session.rol = u.rol; res.redirect('/'); }
    else res.send('Datos incorrectos');
});

app.post('/publicar', upload.single('archivo'), async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    let url = "";
    if (req.file) {
        const r = await new Promise((resolve) => {
            let s = cloudinary.uploader.upload_stream({ folder: "clase" }, (e, resu) => resolve(resu));
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        url = r.secure_url;
    }
    await new Item({ tipo: req.body.tipo, titulo: req.body.titulo, link: url, autor: req.session.u, timestamp: new Date().toLocaleString(), reacciones: [] }).save();
    
    // Notificar a todos
    const users = await User.find({ suscripcionPush: { $exists: true } });
    users.forEach(u => {
        webpush.sendNotification(u.suscripcionPush, JSON.stringify({ title: 'Nueva Publicacion', body: req.session.u + ' subio algo' })).catch(() => {});
    });
    res.redirect('/');
});

app.post('/suscribirse', async (req, res) => {
    await User.findOneAndUpdate({ user: req.session.u }, { suscripcionPush: req.body });
    res.status(201).json({});
});

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });

// --- INTERFAZ (HTML) ---
app.get('/', async (req, res) => {
    if (!req.session.u) {
        return res.send('<head><title>Aula Virtual</title></head><body style="background:#6c5ce7; font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;"><div id="splash" style="position:fixed;top:0;left:0;width:100%;height:100%;background:#6c5ce7;display:flex;flex-direction:column;justify-content:center;align-items:center;z-index:100;color:white;"><img src="https://cdn-icons-png.flaticon.com/512/3449/3449692.png" width="80"><h1>Aula Virtual</h1></div><form action="/auth" method="POST" style="background:white; padding:30px; border-radius:20px; width:280px; text-align:center;"><h2>Entrar</h2><input name="user" placeholder="Usuario" required style="width:100%; margin-bottom:10px; padding:10px;"><input name="pass" type="password" placeholder="Contrasena" required style="width:100%; margin-bottom:10px; padding:10px;"><input name="pin" placeholder="PIN Admin" style="width:100%; margin-bottom:10px; padding:10px;"><button name="accion" value="login" style="width:100%; background:#6c5ce7; color:white; padding:10px; border:none; border-radius:5px; cursor:pointer;">Entrar</button><button name="accion" value="registro" style="background:none; border:none; color:gray; margin-top:10px; cursor:pointer;">Crear cuenta</button></form><script>setTimeout(()=>document.getElementById("splash").style.display="none", 2000);</script></body>');
    }

    const items = await Item.find();
    const uLog = await User.findOne({ user: req.session.u });
    const todosU = req.session.rol === 'admin' ? await User.find() : [];

    let html = '<head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Aula Virtual</title><link rel="icon" href="https://cdn-icons-png.flaticon.com/512/3449/3449692.png"></head><body style="font-family:sans-serif; background:#f0f2f5; margin:0;">';
    html += '<nav style="background:#6c5ce7; color:white; padding:15px; display:flex; justify-content:space-between;"><b>' + req.session.u + '</b><a href="/salir" style="color:white;">Salir</a></nav>';
    html += '<div style="max-width:500px; margin:auto; padding:10px;">';
    html += '<button onclick="activar()" style="width:100%; background:#ff7675; color:white; border:none; padding:10px; border-radius:10px; margin-bottom:10px; font-weight:bold;">ACTIVAR NOTIFICACIONES</button>';
    
    // Formulario subir
    html += '<div style="background:white; padding:15px; border-radius:15px; margin-bottom:20px;"><h3>Publicar</h3><form action="/publicar" method="POST" enctype="multipart/form-data"><input name="titulo" placeholder="Titulo..." required style="width:100%; margin-bottom:10px;"><input type="file" name="archivo" style="margin-bottom:10px;"><button style="width:100%; background:#6c5ce7; color:white; padding:10px; border:none;">Subir</button></form></div>';

    // Lista de posts
    items.reverse().forEach(i => {
        html += '<div style="background:white; padding:15px; border-radius:15px; margin-bottom:15px;"><b>' + i.autor + ':</b> ' + i.titulo + '<br>';
        if (i.link) html += '<img src="' + i.link + '" style="width:100%; border-radius:10px; margin-top:10px;">';
        html += '</div>';
    });

    // Panel Admin
    if (req.session.rol === 'admin') {
        html += '<hr><h3>Admin Panel</h3>';
        todosU.forEach(u => {
            html += '<div style="background:white; padding:10px; margin-bottom:5px; display:flex; justify-content:space-between;">' + u.user + ' (' + u.rol + ') <span>🗑️</span></div>';
        });
    }

    html += '</div><script>async function activar(){ const p = await Notification.requestPermission(); if(p==="granted"){ const r = await navigator.serviceWorker.register("/sw.js"); const s = await r.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:"' + vapidKeys.publicKey + '"}); await fetch("/suscribirse",{method:"POST", body:JSON.stringify(s), headers:{"Content-Type":"application/json"}}); alert("Notificaciones activas"); } }</script></body>';
    res.send(html);
});

app.listen(PORT, () => console.log("Servidor corriendo en puerto " + PORT));
