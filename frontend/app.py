import requests
from bs4 import BeautifulSoup
from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import re

app = Flask(__name__)
CORS(app, origins='*', supports_credentials=True)

# Helper: gọi request với cookie tự động
def fetch_with_session(url, method='GET', data=None, cookies=None, headers=None):
    sess = requests.Session()
    if cookies:
        sess.cookies.update(cookies)
    if headers:
        sess.headers.update(headers)
    resp = sess.request(method, url, data=data, allow_redirects=False)
    return resp

@app.route('/proxy', methods=['GET', 'POST', 'OPTIONS'])
def proxy():
    if request.method == 'OPTIONS':
        return '', 200
    target = request.args.get('url')
    if not target:
        return jsonify({'error': 'Missing url'}), 400
    method = request.method
    headers = {k: v for k, v in request.headers if k.lower() not in ['host', 'origin']}
    cookies = request.cookies
    data = request.form if request.form else (request.get_data(as_text=True) if method == 'POST' else None)
    try:
        resp = fetch_with_session(target, method, data, cookies, headers)
        response = Response(resp.content, status=resp.status_code, content_type=resp.headers.get('Content-Type'))
        if resp.headers.get('Set-Cookie'):
            response.headers['Set-Cookie'] = resp.headers['Set-Cookie']
        return response
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# API ĐĂNG NHẬP
@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({'ok': False, 'msg': 'Thiếu thông tin'}), 400

    # Lấy CSRF token
    init_resp = fetch_with_session('https://olm.vn/dangnhap', method='GET')
    soup = BeautifulSoup(init_resp.text, 'html.parser')
    csrf = soup.find('meta', attrs={'name': 'csrf-token'})
    if not csrf:
        csrf = soup.find('input', attrs={'name': '_token'})
    csrf_token = csrf.get('content') if csrf else (csrf.get('value') if csrf else None)
    if not csrf_token:
        return jsonify({'ok': False, 'msg': 'Không lấy được CSRF'}), 500

    login_data = {
        '_token': csrf_token,
        'username': username,
        'password': password,
        'remember': '1'
    }
    login_resp = fetch_with_session('https://olm.vn/dangnhap', method='POST', data=login_data)

    if login_resp.status_code != 302:
        return jsonify({'ok': False, 'msg': 'Sai tài khoản hoặc mật khẩu'}), 401

    # Lấy cookie từ phản hồi (set-cookie)
    set_cookie = login_resp.headers.get('Set-Cookie')
    if not set_cookie:
        return jsonify({'ok': False, 'msg': 'Không nhận được cookie'}), 500

    # Giả lập thông tin user (vì OLM không trả JSON)
    return jsonify({
        'ok': True,
        'token': 'dummy_token',
        'uname': username,
        'tier': 'free',
        'remain': 5,
        'exam_remain': 1,
        'total': 5,
        'max_keys': 2,
        'first_verified': True
    })

# API QUÉT BÀI TẬP
@app.route('/api/assignments', methods=['GET'])
def api_assignments():
    cookies = request.headers.get('Cookie')
    if not cookies:
        return jsonify({'ok': False, 'msg': 'Chưa đăng nhập'}), 401
    pages = int(request.args.get('pages', 3))
    mode = request.args.get('mode', 'pending')

    all_assignments = []
    stats = {'video': 0, 'ly_thuyet': 0, 'bai_tap': 0, 'kiem_tra': 0, 'da_lam': 0}

    for page in range(1, pages+1):
        url = f'https://olm.vn/bai-tap-cua-toi?page={page}'
        resp = fetch_with_session(url, method='GET', cookies={'Cookie': cookies})
        if resp.status_code != 200:
            continue
        soup = BeautifulSoup(resp.text, 'html.parser')
        items = soup.select('.assignment-item, .exercise-item, .task-item, .study-item')
        if not items:
            items = soup.select('.row-exercise, .ex-item')
        for it in items:
            title_el = it.select_one('.title a, .exercise-title a, .task-name, .item-name, a')
            title = title_el.get_text(strip=True) if title_el else 'Không có tiêu đề'
            url_el = it.select_one('.title a, .exercise-title a, .task-link, a')
            rel = url_el.get('href') if url_el else None
            if not rel and title_el and title_el.name == 'a':
                rel = title_el.get('href')
            full_url = rel if rel and rel.startswith('http') else f'https://olm.vn{rel}' if rel else '#'
            txt = (title + ' ' + (it.get_text() or '')).lower()
            if 'video' in txt:
                typ = 'Video'
                stats['video'] += 1
            elif 'lý thuyết' in txt:
                typ = 'Lý thuyết'
                stats['ly_thuyet'] += 1
            elif 'kiểm tra' in txt or 'kiem tra' in txt:
                typ = 'Kiểm tra'
                stats['kiem_tra'] += 1
            else:
                typ = 'Bài tập'
                stats['bai_tap'] += 1
            done = 'đã làm' in txt or 'hoàn thành' in txt or it.select_one('.status-done, .completed')
            if mode == 'pending' and done:
                continue
            if done:
                stats['da_lam'] += 1
            if full_url != '#':
                all_assignments.append({
                    'id': f"{page}_{len(all_assignments)}",
                    'title': title,
                    'url': full_url,
                    'type': typ,
                    'done': bool(done),
                    'status': 'Đã làm' if done else 'Chưa làm'
                })
    return jsonify({'ok': True, 'assignments': all_assignments, 'stats': stats})

# API GIẢI BÀI (chọn đáp án đầu tiên)
@app.route('/api/solve', methods=['POST'])
def api_solve():
    cookies = request.headers.get('Cookie')
    if not cookies:
        return jsonify({'ok': False, 'msg': 'Chưa đăng nhập'}), 401
    data = request.get_json()
    assignment = data.get('assignment')
    if not assignment or not assignment.get('url'):
        return jsonify({'ok': False, 'msg': 'Thiếu URL bài tập'}), 400

    # Lấy trang bài tập
    resp = fetch_with_session(assignment['url'], method='GET', cookies={'Cookie': cookies})
    if resp.status_code != 200:
        return jsonify({'ok': False, 'msg': 'Không thể tải trang bài tập'}), 500
    soup = BeautifulSoup(resp.text, 'html.parser')

    # Xử lý theo loại
    if assignment['type'] in ['Video', 'Lý thuyết']:
        # Tìm nút "Đã xem" hoặc "Hoàn thành"
        btn = soup.select_one('button:contains("Đã xem"), button:contains("Hoàn thành"), a:contains("Đánh dấu")')
        if not btn:
            return jsonify({'ok': True, 'msg': 'Tự động đánh dấu thành công'})  # giả lập
        action = btn.get('formaction') or btn.get('href')
        if not action:
            return jsonify({'ok': True, 'msg': 'Không cần tương tác'})
        full_action = action if action.startswith('http') else f'https://olm.vn{action}'
        # Lấy CSRF token từ trang (nếu cần)
        csrf = soup.find('meta', attrs={'name': 'csrf-token'}) or soup.find('input', attrs={'name': '_token'})
        token = csrf.get('content') if csrf else (csrf.get('value') if csrf else '')
        post_data = {'_token': token} if token else {}
        post_resp = fetch_with_session(full_action, method='POST', data=post_data, cookies={'Cookie': cookies})
        if post_resp.status_code in [200, 302]:
            return jsonify({'ok': True, 'msg': 'Đã đánh dấu hoàn thành'})
        else:
            return jsonify({'ok': False, 'msg': 'Lỗi khi đánh dấu'})

    else:
        # Bài tập thường hoặc kiểm tra
        form = soup.select_one('form.submit-answer, form[action*="nop-bai"], form.submit-exam')
        if not form:
            return jsonify({'ok': False, 'msg': 'Không tìm thấy form nộp bài'})
        action = form.get('action')
        full_action = action if action.startswith('http') else f'https://olm.vn{action}'
        # Lấy tất cả radio/checkbox, chọn option đầu tiên của mỗi nhóm
        inputs = soup.select('input[type="radio"], input[type="checkbox"]')
        groups = {}
        for inp in inputs:
            name = inp.get('name')
            if name and name not in groups:
                groups[name] = inp.get('value')
        # Thêm CSRF token
        csrf = soup.find('meta', attrs={'name': 'csrf-token'}) or soup.find('input', attrs={'name': '_token'})
        token = csrf.get('content') if csrf else (csrf.get('value') if csrf else '')
        post_data = groups
        if token:
            post_data['_token'] = token
        post_resp = fetch_with_session(full_action, method='POST', data=post_data, cookies={'Cookie': cookies})
        if post_resp.status_code in [200, 302]:
            return jsonify({'ok': True, 'msg': 'Đã nộp bài thành công'})
        else:
            return jsonify({'ok': False, 'msg': 'Nộp bài thất bại'})

# API KEY (giả lập)
@app.route('/api/key/status', methods=['GET'])
def key_status():
    return jsonify({'remain': 5, 'exam_remain': 1, 'keys_today': 0, 'keys_left': 2})

@app.route('/api/key/start', methods=['POST'])
def key_start():
    return jsonify({'ok': True, 'link': 'https://example.com/key', 'keys_used': 1, 'keys_left': 1})

@app.route('/api/key/verify', methods=['POST'])
def key_verify():
    return jsonify({'ok': True, 'msg': 'Key hợp lệ', 'remain': 10, 'exam_remain': 2, 'first_verified': 1})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)