importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCsB1Gyhf0GTP60IOInILXG8eg7r-IcO5U",
  authDomain: "olasandbselectronics-959c7.firebaseapp.com",
  projectId: "olasandbselectronics-959c7",
  storageBucket: "olasandbselectronics-959c7.firebasestorage.app",
  messagingSenderId: "258031638602",
  appId: "1:258031638602:web:8e2751634dd46ad032eeb3",
  measurementId: "G-GZTYHTTF5J"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon-192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
