import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app element');

app.innerHTML = '<h1>Connect 4</h1>';
