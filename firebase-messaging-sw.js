importScripts('https://www.gstatic.com/firebasejs/10.12.3/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.3/firebase-messaging-compat.js');

// Must match the Firebase project used by the web app
firebase.initializeApp({
  apiKey: "AIzaSyBb9XPvVQ9nnLwRf6UYTVCnL3dabLY-B7I",
  authDomain: "ezee-git-config.firebaseapp.com",
  projectId: "ezee-git-config",
  storageBucket: "ezee-git-config.firebasestorage.app",
  messagingSenderId: "106776336",
  appId: "1:106776336:web:91d276bf2bd70d55954795",
  measurementId: "G-YJGQLTWJ8J"
});

const messaging = firebase.messaging();

// Handle background messages (browser closed)
messaging.onBackgroundMessage((payload) => {
  const notification = payload?.notification || {};
  const title = notification.title || 'Ezee Money';
  const body = notification.body || 'New notification';
  const data = payload?.data || {};

  const link = (payload?.fcmOptions && payload.fcmOptions.link)
    || (payload?.webpush && payload.webpush.fcmOptions && payload.webpush.fcmOptions.link)
    || '/admin/dashboard.html';

  self.registration.showNotification(title, {
    body,
    icon: notification.icon || '/favicon.ico',
    data: { link, ...data }
  });
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const link = event.notification?.data?.link || '/admin/dashboard.html';
  event.waitUntil(clients.openWindow(link));
});
