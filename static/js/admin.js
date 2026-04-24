/* Admin Panel Logic */

let map, pendingLatLng = null;
let markers = [];
let allHotels = [];
let currentEditingId = null;

function initAdminMap() {
    // Default to Madurai
    map = L.map('adminMap').setView([9.925, 78.12], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Try to get user location for admin
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                map.setView([latitude, longitude], 14);
            },
            (err) => {
                console.warn("Admin Geolocation denied, using default.");
            }
        );
    }

    map.on('click', onMapClick);
    loadHotels();
}

async function loadHotels() {
    const res = await fetch('/api/hotels');
    allHotels = await res.json();
    
    // Clear list
    const list = document.getElementById('hotelList');
    list.innerHTML = '';
    
    allHotels.forEach(hotel => {
        addMarker(hotel);
        appendToList(hotel);
    });
}

function addMarker(hotel) {
    const marker = L.marker([hotel.lat, hotel.lng]).addTo(map)
        .bindPopup(`<b>${hotel.name}</b>`);
    markers.push(marker);
}

function appendToList(hotel) {
    const list = document.getElementById('hotelList');
    const item = document.createElement('div');
    item.className = 'hotel-item';
    item.innerHTML = `
        <div class="hotel-item-info">
            <h4>${hotel.name}</h4>
            <div style="font-size: 0.72rem; display:flex; gap:6px; opacity:0.8;">
                <span style="background: rgba(255,255,255,0.1); padding: 1px 4px; border-radius: 3px;">${hotel.category || 'Restaurant'}</span>
                <span>${hotel.lat.toFixed(4)}, ${hotel.lng.toFixed(4)}</span>
            </div>
        </div>
        <div class="hotel-item-actions">
            <button class="btn-ghost" onclick="focusHotel(${hotel.lat}, ${hotel.lng})" title="View on Map">👁️</button>
            <button class="btn-ghost" onclick="openHotelEditor(${hotel.id})" title="Edit Info">✏️</button>
            <button class="btn-ghost" onclick="openMenuEditor(${hotel.id}, '${hotel.name}')" title="Manage Menu">📋</button>
            <button class="btn-ghost text-danger" onclick="deleteHotel(${hotel.id})" title="Delete Hotel">🗑️</button>
        </div>
    `;
    list.appendChild(item);
}

function openHotelEditor(id) {
    const hotel = allHotels.find(h => h.id === id);
    if (!hotel) return;

    currentEditingId = id;
    pendingLatLng = { lat: hotel.lat, lng: hotel.lng }; // Store current pos
    
    document.getElementById('editHotelName').value = hotel.name;
    document.getElementById('editHotelDesc').value = hotel.description || '';
    document.getElementById('editHotelMapsUrl').value = hotel.maps_url || '';
    document.getElementById('editHotelCategory').value = hotel.category || 'Restaurant';
    document.getElementById('editHotelOpening').value = hotel.opening_time || '09:00';
    document.getElementById('editHotelClosing').value = hotel.closing_time || '22:00';
    document.getElementById('editCoordsDisplay').textContent = `${hotel.lat.toFixed(6)}, ${hotel.lng.toFixed(6)}`;

    document.getElementById('editHotelForm').classList.remove('hidden');
    document.getElementById('selectionHint').classList.add('hidden');
    document.getElementById('hotelForm').classList.add('hidden');
    document.getElementById('menuEditorCard').classList.add('hidden');
}

function closeHotelEditor() {
    currentEditingId = null;
    document.getElementById('editHotelForm').classList.add('hidden');
    document.getElementById('selectionHint').classList.remove('hidden');
}

async function updateHotel() {
    const name = document.getElementById('editHotelName').value.trim();
    const desc = document.getElementById('editHotelDesc').value.trim();
    const url = document.getElementById('editHotelMapsUrl').value.trim();
    const category = document.getElementById('editHotelCategory').value;
    const opening = document.getElementById('editHotelOpening').value;
    const closing = document.getElementById('editHotelClosing').value;

    if (!name) return alert("Name is required");

    try {
        const res = await fetch(`/api/hotels/${currentEditingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name, 
                description: desc, 
                maps_url: url, 
                category: category,
                lat: pendingLatLng.lat,
                lng: pendingLatLng.lng,
                opening_time: opening,
                closing_time: closing
            })
        });
        if (res.ok) {
            alert("Restaurant updated!");
            location.reload(); // Refresh to update markers and list
        }
    } catch (err) { alert("Update failed"); }
}

async function deleteHotel(id) {
    if (!confirm("Permanently delete this restaurant and all its menu items?")) return;
    try {
        const res = await fetch(`/api/hotels/${id}`, { method: 'DELETE' });
        if (res.ok) location.reload();
    } catch (err) { alert("Delete failed"); }
}

function focusHotel(lat, lng) {
    map.setView([lat, lng], 16);
}

function onMapClick(e) {
    if (currentEditingId) {
        // We are editing an existing hotel - update its coordinates
        pendingLatLng = e.latlng;
        document.getElementById('editCoordsDisplay').textContent = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
        if (window.tempMarker) map.removeLayer(window.tempMarker);
        window.tempMarker = L.marker(e.latlng, { opacity: 0.8 }).addTo(map);
        return;
    }

    pendingLatLng = e.latlng;
    document.getElementById('coordsDisplay').textContent = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
    
    // Show form
    document.getElementById('hotelForm').classList.remove('hidden');
    document.getElementById('selectionHint').classList.add('hidden');
    document.getElementById('editHotelForm').classList.add('hidden');
    document.getElementById('menuEditorCard').classList.add('hidden');
    
    // Clear previous temporary marker if any
    if (window.tempMarker) map.removeLayer(window.tempMarker);
    window.tempMarker = L.marker(e.latlng, { opacity: 0.7 }).addTo(map);
}

function cancelAdd() {
    document.getElementById('hotelForm').classList.add('hidden');
    document.getElementById('selectionHint').classList.remove('hidden');
    if (window.tempMarker) map.removeLayer(window.tempMarker);
    pendingLatLng = null;
}

async function saveHotel() {
    const name = document.getElementById('newHotelName').value.trim();
    const desc = document.getElementById('newHotelDesc').value.trim();
    const mapsUrl = document.getElementById('newHotelMapsUrl').value.trim();
    const category = document.getElementById('newHotelCategory').value;
    const opening = document.getElementById('newHotelOpening').value;
    const closing = document.getElementById('newHotelClosing').value;
    
    if (!name || !pendingLatLng) {
        alert("Please provide a name and select a location on the map.");
        return;
    }

    try {
        const res = await fetch('/api/hotels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                description: desc,
                maps_url: mapsUrl,
                category: category,
                lat: pendingLatLng.lat,
                lng: pendingLatLng.lng,
                opening_time: opening,
                closing_time: closing
            })
        });

        if (res.ok) {
            const newHotel = await res.json();
            allHotels.push(newHotel); // Important: Update global list
            addMarker(newHotel);
            appendToList(newHotel);
            cancelAdd();
            alert("Restaurant saved successfully!");
        } else {
            alert("Failed to save restaurant.");
        }
    } catch (err) {
        console.error(err);
        alert("Error connecting to server.");
    }
}

// ── Menu Management Logic ───────────────────────────────────────────────────

function openMenuEditor(id, name) {
    currentEditingId = id;
    document.getElementById('editingHotelName').textContent = name;
    document.getElementById('menuEditorCard').classList.remove('hidden');
    document.getElementById('hotelForm').classList.add('hidden'); // Hide add form
    loadMenu(id);
}

async function loadMenu(hotelId) {
    const list = document.getElementById('menuItemsList');
    list.innerHTML = '<p class="muted">Loading menu...</p>';
    
    try {
        const res = await fetch(`/api/menu/${hotelId}`);
        const data = await res.json();
        
        if (data.menu && data.menu.length > 0) {
            list.innerHTML = data.menu.map(item => `
                <div class="admin-menu-item">
                    <div class="item-info">
                        <strong>${item.name}</strong>
                        <span>₹${item.price} · ${item.food_type} · ${item.meal_type}</span>
                    </div>
                    <div class="item-ops">
                        <button class="btn-sm btn-ghost" onclick="editItemPrompt(${item.id}, '${item.name}', ${item.price}, '${item.food_type}', '${item.meal_type}')">✏️</button>
                        <button class="btn-sm btn-danger-text" onclick="deleteMenuItem(${item.id})">🗑️</button>
                    </div>
                </div>
            `).join("");
        } else {
            list.innerHTML = '<p class="muted" style="text-align:center;padding:10px;">No items found. AI will generate on view.</p>';
        }
    } catch (err) {
        list.innerHTML = '<p class="error">Failed to load menu</p>';
    }
}

async function deleteMenuItem(id) {
    if (!confirm("Delete this item?")) return;
    try {
        const res = await fetch(`/api/menu_item/${id}`, { method: 'DELETE' });
        if (res.ok) loadMenu(currentEditingId);
    } catch (err) { alert("Error deleting"); }
}

function editItemPrompt(id, name, price, type, meal) {
    const newName = prompt("Edit Item Name:", name);
    if (!newName) return;
    
    const newPrice = prompt("Edit Price (₹):", price);
    if (newPrice === null) return;
    
    const newType = prompt("Edit Type (Veg / Non-veg / Drink / Dessert):", type);
    if (!newType) return;
    
    const newMeal = prompt("Edit Meal Type (Breakfast / Lunch / Dinner / All Day):", meal);
    if (!newMeal) return;
    
    updateMenuItem(id, {
        name: newName.trim(),
        price: parseFloat(newPrice),
        food_type: newType.trim(),
        meal_type: newMeal.trim()
    });
}

async function updateMenuItem(id, payload) {
    try {
        const res = await fetch(`/api/menu_item/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) loadMenu(currentEditingId);
    } catch (err) { alert("Error updating"); }
}

function closeMenuEditor() {
    currentEditingId = null;
    document.getElementById('menuEditorCard').classList.add('hidden');
}

async function addManualItem() {
    const name = document.getElementById('manualItemName').value.trim();
    const type = document.getElementById('manualItemType').value;
    const price = document.getElementById('manualItemPrice').value;
    const meal = document.getElementById('manualItemMeal').value;

    if (!name || !price) {
        alert("Please fill in item name and price.");
        return;
    }

    try {
        const res = await fetch('/api/menu_item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hotel_id: currentEditingId,
                name,
                food_type: type,
                price: parseFloat(price),
                meal_type: meal
            })
        });

        if (res.ok) {
            document.getElementById('manualItemName').value = '';
            loadMenu(currentEditingId); // Reload list
        } else {
            alert("Failed to add menu item.");
        }
    } catch (err) {
        console.error(err);
        alert("Error connecting to server.");
    }
}

async function confirmClearMenu() {
    if (!confirm("Are you sure you want to clear the entire menu for this restaurant? This cannot be undone.")) return;

    try {
        const res = await fetch(`/api/menu_cache/${currentEditingId}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            alert("Menu cleared. Next time you view this restaurant, AI will generate a fresh menu if no manual items exist.");
            closeMenuEditor();
        } else {
            alert("Failed to clear menu.");
        }
    } catch (err) {
        console.error(err);
        alert("Error connecting to server.");
    }
}

// Boot
initAdminMap();
