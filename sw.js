self.addEventListener('push', function(event) {
    const data = event.data ? event.data.json() : { title: 'Plataforma Escolar', body: 'Tienes una nueva actualización' };
    
    const options = {
        body: data.body,
        icon: 'https://via.placeholder.com/192',
        badge: 'https://via.placeholder.com/96'
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Al hacer clic en la notificación
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});
