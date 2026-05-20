// Xử lý đăng nhập thực tế qua backend API (Render)
const BACKEND_URL = 'https://ten-backend-cua-ban.onrender.com';

export async function login(username, password) {
    const res = await fetch(`${BACKEND_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    return res.json();
}