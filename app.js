const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const webpush = require("web-push");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

/* ================== CONFIGURACIÓN INTEGRADA ================== */

// 🔹 Mongo Atlas
mongoose.connect("mongodb+srv://admin:clase1789@cluster0.jbyog90.mongodb.net/claseApp")
.then(() => console.log("✅ Mongo conectado"))
.catch(err => console.log(err));

// 🔹 Cloudinary
cloudinary.config({
  cloud_name: "dvlbsl16g",
  api_key: "721617469253873",
  api_secret: "IkWS7Rx0vD8ktW62IdWmlbhNTPk"
});

// 🔹 Web Push
webpush.setVapidDetails(
  "mailto:amilcarvaleromartinez33@gmail.com",
  "BOYDkx8i4CkqIwTEM_C3zi1r2XLs6CDhCahdUPRASD8UH7V0_bqsgY5IBvbaR_pze7guyfEk89cMKLO5du56z8M",
  "4W4KYN5QhFWFV0I0XMgj0XgQv86JPjJLU9G4_nkxueQ"
);

const upload = multer({ dest: "uploads/" });

/* ================== MODELOS ================== */

const User = mongoose.model("User", new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  role: { type: String, default: "user" },
  bannedUntil: Date
}));

const Post = mongoose.model("Post", new mongoose.Schema({
  title: String,
  content: String,
  type: String,
  files: [String],
  author: mongoose.Schema.Types.ObjectId
}));

const Subscription = mongoose.model("Subscription", new mongoose.Schema({
  user: mongoose.Schema.Types.ObjectId,
  subscription: Object
}));

/* ================== MIDDLEWARE ================== */

function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ msg: "No token" });

  const decoded = jwt.verify(token, "supersecreto123");
  req.user = decoded;
  next();
}

function isAdmin(req, res, next) {
  if (req.user.role !== "admin")
    return res.status(403).json({ msg: "Solo admins" });
  next();
}

function canPostDuda() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  if (
    (day === 5 && hour >= 18) ||
    day === 6 ||
    day === 0 ||
    (day === 1 && hour < 8)
  ) return false;

  return true;
}

/* ================== AUTH ================== */

app.post("/register", async (req, res) => {
  const { username, email, password, adminCode } = req.body;

  let role = "user";
  if (adminCode === "2845") role = "admin";

  const hashed = await bcrypt.hash(password, 10);

  await User.create({
    username,
    email,
    password: hashed,
    role
  });

  res.json({ msg: "Usuario creado" });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ msg: "No existe" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ msg: "Contraseña incorrecta" });

  const token = jwt.sign(
    { id: user._id, role: user.role },
    "supersecreto123"
  );

  res.json({ token });
});

/* ================== CREAR POST ================== */

app.post("/post", auth, upload.single("file"), async (req, res) => {
  const { title, content, type } = req.body;

  if (type === "duda" && !canPostDuda()) {
    return res.status(403).json({ msg: "No se puede publicar duda en este horario" });
  }

  let fileUrl = null;

  if (req.file) {
    const result = await cloudinary.uploader.upload(req.file.path);
    fileUrl = result.secure_url;
  }

  const post = await Post.create({
    title,
    content,
    type,
    files: fileUrl ? [fileUrl] : [],
    author: req.user.id
  });

  // 🔔 Enviar notificaciones
  const subs = await Subscription.find();

  subs.forEach(sub => {
    webpush.sendNotification(
      sub.subscription,
      JSON.stringify({
        title: "Nueva publicación",
        body: title
      })
    );
  });

  res.json(post);
});

/* ================== ADMIN ================== */

app.get("/users", auth, isAdmin, async (req, res) => {
  const users = await User.find();
  res.json(users);
});

app.put("/ban/:id", auth, isAdmin, async (req, res) => {
  const bannedUntil = new Date();
  bannedUntil.setDate(bannedUntil.getDate() + req.body.days);

  await User.findByIdAndUpdate(req.params.id, { bannedUntil });
  res.json({ msg: "Usuario baneado" });
});

/* ================== NOTIFICACIONES ================== */

app.post("/subscribe", auth, async (req, res) => {
  await Subscription.create({
    user: req.user.id,
    subscription: req.body
  });

  res.json({ msg: "Suscripción guardada 🔔" });
});

/* ================== START ================== */

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Servidor funcionando");
});
