/* AI Smart Food Recommendation System — Frontend */

// ── State ──────────────────────────────────────────────────────────────────
/* Main App Logic */
(function() {
    // Custom Cursor Logic
    const cursor = document.getElementById('cursor');
    document.addEventListener('mousemove', (e) => {
        cursor.style.transform = `translate(${e.clientX - 12}px, ${e.clientY - 12}px)`;
    });

    // Pulse markers and interactions
    window.addEventListener('DOMContentLoaded', () => {
        console.log("AI Food Advisor App Started");
    });
    
    window.addEventListener('load', () => {
        if (map) map.invalidateSize();
    });
})();

let map, selectedHotel = null;
let currentMenu = [], activeMenuTab = "All", selectedMealType = "Breakfast";
let markers = {};

// ── Map Init ───────────────────────────────────────────────────────────────
function initMap() {
  // Default to Madurai
  map = L.map("map", { zoomControl: true }).setView([9.925, 78.12], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© OpenStreetMap contributors', maxZoom: 19
  }).addTo(map);

  // Try to get user location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 14);
        console.log("Map centered on user location");
      },
      (err) => {
        console.warn("Geolocation denied or failed, using default (Madurai)");
      }
    );
  }

  loadHotels();
  
  // Robust fix for Leaflet initialization in flex/grid containers
  setTimeout(() => map.invalidateSize(), 100);
  setTimeout(() => map.invalidateSize(), 500);
  setTimeout(() => map.invalidateSize(), 1000);
}

function makeIcon(selected = false) {
  return L.divIcon({
    className: "",
    html: `<div class="custom-marker ${selected ? "selected" : ""}"><span>🍽️</span></div>`,
    iconSize: [38, 38], iconAnchor: [19, 38], popupAnchor: [0, -38]
  });
}

let allHotels = [];

// ── Load Hotels ────────────────────────────────────────────────────────────
async function loadHotels() {
  const res = await fetch("/api/hotels");
  allHotels = await res.json();
  allHotels.forEach(addMarker);
}

function searchHotels() {
  const q = el("hotelSearch").value.toLowerCase().trim();
  const resDiv = el("searchResults");
  if (!q) {
    resDiv.classList.add("hidden");
    return;
  }
  const matches = allHotels.filter(h => h.name.toLowerCase().includes(q));
  if (matches.length > 0) {
    resDiv.innerHTML = matches.map(h => `
      <div class="search-item" onclick="goToHotel(${h.id})">
        <strong>${h.name}</strong><br><small>${h.description || ""}</small>
      </div>
    `).join("");
    resDiv.classList.remove("hidden");
  } else {
    resDiv.innerHTML = `<div class="search-item muted">No restaurants found</div>`;
    resDiv.classList.remove("hidden");
  }
}

function goToHotel(id) {
  const hotel = allHotels.find(h => h.id === id);
  if (!hotel || !markers[id]) return;
  
  el("searchResults").classList.add("hidden");
  el("hotelSearch").value = hotel.name;
  
  map.flyTo([hotel.lat, hotel.lng], 16);
  markers[id].openPopup();
  selectHotel(hotel, markers[id]);
}

// ── Quick Filters Logic ────────────────────────────────────────────────────
function filterByCategory(cat) {
  // Update button UI
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.innerText.includes(cat) || (cat==='all' && btn.innerText.includes('All')));
  });

  allHotels.forEach(hotel => {
    const marker = markers[hotel.id];
    if (cat === 'all' || hotel.category === cat) {
      if (!map.hasLayer(marker)) marker.addTo(map);
    } else {
      if (map.hasLayer(marker)) map.removeLayer(marker);
    }
  });

  if (cat !== 'all') {
    const bounds = L.featureGroup(Object.values(markers).filter((_, i) => allHotels[i] && (allHotels[i].category === cat || cat==='all'))).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50] });
  }
}

let userLocation = null;
function showNearby() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.innerText.includes('Nearby'));
  });

  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser");
    return;
  }

  navigator.geolocation.getCurrentPosition((position) => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    userLocation = [lat, lng];

    map.flyTo([lat, lng], 15);
    
    // Add User Marker
    if (window.userMarker) map.removeLayer(window.userMarker);
    window.userMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'user-location-marker',
        html: '📍',
        iconSize: [30, 30]
      })
    }).addTo(map).bindPopup("You are here").openPopup();

    // Filter hotels within 1km
    allHotels.forEach(hotel => {
      const dist = calculateDistance(lat, lng, hotel.lat, hotel.lng);
      const marker = markers[hotel.id];
      if (dist <= 1.0) { // 1 km radius
        if (!map.hasLayer(marker)) marker.addTo(map);
      } else {
        if (map.hasLayer(marker)) map.removeLayer(marker);
      }
    });
  }, () => {
    alert("Could not get your location.");
  });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Close search on click outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-box")) el("searchResults").classList.add("hidden");
});

function addMarker(hotel) {
  if (markers[hotel.id]) map.removeLayer(markers[hotel.id]);
  const m = L.marker([hotel.lat, hotel.lng], { icon: makeIcon() })
    .addTo(map)
    .bindPopup(`<strong>${hotel.name}</strong><br><small>${hotel.description || ""}</small>`)
    .bindTooltip(hotel.name, { permanent: true, direction: 'top', className: 'marker-label', offset: [0, -10] });
  m.on("click", () => selectHotel(hotel, m));
  markers[hotel.id] = m;
}

// ── Select Hotel ───────────────────────────────────────────────────────────
async function selectHotel(hotel, marker) {
  // Reset previous selected marker
  if (selectedHotel && markers[selectedHotel.id]) {
    markers[selectedHotel.id].setIcon(makeIcon(false));
  }
  selectedHotel = hotel;
  marker.setIcon(makeIcon(true));

  // Show hotel card
  show("hotelCard"); hide("emptyState");
  el("hotelName").textContent = hotel.name;
  el("hotelDesc").textContent = hotel.description || "Restaurant";
  el("hotelCity").textContent = "";
  
  const gLink = el("googleMapsLink");
  if (hotel.maps_url) {
      gLink.href = hotel.maps_url;
  } else {
      gLink.href = `https://www.google.com/maps/search/?api=1&query=${hotel.lat},${hotel.lng}`;
  }
  gLink.classList.remove("hidden");

  el("menuStatus").textContent = "Checking menu...";

  // Reset panels
  hide("menuPreviewCard"); hide("prefCard"); hide("resultCard"); hide("menuLoading");

  // Show loading
  show("menuLoading");

  try {
    const res = await fetch(`/api/menu/${hotel.id}`);
    const data = await res.json();
    hide("menuLoading");

    if (data.error) {
      el("menuStatus").textContent = "⚠️ " + data.error;
      return;
    }

    currentMenu = data.menu;

    // Update hotel info
    if (data.city) el("hotelCity").textContent = "📍 " + data.city;
    el("menuStatus").textContent = `${data.menu.length} items available`;

    // Source badge
    const src = data.source === "ai" ? "⚡ AI Generated" : "💾 Cached";
    const cls = data.source === "ai" ? "source-ai" : "source-cache";
    el("menuSource").textContent = src;
    el("menuSource").className = "source-badge " + cls;

    renderMenuPreview(data.menu);
    show("menuPreviewCard"); show("prefCard");

    // Ensure map tiles are correctly rendered
    map.invalidateSize();

    // Opening/Closing times
    if (hotel.opening_time && hotel.closing_time) {
        el("openingTime").textContent = hotel.opening_time;
        el("closingTime").textContent = hotel.closing_time;
        show("hotelTiming");
    } else {
        hide("hotelTiming");
    }

    // Hide meal type for Coffee category
    if (hotel.category === 'Coffee' || hotel.category === 'Mall') {
        hide("mealToggle").parentElement.classList.add("hidden");
    } else {
        show("mealToggle").parentElement.classList.remove("hidden");
    }

    // Auto-detect meal time
    const h = new Date().getHours();
    selectedMealType = h < 11 ? "Breakfast" : h < 16 ? "Lunch" : "Dinner";
    document.querySelectorAll(".meal-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.val === selectedMealType);
    });

  } catch (e) {
    hide("menuLoading");
    el("menuStatus").textContent = "⚠️ Failed to load menu";
  }
}

// ── Menu Preview ───────────────────────────────────────────────────────────
function renderMenuPreview(menu) {
  const tabs = ["All", "Breakfast", "Lunch", "Dinner", "Veg", "Non-veg", "Drink", "Dessert"];
  el("menuTabs").innerHTML = tabs.map(t =>
    `<button class="tab-btn ${t === activeMenuTab ? "active" : ""}" onclick="switchTab('${t}')">${t}</button>`
  ).join("");
  renderMenuItems(menu);
}

function switchTab(tab) {
  activeMenuTab = tab;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.textContent === tab));
  renderMenuItems(currentMenu);
}

function renderMenuItems(menu) {
  let filtered = menu;
  if (activeMenuTab !== "All") {
    filtered = menu.filter(i =>
      i.meal_type === activeMenuTab || i.food_type === activeMenuTab
    );
  }
  el("menuList").innerHTML = filtered.slice(0, 20).map(item => `
    <div class="menu-item-row">
      <div class="item-dot dot-${item.food_type.toLowerCase().replace('-', '')}"></div>
      <span class="item-name">${item.name}</span>
      <div class="item-meta">
        <span class="item-meal-tag">${item.food_type}</span>
        <span class="item-meal-tag">${item.meal_type}</span>
        <span class="item-cal">${item.calories} cal</span>
        <span class="item-price">₹${item.price}</span>
      </div>
    </div>
  `).join("") || `<p class="muted" style="padding:12px;text-align:center">No items for this filter</p>`;
}

// ── Recommendations ────────────────────────────────────────────────────────
async function getRecommendations() {
  if (!selectedHotel) return;

  const budget = parseFloat(el("budget").value) || 500;
  const members = parseInt(el("members").value) || 1;
  const preference = el("preference").value;
  const hunger = el("hunger").value;

  const btn = el("recommendBtn");
  btn.textContent = "✨ Finding best combo...";
  btn.classList.add("loading");

  try {
    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hotel_id: selectedHotel.id,
        budget, members, preference, hunger,
        meal_type: selectedMealType
      })
    });
    const data = await res.json();

    btn.textContent = "✨ Get AI Recommendations";
    btn.classList.remove("loading");

    if (data.error) {
      el("resultMessage").textContent = "⚠️ " + data.error;
      el("resultItems").innerHTML = "";
      el("resultSummary").innerHTML = "";
      show("resultCard");
      return;
    }

    renderResults(data);

  } catch (e) {
    btn.textContent = "✨ Get AI Recommendations";
    btn.classList.remove("loading");
    alert("Error fetching recommendations.");
  }
}

async function refineRecommendations() {
  if (!selectedHotel) return;
  const userInput = el("refineInput").value.trim();
  if (!userInput) return;

  const btn = el("refineBtn");
  btn.textContent = "Refining...";
  btn.classList.add("loading");

  // Add user message to history
  const history = el("refineHistory");
  history.innerHTML += `<div class="chat-msg msg-user">${userInput}</div>`;
  history.scrollTop = history.scrollHeight;

  const budget = parseFloat(el("budget").value) || 500;
  const members = parseInt(el("members").value) || 1;

  try {
    const res = await fetch("/api/refine-recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hotel_id: selectedHotel.id,
        budget, members,
        meal_type: selectedMealType,
        message: userInput,
        current_recommendations: currentRecommendationsData ? currentRecommendationsData.recommendations : []
      })
    });
    const data = await res.json();

    btn.textContent = "Refine";
    btn.classList.remove("loading");
    el("refineInput").value = "";

    if (data.error) {
      history.innerHTML += `<div class="chat-msg msg-ai" style="color:var(--red)">⚠️ ${data.error}</div>`;
      return;
    }

    // Add AI response to history
    history.innerHTML += `<div class="chat-msg msg-ai">${data.message}</div>`;
    history.scrollTop = history.scrollHeight;

    renderResults(data);

  } catch (e) {
    btn.textContent = "Refine";
    btn.classList.remove("loading");
    alert("Error refining recommendations.");
  }
}

let currentRecommendationsData = null;

function renderResults(data) {
  currentRecommendationsData = data;
  show("resultCard");
  el("resultMessage").textContent = data.message;
  // If this was a fresh recommendation (not a refinement), clear history
  if (data.source === "ai" || data.source === "cache") {
    el("refineHistory").innerHTML = "";
  }

  el("resultItems").innerHTML = data.recommendations.map((item, i) => `
    <div class="result-item" style="animation-delay:${i * 0.06}s">
      <div class="item-dot dot-${item.food_type.toLowerCase().replace('-', '')}" style="flex-shrink:0"></div>
      <div class="result-item-main">
        <div class="result-item-name">${item.name}</div>
        <div class="result-item-sub">${item.food_type} · ${item.meal_type} · ${item.calories * item.quantity} cal total</div>
      </div>
      <div class="result-item-right">
        <div class="result-qty">×${item.quantity}</div>
        <div class="result-subtotal">₹${item.subtotal}</div>
      </div>
    </div>
  `).join("");

  el("resultSummary").innerHTML = `
    <div class="summary-stat">
      <label>💰 Total Cost</label>
      <span class="stat-cost">₹${data.total_cost}</span>
    </div>
    <div class="summary-stat">
      <label>🔥 Calories</label>
      <span class="stat-cal">${data.total_calories}</span>
    </div>
    <div class="summary-stat">
      <label>💚 Saved</label>
      <span class="stat-save">₹${data.remaining_budget}</span>
    </div>
  `;

  // Scroll to results
  el("resultCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Removed User-level 'Add Hotel' logic to maintain database integrity. 
// Use the Admin Panel for any infrastructure modifications.

// ── Meal Toggle ────────────────────────────────────────────────────────────
document.querySelectorAll(".meal-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".meal-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedMealType = btn.dataset.val;
    hide("resultCard");
  };
});

// ── Utils ──────────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
function show(id) { el(id).classList.remove("hidden"); }
function hide(id) { el(id).classList.add("hidden"); }

// ── Boot ───────────────────────────────────────────────────────────────────
initMap();

// Add Enter key listener for refinement
document.addEventListener('DOMContentLoaded', () => {
  const refineInput = el("refineInput");
  if (refineInput) {
    refineInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") refineRecommendations();
    });
  }
});
