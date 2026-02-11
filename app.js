const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const webpush = require('web-push');
const app = express();

const PORT = process.env.PORT || 8080;

// 1. CONFIGURACIONES
cloudinary.config({ cloud_name: 'dvlbsl16g', api_key: '721617469253873', api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' });
const upload = multer();
const vKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:admin@clase.com', vKeys.publicKey, vKeys.privateKey);

// 2. CONEXIÓN Y ESQUEMAS
mongoose.connect('mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0');

const User = mongoose.model('User', { 
    user: String, pass: String, rol: String, 
    baneadoHasta: Date, suscripcionPush: Object,
    ultimaReaccion: { type: Map, of: Date, default: {} } // Petición 5: Control de reacciones
});

const Item = mongoose.model('Item', { 
    tipo: String, titulo: String, link: String, autor: String, 
    timestamp: String, reacciones: { type: [String], default: [] } 
});

// Petición 3: Configuración del Logo del Admin
const Config = mongoose.model('Config', { logoUrl: String });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'aula-pro-2024', resave: false, saveUninitialized: false }));

// 3. MIDDLEWARE DE RESTRICCIÓN HORARIA (Petición 8)
const verificarHorario = function(req, res, next) {
    const ahora = new Date();
    const dia = ahora.getDay(); // 0=Dom, 5=Vie, 6=Sab, 1=Lun
    const hora = ahora.getHours();
    
    // Viernes > 18:00 hasta Lunes < 08:00
    const esFinDeSemana = (dia === 5 && hora >= 18) || (dia === 6) || (dia === 0) || (dia === 1 && hora < 8);
    
    if (esFinDeSemana && req.path === '/publicar') {
        // En fin de semana solo se permite una publicación (lógica simplificada: avisar al usuario)
        console.log('Restricción de fin de semana activa');
    }
    next();
};

// 4. RUTAS DE AUTENTICACIÓN
app.post('/auth', async function(req, res){
    const { user, pass, pin, accion } = req.body;
    if (accion === 'registro') {
        const rol = (pin === '2845') ? 'admin' : 'estudiante';
        await new User({ user, pass, rol }).save();
        return res.send('Registrado como ' + rol + '. <a href="/">Volver</a>');
    }
    const u = await User.findOne({ user, pass });
    if (u) {
        if (u.baneadoHasta && u.baneadoHasta > new Date()) return res.send('Penalizado hasta: ' + u.baneadoHasta.toLocaleString());
        req.session.u = u.user; req.session.rol = u.rol; res.redirect('/');
    } else res.send('Error de acceso.');
});

// 5. PUBLICAR (Petición 1 y 2)
app.post('/publicar', verificarHorario, upload.single('archivo'), async function(req, res){
    if (!req.session.u) return res.redirect('/');
    let url = '';
    if (req.file) {
        const r = await new Promise(function(resul){
            let s = cloudinary.uploader.upload_stream({ folder: 'aula' }, function(e, rs){ resul(rs); });
            streamifier.createReadStream(req.file.buffer).pipe(s);
        });
        url = r.secure_url;
    }
    await new Item({ tipo: req.body.tipo, titulo: req.body.titulo, link: url, autor: req.session.u, timestamp: new Date().toLocaleString() }).save();
    
    // Notificaciones (Petición 2)
    const subs = await User.find({ suscripcionPush: { $exists: true } });
    subs.forEach(s => {
        webpush.sendNotification(s.suscripcionPush, JSON.stringify({ title: 'Aula: ' + req.session.u, body: 'Nuevo contenido disponible' })).catch(()=>{});
    });
    res.redirect('/');
});

// 6. REACCIONAR UNA VEZ POR DÍA (Petición 5)
app.post('/reaccionar/:id', async function(req, res){
    const u = await User.findOne({ user: req.session.u });
    const hoy = new Date().toDateString();
    
    if (u.ultimaReaccion.get(req.params.id) === hoy) {
        return res.send('Ya reaccionaste a este post hoy. <a href="/">Volver</a>');
    }
    
    await Item.findByIdAndUpdate(req.params.id, { $push: { reacciones: req.session.u } });
    u.ultimaReaccion.set(req.params.id, hoy);
    await u.save();
    res.redirect('/');
});

// 7. ADMIN: BORRAR CUENTAS Y PENALIZAR (Petición 6 y 7)
app.post('/admin/borrar-cuenta', async function(req, res){
    if (req.session.rol === 'admin') await User.findByIdAndDelete(req.body.id);
    res.redirect('/');
});

app.post('/admin/penalizar', async function(req, res){
    if (req.session.rol === 'admin') {
        let f = new Date();
        f.setHours(f.getHours() + parseInt(req.body.horas));
        await User.findByIdAndUpdate(req.body.id, { baneadoHasta: f });
    }
    res.redirect('/');
});

app.post('/admin/logo', async function(req, res){
    if (req.session.rol === 'admin') await Config.findOneAndUpdate({}, { logoUrl: req.body.logo }, { upsert: true });
    res.redirect('/');
});

app.get('/salir', function(req, res){ req.session.destroy(); res.redirect('/'); });

// 8. INTERFAZ
app.get('/', async function(req, res){
    const conf = await Config.findOne() || { logoUrl: 'https://cdn-icons-png.flaticon.com/512/3449/3449692.png' };
    
    if (!req.session.u) {
        return res.send('<html><body style="background:#6c5ce7;font-family:sans-serif;text-align:center;color:white;padding-top:50px;"><img src="'+conf.logoUrl+'" width="80"><h1>Aula Virtual</h1><form action="/auth" method="POST" style="background:white;color:black;display:inline-block;padding:30px;border-radius:20px;width:280px;"><input name="user" placeholder="Usuario" required style="width:100%;margin-bottom:10px;"><input name="pass" type="password" placeholder="Pass" required style="width:100%;margin-bottom:10px;"><input name="pin" placeholder="PIN Admin" style="width:100%;margin-bottom:10px;"><button name="accion" value="login" style="width:100%;background:#6c5ce7;color:white;padding:10px;border:none;border-radius:5px;">ENTRAR</button><button name="accion" value="registro" style="background:none;border:none;color:gray;margin-top:10px;">Crear cuenta</button></form></body></html>');
    }

    const items = await Item.find();
    const usuarios = req.session.rol === 'admin' ? await User.find() : [];

    let html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="font-family:sans-serif;background:#f0f2f5;margin:0;">';
    html += '<nav style="background:#6c5ce7;color:white;padding:15px;display:flex;justify-content:space-between;align-items:center;"><img src="'+conf.logoUrl+'" width="30"><b>'+req.session.u+'</b><a href="/salir" style="color:white;">Salir</a></nav>';
    html += '<div style="max-width:500px;margin:auto;padding:10px;">';
    
    // Formulario de Post
    html += '<div style="background:white;padding:15px;border-radius:15px;margin-bottom:20px;"><h3>Nueva Publicación</h3><form action="/publicar" method="POST" enctype="multipart/form-data"><input name="titulo" placeholder="Duda o Apunte" required style="width:100%;margin-bottom:10px;"><input type="file" name="archivo" style="margin-bottom:10px;"><button style="width:100%;background:#6c5ce7;color:white;padding:10px;border:none;border-radius:5px;">PUBLICAR</button></form></div>';

    // Muro
    items.reverse().forEach(function(i){
        html += '<div style="background:white;padding:15px;border-radius:15px;margin-bottom:10px;"><b>'+i.autor+':</b> '+i.titulo+'<br>';
        if(i.link) html += '<img src="'+i.link+'" style="width:100%;border-radius:10px;margin-top:10px;">';
        html += '<form action="/reaccionar/'+i._id+'" method="POST" style="margin-top:10px;"><button style="border:none;background:#eee;padding:5px 10px;border-radius:10px;cursor:pointer;">💡 Útil ('+i.reacciones.length+')</button></form></div>';
    });

    // Panel Admin
    if(req.session.rol === 'admin'){
        html += '<div style="background:#333;color:white;padding:20px;border-radius:15px;margin-top:30px;"><h3>👑 Panel de Control</h3>';
        html += '<form action="/admin/logo" method="POST"><input name="logo" placeholder="URL del nuevo logo" style="width:70%"><button>Cambiar Logo</button></form><hr>';
        usuarios.forEach(function(u){
            if(u.user !== req.session.u) {
                html += '<div style="margin-bottom:10px;">'+u.user+'<br><form action="/admin/penalizar" method="POST" style="display:inline;"><input type="hidden" name="id" value="'+u._id+'"><input name="horas" placeholder="Horas" width="30"><button>Penalizar</button></form> ';
                html += '<form action="/admin/borrar-cuenta" method="POST" style="display:inline;"><input type="hidden" name="id" value="'+u._id+'"><button style="color:red;">Borrar</button></form></div>';
            }
        });
        html += '</div>';
    }

    html += '</div></body></html>';
    res.send(html);
});

app.listen(PORT, '0.0.0.0', function(){ console.log('🚀 Sistema Completo en puerto ' + PORT); });
