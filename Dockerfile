# Usamos Node 22 que es el que Koyeb intentó usar con éxito
FROM node:22

# Creamos la carpeta de la app
WORKDIR /usr/src/app

# Copiamos SOLO el package.json (no hace falta el lockfile aquí)
COPY package*.json ./

# Instalamos todo (aquí npm install funcionará sin errores de lockfile)
RUN npm install

# Copiamos el resto del código (app.js, etc.)
COPY . .

# Exponemos el puerto de Koyeb
EXPOSE 8080

# Arrancamos la app
CMD [ "node", "app.js" ]
