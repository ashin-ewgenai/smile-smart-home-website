import { auth } from '../lib/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';

const ADMIN_EMAIL = 'admin@smilesmarthome.in';

const loginForm = document.getElementById('loginForm') as HTMLFormElement | null;
const emailInput = document.getElementById('email') as HTMLInputElement | null;
const passwordInput = document.getElementById('password') as HTMLInputElement | null;
const loginLoader = document.getElementById('login-loader');
const loginButton = document.getElementById('loginButton');

// If already signed in, redirect
onAuthStateChanged(auth, (user) => {
  if (user && user.email) {
    localStorage.setItem('userEmail', user.email);
    const role = user.email === ADMIN_EMAIL ? 'admin' : 'user';
    localStorage.setItem('userRole', role);
    window.location.href = role === 'admin' ? '/dashboard/admin' : '/dashboard/user';
  }
});

function showLoader() {
  if (loginLoader) {
    loginLoader.classList.add('visible');
    document.documentElement.style.overflowY = 'hidden';
    document.body.style.overflowY = 'hidden';
    if (loginButton) {
      loginButton.setAttribute('disabled', 'true');
      loginButton.textContent = 'Signing in...';
    }
  }
}

function hideLoader() {
  if (loginLoader) {
    loginLoader.classList.remove('visible');
    document.documentElement.style.overflowY = '';
    document.body.style.overflowY = '';
    if (loginButton) {
      loginButton.removeAttribute('disabled');
      loginButton.textContent = 'Sign in';
    }
  }
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput?.value || '';
    const password = passwordInput?.value || '';
    try {
      showLoader();
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const user = cred.user;
      if (user && user.email) {
        localStorage.setItem('userEmail', user.email);
        const role = user.email === ADMIN_EMAIL ? 'admin' : 'user';
        localStorage.setItem('userRole', role);
        window.location.href = role === 'admin' ? '/dashboard/admin' : '/dashboard/user';
      }
    } catch (err) {
      console.error('Login failed', err);
      alert('Invalid email or password. Please try again.');
      hideLoader();
    }
  });
} else {
  console.error('Login form not found in the DOM');
}
