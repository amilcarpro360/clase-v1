// sw.js
self.addEventListener('push', function(event) {
    const data = event.data ? event.data.json() : { title: 'Actualización', body: 'Nueva actividad en la clase' };
    const options = {
        body: data.body,
        icon: 'https://res.cloudinary.com/dvlbsl16g/image/upload/v1/samples/logo',
        vibrate: [200, 100, 200],
        badge: 'https://res.cloudinary.com/dvlbsl16g/image/upload/v1/samples/logo'
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(clients.openWindow('/'));
});
