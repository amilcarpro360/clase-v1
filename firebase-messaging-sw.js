importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyCjv9izSETcQqL6Ad0sN8LDAX81FabWmvY",
    projectId: "aulavirtual1of",
    messagingSenderId: "397072596716",
    appId: "1:397072596716:web:c04730aedbcc3e9fc42fc9"
});

const messaging = firebase.messaging();
