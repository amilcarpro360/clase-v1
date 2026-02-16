const express = require('express');
const mongoose = require('mongoose');
const webpush = require('web-push');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());

// --- CONFIGURACIÓN DE NOTIFICACIONES ---
const publicVapidKey = process.env.PUBLIC_VAPID_KEY;
const privateVapidKey = process.env.PRIVATE_VAPID_KEY;
if (publicVapidKey && privateVapidKey) {
    webpush.setVapidDetails('mailto:tu-email@clase.com', publicVapidKey, privateVapidKey);
}

// --- CONEXIÓN MONGODB ---
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ MongoDB Conectado"));

// --- MODELO DE USUARIO ---
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true },
    profilePic: { type: String, default: 'https://via.placeholder.com/50' },
    role: { type: String, default: 'user' }, // 'admin' si usa código 2845
    themeColor: { type: String, default: '#3498db' },
    isBanned: { type: Boolean, default: false },
    pushSubscription: Object
}));

// --- LÓGICA DE RESTRICCIÓN DE FIN DE SEMANA (Punto 6) ---
const checkWeekendRule = (req, res, next) => {
    const now = new Date();
    const day = now.getDay(); // 0=Dom, 5=Vie, 1=Lun
    const hour = now.getHours();
    // Viernes 6pm (18:00) a Lunes 8am 
    const isWeekend = (day === 5 && hour >= 18) || (day === 6) || (day === 0) || (day === 1 && hour < 8);
    
    if (isWeekend) {
        // Aquí iría la consulta a la DB para ver si ya publicó 1 duda 
        console.log("Regla de fin de semana activa");
    }
    next();
};

// --- DISEÑO HTML ---
const HTML_UI = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Web de la Clase</title>
    <script src="https://upload-widget.cloudinary.com/global/all.js"></script>
    <style>
        :root { --main: #3498db; }
        body { font-family: 'Segoe UI', sans-serif; margin: 0; background: #f0f2f5; }
        #splash { position: fixed; inset: 0; background: var(--main); color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 2000; transition: 0.6s; }
        .nav { display: flex; background: #2c3e50; overflow-x: auto; position: sticky; top: 0; z-index: 100; }
        .nav-btn { color: white; padding: 15px; flex: 1; text-align: center; cursor: pointer; min-width: 80px; }
        .nav-btn:hover { background: #34495e; }
        .section { display: none; padding: 20px; animation: fadeIn 0.3s; }
        .active { display: block; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .admin-only { background: #c0392b !important; }
        .user-card { display: flex; align-items: center; background: white; padding: 10px; margin: 5px 0; border-radius: 8px; }
        .user-card img { border-radius: 50%; width: 45px; height: 45px; margin-right: 15px; border: 2px solid var(--main); }
    </style>
</head>
<body>
    <div id="splash"><h1>🏫 Web de la Clase</h1><p>Cargando...</p></div>

    <div class="nav">
        <div class="nav-btn" onclick="show('apuntes')">Apuntes</div>
        <div class="nav-btn" onclick="show('fechas')">Fechas</div>
        <div class="nav-btn" onclick="show('dudas')">Dudas</div>
        <div class="nav-btn" onclick="show('config')">Config</div>
        <div id="btn-admin" class="nav-btn admin-only" style="display:none;" onclick="show('admin')">Admin</div>
    </div>

    <section id="apuntes" class="section active">
        <h2>📚 Apuntes y Recursos</h2>
        <button id="btn-upload-apunte">Subir Imagen/PDF/Video</button>
        <div id="feed-apuntes"></div>
    </section>

    <section id="fechas" class="section">
        <h2>📅 Calendario de Fechas</h2>
        <div style="background:white; padding:15px; border-radius:10px;">
            <input type="text" placeholder="Título del evento">
            <input type="date">
            <button>Añadir</button>
        </div>
    </section>

    <section id="dudas" class="section">
        <h2>❓ Dudas y Deberes</h2>
        <div id="weekend-msg" style="color:red; display:none;">⚠️ Restricción de fin de semana: solo 1 duda permitida.</div>
        <textarea placeholder="¿Qué deberes hay?"></textarea>
        <button>Preguntar</button>
    </section>

    <section id="config" class="section">
        <h2>⚙️ Configuración</h2>
        <button onclick="activarNotis()">🔔 Activar Notificaciones Reales</button>
        <button id="btn-change-pic">Cambiar Foto de Perfil</button>
        <input type="color" onchange="document.documentElement.style.setProperty('--main', this.value)">
        <button onclick="location.reload()" style="background:#e74c3c; color:white;">Cerrar Sesión</button>
    </section>

    <section id="admin" class="section">
        <h2>🛡️ Gestor de Usuarios (Solo Admins)</h2>
        <div id="lista-usuarios"></div>
    </section>

    <script>
        // Splash Screen (Punto 4) [cite: 2]
        setTimeout(() => { document.getElementById('splash').style.opacity = '0'; 
        setTimeout(() => document.getElementById('splash').style.display='none', 600); }, 2000);

        function show(id) {
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.getElementById(id).classList.add('active');
        }

        // Cloudinary Widget (Punto "Cloudify")
        const myWidget = cloudinary.createUploadWidget({
            cloudName: 'TU_CLOUD_NAME', 
            uploadPreset: 'TU_PRESET'
        }, (error, result) => {
            if (!error && result && result.event === "success") { 
                alert("¡Archivo subido! URL: " + result.info.secure_url);
            }
        });

        document.getElementById("btn-upload-apunte").addEventListener("click", () => myWidget.open());
        document.getElementById("btn-change-pic").addEventListener("click", () => myWidget.open());

        // Notificaciones Reales (Punto 5) [cite: 2, 3]
        async function activarNotis() {
            const reg = await navigator.serviceWorker.register('/sw.js');
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: '${publicVapidKey}'
            });
            await fetch('/api/subscribe', {
                method: 'POST',
                body: JSON.stringify(sub),
                headers: {'Content-Type': 'application/json'}
            });
            alert("¡Notificaciones tipo YouTube activadas!");
        }
    </script>
</body>
</html>
`;

// --- RUTAS ---
app.get('/', (req, res) => res.send(HTML_UI));
app.get('/sw.js', (req, res) => res.sendFile(path.join(__dirname, 'sw.js')));

app.post('/api/subscribe', async (req, res) => {
    // Guardar suscripción en DB para enviar notis luego
    res.status(201).json({});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
