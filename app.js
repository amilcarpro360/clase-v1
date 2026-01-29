const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const app = express();

const PORT = process.env.PORT || 3000;
const MONGO_URI = "mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/?appName=Cluster0"; // <--- PEGA TU LINK AQUÍ

mongoose.connect(MONGO_URI).then(() => console.log("¡Conectado al mongolo!"));

const Item = mongoose.model('Item', { tipo: String, texto: String, link: String, autor: String });
const User = mongoose.model('User', { user: String, pass: String, rol: String });

app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secreto', resave: false, saveUninitialized: false }));

app.post('/auth', async (req, res) => {
    const { user, pass, pin, accion } = req.body;
    if (accion === 'registro') {
        const rol = (pin === '1789') ? 'admin' : 'estudiante';
        await new User({ user, pass, rol }).save();
        return res.send(`Cuenta de ${rol} creada. <a href="/">Volver</a>`);
    }
    const u = await User.findOne({ user, pass });
    if (u) { req.session.u = u.user; req.session.rol = u.rol; res.redirect('/'); }
    else res.send('Error. <a href="/">Volver</a>');
});

app.post('/publicar', async (req, res) => {
    if (!req.session.u) return res.redirect('/');
    await new Item({ tipo: req.body.tipo, texto: req.body.texto, link: req.body.link, autor: req.session.u }).save();
    res.redirect('/');
});

app.post('/eliminar/:id', async (req, res) => {
    const post = await Item.findById(req.params.id);
    if (post && (post.autor === req.session.u || req.session.rol === 'admin')) {
        await Item.findByIdAndDelete(req.params.id);
    }
    res.redirect('/');
});

app.get('/', async (req, res) => {
    if (!req.session.u) return res.send(`
        <body style="font-family:sans-serif; background:#6c5ce7; display:flex; justify-content:center; align-items:center; height:100vh;">
            <div style="background:white; padding:30px; border-radius:15px; width:300px;">
                <h2 style="text-align:center;">🎓 Entrar</h2>
                <form action="/auth" method="POST">
                    <input name="user" placeholder="Usuario" style="width:100%; margin-bottom:10px;" required>
                    <input name="pass" type="password" placeholder="Contraseña" style="width:100%; margin-bottom:10px;" required>
                    <input name="pin" placeholder="PIN Admin (opcional)" style="width:100%; margin-bottom:10px;">
                    <button name="accion" value="login" style="width:100%; background:#6c5ce7; color:white; padding:10px; border:none; border-radius:5px;">Entrar</button>
                    <button name="accion" value="registro" style="width:100%; background:none; border:none; color:#666; margin-top:10px; cursor:pointer;">Crear cuenta</button>
                </form>
            </div>
        </body>`);

    const datos = await Item.find();
    const lista = datos.map(i => `
        <div style="background:white; padding:10px; margin-bottom:10px; border-radius:8px; border-left:5px solid #6c5ce7;">
            <b>${i.tipo}</b>: ${i.texto} <br>
            ${i.link ? `<a href="${i.link}" target="_blank">🔗 Ver en OneDrive</a><br>` : ''}
            <small>Por: ${i.autor}</small>
            ${(i.autor === req.session.u || req.session.rol === 'admin') ? 
                `<form action="/eliminar/${i._id}" method="POST"><button style="background:red; color:white; border:none; padding:3px 7px; border-radius:3px; cursor:pointer;">Borrar</button></form>` : ''}
        </div>`).join('');

    res.send(`
        <body style="font-family:sans-serif; background:#f4f7f6; margin:0;">
            <nav style="background:#6c5ce7; color:white; padding:15px; display:flex; justify-content:space-between;">
                <b>${req.session.rol === 'admin' ? '⭐ ' : ''}${req.session.u}</b>
                <a href="/salir" style="color:white; text-decoration:none;">Salir</a>
            </nav>
            <div style="max-width:500px; margin:20px auto; padding:0 15px;">
                <form action="/publicar" method="POST" style="background:white; padding:20px; border-radius:10px; margin-bottom:20px;">
                    <select name="tipo" style="width:100%; margin-bottom:10px;"><option value="apunte">📚 Apunte</option><option value="duda">❓ Duda</option></select>
                    <input name="texto" placeholder="Título" style="width:100%; margin-bottom:10px;" required>
                    <input name="link" placeholder="Link OneDrive (opcional)" style="width:100%; margin-bottom:10px;">
                    <button style="width:100%; background:#6c5ce7; color:white; padding:10px; border:none; border-radius:5px;">Publicar</button>
                </form>
                ${lista}
            </div>
        </body>`);
});

app.get('/salir', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.listen(PORT, () => console.log('Web lista'));