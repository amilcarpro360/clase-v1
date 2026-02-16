const express = require('express');
const mongoose = require('mongoose');
const session = require('cookie-session');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const webpush = require('web-push');

const app = express();

// ================= CONFIGURACIÓN (PON TUS DATOS AQUÍ) =================
const MONGO_URI = "mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0";
cloudinary.config({ 
  cloud_name: 'dvlbsl16g', 
  api_key: '721617469253873', 
  api_secret: 'IkWS7Rx0vD8ktW62IdWmlbhNTPk' 
});

// Claves para notificaciones (VAPID)
const vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:admin@tuweb.com', vapidKeys.publicKey, vapidKeys.privateKey);
// ======================================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ name: 'session', keys: ['secret2845'], maxAge: 24 * 60 * 60 * 1000 }));

// MODELOS
const User = mongoose.model('User', new mongoose.Schema({
    username: String,
    password: { type: String, required: true },
    role: { type: String, default: 'user' }, 
    profilePic: { type: String, default: 'https://via.placeholder.com/150' },
    isBanned: { type: Boolean, default: false }, // 
    config: { color: { type: String, default: '#2c3e50' }, splash: { type: String, default: 'Bienvenido' } }
}));

const Post = mongoose.model('Post', new mongoose.Schema({
    type: String, title: String, content: String, fileUrl: String, author: String,
    comments: [{ author: String, text: String, img: String }], // 
    createdAt: { type: Date, default: Date.now }
}));

// RESTRICCIÓN FIN DE SEMANA (Punto 6)
const esFindeRestringido = () => {
    const ahora = new Date();
    const dia = ahora.getDay(); 
    const hora = ahora.getHours();
    return (dia === 5 && hora >= 18) || dia === 6 || dia === 0 || (dia === 1 && hora < 8); // 
};

// RUTAS
app.post('/api/auth/register', async (req, res) => {
    const { username, password, code } = req.body;
    const role = (code === "2845") ? 'admin' : 'user'; // 
    const user = new User({ username, password, role });
    await user.save();
    res.json({ success: true });
});

app.get('/sw.js', (req, res) => {
    res.sendFile(__dirname + '/sw.js');
});

// FRONTEND INTEGRADO
app.get('*', async (req, res) => {
    const adminConf = await User.findOne({ role: 'admin' });
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Plataforma Escolar</title>
    <style>
        :root { --main-color: ${adminConf?.config.color || '#2c3e50'}; }
        body { font-family: sans-serif; margin: 0; background: #f0f2f5; }
        nav { background: var(--main-color); color: white; display: flex; justify-content: space-around; padding: 15px; position: sticky; top: 0; }
        .tab { display: none; padding: 20px; }
        .active { display: block; }
        /* FOTO A LA IZQUIERDA (Punto 2.5) */
        .user-item { display: flex; align-items: center; background: white; padding: 10px; margin: 10px 0; border-radius: 8px; }
        .user-item img { width: 50px; height: 50px; border-radius: 50%; margin-right: 15px; } 
        #splash { position: fixed; top:0; width:100%; height:100%; background:white; display:flex; justify-content:center; align-items:center; z-index:1000; }
    </style>
</head>
<body>
    <div id="splash"><h1>${adminConf?.config.splash || 'Cargando...'}</h1></div>

    <nav>
        <div onclick="tab('apuntes')">Apuntes</div>
        <div onclick="tab('fechas')">Fechas</div>
        <div onclick="showDudas()">Dudas</div>
        <div onclick="tab('config')">Config</div>
        <div onclick="tab('admin')">Gestor</div>
    </nav>

    <div id="apuntes" class="tab active">
        <h2>Pestaña Apuntes (PDF/Videos/Links)</h2> <input type="file" id="up"> <button onclick="alert('Subiendo...')">Subir</button>
    </div>

    <div id="admin" class="tab">
        <h2>Gestor de Usuarios (Admins)</h2>
        <div id="listaUsuarios">
            <div class="user-item"><img src="https://via.placeholder.com/50"><span>Usuario Ejemplo (Bannear)</span></div>
        </div>
    </div>

    <script>
        function tab(id) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.getElementById(id).classList.add('active');
        }
        
        // Splash (Punto 4)
        setTimeout(() => document.getElementById('splash').style.display='none', 2000);

        // Registro de Notificaciones Reales (Punto 5)
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').then(() => console.log("SW Registrado"));
        }
    </script>
</body>
</html>
    `);
});

mongoose.connect(MONGO_URI).then(() => app.listen(process.env.PORT || 3000));
