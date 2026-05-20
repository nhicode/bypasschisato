// ======================== CẤU HÌNH ========================
// ⚠️ THAY URL NÀY BẰNG BACKEND THỰC TẾ SAU KHI DEPLOY LÊN RENDER
const BACKEND_URL = 'https://YOUR_BACKEND.onrender.com';  // SỬA LẠI SAU KHI CÓ URL

let sessionCookie = '';
let csrfToken = '';
let userData = null;
let assignments = [];
let selectedIds = new Set();

// DOM elements
const loginPanel = document.getElementById('loginPanel');
const appPanel = document.getElementById('appPanel');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const scanBtn = document.getElementById('scanBtn');
const solveBtn = document.getElementById('solveBtn');
const genKeyBtn = document.getElementById('genKeyBtn');
const statusMsgSpan = document.getElementById('statusMsg');

function showToast(msg, isError = false) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = `position:fixed; bottom:20px; right:20px; background:#1f2937; padding:10px 18px; border-radius:40px; border-left:4px solid ${isError ? '#ef4444' : '#10b981'}; z-index:1000;`;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function addLog(msg, type = 'info') {
    const logDiv = document.getElementById('logArea');
    if (!logDiv) return;
    const entry = document.createElement('div');
    entry.style.marginBottom = '4px';
    entry.style.color = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#9ca3af');
    entry.innerHTML = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}

function updateUI() {
    if (!userData) return;
    document.getElementById('userName').innerText = userData.username;
    document.getElementById('userTier').innerText = userData.tier;
    const unlimited = userData.tier === 'vip' || userData.tier === 'ultra';
    document.getElementById('remainUses').innerText = unlimited ? '∞' : (userData.remain ?? 0);
    document.getElementById('examUses').innerText = (userData.tier === 'ultra') ? '∞' : (userData.exam_remain ?? 0);
}

// ======================== GỌI API QUA BACKEND ========================
async function callAPI(endpoint, options = {}) {
    const url = BACKEND_URL + endpoint;
    const headers = {
        'Content-Type': 'application/json',
        ...(sessionCookie ? { 'Cookie': sessionCookie } : {})
    };
    const res = await fetch(url, {
        ...options,
        headers: { ...headers, ...options.headers },
        credentials: 'include'
    });
    if (res.headers.get('set-cookie')) {
        sessionCookie = res.headers.get('set-cookie').split(';')[0];
    }
    return res.json();
}

// Đăng nhập
async function doLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    if (!username || !password) {
        showToast('Nhập đầy đủ thông tin', true);
        return;
    }
    loginBtn.disabled = true;
    loginBtn.innerText = 'Đang xử lý...';
    document.getElementById('loginError').innerText = '';

    try {
        const data = await callAPI('/api/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        if (data.ok) {
            userData = {
                username: data.uname,
                tier: data.tier,
                remain: data.remain,
                exam_remain: data.exam_remain,
                total: data.total,
                max_keys: data.max_keys,
                keys_today: 0
            };
            if (document.getElementById('rememberMe').checked) {
                localStorage.setItem('olm_user', JSON.stringify(userData));
                localStorage.setItem('olm_cookie', sessionCookie);
            } else {
                localStorage.removeItem('olm_user');
                localStorage.removeItem('olm_cookie');
            }
            updateUI();
            loginPanel.style.display = 'none';
            appPanel.style.display = 'block';
            showToast('Đăng nhập thành công!');
            await scanAssignments();
        } else {
            document.getElementById('loginError').innerText = data.msg || 'Đăng nhập thất bại';
            showToast(data.msg || 'Đăng nhập thất bại', true);
        }
    } catch (err) {
        document.getElementById('loginError').innerText = err.message;
        showToast(err.message, true);
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerText = '🚀 Đăng nhập';
    }
}

// Quét bài tập
async function scanAssignments() {
    if (!sessionCookie && userData) {
        showToast('Phiên đăng nhập hết hạn, đăng nhập lại', true);
        return;
    }
    const pages = parseInt(document.getElementById('pages').value) || 3;
    const mode = document.getElementById('scanMode').value;
    addLog(`Bắt đầu quét ${pages} trang...`);
    document.getElementById('progressArea').style.display = 'block';
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('progressText').innerText = 'Đang quét...';
    document.getElementById('logArea').innerHTML = '';

    try {
        const data = await callAPI(`/api/assignments?pages=${pages}&mode=${mode}`);
        if (data.ok) {
            assignments = data.assignments;
            selectedIds.clear();
            renderAssignmentList(assignments);
            addLog(`Tìm thấy ${assignments.length} bài. Video:${data.stats.video} LT:${data.stats.ly_thuyet} BT:${data.stats.bai_tap} KT:${data.stats.kiem_tra}`, 'success');
            document.getElementById('progressFill').style.width = '100%';
            document.getElementById('progressText').innerText = 'Hoàn tất';
            setTimeout(() => document.getElementById('progressArea').style.display = 'none', 1500);
        } else {
            addLog(data.msg || 'Lỗi quét bài', 'error');
        }
    } catch (err) {
        addLog(`Lỗi: ${err.message}`, 'error');
    }
}

function renderAssignmentList(assignments) {
    const container = document.getElementById('assignmentList');
    if (!assignments.length) {
        container.innerHTML = '<div>📭 Không có bài tập nào</div>';
        return;
    }
    let html = '';
    assignments.forEach(a => {
        const checked = selectedIds.has(a.id) ? 'checked' : '';
        let badgeClass = '';
        if (a.type === 'Video') badgeClass = 'badge-video';
        else if (a.type === 'Lý thuyết') badgeClass = 'badge-lythuyet';
        else if (a.type === 'Kiểm tra') badgeClass = 'badge-kiemtra';
        else badgeClass = 'badge-baitap';
        html += `
            <div class="assignment-item">
                <input type="checkbox" data-id="${a.id}" ${checked} class="assign-check">
                <div style="flex:1">
                    <div>${escapeHtml(a.title)}</div>
                    <div><span class="badge ${badgeClass}">${a.type}</span> <span style="font-size:0.7rem;">${a.done ? '✅ Đã làm' : '⏳ Chưa làm'}</span></div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
    document.querySelectorAll('.assign-check').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = cb.getAttribute('data-id');
            if (cb.checked) selectedIds.add(id);
            else selectedIds.delete(id);
            document.getElementById('solveBtn').disabled = selectedIds.size === 0;
        });
    });
    document.getElementById('solveBtn').disabled = selectedIds.size === 0;
}

function escapeHtml(str) {
    return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
}

// Giải bài đã chọn
async function solveSelected() {
    if (selectedIds.size === 0) {
        showToast('Chưa chọn bài nào', true);
        return;
    }
    const toSolve = assignments.filter(a => selectedIds.has(a.id));
    addLog(`Bắt đầu giải ${toSolve.length} bài...`);
    document.getElementById('progressArea').style.display = 'block';
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('logArea').innerHTML = '';
    let solved = 0;

    for (let i = 0; i < toSolve.length; i++) {
        const a = toSolve[i];
        document.getElementById('progressText').innerText = `Đang giải: ${a.title.substring(0,50)}...`;
        addLog(`Xử lý: ${a.title} (${a.type})`, 'info');
        try {
            const data = await callAPI('/api/solve', {
                method: 'POST',
                body: JSON.stringify({ assignment: a })
            });
            if (data.ok) {
                solved++;
                addLog(`✓ ${a.title.substring(0,45)} -> ${data.msg}`, 'success');
            } else {
                addLog(`✗ ${a.title.substring(0,45)} -> ${data.msg}`, 'error');
            }
        } catch (err) {
            addLog(`✗ ${a.title.substring(0,45)} -> Lỗi: ${err.message}`, 'error');
        }
        const percent = ((i+1)/toSolve.length)*100;
        document.getElementById('progressFill').style.width = percent + '%';
        await new Promise(r => setTimeout(r, 800));
    }
    document.getElementById('progressText').innerText = `Hoàn tất: ${solved}/${toSolve.length} bài thành công`;
    addLog(`Kết thúc: ${solved}/${toSolve.length} bài được giải.`, solved === toSolve.length ? 'success' : 'error');
    setTimeout(() => document.getElementById('progressArea').style.display = 'none', 2000);
    await scanAssignments();  // refresh list
}

// Tạo key (giả lập)
async function genKey() {
    if (userData.tier !== 'free') {
        showToast('VIP/Ultra không cần key', true);
        return;
    }
    if ((userData.keys_today || 0) >= (userData.max_keys || 2)) {
        showToast('Hôm nay đã tạo đủ 2 key', true);
        return;
    }
    try {
        const data = await callAPI('/api/key/start', { method: 'POST' });
        if (data.ok) {
            userData.keys_today = (userData.keys_today || 0) + 1;
            userData.remain += 5;
            userData.exam_remain += 1;
            updateUI();
            showToast(`Key mới: DEMO-${Math.random().toString(36).substring(2,8).toUpperCase()} (+5 BT, +1 KT)`);
            addLog('Tạo key thành công (giả lập).', 'success');
        } else {
            showToast(data.msg || 'Lỗi tạo key', true);
        }
    } catch (err) {
        showToast(err.message, true);
    }
}

function logout() {
    userData = null;
    sessionCookie = '';
    assignments = [];
    selectedIds.clear();
    loginPanel.style.display = 'block';
    appPanel.style.display = 'none';
    localStorage.removeItem('olm_user');
    localStorage.removeItem('olm_cookie');
    showToast('Đã đăng xuất');
}

function restoreSession() {
    const savedUser = localStorage.getItem('olm_user');
    const savedCookie = localStorage.getItem('olm_cookie');
    if (savedUser && savedCookie) {
        try {
            userData = JSON.parse(savedUser);
            sessionCookie = savedCookie;
            updateUI();
            loginPanel.style.display = 'none';
            appPanel.style.display = 'block';
            showToast('Đã khôi phục phiên');
            // Không tự động quét, để người dùng chủ động
        } catch(e) {}
    }
}

// Kiểm tra backend
async function checkBackend() {
    try {
        const res = await fetch(BACKEND_URL + '/proxy?url=https://httpbin.org/status/200');
        if (res.ok) statusMsgSpan.innerText = '✅ Kết nối backend thành công';
        else throw new Error();
    } catch(e) {
        statusMsgSpan.innerHTML = '❌ Không kết nối được backend! Hãy deploy backend lên Render và sửa BACKEND_URL.';
        showToast('Backend chưa chạy, kiểm tra lại URL', true);
    }
}

// Gán sự kiện
loginBtn.addEventListener('click', doLogin);
logoutBtn.addEventListener('click', logout);
scanBtn.addEventListener('click', scanAssignments);
solveBtn.addEventListener('click', solveSelected);
genKeyBtn.addEventListener('click', genKey);

// Khởi tạo
restoreSession();
checkBackend();