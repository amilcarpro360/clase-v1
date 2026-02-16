self.addEventListener('push', function(event) {
    const data = event.data ? event.data.json() : { title: 'Clase', body: 'Nueva actualización' };
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: 'https://res.cloudinary.com/dvlbsl16g/image/upload/v1/logo',
            vibrate: [200, 100, 200]
        })
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(clients.openWindow('/'));
});
