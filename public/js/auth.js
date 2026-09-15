let isLoginMode = true;

const tabLogin = document.getElementById('tabLogin');
const tabSignup = document.getElementById('tabSignup');
const nameGroup = document.getElementById('nameGroup');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const formSubtitle = document.getElementById('formSubtitle');
const authForm = document.getElementById('authForm');
const authAlert = document.getElementById('authAlert');

tabLogin.addEventListener('click', () => setMode(true));
tabSignup.addEventListener('click', () => setMode(false));

function setMode(login) {
  isLoginMode = login;
  authAlert.classList.add('hidden');
  if (login) {
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    nameGroup.style.display = 'none';
    authSubmitBtn.textContent = 'Sign In';
    formSubtitle.textContent = 'Sign in to start or join meetings';
  } else {
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    nameGroup.style.display = 'block';
    authSubmitBtn.textContent = 'Create Account';
    formSubtitle.textContent = 'Create a NexMeet account to host calls';
  }
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authAlert.classList.add('hidden');

  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const name = document.getElementById('authName').value.trim();

  const endpoint = isLoginMode ? '/api/login' : '/api/signup';
  const payload = isLoginMode ? { email, password } : { name, email, password };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      authAlert.textContent = data.error || 'Authentication failed.';
      authAlert.classList.remove('hidden');
      return;
    }

    localStorage.setItem('nexmeet_username', data.user.name);
    window.location.href = '/dashboard';
  } catch (err) {
    authAlert.textContent = 'Unable to connect to the server.';
    authAlert.classList.remove('hidden');
  }
});