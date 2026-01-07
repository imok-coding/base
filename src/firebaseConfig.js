import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCOOnlmEcAcJywsS93LLfLSywy9ENqnppM',
  authDomain: 'tyler-manga-library.firebaseapp.com',
  projectId: 'tyler-manga-library',
  storageBucket: 'tyler-manga-library.firebasestorage.app',
  messagingSenderId: '307412068362',
  appId: '1:307412068362:web:6cfe5666187439dfa757f3',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
setPersistence(auth, browserSessionPersistence).catch((err) => {
  console.warn("Failed to set auth persistence", err);
});
export const db = getFirestore(app);
