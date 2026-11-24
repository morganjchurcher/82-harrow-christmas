#!/usr/bin/env python3
"""
82 Harrow Christmas Dinner Organisation Dashboard
All-in-one Web Server + SQLite Database + Recipe URL Scraper
Run locally: python3 app.py
"""

import gzip
import hashlib
import hmac
import html
import json
import os
import re
import secrets
import socket
import sqlite3
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from datetime import datetime
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DATA_DIR = os.environ.get("DATA_DIR", BASE_DIR)
DB_PATH = os.path.join(DATA_DIR, "harrow82_christmas.db")
PORT = int(os.environ.get("PORT", "8080"))

DB_LOCK = threading.Lock()

AVATAR_COLORS = [
    "#c0392b",  # Cranberry Red
    "#1e824c",  # Pine Green
    "#d35400",  # Mulled Spice
    "#8e44ad",  # Sugar Plum
    "#2980b9",  # Winter Frost
    "#b7950b",  # Festive Gold
    "#16a085",  # Holly Leaf
    "#a93226",  # Cinnamon
]


def get_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    if not salt:
        salt = secrets.token_hex(16)
    pwd_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120_000,
    ).hex()
    return pwd_hash, salt


def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    computed, _ = hash_password(password, salt)
    return hmac.compare_digest(computed, stored_hash)


def is_morgan_user(username: str, display_name: str = "") -> bool:
    u = (username or "").strip().lower()
    d = (display_name or "").strip().lower()
    return u == "morgan" or d == "morgan" or u.startswith("morgan")


def init_db():
    with DB_LOCK:
        conn = get_db()
        try:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    display_name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    password_salt TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'housemate',
                    can_edit_dishes INTEGER NOT NULL DEFAULT 0,
                    avatar_color TEXT NOT NULL DEFAULT '#c0392b',
                    created_at TEXT NOT NULL,
                    last_login_at TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS dishes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'Sides & Trimmings',
                    notes TEXT NOT NULL DEFAULT '',
                    max_claims INTEGER NOT NULL DEFAULT 1,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_by INTEGER,
                    created_at TEXT NOT NULL,
                    recipe_url TEXT NOT NULL DEFAULT '',
                    recipe_title TEXT NOT NULL DEFAULT '',
                    recipe_description TEXT NOT NULL DEFAULT '',
                    recipe_prep_time TEXT NOT NULL DEFAULT '',
                    recipe_cook_time TEXT NOT NULL DEFAULT '',
                    recipe_ingredients TEXT NOT NULL DEFAULT '[]',
                    recipe_image TEXT NOT NULL DEFAULT '',
                    recipe_added_by TEXT NOT NULL DEFAULT '',
                    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
                );

                CREATE TABLE IF NOT EXISTS claims (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    dish_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    note TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'claimed',
                    claimed_at TEXT NOT NULL,
                    UNIQUE(dish_id, user_id),
                    FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                """
            )

            # Safe migrations for existing tables
            user_cols = {
                r["name"] for r in conn.execute("PRAGMA table_info(users)").fetchall()
            }
            if "can_edit_dishes" not in user_cols:
                conn.execute("ALTER TABLE users ADD COLUMN can_edit_dishes INTEGER NOT NULL DEFAULT 0")
            if "last_login_at" not in user_cols:
                conn.execute("ALTER TABLE users ADD COLUMN last_login_at TEXT NOT NULL DEFAULT ''")

            dish_cols = {
                r["name"] for r in conn.execute("PRAGMA table_info(dishes)").fetchall()
            }
            recipe_migrations = [
                ("recipe_url", "TEXT NOT NULL DEFAULT ''"),
                ("recipe_title", "TEXT NOT NULL DEFAULT ''"),
                ("recipe_description", "TEXT NOT NULL DEFAULT ''"),
                ("recipe_prep_time", "TEXT NOT NULL DEFAULT ''"),
                ("recipe_cook_time", "TEXT NOT NULL DEFAULT ''"),
                ("recipe_ingredients", "TEXT NOT NULL DEFAULT '[]'"),
                ("recipe_image", "TEXT NOT NULL DEFAULT ''"),
                ("recipe_added_by", "TEXT NOT NULL DEFAULT ''"),
            ]
            for col_name, col_def in recipe_migrations:
                if col_name not in dish_cols:
                    conn.execute(f"ALTER TABLE dishes ADD COLUMN {col_name} {col_def}")

            # Ensure Morgan always has administrator + dish editor privileges
            conn.execute(
                """
                UPDATE users
                SET role = 'admin', can_edit_dishes = 1
                WHERE LOWER(username) = 'morgan' OR LOWER(display_name) = 'morgan' OR role = 'admin'
                """
            )

            default_settings = {
                "house_name": "82 Harrow",
                "event_title": "82 Harrow Christmas Dinner",
                "event_date": "December 2026",
                "event_time": "7:00 PM",
                "announcement": "Welcome to the 82 Harrow Christmas Dinner dashboard! Click 'Assign to me' on any dish to claim it, or expand a dish to add and view its recipe.",
                "house_code": "",
                "lock_claims": "false",
            }
            for k, v in default_settings.items():
                conn.execute(
                    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                    (k, v),
                )
            conn.commit()
        finally:
            conn.close()


# =====================================================================
# RECIPE URL SCRAPER & PARSER
# =====================================================================

def clean_text(val: str) -> str:
    if not val:
        return ""
    text = re.sub(r"<[^>]+>", " ", str(val))
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def format_iso_duration(val) -> str:
    """Convert ISO 8601 duration (e.g. PT25M, PT1H30M) or raw text to human-friendly time."""
    if not val:
        return ""
    if isinstance(val, (int, float)):
        return f"{int(val)} mins"
    s = clean_text(str(val))
    if not s:
        return ""
    m = re.match(
        r"^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$",
        s.strip(),
        re.IGNORECASE,
    )
    if m:
        days = int(m.group(1) or 0)
        hours = int(m.group(2) or 0) + (days * 24)
        mins = int(m.group(3) or 0)
        parts = []
        if hours == 1:
            parts.append("1 hr")
        elif hours > 1:
            parts.append(f"{hours} hrs")
        if mins == 1:
            parts.append("1 min")
        elif mins > 1:
            parts.append(f"{mins} mins")
        return " ".join(parts) if parts else ""
    return s


def find_recipe_node(data):
    """Recursively search JSON-LD or Next.js JSON for a Schema.org Recipe object."""
    if isinstance(data, list):
        for item in data:
            found = find_recipe_node(item)
            if found:
                return found
        return None

    if isinstance(data, dict):
        t = data.get("@type")
        is_recipe = False
        if isinstance(t, str) and ("recipe" in t.lower()):
            is_recipe = True
        elif isinstance(t, list) and any(isinstance(x, str) and "recipe" in x.lower() for x in t):
            is_recipe = True

        if is_recipe:
            return data

        # Check @graph first
        if "@graph" in data:
            found = find_recipe_node(data["@graph"])
            if found:
                return found

        # Heuristic: dict has recipeIngredient
        if "recipeIngredient" in data and isinstance(data["recipeIngredient"], list):
            return data

        for v in data.values():
            if isinstance(v, (dict, list)):
                found = find_recipe_node(v)
                if found:
                    return found
    return None


def extract_image_url(img_field) -> str:
    if not img_field:
        return ""
    if isinstance(img_field, str):
        return img_field.strip()
    if isinstance(img_field, list) and img_field:
        return extract_image_url(img_field[0])
    if isinstance(img_field, dict):
        return str(img_field.get("url") or img_field.get("contentUrl") or "").strip()
    return ""


def scrape_recipe_from_url(url: str, raw_html: str = None) -> dict:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Please enter a valid http:// or https:// recipe URL.")

    if raw_html and isinstance(raw_html, str) and len(raw_html.strip()) > 50:
        page_html = raw_html
    else:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate",
        }

        req = urllib.request.Request(url, headers=headers)
        raw_bytes = None
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                encoding = (resp.headers.get("Content-Encoding") or "").lower()
                raw_bytes = resp.read()
        except Exception:
            ctx = ssl._create_unverified_context()
            with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
                encoding = (resp.headers.get("Content-Encoding") or "").lower()
                raw_bytes = resp.read()

        if encoding == "gzip" or (raw_bytes and raw_bytes[:2] == b"\x1f\x8b"):
            try:
                raw_bytes = gzip.decompress(raw_bytes)
            except Exception:
                pass
        elif encoding == "deflate":
            try:
                raw_bytes = zlib.decompress(raw_bytes)
            except Exception:
                pass

        page_html = raw_bytes.decode("utf-8", errors="replace")

    recipe_title = ""
    recipe_description = ""
    prep_time = ""
    cook_time = ""
    ingredients = []
    recipe_image = ""

    # 1. Search all JSON-LD <script type="application/ld+json"> blocks
    ld_blocks = re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        page_html,
        re.IGNORECASE | re.DOTALL,
    )
    for block in ld_blocks:
        cleaned_block = block.strip()
        if not cleaned_block:
            continue
        try:
            data = json.loads(cleaned_block)
        except Exception:
            # Sometimes JSON-LD contains raw control chars
            try:
                data = json.loads(re.sub(r"[\x00-\x1f]+", " ", cleaned_block))
            except Exception:
                continue

        node = find_recipe_node(data)
        if node:
            recipe_title = clean_text(node.get("name") or node.get("headline") or "")
            recipe_description = clean_text(node.get("description") or "")
            prep_time = format_iso_duration(node.get("prepTime"))
            cook_time = format_iso_duration(node.get("cookTime") or node.get("totalTime"))
            recipe_image = extract_image_url(node.get("image"))

            raw_ings = node.get("recipeIngredient") or node.get("ingredients") or []
            if isinstance(raw_ings, str):
                raw_ings = [x.strip() for x in raw_ings.split("\n") if x.strip()]
            if isinstance(raw_ings, list):
                for item in raw_ings:
                    if isinstance(item, str):
                        c = clean_text(item)
                        if c:
                            ingredients.append(c)
                    elif isinstance(item, dict):
                        c = clean_text(item.get("text") or item.get("name") or "")
                        if c:
                            ingredients.append(c)
            if ingredients or recipe_description or prep_time or cook_time:
                break

    # 2. Check __NEXT_DATA__ if JSON-LD wasn't present
    if not ingredients:
        next_match = re.search(
            r'<script[^>]*id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>',
            page_html,
            re.IGNORECASE | re.DOTALL,
        )
        if next_match:
            try:
                next_data = json.loads(next_match.group(1))
                node = find_recipe_node(next_data)
                if node:
                    recipe_title = recipe_title or clean_text(node.get("name") or node.get("title") or "")
                    recipe_description = recipe_description or clean_text(node.get("description") or "")
                    prep_time = prep_time or format_iso_duration(node.get("prepTime"))
                    cook_time = cook_time or format_iso_duration(node.get("cookTime") or node.get("totalTime"))
                    raw_ings = node.get("recipeIngredient") or node.get("ingredients") or []
                    if isinstance(raw_ings, list):
                        for item in raw_ings:
                            c = clean_text(item if isinstance(item, str) else (item.get("text") or ""))
                            if c:
                                ingredients.append(c)
            except Exception:
                pass

    # 3. Fallback Meta Tags & Microdata / HTML parsing
    if not recipe_title:
        og_title = re.search(
            r'<meta[^>]+(?:property|name)=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']',
            page_html,
            re.IGNORECASE,
        ) or re.search(
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']og:title["\']',
            page_html,
            re.IGNORECASE,
        )
        if og_title:
            recipe_title = clean_text(og_title.group(1))
        else:
            title_tag = re.search(r"<title[^>]*>(.*?)</title>", page_html, re.IGNORECASE | re.DOTALL)
            if title_tag:
                recipe_title = clean_text(title_tag.group(1))

    if not recipe_description:
        og_desc = (
            re.search(
                r'<meta[^>]+(?:property|name)=["\'](?:og:description|description)["\'][^>]+content=["\']([^"\']+)["\']',
                page_html,
                re.IGNORECASE,
            )
            or re.search(
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:description|description)["\']',
                page_html,
                re.IGNORECASE,
            )
        )
        if og_desc:
            recipe_description = clean_text(og_desc.group(1))

    if not recipe_image:
        og_img = re.search(
            r'<meta[^>]+(?:property|name)=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
            page_html,
            re.IGNORECASE,
        )
        if og_img:
            recipe_image = og_img.group(1).strip()

    # Fallback HTML microdata ingredients
    if not ingredients:
        micro_ings = re.findall(
            r'itemprop=["\'](?:recipeIngredient|ingredients)["\'][^>]*>(.*?)</',
            page_html,
            re.IGNORECASE | re.DOTALL,
        )
        for m in micro_ings:
            c = clean_text(m)
            if c and len(c) < 220:
                ingredients.append(c)

    # Fallback class-based ingredients
    if not ingredients:
        li_ings = re.findall(
            r'<li[^>]*class=["\'][^"\']*ingredient[^"\']*["\'][^>]*>(.*?)</li>',
            page_html,
            re.IGNORECASE | re.DOTALL,
        )
        for m in li_ings:
            c = clean_text(m)
            if c and len(c) < 220:
                ingredients.append(c)

    # Fallback regex for Prep Time & Cook Time in plain text
    plain_text = clean_text(page_html)
    if not prep_time:
        pm = re.search(
            r"Prep(?:\s*time)?\s*[:\-]?\s*(\d+\s*(?:hrs?|hours?|mins?|minutes?)(?:\s*(?:and|,)?\s*\d+\s*(?:mins?|minutes?))?)",
            plain_text,
            re.IGNORECASE,
        )
        if pm:
            prep_time = pm.group(1).strip()

    if not cook_time:
        cm = re.search(
            r"Cook(?:\s*time)?\s*[:\-]?\s*(\d+\s*(?:hrs?|hours?|mins?|minutes?)(?:\s*(?:and|,)?\s*\d+\s*(?:mins?|minutes?))?)",
            plain_text,
            re.IGNORECASE,
        )
        if cm:
            cook_time = cm.group(1).strip()

    # Deduplicate ingredients while preserving order
    seen = set()
    deduped_ings = []
    for ing in ingredients:
        key = ing.lower()
        if key not in seen:
            seen.add(key)
            deduped_ings.append(ing)

    return {
        "recipe_url": url,
        "recipe_title": recipe_title or parsed.netloc,
        "recipe_description": recipe_description or "Recipe pulled from link.",
        "recipe_prep_time": prep_time or "Not listed",
        "recipe_cook_time": cook_time or "Not listed",
        "recipe_ingredients": deduped_ings,
        "recipe_image": recipe_image,
    }


def user_row_to_dict(row) -> dict:
    d = dict(row)
    d.pop("password_hash", None)
    d.pop("password_salt", None)
    is_admin = d.get("role") == "admin"
    d["can_edit_dishes"] = bool(is_admin or d.get("can_edit_dishes"))
    return d


def fetch_dashboard_state(conn, current_user=None):
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    settings = {r["key"]: r["value"] for r in rows}

    users_rows = conn.execute(
        """
        SELECT id, username, display_name, role, can_edit_dishes, avatar_color, created_at, last_login_at
        FROM users
        ORDER BY CASE WHEN role = 'admin' THEN 0 WHEN can_edit_dishes = 1 THEN 1 ELSE 2 END,
                 display_name COLLATE NOCASE ASC
        """
    ).fetchall()
    users = [user_row_to_dict(u) for u in users_rows]

    dishes_rows = conn.execute(
        """
        SELECT id, title, category, notes, max_claims, sort_order, created_by, created_at,
               recipe_url, recipe_title, recipe_description, recipe_prep_time, recipe_cook_time,
               recipe_ingredients, recipe_image, recipe_added_by
        FROM dishes
        ORDER BY sort_order ASC, id ASC
        """
    ).fetchall()

    claims_rows = conn.execute(
        """
        SELECT c.id, c.dish_id, c.user_id, c.note, c.status, c.claimed_at,
               u.display_name, u.username, u.avatar_color, u.role
        FROM claims c
        JOIN users u ON u.id = c.user_id
        ORDER BY c.id ASC
        """
    ).fetchall()

    claims_by_dish = {}
    for c in claims_rows:
        cd = dict(c)
        claims_by_dish.setdefault(cd["dish_id"], []).append(cd)

    dishes = []
    for d in dishes_rows:
        dd = dict(d)
        try:
            dd["recipe_ingredients"] = json.loads(dd.get("recipe_ingredients") or "[]")
        except Exception:
            dd["recipe_ingredients"] = []
        dd["claims"] = claims_by_dish.get(dd["id"], [])
        dishes.append(dd)

    return {
        "has_admin": any(u["role"] == "admin" for u in users),
        "user_count": len(users),
        "require_house_code": bool(settings.get("house_code", "").strip()),
        "current_user": current_user,
        "settings": {
            "house_name": settings.get("house_name", "82 Harrow"),
            "event_title": settings.get("event_title", "82 Harrow Christmas Dinner"),
            "event_date": settings.get("event_date", ""),
            "event_time": settings.get("event_time", ""),
            "announcement": settings.get("announcement", ""),
            "lock_claims": settings.get("lock_claims", "false") == "true",
            "house_code": settings.get("house_code", "")
            if (current_user and current_user.get("role") == "admin")
            else ("***" if settings.get("house_code", "").strip() else ""),
        },
        "users": users if current_user else [],
        "dishes": dishes if current_user else [],
    }


class DashboardRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if not self.path.startswith("/api/state"):
            print(f"[{datetime.now().strftime('%H:%M:%S')}] {self.address_string()} - {fmt % args}")

    def send_json(self, status_code: int, payload: dict, set_cookie: str = None, clear_cookie: bool = False):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if set_cookie:
            self.send_header(
                "Set-Cookie",
                f"harrow82_session={set_cookie}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax",
            )
        elif clear_cookie:
            self.send_header(
                "Set-Cookie",
                "harrow82_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
            )
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def get_session_token(self) -> str:
        auth_header = self.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
            if token:
                return token
        cookie_header = self.headers.get("Cookie", "")
        if cookie_header:
            c = cookies.SimpleCookie()
            try:
                c.load(cookie_header)
                if "harrow82_session" in c:
                    return c["harrow82_session"].value
            except Exception:
                pass
        return ""

    def get_current_user(self, conn):
        token = self.get_session_token()
        if not token:
            return None
        row = conn.execute(
            """
            SELECT u.id, u.username, u.display_name, u.role, u.can_edit_dishes,
                   u.avatar_color, u.created_at, u.last_login_at
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
        return user_row_to_dict(row) if row else None

    def serve_static(self, rel_path: str):
        if rel_path in ("", "/"):
            rel_path = "index.html"
        rel_path = rel_path.lstrip("/")
        full_path = os.path.abspath(os.path.join(STATIC_DIR, rel_path))
        if not full_path.startswith(STATIC_DIR) or not os.path.isfile(full_path):
            full_path = os.path.join(STATIC_DIR, "index.html")

        ext = os.path.splitext(full_path)[1].lower()
        content_types = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".ico": "image/x-icon",
        }
        ctype = content_types.get(ext, "application/octet-stream")
        with open(full_path, "rb") as f:
            content = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/state":
            with DB_LOCK:
                conn = get_db()
                try:
                    user = self.get_current_user(conn)
                    state = fetch_dashboard_state(conn, user)
                    self.send_json(200, state)
                finally:
                    conn.close()
            return

        if path.startswith("/api/"):
            self.send_json(404, {"error": "Endpoint not found"})
            return

        self.serve_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        data = self.read_json_body()

        with DB_LOCK:
            conn = get_db()
            try:
                # 1. REGISTER
                if path == "/api/register":
                    username = (data.get("username") or "").strip().lower()
                    display_name = (data.get("display_name") or "").strip()
                    password = data.get("password") or ""
                    house_code_input = (data.get("house_code") or "").strip()

                    if not username or len(username) < 2:
                        return self.send_json(400, {"error": "Username must be at least 2 characters."})
                    if not all(ch.isalnum() or ch in ("_", "-", ".") for ch in username):
                        return self.send_json(
                            400,
                            {"error": "Username can only contain letters, numbers, dots, hyphens, or underscores."},
                        )
                    if not display_name:
                        display_name = "Morgan" if username == "morgan" else username.capitalize()
                    if not password or len(password) < 4:
                        return self.send_json(400, {"error": "Password must be at least 4 characters."})

                    existing_count = conn.execute("SELECT COUNT(*) AS cnt FROM users").fetchone()["cnt"]
                    # Morgan (or the first user) automatically gets Administrator + Dish Editor privileges
                    is_admin = (existing_count == 0) or is_morgan_user(username, display_name)
                    role = "admin" if is_admin else "housemate"
                    can_edit_dishes = 1 if is_admin else 0

                    if role != "admin":
                        saved_code_row = conn.execute(
                            "SELECT value FROM settings WHERE key = 'house_code'"
                        ).fetchone()
                        saved_code = (saved_code_row["value"] if saved_code_row else "").strip()
                        if saved_code and saved_code.lower() != house_code_input.lower():
                            return self.send_json(
                                403,
                                {"error": "Invalid 82 Harrow house invite code. Ask Morgan!"},
                            )

                    existing_user = conn.execute(
                        "SELECT id FROM users WHERE username = ?", (username,)
                    ).fetchone()
                    if existing_user:
                        return self.send_json(
                            409,
                            {"error": f"Username '{username}' is already registered. Use the Log In tab!"},
                        )

                    pwd_hash, salt = hash_password(password)
                    color = AVATAR_COLORS[existing_count % len(AVATAR_COLORS)]
                    now_iso = datetime.utcnow().isoformat()

                    cur = conn.execute(
                        """
                        INSERT INTO users (
                            username, display_name, password_hash, password_salt,
                            role, can_edit_dishes, avatar_color, created_at, last_login_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (username, display_name, pwd_hash, salt, role, can_edit_dishes, color, now_iso, now_iso),
                    )
                    user_id = cur.lastrowid
                    token = secrets.token_urlsafe(32)
                    conn.execute(
                        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
                        (token, user_id, int(time.time())),
                    )
                    conn.commit()

                    user_row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
                    user = user_row_to_dict(user_row)
                    state = fetch_dashboard_state(conn, user)
                    state["token"] = token
                    return self.send_json(200, state, set_cookie=token)

                # 2. LOGIN
                if path == "/api/login":
                    username = (data.get("username") or "").strip().lower()
                    password = data.get("password") or ""
                    if not username or not password:
                        return self.send_json(400, {"error": "Please enter your username and password."})

                    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()

                    # Convenience: if Morgan logs in directly before registering, create Morgan's Admin account on the spot!
                    if not row and is_morgan_user(username) and len(password) >= 4:
                        pwd_hash, salt = hash_password(password)
                        now_iso = datetime.utcnow().isoformat()
                        cur = conn.execute(
                            """
                            INSERT INTO users (
                                username, display_name, password_hash, password_salt,
                                role, can_edit_dishes, avatar_color, created_at, last_login_at
                            )
                            VALUES (?, ?, ?, ?, 'admin', 1, ?, ?, ?)
                            """,
                            (username, "Morgan", pwd_hash, salt, AVATAR_COLORS[0], now_iso, now_iso),
                        )
                        conn.commit()
                        row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()

                    if not row or not verify_password(password, row["password_hash"], row["password_salt"]):
                        return self.send_json(401, {"error": "Incorrect username or password."})

                    now_iso = datetime.utcnow().isoformat()
                    # Ensure Morgan always has admin privileges
                    if is_morgan_user(row["username"], row["display_name"]) and row["role"] != "admin":
                        conn.execute(
                            "UPDATE users SET role = 'admin', can_edit_dishes = 1, last_login_at = ? WHERE id = ?",
                            (now_iso, row["id"]),
                        )
                    else:
                        conn.execute(
                            "UPDATE users SET last_login_at = ? WHERE id = ?",
                            (now_iso, row["id"]),
                        )

                    token = secrets.token_urlsafe(32)
                    conn.execute(
                        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
                        (token, row["id"], int(time.time())),
                    )
                    conn.commit()

                    updated_row = conn.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone()
                    user = user_row_to_dict(updated_row)
                    state = fetch_dashboard_state(conn, user)
                    state["token"] = token
                    return self.send_json(200, state, set_cookie=token)

                # 3. LOGOUT
                if path == "/api/logout":
                    token = self.get_session_token()
                    if token:
                        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
                        conn.commit()
                    state = fetch_dashboard_state(conn, None)
                    return self.send_json(200, state, clear_cookie=True)

                # Require authenticated user for all routes below
                user = self.get_current_user(conn)
                if not user:
                    return self.send_json(401, {"error": "Please log in first."})

                can_manage_dishes = (user["role"] == "admin") or bool(user.get("can_edit_dishes"))

                # 4. ADD DISH / ROLE (ADMIN OR DISH EDITOR)
                if path == "/api/dishes/add":
                    if not can_manage_dishes:
                        return self.send_json(
                            403,
                            {"error": "You need Dish Editor or Administrator privileges to add dishes."},
                        )
                    title = (data.get("title") or "").strip()
                    category = (data.get("category") or "Sides & Trimmings").strip()
                    notes = (data.get("notes") or "").strip()
                    try:
                        max_claims = max(1, min(20, int(data.get("max_claims", 1))))
                    except Exception:
                        max_claims = 1

                    if not title:
                        return self.send_json(400, {"error": "Please enter a dish or role name."})

                    max_sort = conn.execute(
                        "SELECT COALESCE(MAX(sort_order), 0) AS m FROM dishes"
                    ).fetchone()["m"]
                    conn.execute(
                        """
                        INSERT INTO dishes (title, category, notes, max_claims, sort_order, created_by, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (title, category, notes, max_claims, max_sort + 1, user["id"], datetime.utcnow().isoformat()),
                    )
                    conn.commit()
                    return self.send_json(200, fetch_dashboard_state(conn, user))

                # 5. UPDATE DISH / ROLE (ADMIN OR DISH EDITOR)
                if path == "/api/dishes/update":
                    if not can_manage_dishes:
                        return self.send_json(403, {"error": "You need Dish Editor or Administrator privileges to edit dishes."})
                    dish_id = data.get("dish_id")
                    title = (data.get("title") or "").strip()
                    category = (data.get("category") or "Sides & Trimmings").strip()
                    notes = (data.get("notes") or "").strip()
                    try:
                        max_claims = max(1, min(20, int(data.get("max_claims", 1))))
                    except Exception:
                        max_claims = 1

                    if not dish_id or not title:
                        return self.send_json(400, {"error": "Dish ID and title are required."})

                    conn.execute(
                        """
                        UPDATE dishes
                        SET title = ?, category = ?, notes = ?, max_claims = ?
                        WHERE id = ?
                        """,
                        (title, category, notes, max_claims, dish_id),
                    )
                    conn.commit()
                    return self.send_json(200, fetch_dashboard_state(conn, user))

                # 6. DELETE DISH / ROLE (ADMIN OR DISH EDITOR)
                if path == "/api/dishes/delete":
                    if not can_manage_dishes:
                        return self.send_json(403, {"error": "You need Dish Editor or Administrator privileges to delete dishes."})
                    dish_id = data.get("dish_id")
                    conn.execute("DELETE FROM dishes WHERE id = ?", (dish_id,))
                    conn.commit()
                    return self.send_json(200, fetch_dashboard_state(conn, user))

                # 7. ADD OR UPDATE RECIPE URL ON A DISH (ANY LOGGED-IN USER)
                if path == "/api/dishes/recipe":
                    dish_id = data.get("dish_id")
                    recipe_url = (data.get("recipe_url") or "").strip()
                    manual_override = bool(data.get("manual_override"))

                    dish = conn.execute("SELECT * FROM dishes WHERE id = ?", (dish_id,)).fetchone()
                    if not dish:
                        return self.send_json(404, {"error": "Dish not found."})

                    if not recipe_url and not manual_override:
                        # Clear recipe
                        conn.execute(
                            """
                            UPDATE dishes
                            SET recipe_url = '', recipe_title = '', recipe_description = '',
                                recipe_prep_time = '', recipe_cook_time = '',
                                recipe_ingredients = '[]', recipe_image = '', recipe_added_by = ''
                            WHERE id = ?
                            """,
                            (dish_id,),
                        )
                        conn.commit()
                        return self.send_json(200, fetch_dashboard_state(conn, user))

                    if manual_override:
                        r_title = (data.get("recipe_title") or dish["title"]).strip()
                        r_desc = (data.get("recipe_description") or "").strip()
                        r_prep = (data.get("recipe_prep_time") or "Not listed").strip()
                        r_cook = (data.get("recipe_cook_time") or "Not listed").strip()
                        raw_ings = data.get("recipe_ingredients") or []
                        if isinstance(raw_ings, str):
                            r_ings = [x.strip() for x in raw_ings.split("\n") if x.strip()]
                        elif isinstance(raw_ings, list):
                            r_ings = [str(x).strip() for x in raw_ings if str(x).strip()]
                        else:
                            r_ings = []
                        r_image = (data.get("recipe_image") or dish["recipe_image"] or "").strip()
                    else:
                        raw_html = data.get("raw_html") or None
                        try:
                            scraped = scrape_recipe_from_url(recipe_url, raw_html=raw_html)
                            r_title = scraped["recipe_title"] or dish["title"]
                            r_desc = scraped["recipe_description"]
                            r_prep = scraped["recipe_prep_time"]
                            r_cook = scraped["recipe_cook_time"]
                            r_ings = scraped["recipe_ingredients"]
                            r_image = scraped["recipe_image"]
                        except Exception as exc:
                            return self.send_json(
                                422,
                                {
                                    "error": f"Could not automatically pull recipe from that URL ({exc}). You can also paste or edit the details manually below!",
                                    "needs_browser_fetch": not bool(raw_html),
                                    "can_manual_fallback": True,
                                },
                            )

                    conn.execute(
                        """
                        UPDATE dishes
                        SET recipe_url = ?, recipe_title = ?, recipe_description = ?,
                            recipe_prep_time = ?, recipe_cook_time = ?,
                            recipe_ingredients = ?, recipe_image = ?, recipe_added_by = ?
                        WHERE id = ?
                        """,
                        (
                            recipe_url,
                            r_title,
                            r_desc,
                            r_prep,
                            r_cook,
                            json.dumps(r_ings),
                            r_image,
                            user["display_name"],
                            dish_id,
                        ),
                    )
                    conn.commit()
                    return self.send_json(200, fetch_dashboard_state(conn, user))

                # 8. ASSIGN DISH TO ME (/api/dishes/claim)
                if path == "/api/dishes/claim":
                    dish_id = data.get("dish_id")
                    target_user_id = (
                        data.get("user_id")
                        if (user["role"] == "admin" and data.get("user_id"))
                        else user["id"]
                    )
                    note = (data.get("note") or "").strip()

                    lock_row = conn.execute("SELECT value FROM settings WHERE key = 'lock_claims'").fetchone()
                    if lock_row and lock_row["value"] == "true" and user["role"] != "admin":
                        return self.send_json(403, {"error": "Assignments have been locked by the organiser."})

                    dish = conn.execute("SELECT * FROM dishes WHERE id = ?", (dish_id,)).fetchone()
                    if not dish:
                        return self.send_json(404, {"error": "Dish not found."})

                    existing = conn.execute(
                        "SELECT id FROM claims WHERE dish_id = ? AND user_id = ?",
                        (dish_id, target_user_id),
                    ).fetchone()
                    if existing:
                        return self.send_json(400, {"error": "Already assigned to this dish."})

                    current_claims_count = conn.execute(
                        "SELECT COUNT(*) AS cnt FROM claims WHERE dish_id = ?",
                        (dish_id,),
                    ).fetchone()["cnt"]
                    if current_claims_count >= dish["max_claims"]:
                        return self.send_json(
                            400, {"error": "This dish is already sorted!"}
                        )

                    conn.execute(
                        """
                        INSERT INTO claims (dish_id, user_id, note, status, claimed_at)
                        VALUES (?, ?, ?, 'claimed', ?)
                        """,
                        (dish_id, target_user_id, note, datetime.utcnow().isoformat()),
                    )
                    conn.commit()
                    return self.send_json(200, fetch_dashboard_state(conn, user))

                # 9. UNASSIGN DISH (/api/dishes/unclaim)
                if path == "/api/dishes/unclaim":
                    dish_id = data.get("dish_id")
                    target_user_id = (
                        data.get("user_id")
                        if (user["role"] == "admin" and data.get("user_id"))
                        else user["id"]
                    )

                    lock_row = conn.execute("SELECT value FROM settings WHERE key = 'lock_claims'").fetchone()
                    if lock_row and lock_row["value"] == "true" and user["role"] != "admin":
                        return self.send_json(403, {"error": "Assignments are locked by the organiser."})

                    conn.execute(
                        "DELETE FROM claims WHERE dish_id = ? AND user_id = ?",
                        (dish_id, target_user_id),
                    )
                    conn.commit()
                    return self.send_json(200, fetch_dashboard_state(conn, user))

                # 10. UPDATE CLAIM NOTE OR STATUS
                if path == "/api/claims/update":
                    claim_id = data.get("claim_id")
                    note = data.get("note")
                    status = data.get("status")

                    claim = conn.execute("SELECT * FROM claims WHERE id = ?", (claim_id,)).fetchone()
                    if not claim:
                        return self.send_json(404, {"error": "Assignment not found."})
                    if claim["user_id"] != user["id"] and user["role"] != "admin":
                        return self.send_json(403, {"error": "You can only edit your own assignment."})

                    new_note = claim["note"] if note is None else str(note).strip()
                    new_status = claim["status"] if status is None else str(status).strip()
                    if new_status not in ("claimed", "bought", "ready"):
                        new_status = "claimed"

                    conn.execute(
                        "UPDATE claims SET note = ?, status = ? WHERE id = ?",
                        (new_note, new_status, claim_id),
                    )
                    conn.commit()
                    return self.send_json(200, fetch_dashboard_state(conn, user))

                # 11. UPDATE SETTINGS (ADMIN ONLY)
                if path == "/api/settings/update":
                    if user["role"] != "admin":
                        return self.send_json(403, {"error": "Only an Administrator can update settings."})
                    allowed_keys = ("event_title", "event_date", "event_time", "announcement", "house_code", "lock_claims")
                    for key in allowed_keys:
                        if key in data:
                            val = data[key]
                            if isinstance(val, bool):
                                val = "true" if val else "false"
                            else:
                                val = str(val).strip()
                            conn.execute(
                                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                                (key, val),
                            )
                    conn.commit()
                    return self.send_json(200, fetch_dashboard_state(conn, user))

                # 12. ADMIN USER & PRIVILEGES MANAGEMENT
                if path == "/api/users/manage":
                    if user["role"] != "admin":
                        return self.send_json(403, {"error": "Only an Administrator can manage user privileges."})
                    action = data.get("action")
                    target_id = data.get("user_id")
                    target = conn.execute("SELECT * FROM users WHERE id = ?", (target_id,)).fetchone()
                    if not target:
                        return self.send_json(404, {"error": "User not found."})

                    if action == "toggle_dish_editor":
                        new_val = 0 if target["can_edit_dishes"] else 1
                        if target["role"] == "admin":
                            new_val = 1
                        conn.execute(
                            "UPDATE users SET can_edit_dishes = ? WHERE id = ?",
                            (new_val, target_id),
                        )
                        conn.commit()
                        return self.send_json(200, fetch_dashboard_state(conn, user))

                    if action == "toggle_admin":
                        if target_id == user["id"] or is_morgan_user(target["username"], target["display_name"]):
                            return self.send_json(
                                400, {"error": "Morgan's Administrator privileges cannot be removed."}
                            )
                        new_role = "housemate" if target["role"] == "admin" else "admin"
                        new_editor = 1 if new_role == "admin" else target["can_edit_dishes"]
                        conn.execute(
                            "UPDATE users SET role = ?, can_edit_dishes = ? WHERE id = ?",
                            (new_role, new_editor, target_id),
                        )
                        conn.commit()
                        return self.send_json(200, fetch_dashboard_state(conn, user))

                    if action == "reset_password":
                        new_password = (data.get("new_password") or "").strip()
                        if len(new_password) < 4:
                            return self.send_json(400, {"error": "New password must be at least 4 characters."})
                        pwd_hash, salt = hash_password(new_password)
                        conn.execute(
                            "UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?",
                            (pwd_hash, salt, target_id),
                        )
                        conn.commit()
                        return self.send_json(200, fetch_dashboard_state(conn, user))

                    if action == "delete_user":
                        if target_id == user["id"]:
                            return self.send_json(400, {"error": "You cannot delete your own account."})
                        conn.execute("DELETE FROM users WHERE id = ?", (target_id,))
                        conn.commit()
                        return self.send_json(200, fetch_dashboard_state(conn, user))

                    return self.send_json(400, {"error": "Invalid user management action."})

                return self.send_json(404, {"error": "Unknown API endpoint."})
            finally:
                conn.close()


def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def main():
    init_db()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), DashboardRequestHandler)
    local_ip = get_local_ip()
    print("=" * 64)
    print("🎄 82 HARROW CHRISTMAS DINNER DASHBOARD IS LIVE! 🎄")
    print("=" * 64)
    print(f"• On this device:          http://localhost:{PORT}")
    print(f"• On 82 Harrow Wi-Fi:      http://{local_ip}:{PORT}")
    print(f"• SQLite Database file:    {DB_PATH}")
    print("=" * 64)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down 82 Harrow dashboard...")
        server.server_close()


if __name__ == "__main__":
    main()
