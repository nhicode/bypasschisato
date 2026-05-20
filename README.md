# OLM Auto Tool

- Backend Python Flask, deploy trên Render
- Frontend HTML/CSS/JS tĩnh, deploy trên GitHub Pages

## Hướng dẫn deploy

1. Tạo repository GitHub, đẩy code theo cấu trúc trên.
2. Deploy backend lên Render: chọn Web Service, kết nối repo, root directory là `backend`, build `pip install -r requirements.txt`, start `gunicorn app:app`.
3. Deploy frontend lên GitHub Pages: vào Settings → Pages, chọn branch main, thư mục gốc `/frontend`.
4. Sửa `BACKEND_URL` trong `frontend/script.js` thành URL backend thực tế.
5. Truy cập link GitHub Pages để dùng.

## Công nghệ
- Flask, BeautifulSoup, requests
- HTML5, CSS3, JavaScript thuần