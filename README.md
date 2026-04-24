# 🍽️ AI Smart Food Recommendation System

A full-stack web application that helps users discover restaurants on a map, auto-generates menus using Google Gemini AI, and provides intelligent food recommendations based on budget, group size, and preferences.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Set Your Gemini API Key
Get a free key at: https://aistudio.google.com/app/apikey

**Linux/Mac:**
```bash
export GEMINI_API_KEY="your-api-key-here"
```

**Windows (Command Prompt):**
```cmd
set GEMINI_API_KEY=your-api-key-here
```

**Windows (PowerShell):**
```powershell
$env:GEMINI_API_KEY="your-api-key-here"
```

### 3. Run the App
```bash
python app.py
```

### 4. Open in Browser
Navigate to: **http://localhost:5000**

---

## 🗂️ Project Structure
```
food-app/
├── app.py                  # Flask backend (API routes, AI logic, DB)
├── food.db                 # SQLite database (auto-created)
├── requirements.txt        # Python dependencies
├── templates/
│   └── index.html          # Main HTML page
└── static/
    ├── css/style.css       # Styling (dark theme)
    └── js/app.js           # Frontend logic (map, API calls, UI)
```

---

## 🎯 Features

| Feature | Description |
|---------|-------------|
| 🗺️ **Interactive Map** | Leaflet.js dark map with restaurant markers |
| 📍 **Add Restaurants** | Click map to place new restaurants |
| 🤖 **AI Menu Generation** | Gemini generates unique menus per restaurant |
| 💾 **Smart Caching** | Menus stored in SQLite, re-fetched instantly |
| 🔍 **Menu Preview** | Browse menu by meal type or Veg/Non-veg |
| 🎯 **Smart Recommendations** | Budget-aware, variety-focused suggestions |
| 📊 **Nutritional Info** | Calories, total cost, savings displayed |

---

## 🧠 How It Works

1. **Map loads** with seeded restaurants around Madurai, Tamil Nadu
2. **Click a restaurant** → app checks SQLite for existing menu
3. **No menu found** → Gemini AI generates a unique 10-item menu using hotel name + city
4. **Menu cached** in SQLite for instant future loads
5. **Fill preferences** → Budget, members, hunger level, meal type
6. **AI recommendations** → Greedy algorithm selects diverse items within budget
7. **Results shown** → Item list, total cost, calories, savings

---

## 🔑 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/hotels` | List all restaurants |
| POST | `/api/hotels` | Add a new restaurant |
| GET | `/api/menu/<id>` | Get/generate menu for hotel |
| POST | `/api/recommend` | Get food recommendations |

---

## 💡 Notes

- Works without a Gemini API key (falls back to a realistic static menu generator)
- Reverse geocoding uses OpenStreetMap Nominatim (free, no key needed)
- SQLite database (`food.db`) is auto-created on first run
- 8 restaurants pre-seeded in the Madurai area

---

## 🛠️ Tech Stack

- **Backend:** Python, Flask, SQLite
- **AI:** Google Gemini 1.5 Flash
- **Geocoding:** OpenStreetMap Nominatim
- **Frontend:** Vanilla JS, Leaflet.js
- **Styling:** Custom CSS (dark theme)
