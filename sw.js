self.addEventListener('push', function(event) {
    const data = event.data ? event.data.json() : { title: 'Notificación de Clase', body: 'Tienes una nueva actualización.' };
    const options = {
        body: data.body,
        icon: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg',
        badge: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg',
        vibrate: [100, 50, 100]
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
});
