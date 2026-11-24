#!/usr/bin/env python3
"""
82 Harrow Christmas Dinner Organisation Dashboard
All-in-one Web Server + SQLite Database + Recipe URL Scraper + 7-Person Cost Estimator + Meat Poll + Drinks Board
Run locally: python3 app.py
"""

import gzip
import hashlib
import hmac
import html
import json
import math
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
HOUSE_SIZE = 7  # 82 Harrow dinner size for ingredient scaling & cost splitting

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

MEAT_POLL_OPTIONS = [
    {"id": "gammon", "label": "Gammon", "emoji": "🍖", "color": "#d9534f"},
    {"id": "beef", "label": "Roast Beef", "emoji": "🥩", "color": "#8b261d"},
    {"id": "lamb", "label": "Roast Lamb", "emoji": "🐑", "color": "#2e8b57"},
    {"id": "pork", "label": "Roast Pork (& Crackling)", "emoji": "🐖", "color": "#e67e22"},
    {"id": "beef_wellington", "label": "Beef Wellington (Ambitious)", "emoji": "🥐", "color": "#8e44ad"},
]
VALID_MEAT_IDS = {m["id"] for m in MEAT_POLL_OPTIONS}


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


def select_drink_emoji(name: str, notes: str = "") -> str:
    """AI-style semantic emoji matcher for drinks uploaded by housemates."""
    text = f"{name or ''} {notes or ''}".lower()
    rules = [
        (["mulled wine", "gluhwein", "glühwein", "red wine", "merlot", "malbec", "cabernet", "pinot noir", "shiraz", "rioja", "claret", "port", "bordeaux"], "🍷"),
        (["prosecco", "champagne", "cava", "buck's fizz", "bucks fizz", "mimosa", "bellini", "sparkling wine", "bubbly", "fizz"], "🥂"),
        (["white wine", "sauvignon", "chardonnay", "pinot grigio", "riesling", "rosé", "rose wine"], "🍾"),
        (["guinness", "stout", "porter", "murphy"], "🍺"),
        (["cider", "cidre", "kopparberg", "strongbow", "thatchers", "bulmers", "rekorderlig", "inch", "scrumpy"], "🍻"),
        (["beer", "lager", "ale", "ipa", "pilsner", "stella", "peroni", "corona", "heineken", "birra", "moretti", "carling", "fosters", "kronenbourg", "madri", "asahi", "guinness", "craft beer", "pint"], "🍺"),
        (["baileys", "irish cream", "whisky", "whiskey", "scotch", "bourbon", "jack daniel", "jameson", "brandy", "cognac", "hennessy", "amaretto", "disaronno", "kahlua", "tia maria", "southern comfort"], "🥃"),
        (["tequila", "sambuca", "jager", "jäger", "fireball", "shot", "shots", "limoncello", "schnapps", "sourz"], "🥃"),
        (["rum", "captain morgan", "malibu", "kraken", "bacardi", "spiced rum", "dark rum"], "🍹"),
        (["gin", "g&t", "g & t", "martini", "espresso martini", "negroni", "cosmopolitan", "vodka", "smirnoff", "absolut", "grey goose"], "🍸"),
        (["cocktail", "aperol", "spritz", "pimm", "mojito", "margarita", "daiquiri", "pina colada", "piña colada", "sangria", "punch", "sex on the beach", "bellini", "passionfruit"], "🍹"),
        (["hot chocolate", "cocoa", "coffee", "tea", "latte", "mocha", "chai", "mulled apple", "hot toddy"], "☕"),
        (["eggnog", "milk", "milkshake", "white russian", "horlicks"], "🥛"),
        (["coke", "coca-cola", "coca cola", "diet coke", "pepsi", "lemonade", "sprite", "7up", "fanta", "tango", "irn-bru", "irn bru", "dr pepper", "ginger beer", "ginger ale", "soda", "soft drink", "fizzy"], "🥤"),
        (["juice", "orange juice", "apple juice", "cranberry", "elderflower", "shloer", "appletiser", "j2o", "oasis", "ribena", "vimto", "cordial", "squash", "mocktail", "non-alcoholic", "0%", "alcohol free"], "🧃"),
        (["water", "sparkling water", "san pellegrino", "evian", "tap water"], "💧"),
    ]
    for keywords, emoji in rules:
        if any(k in text for k in keywords):
            return emoji
    if "wine" in text:
        return "🍷"
    return "🍹"


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
                    recipe_servings INTEGER NOT NULL DEFAULT 4,
                    recipe_custom_items TEXT NOT NULL DEFAULT '[]',
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

                CREATE TABLE IF NOT EXISTS meat_votes (
                    user_id INTEGER PRIMARY KEY,
                    choice TEXT NOT NULL,
                    voted_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS drinks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    emoji TEXT NOT NULL DEFAULT '🍹',
                    notes TEXT NOT NULL DEFAULT '',
                    created_by INTEGER,
                    created_by_name TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
                );

                CREATE TABLE IF NOT EXISTS drink_selections (
                    user_id INTEGER PRIMARY KEY,
                    drink_id INTEGER NOT NULL,
                    selected_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (drink_id) REFERENCES drinks(id) ON DELETE CASCADE
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
                ("recipe_servings", "INTEGER NOT NULL DEFAULT 4"),
                ("recipe_custom_items", "TEXT NOT NULL DEFAULT '[]'"),
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
                "announcement": "Welcome to the 82 Harrow Christmas Dinner dashboard! Assign dishes to yourself, add Recipe URLs, vote in the Secondary Meat Poll, and pick your Drinks!",
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
# RECIPE URL SCRAPER & 7-PERSON UK SUPERMARKET COST ESTIMATOR
# =====================================================================

UNICODE_FRACTIONS = {
    "½": 0.5,
    "⅓": 1 / 3,
    "⅔": 2 / 3,
    "¼": 0.25,
    "¾": 0.75,
    "⅕": 0.2,
    "⅖": 0.4,
    "⅗": 0.6,
    "⅘": 0.8,
    "⅙": 1 / 6,
    "⅚": 5 / 6,
    "⅛": 0.125,
    "⅜": 0.375,
    "⅝": 0.625,
    "⅞": 0.875,
}


def clean_text(val: str) -> str:
    if not val:
        return ""
    text = re.sub(r"<[^>]+>", " ", str(val))
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_servings(val) -> int:
    """Extract numeric serving count from Schema.org recipeYield or string."""
    if not val:
        return 4
    if isinstance(val, (int, float)):
        n = int(val)
        return max(1, min(30, n)) if n > 0 else 4
    if isinstance(val, list) and val:
        return parse_servings(val[0])
    s = clean_text(str(val))
    # Look for "serves X" or "X servings" or "X-Y"
    m_range = re.search(r"(\d+)\s*(?:-|to|–)\s*(\d+)", s, re.IGNORECASE)
    if m_range:
        avg = round((int(m_range.group(1)) + int(m_range.group(2))) / 2)
        return max(1, min(30, avg))
    m_single = re.search(r"(\d+)", s)
    if m_single:
        n = int(m_single.group(1))
        if 1 <= n <= 30:
            return n
    return 4


def format_iso_duration(val) -> str:
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


def parse_number_token(tok: str) -> float:
    tok = tok.strip()
    if not tok:
        return 0.0
    for uf, fval in UNICODE_FRACTIONS.items():
        if uf in tok:
            prefix = tok.replace(uf, "").strip()
            base = float(prefix) if prefix.isdigit() else 0.0
            return base + fval
    if "/" in tok:
        parts = tok.split("/", 1)
        try:
            return float(parts[0]) / float(parts[1])
        except Exception:
            return 0.0
    try:
        return float(tok)
    except Exception:
        return 0.0


def scale_ingredient_for_7(raw_ing: str, base_servings: int = 4) -> dict:
    """
    Scale a recipe ingredient line from base_servings to HOUSE_SIZE (7 people)
    and estimate its average UK supermarket cost in GBP (£).
    """
    ing = clean_text(raw_ing)
    base_servings = max(1, int(base_servings or 4))
    factor = HOUSE_SIZE / float(base_servings)

    # Replace unicode fractions with spaced versions for easier regex matching
    norm = ing
    for uf in UNICODE_FRACTIONS:
        norm = norm.replace(uf, f" {uf}")
    norm = re.sub(r"\s+", " ", norm).strip()

    # Match leading number (e.g. "2.5", "1 1/2", "100", "2-3") + optional unit
    pattern = re.compile(
        r"^(\d+(?:\.\d+)?(?:\s+\d+/\d+|\s+[½⅓⅔¼¾⅛⅜⅝⅞])?|\d+/\d+|[½⅓⅔¼¾⅛⅜⅝⅞])"
        r"(?:\s*(?:-|to|–)\s*(\d+(?:\.\d+)?))?"
        r"\s*(kg|g|grams?|ml|l|litres?|tbsp|tablespoons?|tsp|teaspoons?|oz|lb|cloves?|cans?|tins?|packs?|packets?|bunche?s?|sprigs?|slices?|rashers?|sheets?)?\b\s*(.*)$",
        re.IGNORECASE,
    )
    m = pattern.match(norm)

    qty_val = None
    unit = ""
    rest_name = ing

    if m:
        q1_str = m.group(1)
        q2_str = m.group(2)
        unit_raw = (m.group(3) or "").lower()
        remainder = (m.group(4) or "").strip()

        # Parse q1 (could be "1 1/2")
        subparts = q1_str.split()
        q1 = sum(parse_number_token(sp) for sp in subparts)
        if q2_str:
            q2 = parse_number_token(q2_str)
            if q2 > q1:
                q1 = (q1 + q2) / 2.0

        if q1 > 0:
            qty_val = q1
            unit = unit_raw
            rest_name = remainder if remainder else ing

    # Compute scaled amount string for 7 people
    scaled_qty = (qty_val * factor) if qty_val is not None else None
    amount_for_7 = ""

    if scaled_qty is not None:
        if unit in ("g", "gram", "grams"):
            if scaled_qty >= 1000:
                kg_val = round(scaled_qty / 1000.0, 2)
                amount_for_7 = f"{kg_val:g} kg"
            else:
                rounded_g = max(5, int(round(scaled_qty / 5.0) * 5))
                amount_for_7 = f"{rounded_g} g"
        elif unit == "kg":
            kg_val = round(scaled_qty, 2)
            amount_for_7 = f"{kg_val:g} kg"
        elif unit == "ml":
            if scaled_qty >= 1000:
                l_val = round(scaled_qty / 1000.0, 2)
                amount_for_7 = f"{l_val:g} L"
            else:
                rounded_ml = max(5, int(round(scaled_qty / 5.0) * 5))
                amount_for_7 = f"{rounded_ml} ml"
        elif unit in ("l", "litre", "litres"):
            l_val = round(scaled_qty, 2)
            amount_for_7 = f"{l_val:g} L"
        elif unit in ("tbsp", "tablespoon", "tablespoons"):
            rounded_t = round(scaled_qty * 2) / 2.0
            amount_for_7 = f"{rounded_t:g} tbsp"
        elif unit in ("tsp", "teaspoon", "teaspoons"):
            rounded_t = round(scaled_qty * 2) / 2.0
            amount_for_7 = f"{rounded_t:g} tsp"
        elif unit:
            # Discrete units like cloves, packs, sprigs, slices
            rounded_u = max(1, int(math.ceil(scaled_qty - 0.15)))
            amount_for_7 = f"{rounded_u} {unit}"
        else:
            # Count of whole items (e.g. "2 onions", "12 chipolatas")
            rounded_cnt = max(1, int(math.ceil(scaled_qty - 0.15)))
            amount_for_7 = f"{rounded_cnt}"
    else:
        amount_for_7 = f"Scaled for {HOUSE_SIZE} (1x pack/to taste)"

    est_cost = estimate_uk_supermarket_cost(ing, scaled_qty, unit)

    return {
        "ingredient": rest_name.lstrip("- ").strip() or ing,
        "original_text": ing,
        "amount_for_7": amount_for_7,
        "estimated_cost_gbp": round(est_cost, 2),
    }


def estimate_uk_supermarket_cost(ing_text: str, scaled_qty: float, unit: str) -> float:
    """
    Estimate typical UK supermarket cost (Tesco / Sainsbury's / Aldi average in £ GBP)
    for the scaled 7-person quantity.
    """
    t = ing_text.lower()
    u = (unit or "").lower()

    # Convert weight to grams or volume to ml if available
    grams = None
    if scaled_qty is not None:
        if u in ("g", "gram", "grams"):
            grams = scaled_qty
        elif u == "kg":
            grams = scaled_qty * 1000.0
        elif u == "oz":
            grams = scaled_qty * 28.35
        elif u == "lb":
            grams = scaled_qty * 453.6

    ml = None
    if scaled_qty is not None:
        if u == "ml":
            ml = scaled_qty
        elif u in ("l", "litre", "litres"):
            ml = scaled_qty * 1000.0

    # Small pinch / spoonful pantry items (salt, pepper, oil, vinegar, spices, flour)
    if u in ("tsp", "teaspoon", "teaspoons", "tbsp", "tablespoon", "tablespoons") or "to taste" in t or "pinch" in t:
        if any(k in t for k in ["goose fat", "duck fat"]):
            return 3.25
        if any(k in t for k in ["truffle", "saffron", "vanilla", "maple syrup", "honey", "cranberry", "redcurrant"]):
            return 1.85
        if any(k in t for k in ["butter", "olive oil", "vegetable oil", "sunflower oil", "rapeseed oil"]):
            return 0.65
        if any(k in t for k in ["salt", "pepper", "flour", "sugar", "mustard", "vinegar", "soy", "worcestershire", "paprika", "cinnamon", "nutmeg", "thyme", "rosemary", "sage", "bay", "mixed herbs"]):
            return 0.45
        return 0.60

    # 1. Poultry & Meats
    if "turkey" in t:
        if "crown" in t or (grams and grams < 3000):
            return 19.50
        return 26.00
    if "beef wellington" in t or "fillet of beef" in t or "beef fillet" in t or "tenderloin" in t:
        return 28.00 if not grams else max(16.00, round((grams / 1000.0) * 32.0, 2))
    if "chicken" in t and not any(k in t for k in ["stock", "bouillon", "gravy", "cube"]):
        if "whole" in t or (grams and grams >= 1400):
            return 6.75 * max(1, round((grams or 2200) / 1800.0))
        return 5.50
    if "gammon" in t or "ham" in t:
        if "slice" in t or "parma" in t or "prosciutto" in t:
            return 2.60
        return 9.50 if not grams else max(6.50, round((grams / 1000.0) * 6.50, 2))
    if "beef" in t and not any(k in t for k in ["stock", "bouillon", "gravy", "cube", "suet"]):
        return 13.50 if not grams else max(7.50, round((grams / 1000.0) * 11.50, 2))
    if "lamb" in t and not any(k in t for k in ["stock"]):
        return 14.50 if not grams else max(8.50, round((grams / 1000.0) * 12.50, 2))
    if "pork" in t and not any(k in t for k in ["stock"]):
        if "sausage" in t or "mince" in t or " sausagemeat" in t:
            return 3.00
        return 9.00 if not grams else max(5.50, round((grams / 1000.0) * 7.50, 2))
    if any(k in t for k in ["pigs in blankets", "chipolata", "sausage"]):
        packs = 2 if (scaled_qty and scaled_qty >= 12) else 1
        return round(2.75 * packs, 2)
    if any(k in t for k in ["bacon", "pancetta", "lardons", "streaky"]):
        packs = 2 if (grams and grams > 300) or (scaled_qty and u in ("rasher", "rashers", "slice", "slices") and scaled_qty > 10) else 1
        return round(2.40 * packs, 2)

    # 2. Fats, Dairy, Eggs & Cheese
    if any(k in t for k in ["goose fat", "duck fat"]):
        return 3.50
    if "butter" in t:
        return 2.15 if not grams or grams <= 250 else round(2.15 * math.ceil(grams / 250.0), 2)
    if any(k in t for k in ["double cream", "single cream", "whipping cream", "clotted cream", "creme fraiche", "crème fraîche", "custard"]):
        return 1.65 if not ml or ml <= 300 else 2.65
    if any(k in t for k in ["cheddar", "cheese", "parmesan", "gruyere", "stilton", "camembert", "brie"]):
        return 2.85 if not grams or grams <= 300 else round((grams / 250.0) * 2.50, 2)
    if "milk" in t:
        return 1.45
    if "egg" in t:
        return 2.10
    if "pastry" in t or "puff pastry" in t or "shortcrust" in t:
        return 1.85

    # 3. Christmas Veg & Produce
    if "potato" in t:
        if grams:
            return max(1.50, round((grams / 2000.0) * 1.85, 2))
        return 2.00
    if "parsnip" in t:
        return 1.30 if not grams or grams <= 750 else 2.20
    if "carrot" in t:
        return 0.95 if not grams or grams <= 1000 else 1.60
    if "sprout" in t:
        return 1.40 if not grams or grams <= 750 else 2.40
    if "cauliflower" in t:
        return 1.35 if not scaled_qty or scaled_qty <= 1.2 else round(1.35 * math.ceil(scaled_qty), 2)
    if any(k in t for k in ["cabbage", "red cabbage", "broccoli", "leek", "peas", "green beans"]):
        return 1.40
    if "mushroom" in t:
        return 1.65
    if "chestnut" in t:
        return 2.50
    if any(k in t for k in ["onion", "shallot"]):
        return 1.10
    if "garlic" in t:
        return 0.75
    if any(k in t for k in ["lemon", "orange", "clementine", "apple", "cranberr"]):
        return 1.50
    if any(k in t for k in ["rosemary", "thyme", "sage", "parsley", "bay leaves", "fresh herbs", "chives"]):
        return 1.00

    # 4. Liquids, Wine, Stock, Gravy & Condiments
    if any(k in t for k in ["wine", "port", "sherry", "brandy", "cider", "marsala"]):
        if ml and ml <= 250:
            return 2.75  # Cooking portion of a £6.50 bottle
        return 6.50
    if any(k in t for k in ["stock", "bouillon", "gravy", "bisto"]):
        return 1.35
    if any(k in t for k in ["cranberry sauce", "bread sauce", "horseradish", "mustard", "apple sauce", "mint sauce", "redcurrant jelly"]):
        return 1.60
    if "stuffing" in t:
        return 1.75
    if any(k in t for k in ["breadcrumb", "bread", "flour", "cornflour", "sugar", "icing sugar", "brown sugar", "honey"]):
        return 1.15

    # Default average UK grocery item
    return 1.50


def find_recipe_node(data):
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

        if "@graph" in data:
            found = find_recipe_node(data["@graph"])
            if found:
                return found

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
    recipe_servings = 4

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
            if node.get("recipeYield"):
                recipe_servings = parse_servings(node.get("recipeYield"))

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
                    if node.get("recipeYield"):
                        recipe_servings = parse_servings(node.get("recipeYield"))
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

    if recipe_servings == 4:
        sm = re.search(r"Serves\s*[:\-]?\s*(\d+(?:\s*(?:-|to|–)\s*\d+)?)", plain_text, re.IGNORECASE)
        if sm:
            recipe_servings = parse_servings(sm.group(1))

    seen = set()
    deduped_ings = []
    for ing in ingredients:
        key = ing.lower()
        if key not in seen:
            seen.add(key)
            deduped_ings.append(ing)

    scaled_items = [scale_ingredient_for_7(ing, recipe_servings) for ing in deduped_ings]

    return {
        "recipe_url": url,
        "recipe_title": recipe_title or parsed.netloc,
        "recipe_description": recipe_description or "Recipe pulled from link.",
        "recipe_prep_time": prep_time or "Not listed",
        "recipe_cook_time": cook_time or "Not listed",
        "recipe_ingredients": deduped_ings,
        "recipe_image": recipe_image,
        "recipe_servings": recipe_servings,
        "recipe_custom_items": scaled_items,
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
               recipe_ingredients, recipe_image, recipe_added_by, recipe_servings, recipe_custom_items
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

        servings = int(dd.get("recipe_servings") or 4)
        dd["recipe_servings"] = servings

        try:
            custom_items = json.loads(dd.get("recipe_custom_items") or "[]")
        except Exception:
            custom_items = []

        # If custom_items haven't been computed yet for existing recipe_ingredients, compute them on the fly!
        if not custom_items and dd["recipe_ingredients"]:
            custom_items = [scale_ingredient_for_7(ing, servings) for ing in dd["recipe_ingredients"]]

        dd["compiled_ingredients"] = custom_items
        dd["claims"] = claims_by_dish.get(dd["id"], [])
        dishes.append(dd)

    # Meat Poll Votes
    meat_votes_rows = conn.execute(
        """
        SELECT mv.user_id, mv.choice, mv.voted_at,
               u.display_name, u.username, u.avatar_color
        FROM meat_votes mv
        JOIN users u ON u.id = mv.user_id
        ORDER BY mv.voted_at ASC
        """
    ).fetchall()
    meat_votes = [dict(r) for r in meat_votes_rows]

    # Drinks & Selections
    drinks_rows = conn.execute(
        """
        SELECT id, name, emoji, notes, created_by, created_by_name, created_at
        FROM drinks
        ORDER BY id ASC
        """
    ).fetchall()
    drink_sel_rows = conn.execute(
        """
        SELECT ds.user_id, ds.drink_id, ds.selected_at,
               u.display_name, u.username, u.avatar_color
        FROM drink_selections ds
        JOIN users u ON u.id = ds.user_id
        ORDER BY ds.selected_at ASC
        """
    ).fetchall()
    drinkers_by_drink = {}
    for s in drink_sel_rows:
        sd = dict(s)
        drinkers_by_drink.setdefault(sd["drink_id"], []).append(sd)

    drinks = []
    for dr in drinks_rows:
        drd = dict(dr)
        drd["drinkers"] = drinkers_by_drink.get(drd["id"], [])
        drinks.append(drd)

    return {
        "house_size": HOUSE_SIZE,
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
        "meat_poll": {
            "primary_meat": {"label": "Roast Chicken", "emoji": "🍗", "note": "Non-Negotiable Centrepiece"},
            "options": MEAT_POLL_OPTIONS,
            "votes": meat_votes if current_user else [],
        },
        "drinks": drinks if current_user else [],
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

                is_admin = user["role"] == "admin"
                can_manage_dishes = is_admin or bool(user.get("can_edit_dishes"))

                # 4. ADD DISH / ROLE
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

                # 5. UPDATE DISH / ROLE
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

                # 6. DELETE DISH / ROLE
                if path == "/api/dishes/delete":
                    if not can_manage_dishes:
                        return self.send_json(403, {"error": "You need Dish Editor or Administrator privileges to delete dishes."})
                    dish_id = data.get("dish_id")
                    conn.execute("DELETE FROM dishes WHERE id = ?", (dish_id,))
                    conn.commit()
                    return self.send_json(200, fetch_dashboard_state(conn, user))

                # 7. ADD OR UPDATE RECIPE URL ON A DISH
                if path == "/api/dishes/recipe":
                    dish_id = data.get("dish_id")
                    recipe_url = (data.get("recipe_url") or "").strip()
                    manual_override = bool(data.get("manual_override"))

                    dish = conn.execute("SELECT * FROM dishes WHERE id = ?", (dish_id,)).fetchone()
                    if not dish:
                        return self.send_json(404, {"error": "Dish not found."})

                    if not recipe_url and not manual_override:
                        conn.execute(
                            """
                            UPDATE dishes
                            SET recipe_url = '', recipe_title = '', recipe_description = '',
                                recipe_prep_time = '', recipe_cook_time = '',
                                recipe_ingredients = '[]', recipe_image = '', recipe_added_by = '',
                                recipe_servings = 4, recipe_custom_items = '[]'
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
                        try:
                            r_servings = max(1, min(30, int(data.get("recipe_servings") or dish["recipe_servings"] or 4)))
                        except Exception:
                            r_servings = 4
                        raw_ings = data.get("recipe_ingredients") or []
                        if isinstance(raw_ings, str):
                            r_ings = [x.strip() for x in raw_ings.split("\n") if x.strip()]
                        elif isinstance(raw_ings, list):
                            r_ings = [str(x).strip() for x in raw_ings if str(x).strip()]
                        else:
                            r_ings = []
                        r_image = (data.get("recipe_image") or dish["recipe_image"] or "").strip()
                        r_custom_items = data.get("compiled_ingredients")
                        if not isinstance(r_custom_items, list):
                            r_custom_items = [scale_ingredient_for_7(ing, r_servings) for ing in r_ings]
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
                            r_servings = scraped["recipe_servings"]
                            r_custom_items = scraped["recipe_custom_items"]
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
                            recipe_ingredients = ?, recipe_image = ?, recipe_added_by = ?,
                            recipe_servings = ?, recipe_custom_items = ?
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
                            r_servings,
                            json.dumps(r_custom_items),
                            dish_id,
                        ),
                    )
                    conn.commit()
                    return self.send_json(200, fetch_dashboard_state(conn, user))

                # 7B. ADMIN UPDATE COMPILED 7-PERSON INGREDIENT AMOUNT OR COST
                if path == "/api/recipes/update_item":
                    if not is_admin:
                        return self.send_json(403, {"error": "Only the Administrator can edit compiled ingredient amounts and costs."})
                    dish_id = data.get("dish_id")
                    item_index = int(data.get("item_index", -1))
                    new_ingredient = (data.get("ingredient") or "").strip()
                    new_amount = (data.get("amount_for_7") or "").strip()
                    try:
                        new_cost = max(0.0, round(float(data.get("estimated_cost_gbp", 0.0)), 2))
                    except Exception:
                        new_cost = 1.50

                    dish = conn.execute("SELECT * FROM dishes WHERE id = ?", (dish_id,)).fetchone()
                    if not dish:
                        return self.send_json(404, {"error": "Dish not found."})

                    try:
                        ings = json.loads(dish["recipe_ingredients"] or "[]")
                    except Exception:
                        ings = []
                    servings = int(dish["recipe_servings"] or 4)
                    try:
                        custom_items = json.loads(dish["recipe_custom_items"] or "[]")
                    except Exception:
                        custom_items = []
                    if not custom_items and ings:
                        custom_items = [scale_ingredient_for_7(ing, servings) for ing in ings]

                    if 0 <= item_index < len(custom_items):
                        if new_ingredient:
                            custom_items[item_index]["ingredient"] = new_ingredient
                        if new_amount:
                            custom_items[item_index]["amount_for_7"] = new_amount
                        custom_items[item_index]["estimated_cost_gbp"] = new_cost

                    conn.execute(
                        "UPDATE dishes SET recipe_custom_items = ? WHERE id = ?",
                        (json.dumps(custom_items), dish_id),
                    )
                    conn.commit()
                    return self.send_json(200, fetch_dashboard_state(conn, user))

                # 8. ASSIGN DISH TO ME (/api/dishes/claim)
                if path == "/api/dishes/claim":
                    dish_id = data.get("dish_id")
                    target_user_id = (
                        data.get("user_id")
                        if (is_admin and data.get("user_id"))
                        else user["id"]
                    )
                    note = (data.get("note") or "").strip()

                    lock_row = conn.execute("SELECT value FROM settings WHERE key = 'lock_claims'").fetchone()
                    if lock_row and lock_row["value"] == "true" and not is_admin:
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
                        if (is_admin and data.get("user_id"))
                        else user["id"]
                    )

                    lock_row = conn.execute("SELECT value FROM settings WHERE key = 'lock_claims'").fetchone()
                    if lock_row and lock_row["value"] == "true" and not is_admin:
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
                    if claim["user_id"] != user["id"] and not is_admin:
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

                # 11. MEAT POLL VOTE (EVERYONE CAN VOTE; ADMIN CAN ALSO EDIT ANYONE'S VOTE)
                if path == "/api/meat_poll/vote":
                    choice = (data.get("choice") or "").strip().lower()
                    target_user_id = (
                        int(data.get("user_id"))
                        if (is_admin and data.get("user_id"))
                        else user["id"]
                    )
                    if choice == "clear" or choice == "":
                        conn.execute("DELETE FROM meat_votes WHERE user_id = ?", (target_user_id,))
                        conn.commit()
                        return self.send_json(200, fetch_dashboard_state(conn, user))

                    if choice not in VALID_MEAT_IDS:
                        return self.send_json(400, {"error": "Invalid secondary meat option."})

                    conn.execute(
                        """
                        INSERT OR REPLACE INTO meat_votes (user_id, choice, voted_at)
                        VALUES (?, ?, ?)
                        """,
                        (target_user_id, choice, datetime.utcnow().isoformat()),
                    )
                    conn.commit()
                    return self.send_json(200, fetch_dashboard_state(conn, user))

                # 12. DRINKS: ADD DRINK OPTION (EVERYONE CAN UPLOAD DRINK OPTIONS)
                if path == "/api/drinks/add":
                    name = (data.get("name") or "").strip()
                    notes = (data.get("notes") or "").strip()
                    if not name:
                        return self.send_json(400, {"error": "Please enter a drink name."})

                    emoji = select_drink_emoji(name, notes)
                    conn.execute(
                        """
                        INSERT INTO drinks (name, emoji, notes, created_by, created_by_name, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (name, emoji, notes, user["id"], user["display_name"], datetime.utcnow().isoformat()),
                    )
                    conn.commit()
                    return self.send_json(200, fetch_dashboard_state(conn, user))

                # 13. DRINKS: SELECT / SWITCH ONE DRINK OPTION (OR ADMIN ASSIGN)
                if path == "/api/drinks/select":
                    drink_id = data.get("drink_id")
                    target_user_id = (
                        int(data.get("user_id"))
                        if (is_admin and data.get("user_id"))
                        else user["id"]
                    )
                    if not drink_id or drink_id == "clear":
                        conn.execute("DELETE FROM drink_selections WHERE user_id = ?", (target_user_id,))
                        conn.commit()
                        return self.send_json(200, fetch_dashboard_state(conn, user))

                    drink_row = conn.execute("SELECT id FROM drinks WHERE id = ?", (drink_id,)).fetchone()
                    if not drink_row:
                        return self.send_json(404, {"error": "Drink option not found."})

                    # Each person gets ONE drink selection (INSERT OR REPLACE switches their choice automatically)
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO drink_selections (user_id, drink_id, selected_at)
                        VALUES (?, ?, ?)
                        """,
                        (target_user_id, int(drink_id), datetime.utcnow().isoformat()),
                    )
                    conn.commit()
                    return self.send_json(200, fetch_dashboard_state(conn, user))

                # 14. DRINKS: EDIT OR DELETE DRINK OPTION (ADMIN OR CREATOR)
                if path == "/api/drinks/update":
                    drink_id = data.get("drink_id")
                    dr = conn.execute("SELECT * FROM drinks WHERE id = ?", (drink_id,)).fetchone()
                    if not dr:
                        return self.send_json(404, {"error": "Drink not found."})
                    if not is_admin and dr["created_by"] != user["id"]:
                        return self.send_json(403, {"error": "Only the Administrator or creator can edit this drink."})

                    name = (data.get("name") or "").strip()
                    notes = (data.get("notes") or "").strip()
                    if not name:
                        return self.send_json(400, {"error": "Drink name is required."})
                    emoji = (data.get("emoji") or "").strip() or select_drink_emoji(name, notes)
                    conn.execute(
                        "UPDATE drinks SET name = ?, emoji = ?, notes = ? WHERE id = ?",
                        (name, emoji, notes, drink_id),
                    )
                    conn.commit()
                    return self.send_json(200, fetch_dashboard_state(conn, user))

                if path == "/api/drinks/delete":
                    drink_id = data.get("drink_id")
                    dr = conn.execute("SELECT * FROM drinks WHERE id = ?", (drink_id,)).fetchone()
                    if not dr:
                        return self.send_json(404, {"error": "Drink not found."})
                    if not is_admin and dr["created_by"] != user["id"]:
                        return self.send_json(403, {"error": "Only the Administrator or creator can delete this drink."})
                    conn.execute("DELETE FROM drinks WHERE id = ?", (drink_id,))
                    conn.commit()
                    return self.send_json(200, fetch_dashboard_state(conn, user))

                # 15. UPDATE SETTINGS (ADMIN ONLY)
                if path == "/api/settings/update":
                    if not is_admin:
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

                # 16. ADMIN USER & PRIVILEGES MANAGEMENT (INCLUDING EDITING PEOPLE'S NAMES)
                if path == "/api/users/manage":
                    if not is_admin:
                        return self.send_json(403, {"error": "Only an Administrator can manage users and privileges."})
                    action = data.get("action")
                    target_id = data.get("user_id")
                    target = conn.execute("SELECT * FROM users WHERE id = ?", (target_id,)).fetchone()
                    if not target:
                        return self.send_json(404, {"error": "User not found."})

                    if action == "rename_user":
                        new_display_name = (data.get("display_name") or "").strip()
                        if not new_display_name:
                            return self.send_json(400, {"error": "Display name cannot be empty."})
                        conn.execute(
                            "UPDATE users SET display_name = ? WHERE id = ?",
                            (new_display_name, target_id),
                        )
                        conn.commit()
                        updated_me = self.get_current_user(conn)
                        return self.send_json(200, fetch_dashboard_state(conn, updated_me))

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
