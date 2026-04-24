from flask import Flask, render_template, request, jsonify, redirect
import sqlite3, json, os, random, requests
import google.generativeai as genai

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None

DATABASE_URL = os.environ.get("DATABASE_URL")

app = Flask(__name__)
DB_PATH = "food.db"
# ── API Setup ──────────────────────────────────────────────────────────────────
# IMPORTANT: DO NOT hardcode keys. Use Environment Variables on Render/Supabase.
GEMINI_API_KEYS = os.environ.get("GEMINI_API_KEYS", "YOUR_FALLBACK_KEY").split(",")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "YOUR_GROQ_KEY")
_key_index = 0
app.secret_key = "super-secret-admin-key-change-this" # For session
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"
USER_USERNAME = "user"
USER_PASSWORD = "password123"

def get_gemini_key():
    global _key_index
    key = GEMINI_API_KEYS[_key_index]
    _key_index = (_key_index + 1) % len(GEMINI_API_KEYS)
    return key

# ── DB Setup ──────────────────────────────────────────────────────────────────
def get_db():
    if DATABASE_URL and psycopg2:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

def execute_query(query, params=(), fetch=None, commit=True):
    """Universal query executor that handles placeholder differences."""
    is_postgres = DATABASE_URL and psycopg2
    if is_postgres:
        query = query.replace('?', '%s').replace('AUTOINCREMENT', '')
        # Handle PostgreSQL RETURNING for ID if it's an insert and we want the record back
        if query.strip().upper().startswith("INSERT") and "RETURNING" not in query.upper():
            query += " RETURNING id"
            fetch = 'one'
    
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor) if is_postgres else conn.cursor()
        if is_postgres:
            cur.execute(query, params)
        else:
            # SQLite cur.execute returns cursor
            cur.execute(query, params)
        
        res = None
        if fetch == 'one':
            res = cur.fetchone()
        elif fetch == 'all':
            res = cur.fetchall()
            
        if commit:
            conn.commit()
            
        # For SQLite INSERTs without specific fetch, return lastrowid
        if not is_postgres and query.strip().upper().startswith("INSERT") and res is None:
            return {"id": cur.lastrowid}
            
        return res
    finally:
        conn.close()

def init_db():
    # Use SERIAL for Postgres, AUTOINCREMENT for SQLite
    pk_type = "SERIAL PRIMARY KEY" if (DATABASE_URL and psycopg2) else "INTEGER PRIMARY KEY AUTOINCREMENT"
    
    # We execute these one by one to ensure compatibility
    queries = [
        f"""CREATE TABLE IF NOT EXISTS hostel (
            id {pk_type},
            name TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            description TEXT,
            maps_url TEXT,
            category TEXT DEFAULT 'Restaurant',
            opening_time TEXT,
            closing_time TEXT
        );""",
        f"""CREATE TABLE IF NOT EXISTS menu_item (
            id {pk_type},
            hostel_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            food_type TEXT NOT NULL,
            price REAL NOT NULL,
            calories INTEGER NOT NULL,
            meal_type TEXT NOT NULL
        );""",
        f"""CREATE TABLE IF NOT EXISTS users (
            id {pk_type},
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        );"""
    ]
    
    for q in queries:
        execute_query(q)

init_db()

# ── Helpers ───────────────────────────────────────────────────────────────────
def reverse_geocode(lat, lng):
    try:
        r = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lng, "format": "json"},
            headers={"User-Agent": "AIFoodApp/1.0"},
            timeout=5
        )
        data = r.json()
        return (data.get("address", {}).get("city")
                or data.get("address", {}).get("town")
                or data.get("address", {}).get("village")
                or data.get("display_name", "").split(",")[0]
                or "Madurai")
    except Exception:
        return "Madurai"

def generate_menu_gemini(hotel_name, city, hotel_id):
    seed = random.randint(1000, 9999)
    style_hint = ""
    name_lower = hotel_name.lower()
    if any(k in name_lower for k in ["veg", "ananda", "murugan", "idli", "saravana", "mess"]):
        style_hint = "Focus on vegetarian South Indian items."
    elif any(k in name_lower for k in ["bbq", "grill", "non-veg", "chicken", "mutton", "fish"]):
        style_hint = "Focus on non-vegetarian grilled and tandoor items."
    elif any(k in name_lower for k in ["cafe", "coffee", "bakery", "brew"]):
        style_hint = "Focus on snacks, beverages, sandwiches, and light bites."
    elif any(k in name_lower for k in ["punjab", "dhaba", "north"]):
        style_hint = "Focus on North Indian dishes, curries, and breads."
    elif any(k in name_lower for k in ["burger", "pizza", "fast", "lab"]):
        style_hint = "Focus on fast food, burgers, and continental items."

    prompt = f"""You are a menu designer for a restaurant called "{hotel_name}" located in {city}, India.
Random seed for uniqueness: {seed}. Hotel ID: {hotel_id}.

{style_hint}

Generate a unique restaurant menu with exactly 10 food items. Return ONLY valid JSON array, no markdown, no explanation.

Rules:
- Each hotel must have a UNIQUE menu different from all others
- Mix of meal types: Breakfast, Lunch, Dinner
- Price in INR (₹50 to ₹500 based on item)
- Calories between 150 and 900
- food_type: "Veg", "Non-veg", "Drink", or "Dessert"
- CRITICAL: If the style_hint says "Focus on vegetarian", then items MUST be "Veg", "Drink", or "Dessert". NO "Non-veg".
- Use the restaurant name and style to infer the cuisine type
- Add variety: main dishes, snacks, beverages, desserts

JSON format (array of objects):
[
  {{
    "name": "Item Name",
    "food_type": "Veg",
    "price": 120,
    "calories": 350,
    "meal_type": "Breakfast"
  }}
]"""

    try:
        current_key = get_gemini_key()
        genai.configure(api_key=current_key)
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(prompt)
        text = response.text.strip()
        # Strip markdown fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        items = json.loads(text.strip())
        return items
    except Exception as e:
        print(f"Gemini error: {e}")
        return None


# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/")
def landing():
    return render_template("landing.html")

@app.route("/app")
def index():
    username = request.cookies.get("user_auth")
    if not username:
        return redirect("/")
    return render_template("app.html")

@app.route("/admin")
def admin():
    if not os.environ.get("FLASK_DEBUG") == "1": # Only bypass for local dev if needed
        pass
    auth = request.cookies.get("admin_auth")
    if not auth or auth != f"{ADMIN_USERNAME}:{ADMIN_PASSWORD}":
        return render_template("admin_login.html")
    return render_template("admin.html")

@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    username = request.json.get("username")
    password = request.json.get("password")
    if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
        resp = jsonify({"success": True})
        resp.set_cookie("admin_auth", f"{username}:{password}", max_age=86400) # 1 day
        return resp
    return jsonify({"success": False, "error": "Invalid credentials"}), 401

@app.route("/api/user/login", methods=["POST"])
def user_login():
    username = request.json.get("username")
    password = request.json.get("password")
    user = execute_query("SELECT * FROM users WHERE username = ? AND password = ?", (username, password), fetch='one')
    if user:
        resp = jsonify({"success": True})
        resp.set_cookie("user_auth", username, max_age=86400)
        return resp
    return jsonify({"success": False, "error": "Invalid credentials"}), 401

@app.route("/api/user/signup", methods=["POST"])
def user_signup():
    username = request.json.get("username")
    password = request.json.get("password")
    if not username or not password:
        return jsonify({"success": False, "error": "Missing fields"}), 400
    try:
        execute_query("INSERT INTO users (username, password) VALUES (?, ?)", (username, password))
        resp = jsonify({"success": True})
        resp.set_cookie("user_auth", username, max_age=86400)
        return resp
    except Exception as e:
        # Check for unique constraint violation in a generic way
        err_msg = str(e).lower()
        if "unique" in err_msg or "already exists" in err_msg:
            return jsonify({"success": False, "error": "Username already exists"}), 409
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/auth/google", methods=["POST"])
def google_auth():
    # In a production app, we would verify the JWT here using google-auth library.
    # For now, we accept the token and set the session.
    token = request.json.get("credential")
    if token:
        resp = jsonify({"success": True})
        resp.set_cookie("user_auth", "google_user", max_age=86400)
        return resp
    return jsonify({"success": False}), 400

@app.route("/api/hotels")
def get_hotels():
    rows = execute_query("SELECT * FROM hostel", fetch='all')
    return jsonify([dict(r) for r in rows] if rows else [])

@app.route("/api/hotels", methods=["POST"])
def add_hotel():
    data = request.json
    name = data.get("name", "").strip()
    lat = float(data.get("lat", 0))
    lng = float(data.get("lng", 0))
    desc = data.get("description", "")
    maps_url = data.get("maps_url", "")
    category = data.get("category", "Restaurant")
    opening = data.get("opening_time", "")
    closing = data.get("closing_time", "")
    if not name:
        return jsonify({"error": "Name required"}), 400
    
    res = execute_query("INSERT INTO hostel(name,lat,lng,description,maps_url,category,opening_time,closing_time) VALUES(?,?,?,?,?,?,?,?)", 
                        (name, lat, lng, desc, maps_url, category, opening, closing))
    
    hotel_id = res["id"] if res and "id" in res else None
    return jsonify({"id": hotel_id, "name": name, "lat": lat, "lng": lng, "description": desc, "maps_url": maps_url, "category": category, "opening_time": opening, "closing_time": closing})

@app.route("/api/hotels/<int:hotel_id>", methods=["PUT", "DELETE"])
def manage_hotel(hotel_id):
    if request.method == "DELETE":
        execute_query("DELETE FROM menu_item WHERE hostel_id=?", (hotel_id,))
        execute_query("DELETE FROM hostel WHERE id=?", (hotel_id,))
        return jsonify({"success": True})

    if request.method == "PUT":
        data = request.json
        name = data.get("name")
        desc = data.get("description")
        maps_url = data.get("maps_url")
        category = data.get("category")
        lat = data.get("lat")
        lng = data.get("lng")
        opening = data.get("opening_time")
        closing = data.get("closing_time")
        
        execute_query(
            "UPDATE hostel SET name=?, description=?, maps_url=?, category=?, lat=?, lng=?, opening_time=?, closing_time=? WHERE id=?",
            (name, desc, maps_url, category, lat, lng, opening, closing, hotel_id)
        )
        return jsonify({"success": True})

@app.route("/api/menu/<int:hotel_id>")
def get_menu(hotel_id):
    hotel = execute_query("SELECT * FROM hostel WHERE id=?", (hotel_id,), fetch='one')
    if not hotel:
        return jsonify({"error": "Hotel not found"}), 404

    existing = execute_query("SELECT * FROM menu_item WHERE hostel_id=?", (hotel_id,), fetch='all')
    if existing:
        return jsonify({
            "hotel": dict(hotel),
            "menu": [dict(i) for i in existing],
            "source": "cache"
        })

        # Generate via AI
        city = reverse_geocode(hotel["lat"], hotel["lng"])
        items = generate_menu_gemini(hotel["name"], city, hotel_id)

        if items is None:
            return jsonify({"error": "AI failed to generate a menu for this restaurant. Please check API keys or try again later."}), 500

        for item in items:
            execute_query(
                "INSERT INTO menu_item(hostel_id,name,food_type,price,calories,meal_type) VALUES(?,?,?,?,?,?)",
                (hotel_id, item["name"], item["food_type"], item["price"], item["calories"], item["meal_type"])
            )

        rows = execute_query("SELECT * FROM menu_item WHERE hostel_id=?", (hotel_id,), fetch='all')
        return jsonify({
            "hotel": dict(hotel),
            "menu": [dict(r) for r in rows],
            "source": "ai",
            "city": city
        })

@app.route("/api/menu_cache/<int:hotel_id>", methods=["DELETE"])
def clear_menu_cache(hotel_id):
    execute_query("DELETE FROM menu_item WHERE hostel_id=?", (hotel_id,))
    return jsonify({"success": True, "message": "Menu cleared successfully"})

@app.route("/api/menu_item", methods=["POST"])
def add_menu_item():
    data = request.json
    hotel_id = data.get("hotel_id")
    name = data.get("name")
    food_type = data.get("food_type")
    price = data.get("price")
    calories = data.get("calories", random.randint(200, 600))
    meal_type = data.get("meal_type")

    execute_query(
        "INSERT INTO menu_item(hostel_id,name,food_type,price,calories,meal_type) VALUES(?,?,?,?,?,?)",
        (hotel_id, name, food_type, price, calories, meal_type)
    )
    return jsonify({"success": True})

@app.route("/api/menu_item/<int:item_id>", methods=["PUT", "DELETE"])
def manage_menu_item(item_id):
    if request.method == "DELETE":
        execute_query("DELETE FROM menu_item WHERE id=?", (item_id,))
        return jsonify({"success": True, "message": "Item deleted"})
    
    if request.method == "PUT":
        data = request.json
        name = data.get("name")
        food_type = data.get("food_type")
        price = data.get("price")
        meal_type = data.get("meal_type")
        
        execute_query(
            "UPDATE menu_item SET name=?, food_type=?, price=?, meal_type=? WHERE id=?",
            (name, food_type, price, meal_type, item_id)
        )
        return jsonify({"success": True, "message": "Item updated"})

@app.route("/api/recommend", methods=["POST"])
def recommend():
    data = request.json
    hotel_id = data["hotel_id"]
    budget = float(data["budget"])
    members = int(data["members"])
    preference = data["preference"]   # Veg / Non-veg / Both
    hunger = data["hunger"]           # Low / Medium / High
    meal_type = data["meal_type"]     # Breakfast / Lunch / Dinner

    query = "SELECT * FROM menu_item WHERE hostel_id=? AND (meal_type=? OR meal_type='All Day')"
    params = [hotel_id, meal_type]

    hotel = execute_query("SELECT * FROM hostel WHERE id=?", (hotel_id,), fetch='one')
    
    if preference != "Both":
        query += " AND food_type=?"
        params.append(preference)
    elif hotel and hotel["category"] == "Veg":
        # Force Veg for Veg hotels even if user picks 'Both'
        query += " AND food_type=?"
        params.append("Veg")

    items = execute_query(query, params, fetch='all')
    items = [dict(i) for i in items] if items else []

    if not items:
        return jsonify({"error": "No menu items found for selected filters. Try different meal type or preference."}), 400

    # VALIDATION: Check if budget can even cover the cheapest item for all members
    min_item_price = min(i["price"] for i in items)
    min_total_required = min_item_price * members
    if budget < min_total_required:
        return jsonify({
            "error": f"Budget of ₹{budget} is too low for {members} members at this restaurant. Minimal cost for this group would be approximately ₹{min_total_required}. Please adjust your budget or group size."
        }), 400

    # Hunger multiplier for quantity
    hunger_map = {"Low": 0.6, "Medium": 1.0, "High": 1.4}
    multiplier = hunger_map.get(hunger, 1.0)

    # Sort by category for variety
    mains = [i for i in items if any(k in i["name"].lower() for k in ["biryani","meals","curry","masala","roti","parotta","rice","burger","pizza","fish","mutton","chicken","paneer","dal"])]
    snacks = [i for i in items if any(k in i["name"].lower() for k in ["dosa","idli","pongal","sandwich","tikka","vada","bajji","samosa","wrap"])]
    extras = [i for i in items if any(k in i["name"].lower() for k in ["juice","coffee","lassi","soda","tea","dessert","gulab","kheer","ice cream","halwa","payasam"])]
    others = [i for i in items if i not in mains and i not in snacks and i not in extras]

    random.shuffle(mains); random.shuffle(snacks); random.shuffle(extras); random.shuffle(others)

    # Build candidate list with variety
    candidates = []
    if mains: candidates.append(mains[0])
    if mains and len(mains) > 1: candidates.append(mains[1])
    if snacks: candidates.append(snacks[0])
    if extras: candidates.append(extras[0])
    if others: candidates.append(others[0])
    if snacks and len(snacks) > 1: candidates.append(snacks[1])
    if extras and len(extras) > 1: candidates.append(extras[1])

    # Fill remaining from all items not yet picked
    picked_ids = {c["id"] for c in candidates}
    remaining = [i for i in items if i["id"] not in picked_ids]
    random.shuffle(remaining)
    candidates.extend(remaining)

    # Greedy selection within budget
    budget_per_person = budget / members
    selected = []
    total_cost = 0
    total_cal = 0

    for item in candidates:
        if len(selected) >= 6:
            break
        qty = max(1, min(members, int(members * multiplier)))
        cost = item["price"] * qty
        if total_cost + cost <= budget:
            selected.append({**item, "quantity": qty, "subtotal": round(cost, 2)})
            total_cost += cost
            total_cal += item["calories"] * qty

    if not selected:
        # fallback: pick cheapest item with qty=1
        cheapest = sorted(items, key=lambda x: x["price"])[0]
        selected = [{**cheapest, "quantity": 1, "subtotal": cheapest["price"]}]
        total_cost = cheapest["price"]
        total_cal = cheapest["calories"]

    # Suggestion message
    if len(selected) >= 5:
        msg = "🎉 Variety combo within budget — great pick for your group!"
    elif hunger == "High":
        msg = "🔥 High hunger mode: calorie-packed selection for your crew!"
    elif members > 4:
        msg = "👨‍👩‍👧‍👦 Balanced meal optimized for group dining!"
    else:
        msg = "✅ Smart selection — nutritious and budget-friendly!"

    return jsonify({
        "recommendations": selected,
        "total_cost": round(total_cost, 2),
        "total_calories": total_cal,
        "message": msg,
        "members": members,
        "budget": budget,
        "remaining_budget": round(budget - total_cost, 2)
    })

@app.route("/api/refine-recommendations", methods=["POST"])
def refine_recommendations():
    data = request.json
    hotel_id = data["hotel_id"]
    budget = float(data["budget"])
    members = int(data["members"])
    meal_type = data["meal_type"]
    user_msg = data["message"]
    current_recs = data.get("current_recommendations", [])

    # Get full menu for this hotel and meal type (including All Day)
    items = execute_query("SELECT * FROM menu_item WHERE hostel_id=? AND (meal_type=? OR meal_type='All Day')", (hotel_id, meal_type), fetch='all')
    menu_list = [dict(i) for i in items] if items else []
    hotel = execute_query("SELECT * FROM hostel WHERE id=?", (hotel_id,), fetch='one')

    if not menu_list:
        return jsonify({"error": "Menu not found for this hotel/meal type."}), 400

    # VALIDATION: Pre-check budget vs members to avoid unnecessary AI calls
    min_item_price = min(i["price"] for i in menu_list)
    min_total_required = min_item_price * members
    if budget < min_total_required:
        return jsonify({
            "error": f"Budget of ₹{budget} is too low to accommodate {members} members at this hotel. Minimal requirement is ₹{min_total_required}. Please decrease member count or increase budget."
        }), 400

    prompt = f"""You are an AI Food Assistant for the restaurant "{hotel['name']}".
The user wants to REFINE their existing food recommendations.

Members: {members}
Budget: ₹{budget}
Meal Type: {meal_type}

Previous Recommendations:
{json.dumps(current_recs)}

User's Update Request: "{user_msg}"

Available Menu Items (JSON):
{json.dumps(menu_list)}

Task:
1. Adjust the recommendations based on the user's request. 
   - If they want "starters", add/replace items with starters from the menu.
   - If they want "more of something", increase quantities.
2. The total cost MUST be less than or equal to ₹{budget}.
3. The selection should be sufficient for {members} people.
4. Return ONLY a valid JSON object in this format:
{{
  "recommendations": [
    {{ "id": 1, "name": "Item Name", "food_type": "Veg", "price": 100, "calories": 300, "meal_type": "Lunch", "quantity": 2, "subtotal": 200 }}
  ],
  "total_cost": 200,
  "total_calories": 600,
  "message": "Explain what you changed based on their request."
}}

Rules:
- DO NOT invent items. Use only items from the menu provided.
- Calculate subtotals and totals correctly.
- If the user's request is impossible (e.g. "I want gold" and it's not on the menu), politely explain in the "message" and provide a best-effort alternative from the menu.
- Return ONLY JSON. No markdown.
"""

    try:
        # Use Groq for lightning-fast chat refinement
        text = generate_refinement_groq(prompt)
        
        # Robust JSON extraction (shared logic)
        clean_json = text
        if not (clean_json.startswith("{") and clean_json.endswith("}")):
            start_index = clean_json.find("{")
            end_index = clean_json.rfind("}")
            if start_index != -1 and end_index != -1:
                clean_json = clean_json[start_index:end_index+1]

        result = json.loads(clean_json)
        
        # Add metadata like in /api/recommend
        result["members"] = members
        result["budget"] = budget
        result["remaining_budget"] = round(budget - result.get("total_cost", 0), 2)
        
        return jsonify(result)
    except Exception as e:
        print(f"Refinement error: {e}")
        # Try fallback to Gemini if Groq fails
        try:
            current_key = get_gemini_key()
            genai.configure(api_key=current_key)
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = model.generate_content(prompt)
            result = json.loads(response.text.strip())
            return jsonify(result)
        except:
             return jsonify({"error": f"AI refinement failed: {str(e)}"}), 500

def generate_refinement_groq(prompt):
    """Fallback/Premium refinement using Groq Cloud API for speed."""
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "response_format": {"type": "json_object"}
    }
    r = requests.post(url, headers=headers, json=payload, timeout=10)
    r.raise_for_status()
    data = r.json()
    return data["choices"][0]["message"]["content"]

# ── Initialization ─────────────────────────────────────────────────────────────
try:
    print("Initializing Database...")
    init_db()
    print("Database Initialized Successfully.")
except Exception as e:
    print(f"DATABASE INITIALIZATION ERROR: {e}")

if __name__ == "__main__":
    app.run(debug=True, port=5000)
