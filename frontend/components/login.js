import { login } from '../src/auth.js';

export function renderLogin() {
    return `
        <div class="login-card">
            <input id="username" placeholder="Tên đăng nhập" />
            <input id="password" type="password" placeholder="Mật khẩu" />
            <button id="btnLogin">Đăng nhập</button>
            <div id="errorMsg"></div>
        </div>
    `;
}

export function attachLoginHandler() {
    document.getElementById('btnLogin').onclick = async () => {
        const user = document.getElementById('username').value;
        const pass = document.getElementById('password').value;
        const data = await login(user, pass);
        if (data.ok) {
            localStorage.setItem('token', data.token);
            // chuyển sang màn hình chính
            window.location.reload();
        } else {
            document.getElementById('errorMsg').innerText = data.msg;
        }
    };
}