import { renderLogin, attachLoginHandler } from './components/login.js';
import { renderDashboard } from './components/dashboard.js';

const app = document.getElementById('app');
const token = localStorage.getItem('token');

if (!token) {
    app.innerHTML = renderLogin();
    attachLoginHandler();
} else {
    app.innerHTML = renderDashboard();
    // Gọi các hàm quét bài, giải bài (tương tự các phiên bản trước nhưng dùng BACKEND_URL)
}