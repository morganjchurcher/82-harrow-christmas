/**
 * 82 Harrow Christmas Dinner Dashboard - Frontend Controller
 * Includes:
 * - Animated Snowy Background Canvas
 * - Morgan's Administrator Privileges (Edit people's names, selections & recipes + Dish Editor & Admin toggles)
 * - "Assign to me" -> "Sorted by THEIR NAME"
 * - Expandable Dish Items with "Add Recipe URL" -> Auto-pulled Ingredients, Prep Time, Cook Time & Short Description
 * - Compiled Recipe Ingredient List (Scaled for 7 people + UK Supermarket £ Costs + Total & Total ÷ 7)
 * - Secondary Meat Poll (Primary = Chicken non-negotiable; Gammon, Beef, Lamb, Pork, Beef Wellington + Live Pie Chart)
 * - Drinks Board (Everyone uploads options + AI-matched Emoji + 1 switchable drink selection per person)
 */

const TOKEN_STORAGE_KEY = "harrow82_auth_token";
const HOUSE_SIZE = 7;

const QUICK_PRESETS = [
  { title: "Roast Chicken (Primary Meat)", category: "Mains", max_claims: 1, notes: "Non-negotiable centrepiece!" },
  { title: "Secondary Meat (From Meat Poll)", category: "Mains", max_claims: 1, notes: "Winner of the 82 Harrow Meat Poll" },
  { title: "Vegetarian / Vegan Main", category: "Mains", max_claims: 1, notes: "Nut roast or veggie alternative" },
  { title: "Crispy Roast Potatoes", category: "Sides & Trimmings", max_claims: 2, notes: "Plenty for 7 people" },
  { title: "Pigs in Blankets", category: "Sides & Trimmings", max_claims: 1, notes: "Get extra!" },
  { title: "Yorkshire Puddings", category: "Sides & Trimmings", max_claims: 1, notes: "Essential on every plate" },
  { title: "Sage & Onion Stuffing", category: "Sides & Trimmings", max_claims: 1, notes: "" },
  { title: "Honey Roast Parsnips & Carrots", category: "Sides & Trimmings", max_claims: 1, notes: "" },
  { title: "Brussels Sprouts (with Bacon/Chestnuts)", category: "Sides & Trimmings", max_claims: 1, notes: "" },
  { title: "Cauliflower Cheese", category: "Sides & Trimmings", max_claims: 1, notes: "" },
  { title: "Proper Rich Gravy", category: "Sides & Trimmings", max_claims: 1, notes: "Lots of it!" },
  { title: "Cranberry & Bread Sauces", category: "Sides & Trimmings", max_claims: 1, notes: "" },
  { title: "Christmas Pudding / Yule Log", category: "Puddings & Desserts", max_claims: 1, notes: "With custard or cream" },
  { title: "Mince Pies & After Dinner Treats", category: "Puddings & Desserts", max_claims: 1, notes: "" },
  { title: "Christmas Crackers, Table & Music", category: "Table & Setup", max_claims: 2, notes: "Set the 82 Harrow dining table" },
  { title: "Head Chef / Oven Timer Coordinator", category: "Cleanup & Kitchen Roles", max_claims: 1, notes: "Keep the timings on track" },
  { title: "Washing Up & Kitchen Cleanup Crew", category: "Cleanup & Kitchen Roles", max_claims: 3, notes: "Post-dinner team effort" },
];

const CATEGORY_ICONS = {
  "Mains": "🦃",
  "Sides & Trimmings": "🥔",
  "Drinks": "🍷",
  "Puddings & Desserts": "🥧",
  "Table & Setup": "🎄",
  "Cleanup & Kitchen Roles": "🧽",
};

const STATUS_LABELS = {
  claimed: "📝 Planned",
  bought: "🛒 Bought Ingredients",
  ready: "✅ Ready / Done",
};

let appState = null;
let activeView = "dishes";
let activePeopleSubtab = "privileges";
let activeFilter = "ALL";
let searchQuery = "";
let pollTimer = null;

const expandedDishIds = new Set();
const editingRecipeDishIds = new Set();
const manualRecipeDishIds = new Set();

// =====================================================================
// CLIENT-SIDE AI DRINK EMOJI MATCHER (FOR LIVE TYPING PREVIEW)
// =====================================================================
function selectDrinkEmojiClient(name, notes = "") {
  const text = `${name || ""} ${notes || ""}`.toLowerCase();
  const rules = [
    [["mulled wine", "gluhwein", "glühwein", "red wine", "merlot", "malbec", "cabernet", "pinot noir", "shiraz", "rioja", "claret", "port", "bordeaux"], "🍷"],
    [["prosecco", "champagne", "cava", "buck's fizz", "bucks fizz", "mimosa", "bellini", "sparkling wine", "bubbly", "fizz"], "🥂"],
    [["white wine", "sauvignon", "chardonnay", "pinot grigio", "riesling", "rosé", "rose wine"], "🍾"],
    [["guinness", "stout", "porter", "murphy"], "🍺"],
    [["cider", "cidre", "kopparberg", "strongbow", "thatchers", "bulmers", "rekorderlig", "inch", "scrumpy"], "🍻"],
    [["beer", "lager", "ale", "ipa", "pilsner", "stella", "peroni", "corona", "heineken", "birra", "moretti", "carling", "fosters", "kronenbourg", "madri", "asahi", "craft beer", "pint"], "🍺"],
    [["baileys", "irish cream", "whisky", "whiskey", "scotch", "bourbon", "jack daniel", "jameson", "brandy", "cognac", "hennessy", "amaretto", "disaronno", "kahlua", "tia maria", "southern comfort"], "🥃"],
    [["tequila", "sambuca", "jager", "jäger", "fireball", "shot", "shots", "limoncello", "schnapps", "sourz"], "🥃"],
    [["rum", "captain morgan", "malibu", "kraken", "bacardi", "spiced rum", "dark rum"], "🍹"],
    [["gin", "g&t", "g & t", "martini", "espresso martini", "negroni", "cosmopolitan", "vodka", "smirnoff", "absolut", "grey goose"], "🍸"],
    [["cocktail", "aperol", "spritz", "pimm", "mojito", "margarita", "daiquiri", "pina colada", "piña colada", "sangria", "punch", "sex on the beach", "passionfruit"], "🍹"],
    [["hot chocolate", "cocoa", "coffee", "tea", "latte", "mocha", "chai", "mulled apple", "hot toddy"], "☕"],
    [["eggnog", "milk", "milkshake", "white russian", "horlicks"], "🥛"],
    [["coke", "coca-cola", "coca cola", "diet coke", "pepsi", "lemonade", "sprite", "7up", "fanta", "tango", "irn-bru", "irn bru", "dr pepper", "ginger beer", "ginger ale", "soda", "soft drink", "fizzy"], "🥤"],
    [["juice", "orange juice", "apple juice", "cranberry", "elderflower", "shloer", "appletiser", "j2o", "oasis", "ribena", "vimto", "cordial", "squash", "mocktail", "non-alcoholic", "0%", "alcohol free"], "🧃"],
    [["water", "sparkling water", "san pellegrino", "evian", "tap water"], "💧"],
  ];
  for (const [keywords, emoji] of rules) {
    if (keywords.some((k) => text.includes(k))) return emoji;
  }
  if (text.includes("wine")) return "🍷";
  return "🍹";
}

// =====================================================================
// ANIMATED SNOWY BACKGROUND
// =====================================================================
function initSnowfall() {
  const canvas = document.getElementById("snow-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener("resize", () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const FLAKE_COUNT = 110;
  const flakes = Array.from({ length: FLAKE_COUNT }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() * 3.2 + 1.1,
    speedY: Math.random() * 0.9 + 0.35,
    speedX: (Math.random() - 0.5) * 0.45,
    swayAmp: Math.random() * 0.6 + 0.2,
    swayAngle: Math.random() * Math.PI * 2,
    swaySpeed: Math.random() * 0.02 + 0.008,
    alpha: Math.random() * 0.55 + 0.3,
  }));

  function drawFrame() {
    ctx.clearRect(0, 0, width, height);
    for (const f of flakes) {
      f.swayAngle += f.swaySpeed;
      f.y += f.speedY;
      f.x += f.speedX + Math.sin(f.swayAngle) * f.swayAmp;

      if (f.y > height + 10) {
        f.y = -8;
        f.x = Math.random() * width;
      }
      if (f.x > width + 10) f.x = -8;
      if (f.x < -10) f.x = width + 8;

      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${f.alpha})`;
      ctx.fill();
    }
    requestAnimationFrame(drawFrame);
  }

  requestAnimationFrame(drawFrame);
}

// =====================================================================
// HELPERS & API
// =====================================================================
function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  } catch (_) {
    return "";
  }
}

function setStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch (_) {}
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getInitials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return String(name || "?").slice(0, 2).toUpperCase();
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3400);
}

let mutationEpoch = 0;

async function apiRequest(path, method = "GET", body = null) {
  if (method !== "GET") {
    mutationEpoch += 1;
  }
  const headers = { "Content-Type": "application/json" };
  const token = getStoredToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const opts = { method, headers, credentials: "same-origin" };
  if (body !== null) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (method !== "GET") {
    mutationEpoch += 1;
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.payload = data;
    throw err;
  }
  return data;
}

// =====================================================================
// AUTH VIEW
// =====================================================================
function switchAuthTab(mode) {
  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const authError = document.getElementById("auth-error");
  authError.classList.add("hidden");

  if (mode === "register") {
    tabLogin.classList.remove("active");
    tabRegister.classList.add("active");
    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");
  } else {
    tabRegister.classList.remove("active");
    tabLogin.classList.add("active");
    registerForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
  }
}

function showAuthError(msg) {
  const el = document.getElementById("auth-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function renderAuthView() {
  const authView = document.getElementById("auth-view");
  const dashView = document.getElementById("dashboard-view");
  dashView.classList.add("hidden");
  authView.classList.remove("hidden");

  const firstBanner = document.getElementById("first-admin-banner");
  const houseCodeGroup = document.getElementById("house-code-group");

  if (appState && !appState.has_admin) {
    firstBanner.classList.remove("hidden");
  } else {
    firstBanner.classList.add("hidden");
  }

  if (appState && appState.require_house_code && appState.user_count > 0) {
    houseCodeGroup.classList.remove("hidden");
  } else {
    houseCodeGroup.classList.add("hidden");
  }
}

// =====================================================================
// QUICK PRESETS (FOR ADMIN & DISH EDITORS)
// =====================================================================
function renderQuickPresets() {
  const container = document.getElementById("presets-chips-container");
  if (!container || !appState) return;

  const existingTitles = new Set((appState.dishes || []).map((d) => d.title.toLowerCase()));
  container.innerHTML = QUICK_PRESETS.map((preset, idx) => {
    const alreadyAdded = existingTitles.has(preset.title.toLowerCase());
    const icon = CATEGORY_ICONS[preset.category] || "🍽️";
    return `
      <button
        type="button"
        class="preset-chip"
        data-preset-idx="${idx}"
        ${alreadyAdded ? 'disabled title="Already on the list"' : ""}
      >
        ${alreadyAdded ? "✓" : "+"} ${icon} ${escapeHtml(preset.title)}
      </button>
    `;
  }).join("");

  container.querySelectorAll(".preset-chip").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.getAttribute("data-preset-idx"));
      const preset = QUICK_PRESETS[idx];
      if (!preset) return;
      try {
        btn.disabled = true;
        const newState = await apiRequest("/api/dishes/add", "POST", preset);
        updateState(newState, true);
        showToast(`Added "${preset.title}" to the list!`);
      } catch (err) {
        showToast(err.message);
        btn.disabled = false;
      }
    });
  });
}

// =====================================================================
// MAIN DASHBOARD RENDER
// =====================================================================
function renderDashboard() {
  const authView = document.getElementById("auth-view");
  const dashView = document.getElementById("dashboard-view");
  authView.classList.add("hidden");
  dashView.classList.remove("hidden");

  const user = appState.current_user;
  const isAdmin = user.role === "admin";
  const canEditDishes = isAdmin || Boolean(user.can_edit_dishes);
  const settings = appState.settings || {};
  const dishes = appState.dishes || [];
  const users = appState.users || [];
  const meatVotes = (appState.meat_poll && appState.meat_poll.votes) || [];
  const drinks = appState.drinks || [];

  // Header info
  document.getElementById("header-event-title").textContent =
    (settings.event_title || "82 Harrow Christmas Dinner") + " 🎄";
  const dtParts = [settings.event_date, settings.event_time].filter(Boolean);
  document.getElementById("event-datetime-badge").textContent =
    "📅 " + (dtParts.length ? dtParts.join(" • ") : "December 2026");
  document.getElementById("header-announcement").textContent = settings.announcement || "";

  // Current user badge
  const avatarEl = document.getElementById("current-user-avatar");
  avatarEl.textContent = getInitials(user.display_name);
  avatarEl.style.backgroundColor = user.avatar_color || "#b82927";
  document.getElementById("current-user-name").textContent = user.display_name;
  document.getElementById("current-user-username").textContent = `@${user.username}`;

  const roleBadge = document.getElementById("current-user-role-badge");
  if (isAdmin) {
    roleBadge.textContent = "👑 Administrator";
    roleBadge.className = "role-badge role-admin";
  } else if (canEditDishes) {
    roleBadge.textContent = "🍽️ Dish Editor";
    roleBadge.className = "role-badge role-editor";
  } else {
    roleBadge.textContent = "Housemate";
    roleBadge.className = "role-badge role-housemate";
  }

  // Show/hide Dish Creator panel (for Admin OR Dish Editor)
  const creatorPanel = document.getElementById("admin-add-dish-panel");
  const creatorTag = document.getElementById("creator-privilege-tag");
  if (canEditDishes) {
    creatorPanel.classList.remove("hidden");
    creatorTag.textContent = isAdmin
      ? "👑 ADMINISTRATOR PRIVILEGES"
      : "🍽️ DISH EDITOR PRIVILEGES";
    renderQuickPresets();
  } else {
    creatorPanel.classList.add("hidden");
  }

  // Show/hide Event Settings tab (Admin only)
  const adminTab = document.getElementById("admin-settings-tab");
  if (isAdmin) {
    adminTab.classList.remove("hidden");
  } else {
    adminTab.classList.add("hidden");
    if (activeView === "admin") {
      setActiveView("dishes");
    }
  }

  // Compute Stats & Grouped Recipe Total Cost
  const totalDishes = dishes.length;
  let totalSpots = 0;
  let claimedSpots = 0;
  let myClaimsCount = 0;
  let totalRecipeCostGbp = 0;
  const groupedList = appState.grouped_shopping_list || [];
  const compiledIngredientCount = groupedList.length;

  dishes.forEach((d) => {
    const claimsCount = (d.claims || []).length;
    totalSpots += d.max_claims;
    claimedSpots += Math.min(claimsCount, d.max_claims);
    if ((d.claims || []).some((c) => c.user_id === user.id)) {
      myClaimsCount += 1;
    }
  });

  groupedList.forEach((item) => {
    totalRecipeCostGbp += Number(item.estimated_cost_gbp || 0);
  });

  const costEachGbp = totalRecipeCostGbp / HOUSE_SIZE;
  const pct = totalSpots > 0 ? Math.round((claimedSpots / totalSpots) * 100) : 0;

  document.getElementById("stat-total-dishes").textContent = String(totalDishes);
  document.getElementById("stat-total-spots").textContent = `${totalSpots} total spot${totalSpots === 1 ? "" : "s"}`;
  document.getElementById("stat-claimed-spots").textContent = `${claimedSpots} / ${totalSpots}`;
  document.getElementById("stat-progress-fill").style.width = `${pct}%`;
  document.getElementById("stat-cost-each").textContent = `£${costEachGbp.toFixed(2)}`;
  document.getElementById("stat-total-cost-sub").textContent = `£${totalRecipeCostGbp.toFixed(2)} total recipe cost`;
  document.getElementById("stat-my-claims").textContent = String(myClaimsCount);
  document.getElementById("stat-housemates-count").textContent = `${users.length} ${users.length === 1 ? "person" : "people"} logged in`;

  document.getElementById("tab-count-dishes").textContent = String(totalDishes);
  document.getElementById("tab-count-recipes").textContent = String(compiledIngredientCount);
  document.getElementById("tab-count-meat").textContent = String(meatVotes.length);
  document.getElementById("tab-count-drinks").textContent = String(drinks.length);
  document.getElementById("tab-count-housemates").textContent = String(users.length);

  renderDishesList();
  renderCompiledRecipesList();
  renderMeatPoll();
  renderDrinksBoard();
  renderPeopleAndPrivileges();
  renderHousematesRoster();
  if (isAdmin) {
    renderAdminSettings();
  }
}

// =====================================================================
// VIEW 1: EXPANDABLE DISHES LIST
// =====================================================================
function formatSortedByNames(claims) {
  if (!claims || claims.length === 0) return "";
  const names = claims.map((c) => c.display_name);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

function renderDishesList() {
  const user = appState.current_user;
  const isAdmin = user.role === "admin";
  const canEditDishes = isAdmin || Boolean(user.can_edit_dishes);
  const isLocked = appState.settings && appState.settings.lock_claims;
  const dishes = appState.dishes || [];
  const users = appState.users || [];

  const filtered = dishes.filter((d) => {
    const claims = d.claims || [];
    const isMine = claims.some((c) => c.user_id === user.id);
    const hasOpenSpot = claims.length < d.max_claims;

    if (activeFilter === "UNCLAIMED" && !hasOpenSpot) return false;
    if (activeFilter === "MINE" && !isMine) return false;
    if (
      activeFilter !== "ALL" &&
      activeFilter !== "UNCLAIMED" &&
      activeFilter !== "MINE" &&
      d.category !== activeFilter
    ) {
      return false;
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = d.title.toLowerCase().includes(q);
      const matchNotes = (d.notes || "").toLowerCase().includes(q);
      const matchCat = (d.category || "").toLowerCase().includes(q);
      const matchClaimer = claims.some(
        (c) =>
          (c.display_name || "").toLowerCase().includes(q) ||
          (c.note || "").toLowerCase().includes(q)
      );
      if (!matchTitle && !matchNotes && !matchCat && !matchClaimer) return false;
    }
    return true;
  });

  const emptyEl = document.getElementById("dishes-empty-state");
  const listEl = document.getElementById("dishes-container");

  if (filtered.length === 0) {
    listEl.innerHTML = "";
    emptyEl.classList.remove("hidden");
    const titleEl = document.getElementById("empty-state-title");
    const descEl = document.getElementById("empty-state-desc");
    if (dishes.length === 0) {
      titleEl.textContent = "No dishes added to the Christmas dinner list yet";
      descEl.textContent = canEditDishes
        ? "Use the Dish Creator panel above (or click 'Quick-Add Christmas Ideas') to add the first dishes for 82 Harrow!"
        : "Morgan or a Dish Editor hasn't posted the dishes yet — check back soon!";
    } else {
      titleEl.textContent = "No matching dishes";
      descEl.textContent = "Try switching the category filter above or clearing your search.";
    }
    return;
  }

  emptyEl.classList.add("hidden");

  listEl.innerHTML = filtered
    .map((d) => {
      const claims = d.claims || [];
      const icon = CATEGORY_ICONS[d.category] || "🍽️";
      const myClaim = claims.find((c) => c.user_id === user.id);
      const spotsLeft = Math.max(0, d.max_claims - claims.length);
      const isFull = spotsLeft === 0;
      const isExpanded = expandedDishIds.has(d.id);
      const hasRecipe = Boolean((d.recipe_url || "").trim());
      const showRecipeForm = !hasRecipe || editingRecipeDishIds.has(d.id);
      const showManualForm = manualRecipeDishIds.has(d.id);

      let sortedByHtml = "";
      if (claims.length > 0) {
        const sortedNames = formatSortedByNames(claims);
        const avatarsHtml = claims
          .map(
            (c) => `
              <span class="avatar avatar-sm" style="background-color: ${escapeHtml(c.avatar_color)}" title="${escapeHtml(c.display_name)}">
                ${escapeHtml(getInitials(c.display_name))}
              </span>
            `
          )
          .join("");
        const extraSpotsText =
          !isFull && d.max_claims > 1 ? ` (+${spotsLeft} spot open)` : "";
        sortedByHtml = `
          <div class="sorted-by-badge">
            <span class="sorted-by-avatars">${avatarsHtml}</span>
            <span>✅ Sorted by <strong>${escapeHtml(sortedNames)}</strong>${escapeHtml(extraSpotsText)}</span>
          </div>
        `;
      } else {
        sortedByHtml = `
          <span class="unassigned-badge">
            🔥 Needs sorting (${d.max_claims} ${d.max_claims === 1 ? "person" : "people"})
          </span>
        `;
      }

      let assignButtonHtml = "";
      if (myClaim) {
        assignButtonHtml = `
          <button
            type="button"
            class="btn btn-danger-outline btn-sm btn-unclaim-dish"
            data-dish-id="${d.id}"
            ${isLocked && !isAdmin ? "disabled" : ""}
          >
            Unassign me
          </button>
        `;
      } else if (!isFull) {
        assignButtonHtml = `
          <button
            type="button"
            class="btn btn-green btn-sm btn-claim-dish"
            data-dish-id="${d.id}"
            ${isLocked && !isAdmin ? "disabled" : ""}
          >
            ✋ Assign to me
          </button>
        `;
      }

      const recipeIndicatorHtml = hasRecipe
        ? `<span class="recipe-indicator-pill recipe-indicator-ready">📖 Recipe attached</span>`
        : `<span class="recipe-indicator-pill recipe-indicator-empty">🔗 Expand to add recipe URL</span>`;

      const editorButtonsHtml = canEditDishes
        ? `
          <button type="button" class="icon-btn btn-edit-dish" data-dish-id="${d.id}" title="Edit Dish">✏️</button>
          <button type="button" class="icon-btn btn-delete-dish" data-dish-id="${d.id}" title="Delete Dish">🗑️</button>
        `
        : "";

      const ingredientsList = Array.isArray(d.recipe_ingredients) ? d.recipe_ingredients : [];
      const recipeSectionHtml = showRecipeForm
        ? `
          <div class="recipe-box">
            <div class="recipe-box-header">
              <div>
                <h4>🔗 ${hasRecipe ? "Update Recipe URL" : "Add Recipe URL"}</h4>
                <p style="font-size:0.83rem; color:var(--text-muted);">
                  Paste a recipe link below (e.g. BBC Good Food, Jamie Oliver, Allrecipes, Tesco) to automatically pull its ingredients, prep time, cook time, description, and 7-person UK supermarket cost estimate.
                </p>
              </div>
              ${
                hasRecipe
                  ? `<button type="button" class="btn btn-secondary btn-sm btn-cancel-recipe-edit" data-dish-id="${d.id}">Cancel</button>`
                  : ""
              }
            </div>

            <form class="recipe-url-form" data-dish-id="${d.id}">
              <div class="recipe-url-input-row">
                <input
                  type="url"
                  class="recipe-url-input"
                  data-dish-id="${d.id}"
                  value="${escapeHtml(d.recipe_url || "")}"
                  required
                  placeholder="https://www.bbcgoodfood.com/recipes/..."
                />
                <button type="submit" class="btn btn-primary btn-pull-recipe" data-dish-id="${d.id}">
                  ✨ Add Recipe URL
                </button>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm btn-toggle-manual-recipe"
                  data-dish-id="${d.id}"
                >
                  ✍️ ${showManualForm ? "Hide Manual Recipe Editor" : "Or enter / edit recipe details manually"}
                </button>
                ${
                  hasRecipe
                    ? `<button type="button" class="btn btn-danger-outline btn-sm btn-clear-recipe" data-dish-id="${d.id}">Remove Recipe</button>`
                    : ""
                }
              </div>
            </form>

            <!-- Manual / Fallback Recipe Details Editor -->
            <div class="manual-recipe-editor ${showManualForm ? "" : "hidden"}" data-dish-id="${d.id}">
              <div class="form-row">
                <div class="form-group">
                  <label>Recipe Title</label>
                  <input type="text" class="manual-recipe-title" data-dish-id="${d.id}" value="${escapeHtml(d.recipe_title || d.title)}" />
                </div>
                <div class="form-group">
                  <label>Recipe Serves (Original Yield)</label>
                  <input type="number" min="1" max="30" class="manual-recipe-servings" data-dish-id="${d.id}" value="${escapeHtml(d.recipe_servings || 4)}" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>🔪 Prep Time</label>
                  <input type="text" class="manual-recipe-prep" data-dish-id="${d.id}" value="${escapeHtml(d.recipe_prep_time || "")}" placeholder="e.g. 20 mins" />
                </div>
                <div class="form-group">
                  <label>🔥 Cook Time</label>
                  <input type="text" class="manual-recipe-cook" data-dish-id="${d.id}" value="${escapeHtml(d.recipe_cook_time || "")}" placeholder="e.g. 1 hr 15 mins" />
                </div>
              </div>
              <div class="form-group">
                <label>Short Description</label>
                <textarea rows="2" class="manual-recipe-desc" data-dish-id="${d.id}" placeholder="Short summary of the recipe...">${escapeHtml(d.recipe_description || "")}</textarea>
              </div>
              <div class="form-group">
                <label>🥕 Ingredients (one per line)</label>
                <textarea rows="5" class="manual-recipe-ings" data-dish-id="${d.id}" placeholder="2kg Maris Piper potatoes&#10;100g goose fat&#10;Fresh rosemary sprigs">${escapeHtml(ingredientsList.join("\n"))}</textarea>
              </div>
              <button type="button" class="btn btn-green btn-sm btn-save-manual-recipe" data-dish-id="${d.id}">
                💾 Save Recipe &amp; Recalculate 7-Person Costs
              </button>
            </div>
          </div>
        `
        : `
          <div class="recipe-box">
            <div class="recipe-box-header">
              <div>
                <h4>📖 ${escapeHtml(d.recipe_title || d.title)}</h4>
                <a href="${escapeHtml(d.recipe_url)}" target="_blank" rel="noopener noreferrer" class="recipe-source-link">
                  🔗 Open Original Recipe URL ↗
                </a>
                ${
                  d.recipe_added_by
                    ? `<span style="font-size:0.76rem; color:var(--text-muted); margin-left:0.5rem;">(Added by ${escapeHtml(d.recipe_added_by)})</span>`
                    : ""
                }
              </div>
              <div style="display:flex; gap:0.4rem;">
                <button type="button" class="btn btn-secondary btn-sm btn-edit-recipe-url" data-dish-id="${d.id}">
                  🔄 Change URL / Edit Recipe
                </button>
              </div>
            </div>

            <div class="recipe-meta-strip">
              <div class="recipe-time-pill">
                🔪 <strong>Prep Time:</strong> ${escapeHtml(d.recipe_prep_time || "Not listed")}
              </div>
              <div class="recipe-time-pill">
                🔥 <strong>Cook Time:</strong> ${escapeHtml(d.recipe_cook_time || "Not listed")}
              </div>
              <div class="recipe-time-pill">
                🍽️ <strong>Original Yield:</strong> Serves ${escapeHtml(d.recipe_servings || 4)} (auto-scaled to 7 in Recipe List tab)
              </div>
            </div>

            ${
              d.recipe_description
                ? `<div class="recipe-description-box">${escapeHtml(d.recipe_description)}</div>`
                : ""
            }

            <div>
              <div class="recipe-ingredients-title">🥕 Ingredients (${ingredientsList.length})</div>
              ${
                ingredientsList.length > 0
                  ? `
                    <ul class="recipe-ingredients-list">
                      ${ingredientsList.map((ing) => `<li><span>${escapeHtml(ing)}</span></li>`).join("")}
                    </ul>
                  `
                  : `<p class="no-claims-yet">No structured ingredient list detected on that page — click "Change URL / Edit Recipe" to add ingredients or try another recipe link.</p>`
              }
            </div>
          </div>
        `;

      const claimsDetailHtml =
        claims.length === 0
          ? `<div class="no-claims-yet">Nobody has clicked "Assign to me" on this dish yet.</div>`
          : claims
              .map((c) => {
                const isThisMine = c.user_id === user.id;
                const canEditClaim = isThisMine || isAdmin;
                return `
                  <div class="claim-item ${isThisMine ? "claim-mine" : ""}">
                    <div class="claim-header">
                      <div class="claim-user">
                        <span class="avatar avatar-sm" style="background-color: ${escapeHtml(c.avatar_color)}">
                          ${escapeHtml(getInitials(c.display_name))}
                        </span>
                        <span>Sorted by <strong>${escapeHtml(c.display_name)}</strong>${isThisMine ? " (You)" : ""}</span>
                      </div>
                      <div style="display:flex; align-items:center; gap:0.35rem;">
                        ${
                          canEditClaim
                            ? `
                              <select class="claim-status-select" data-claim-id="${c.id}">
                                <option value="claimed" ${c.status === "claimed" ? "selected" : ""}>📝 Planned</option>
                                <option value="bought" ${c.status === "bought" ? "selected" : ""}>🛒 Bought</option>
                                <option value="ready" ${c.status === "ready" ? "selected" : ""}>✅ Ready</option>
                              </select>
                            `
                            : `<span class="status-pill">${escapeHtml(STATUS_LABELS[c.status] || "📝 Planned")}</span>`
                        }
                        ${
                          isAdmin
                            ? `<button type="button" class="icon-btn btn-admin-unclaim" data-dish-id="${d.id}" data-user-id="${c.user_id}" title="Unassign ${escapeHtml(c.display_name)}">✕</button>`
                            : ""
                        }
                      </div>
                    </div>
                    ${c.note ? `<div class="claim-note-text">“${escapeHtml(c.note)}”</div>` : ""}
                    ${
                      canEditClaim
                        ? `
                          <div class="claim-note-editor">
                            <input
                              type="text"
                              class="claim-note-input"
                              data-claim-id="${c.id}"
                              value="${escapeHtml(c.note || "")}"
                              placeholder="Add a note (e.g. 'Making goose fat roasties')..."
                            />
                            <button type="button" class="btn btn-secondary btn-sm btn-save-claim-note" data-claim-id="${c.id}">
                              Save Note
                            </button>
                          </div>
                        `
                        : ""
                    }
                  </div>
                `;
              })
              .join("");

      let adminAssignHtml = "";
      if (isAdmin && !isFull && users.length > 0) {
        const unclaimedUsers = users.filter((u) => !claims.some((c) => c.user_id === u.id));
        if (unclaimedUsers.length > 0) {
          adminAssignHtml = `
            <div class="admin-assign-row">
              <select class="admin-assign-select" data-dish-id="${d.id}">
                <option value="">👑 Assign someone to this dish...</option>
                ${unclaimedUsers
                  .map((u) => `<option value="${u.id}">${escapeHtml(u.display_name)} (@${escapeHtml(u.username)})</option>`)
                  .join("")}
              </select>
              <button type="button" class="btn btn-secondary btn-sm btn-admin-assign" data-dish-id="${d.id}">
                Assign
              </button>
            </div>
          `;
        }
      }

      return `
        <article class="dish-item ${myClaim ? "dish-mine" : ""} ${isExpanded ? "expanded" : ""}" data-dish-id="${d.id}">
          <div class="dish-row-main" data-toggle-dish="${d.id}">
            <div class="dish-left">
              <span class="expand-chevron" title="Click to expand recipe & details">▾</span>
              <div class="dish-title-stack">
                <div class="dish-title-line">
                  <span class="category-tag">${icon} ${escapeHtml(d.category)}</span>
                  <h3 class="dish-title">${escapeHtml(d.title)}</h3>
                  ${recipeIndicatorHtml}
                </div>
                ${d.notes ? `<p class="dish-notes">${escapeHtml(d.notes)}</p>` : ""}
              </div>
            </div>

            <div class="dish-right" onclick="event.stopPropagation()">
              ${sortedByHtml}
              ${assignButtonHtml}
              <button
                type="button"
                class="btn btn-secondary btn-sm btn-toggle-expand"
                data-dish-id="${d.id}"
              >
                ${isExpanded ? "▴ Hide Recipe" : "▾ Recipe & Details"}
              </button>
              ${editorButtonsHtml}
            </div>
          </div>

          <div class="dish-expanded-panel ${isExpanded ? "" : "hidden"}">
            <div class="expanded-grid">
              ${recipeSectionHtml}

              <div class="assignment-box">
                <div>
                  <h4>🏠 Assignment &amp; Prep Status</h4>
                  <div class="claims-list">
                    ${claimsDetailHtml}
                  </div>
                </div>
                <div>
                  ${adminAssignHtml}
                </div>
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  attachDishListListeners();
}

function toggleDishExpanded(dishId) {
  if (expandedDishIds.has(dishId)) {
    expandedDishIds.delete(dishId);
  } else {
    expandedDishIds.add(dishId);
  }
  renderDishesList();
}

function attachDishListListeners() {
  document.querySelectorAll("[data-toggle-dish]").forEach((row) => {
    row.addEventListener("click", () => {
      const dishId = Number(row.getAttribute("data-toggle-dish"));
      toggleDishExpanded(dishId);
    });
  });

  document.querySelectorAll(".btn-toggle-expand").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dishId = Number(btn.getAttribute("data-dish-id"));
      toggleDishExpanded(dishId);
    });
  });

  document.querySelectorAll(".btn-claim-dish").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const dishId = Number(btn.getAttribute("data-dish-id"));
      try {
        btn.disabled = true;
        const newState = await apiRequest("/api/dishes/claim", "POST", { dish_id: dishId });
        updateState(newState, true);
        showToast(`✅ Sorted by ${appState.current_user.display_name}!`);
      } catch (err) {
        showToast(err.message);
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll(".btn-unclaim-dish").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const dishId = Number(btn.getAttribute("data-dish-id"));
      try {
        btn.disabled = true;
        const newState = await apiRequest("/api/dishes/unclaim", "POST", { dish_id: dishId });
        updateState(newState, true);
        showToast("Unassigned.");
      } catch (err) {
        showToast(err.message);
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll(".btn-admin-unclaim").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const dishId = Number(btn.getAttribute("data-dish-id"));
      const userId = Number(btn.getAttribute("data-user-id"));
      try {
        const newState = await apiRequest("/api/dishes/unclaim", "POST", {
          dish_id: dishId,
          user_id: userId,
        });
        updateState(newState, true);
        showToast("Removed assignment.");
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  document.querySelectorAll(".btn-admin-assign").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const dishId = Number(btn.getAttribute("data-dish-id"));
      const sel = document.querySelector(`.admin-assign-select[data-dish-id="${dishId}"]`);
      if (!sel || !sel.value) return;
      try {
        const newState = await apiRequest("/api/dishes/claim", "POST", {
          dish_id: dishId,
          user_id: Number(sel.value),
        });
        updateState(newState, true);
        showToast("Assigned housemate!");
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  document.querySelectorAll(".claim-status-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const claimId = Number(sel.getAttribute("data-claim-id"));
      try {
        const newState = await apiRequest("/api/claims/update", "POST", {
          claim_id: claimId,
          status: sel.value,
        });
        updateState(newState, true);
        showToast("Updated prep status!");
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  document.querySelectorAll(".btn-save-claim-note").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const claimId = Number(btn.getAttribute("data-claim-id"));
      const input = document.querySelector(`.claim-note-input[data-claim-id="${claimId}"]`);
      if (!input) return;
      try {
        const newState = await apiRequest("/api/claims/update", "POST", {
          claim_id: claimId,
          note: input.value,
        });
        updateState(newState, true);
        showToast("Saved note!");
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  document.querySelectorAll(".recipe-url-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const dishId = Number(form.getAttribute("data-dish-id"));
      const urlInput = form.querySelector(`.recipe-url-input[data-dish-id="${dishId}"]`);
      const submitBtn = form.querySelector(`.btn-pull-recipe[data-dish-id="${dishId}"]`);
      if (!urlInput || !urlInput.value.trim()) return;

      const targetUrl = urlInput.value.trim();
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "⏳ Pulling recipe & 7-person costs...";

      try {
        let newState;
        try {
          newState = await apiRequest("/api/dishes/recipe", "POST", {
            dish_id: dishId,
            recipe_url: targetUrl,
          });
        } catch (backendErr) {
          if (backendErr.payload && backendErr.payload.needs_browser_fetch) {
            let fetchedHtml = "";
            const proxies = [
              `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
              `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
            ];
            for (const proxyUrl of proxies) {
              try {
                const r = await fetch(proxyUrl);
                if (r.ok) {
                  fetchedHtml = await r.text();
                  if (fetchedHtml && fetchedHtml.length > 100) break;
                }
              } catch (_) {}
            }
            if (fetchedHtml && fetchedHtml.length > 100) {
              newState = await apiRequest("/api/dishes/recipe", "POST", {
                dish_id: dishId,
                recipe_url: targetUrl,
                raw_html: fetchedHtml,
              });
            } else {
              throw backendErr;
            }
          } else {
            throw backendErr;
          }
        }

        editingRecipeDishIds.delete(dishId);
        manualRecipeDishIds.delete(dishId);
        expandedDishIds.add(dishId);
        updateState(newState, true);
        showToast("📖 Pulled recipe & added 7-person ingredients to Recipe List!");
      } catch (err) {
        showToast(err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        manualRecipeDishIds.add(dishId);
        renderDishesList();
      }
    });
  });

  document.querySelectorAll(".btn-edit-recipe-url").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dishId = Number(btn.getAttribute("data-dish-id"));
      editingRecipeDishIds.add(dishId);
      manualRecipeDishIds.add(dishId);
      renderDishesList();
    });
  });

  document.querySelectorAll(".btn-cancel-recipe-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dishId = Number(btn.getAttribute("data-dish-id"));
      editingRecipeDishIds.delete(dishId);
      manualRecipeDishIds.delete(dishId);
      renderDishesList();
    });
  });

  document.querySelectorAll(".btn-toggle-manual-recipe").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dishId = Number(btn.getAttribute("data-dish-id"));
      if (manualRecipeDishIds.has(dishId)) {
        manualRecipeDishIds.delete(dishId);
      } else {
        manualRecipeDishIds.add(dishId);
      }
      renderDishesList();
    });
  });

  document.querySelectorAll(".btn-save-manual-recipe").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const dishId = Number(btn.getAttribute("data-dish-id"));
      const urlInput = document.querySelector(`.recipe-url-input[data-dish-id="${dishId}"]`);
      const titleInput = document.querySelector(`.manual-recipe-title[data-dish-id="${dishId}"]`);
      const servingsInput = document.querySelector(`.manual-recipe-servings[data-dish-id="${dishId}"]`);
      const prepInput = document.querySelector(`.manual-recipe-prep[data-dish-id="${dishId}"]`);
      const cookInput = document.querySelector(`.manual-recipe-cook[data-dish-id="${dishId}"]`);
      const descInput = document.querySelector(`.manual-recipe-desc[data-dish-id="${dishId}"]`);
      const ingsInput = document.querySelector(`.manual-recipe-ings[data-dish-id="${dishId}"]`);

      try {
        btn.disabled = true;
        const newState = await apiRequest("/api/dishes/recipe", "POST", {
          dish_id: dishId,
          manual_override: true,
          recipe_url: (urlInput && urlInput.value.trim()) || "https://custom-recipe",
          recipe_title: titleInput ? titleInput.value.trim() : "",
          recipe_servings: servingsInput ? Number(servingsInput.value) || 4 : 4,
          recipe_prep_time: prepInput ? prepInput.value.trim() : "",
          recipe_cook_time: cookInput ? cookInput.value.trim() : "",
          recipe_description: descInput ? descInput.value.trim() : "",
          recipe_ingredients: ingsInput ? ingsInput.value : "",
        });
        editingRecipeDishIds.delete(dishId);
        manualRecipeDishIds.delete(dishId);
        expandedDishIds.add(dishId);
        updateState(newState, true);
        showToast("📖 Saved recipe & updated 7-person cost table!");
      } catch (err) {
        showToast(err.message);
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll(".btn-clear-recipe").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const dishId = Number(btn.getAttribute("data-dish-id"));
      if (!confirm("Remove the recipe from this dish?")) return;
      try {
        const newState = await apiRequest("/api/dishes/recipe", "POST", {
          dish_id: dishId,
          recipe_url: "",
        });
        editingRecipeDishIds.delete(dishId);
        manualRecipeDishIds.delete(dishId);
        updateState(newState, true);
        showToast("Removed recipe.");
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  document.querySelectorAll(".btn-edit-dish").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dishId = Number(btn.getAttribute("data-dish-id"));
      const dish = (appState.dishes || []).find((d) => d.id === dishId);
      if (!dish) return;
      document.getElementById("edit-dish-id").value = String(dish.id);
      document.getElementById("edit-dish-title").value = dish.title;
      document.getElementById("edit-dish-category").value = dish.category;
      document.getElementById("edit-dish-spots").value = String(dish.max_claims);
      document.getElementById("edit-dish-notes").value = dish.notes || "";
      document.getElementById("edit-dish-modal").classList.remove("hidden");
    });
  });

  document.querySelectorAll(".btn-delete-dish").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const dishId = Number(btn.getAttribute("data-dish-id"));
      const dish = (appState.dishes || []).find((d) => d.id === dishId);
      if (!dish) return;
      if (!confirm(`Remove "${dish.title}" from the Christmas dinner list?`)) return;
      try {
        const newState = await apiRequest("/api/dishes/delete", "POST", { dish_id: dishId });
        updateState(newState, true);
        showToast(`Deleted "${dish.title}".`);
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

// =====================================================================
// VIEW 2: GROUPED RECIPE SHOPPING LIST, STORE DROPDOWNS & PDF/CSV EXPORT
// =====================================================================
const STORE_TIER_LABELS = {
  normal: "🛒 Normal (e.g. Sainsbury's)",
  premium: "✨ Premium (e.g. M&S)",
  budget: "💷 Budget (e.g. Aldi/Lidl)",
  butcher: "🔪 Local Butchers (e.g. Rossiter's)",
};

const STORE_TIER_CLEAN_NAMES = {
  normal: "Normal (e.g. Sainsbury's)",
  premium: "Premium (e.g. M&S)",
  budget: "Budget (e.g. Aldi/Lidl)",
  butcher: "Local Butchers (e.g. Rossiter's)",
};

function renderCompiledRecipesList() {
  const user = appState.current_user;
  const isAdmin = user.role === "admin";
  const dishes = appState.dishes || [];
  const groupedList = appState.grouped_shopping_list || [];

  const emptyEl = document.getElementById("recipes-empty-state");
  const wrapperEl = document.getElementById("recipes-compiled-wrapper");
  const tbody = document.getElementById("compiled-ingredients-tbody");
  const adminCol = document.getElementById("compiled-admin-col");
  const subtotalsStrip = document.getElementById("store-subtotals-strip");

  if (isAdmin) {
    adminCol.classList.remove("hidden");
  } else {
    adminCol.classList.add("hidden");
  }

  if (groupedList.length === 0) {
    wrapperEl.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    return;
  }

  emptyEl.classList.add("hidden");
  wrapperEl.classList.remove("hidden");

  let grandTotal = 0;
  const storeSubtotals = {
    budget: { count: 0, total: 0 },
    normal: { count: 0, total: 0 },
    premium: { count: 0, total: 0 },
    butcher: { count: 0, total: 0 },
  };
  const recipeCount = dishes.filter((d) => (d.recipe_ingredients || []).length > 0).length;

  tbody.innerHTML = groupedList
    .map((item) => {
      const cost = Number(item.estimated_cost_gbp || 0);
      grandTotal += cost;
      const tier = item.store_tier || "normal";
      if (storeSubtotals[tier]) {
        storeSubtotals[tier].count += 1;
        storeSubtotals[tier].total += cost;
      }

      const prices = item.prices_by_tier || {
        normal: cost,
        premium: cost,
        budget: cost,
        butcher: cost,
      };

      const groupedBadgeHtml =
        item.recipe_count > 1
          ? `<span class="grouped-count-badge" title="Quantities summed across ${item.recipe_count} recipes">🔗 Combined (${item.recipe_count} recipes)</span>`
          : "";

      const usesHtml = (item.uses || [])
        .map(
          (u) => `
            <div class="recipe-use-chip">
              <strong>${escapeHtml(u.dish_title)}</strong>
              <span>(${escapeHtml(u.scaled_part)})</span>
              <span style="font-size:0.73rem;">• ${escapeHtml(u.sorted_by)}</span>
            </div>
          `
        )
        .join("");

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:0.25rem;">
              <strong style="font-size:0.96rem;">${escapeHtml(item.ingredient_name)}</strong>
              ${groupedBadgeHtml}
            </div>
          </td>
          <td>
            <div class="recipe-uses-list">
              ${usesHtml}
            </div>
          </td>
          <td>
            <span class="amount-7-badge">${escapeHtml(item.total_amount_for_7)}</span>
          </td>
          <td class="cost-gbp-cell">
            £${cost.toFixed(2)}
          </td>
          <td>
            <select
              class="store-tier-select tier-${escapeHtml(tier)}"
              data-canonical-key="${escapeHtml(item.canonical_key)}"
            >
              <option value="normal" ${tier === "normal" ? "selected" : ""}>
                🛒 Normal (e.g. Sainsbury's) — £${Number(prices.normal || 0).toFixed(2)}
              </option>
              <option value="premium" ${tier === "premium" ? "selected" : ""}>
                ✨ Premium (e.g. M&amp;S) — £${Number(prices.premium || 0).toFixed(2)}
              </option>
              <option value="budget" ${tier === "budget" ? "selected" : ""}>
                💷 Budget (e.g. Aldi/Lidl) — £${Number(prices.budget || 0).toFixed(2)}
              </option>
              <option value="butcher" ${tier === "butcher" ? "selected" : ""}>
                🔪 Local Butchers (e.g. Rossiter's) — £${Number(prices.butcher || 0).toFixed(2)}
              </option>
            </select>
          </td>
          ${
            isAdmin
              ? `
                <td>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm btn-admin-edit-grouped"
                    data-canonical-key="${escapeHtml(item.canonical_key)}"
                    data-name="${escapeHtml(item.ingredient_name)}"
                    data-amt="${escapeHtml(item.total_amount_for_7)}"
                    data-base-cost="${Number(prices.normal || cost).toFixed(2)}"
                  >
                    ✏️ Edit
                  </button>
                </td>
              `
              : ""
          }
        </tr>
      `;
    })
    .join("");

  // Render Store Subtotals Breakdown Strip
  if (subtotalsStrip) {
    subtotalsStrip.innerHTML = ["butcher", "budget", "normal", "premium"]
      .map((tKey) => {
        const st = storeSubtotals[tKey];
        return `
          <div class="store-subtotal-card">
            <div>
              <strong>${escapeHtml(STORE_TIER_LABELS[tKey])}</strong>
              <div style="font-size:0.75rem; color:var(--text-muted);">${st.count} item${st.count === 1 ? "" : "s"} assigned</div>
            </div>
            <strong style="font-size:1.02rem; color:var(--green-primary);">£${st.total.toFixed(2)}</strong>
          </div>
        `;
      })
      .join("");
  }

  const perPerson = grandTotal / HOUSE_SIZE;
  document.getElementById("recipe-grand-total").textContent = `£${grandTotal.toFixed(2)}`;
  document.getElementById("recipe-cost-per-person").textContent = `£${perPerson.toFixed(2)}`;
  document.getElementById("recipe-total-items-count").textContent = `${groupedList.length} grouped item${groupedList.length === 1 ? "" : "s"} combined from ${recipeCount} recipe${recipeCount === 1 ? "" : "s"}`;

  // Store tier dropdown change listener
  tbody.querySelectorAll(".store-tier-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const canonicalKey = sel.getAttribute("data-canonical-key");
      const storeTier = sel.value;
      try {
        sel.disabled = true;
        const newState = await apiRequest("/api/shopping/update_store", "POST", {
          canonical_key: canonicalKey,
          store_tier: storeTier,
        });
        updateState(newState, true);
        showToast(`Updated store to ${STORE_TIER_CLEAN_NAMES[storeTier]}!`);
      } catch (err) {
        showToast(err.message);
        sel.disabled = false;
      }
    });
  });

  // Admin Edit grouped row listener
  if (isAdmin) {
    tbody.querySelectorAll(".btn-admin-edit-grouped").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const canonicalKey = btn.getAttribute("data-canonical-key");
        const curName = btn.getAttribute("data-name") || "";
        const curAmt = btn.getAttribute("data-amt") || "";
        const curBase = btn.getAttribute("data-base-cost") || "1.50";

        const newName = prompt("Edit Grouped Ingredient Name:", curName);
        if (newName === null) return;
        const newAmt = prompt("Edit Total Amount Needed for 7 People:", curAmt);
        if (newAmt === null) return;
        const newBaseStr = prompt(
          "Edit Base Normal (Sainsbury's) Price (£) — other store tiers will scale from this:",
          curBase
        );
        if (newBaseStr === null) return;

        try {
          const newState = await apiRequest("/api/shopping/admin_edit", "POST", {
            canonical_key: canonicalKey,
            custom_name: newName.trim(),
            custom_amount: newAmt.trim(),
            custom_base_cost: parseFloat(newBaseStr.replace("£", "")) || 0,
          });
          updateState(newState, true);
          showToast("Updated grouped item & recalculated store prices!");
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  }
}

function exportShoppingListAsPdfTable() {
  if (!appState || !appState.grouped_shopping_list || appState.grouped_shopping_list.length === 0) {
    showToast("No shopping list items to export yet!");
    return;
  }

  const groupedList = appState.grouped_shopping_list;
  const settings = appState.settings || {};
  let grandTotal = 0;
  groupedList.forEach((item) => {
    grandTotal += Number(item.estimated_cost_gbp || 0);
  });
  const perPerson = grandTotal / HOUSE_SIZE;

  // Group items by selected store establishment for quick-look shopping trip sections
  const byStore = {
    butcher: [],
    budget: [],
    normal: [],
    premium: [],
  };
  groupedList.forEach((item) => {
    const t = item.store_tier || "normal";
    if (!byStore[t]) byStore[t] = [];
    byStore[t].push(item);
  });

  const storeSectionsHtml = ["butcher", "budget", "normal", "premium"]
    .filter((tKey) => byStore[tKey] && byStore[tKey].length > 0)
    .map((tKey) => {
      const items = byStore[tKey];
      const storeSub = items.reduce((acc, x) => acc + Number(x.estimated_cost_gbp || 0), 0);
      const rowsHtml = items
        .map((item) => {
          const dishesUsed = (item.uses || [])
            .map((u) => `${u.dish_title} (${u.scaled_part})`)
            .join(", ");
          return `
            <tr>
              <td style="width:34px; text-align:center; font-size:1.15rem;">☐</td>
              <td><strong>${escapeHtml(item.ingredient_name)}</strong></td>
              <td><strong>${escapeHtml(item.total_amount_for_7)}</strong></td>
              <td style="font-size:0.82rem; color:#4b5563;">${escapeHtml(dishesUsed)}</td>
              <td style="font-size:0.84rem;">${escapeHtml(STORE_TIER_CLEAN_NAMES[tKey])}</td>
              <td style="text-align:right; font-weight:700;">£${Number(item.estimated_cost_gbp || 0).toFixed(2)}</td>
            </tr>
          `;
        })
        .join("");

      return `
        <div class="store-section">
          <div class="store-header">
            <h3>${escapeHtml(STORE_TIER_LABELS[tKey])} (${items.length} item${items.length === 1 ? "" : "s"})</h3>
            <strong>Subtotal: £${storeSub.toFixed(2)}</strong>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width:34px; text-align:center;">✓</th>
                <th style="width:24%;">Ingredient</th>
                <th style="width:24%;">Total Needed (7 People)</th>
                <th style="width:28%;">Used In Recipes</th>
                <th style="width:14%;">Where to Buy</th>
                <th style="width:10%; text-align:right;">Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      `;
    })
    .join("");

  const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>82 Harrow Christmas Dinner - Shopping List Table (For 7 People)</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #18271e;
      background: #fff;
      margin: 0;
      padding: 24px 32px;
      line-height: 1.4;
    }
    .no-print-bar {
      background: #133020;
      color: #fff;
      padding: 12px 18px;
      border-radius: 10px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .no-print-bar button {
      background: #f3c65f;
      color: #2b1d00;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 800;
      cursor: pointer;
      font-size: 0.9rem;
    }
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 3px solid #133020;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }
    .doc-header h1 {
      margin: 0 0 4px 0;
      font-size: 1.55rem;
    }
    .doc-header p {
      margin: 0;
      color: #556659;
      font-size: 0.9rem;
    }
    .summary-strip {
      display: flex;
      gap: 16px;
      margin-bottom: 20px;
    }
    .summary-box {
      flex: 1;
      border: 1.5px solid #d5cbb8;
      background: #faf7f0;
      border-radius: 8px;
      padding: 10px 14px;
    }
    .summary-box span {
      display: block;
      font-size: 0.74rem;
      text-transform: uppercase;
      font-weight: 700;
      color: #556659;
    }
    .summary-box strong {
      font-size: 1.35rem;
      color: #133020;
    }
    .store-section {
      margin-bottom: 22px;
      page-break-inside: avoid;
    }
    .store-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #eef5f0;
      border: 1px solid #c6dcd0;
      padding: 8px 12px;
      border-radius: 6px 6px 0 0;
    }
    .store-header h3 {
      margin: 0;
      font-size: 1rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }
    th, td {
      border: 1px solid #d8d0c0;
      padding: 7px 10px;
      text-align: left;
    }
    th {
      background: #f4efe4;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    @media print {
      .no-print-bar { display: none !important; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <span>🎄 <strong>82 Harrow Quick-Look Shopping List Table</strong> — Use "Save as PDF" in the print dialog!</span>
    <button onclick="window.print()">🖨️ Save as PDF / Print</button>
  </div>

  <div class="doc-header">
    <div>
      <h1>🎄 ${escapeHtml(settings.event_title || "82 Harrow Christmas Dinner")} — Shopping List</h1>
      <p>Grouped ingredients &amp; quantities scaled for <strong>7 people</strong> • Grouped by establishment</p>
    </div>
    <div style="text-align:right; font-size:0.84rem; color:#556659;">
      <div>${escapeHtml(settings.event_date || "December 2026")} • ${escapeHtml(settings.event_time || "7:00 PM")}</div>
      <div>${groupedList.length} total shopping items</div>
    </div>
  </div>

  <div class="summary-strip">
    <div class="summary-box">
      <span>Total Grouped Items</span>
      <strong>${groupedList.length} items</strong>
    </div>
    <div class="summary-box">
      <span>Total Estimated Cost</span>
      <strong>£${grandTotal.toFixed(2)}</strong>
    </div>
    <div class="summary-box">
      <span>Total Cost Each (Split 7 Ways)</span>
      <strong>£${perPerson.toFixed(2)} / person</strong>
    </div>
  </div>

  ${storeSectionsHtml}

  <script>
    window.addEventListener("load", () => {
      setTimeout(() => { window.print(); }, 350);
    });
  </script>
</body>
</html>`;

  const printWin = window.open("", "_blank");
  if (printWin) {
    printWin.document.open();
    printWin.document.write(htmlDoc);
    printWin.document.close();
  } else {
    // Fallback download as standalone HTML file if popup blocked
    const blob = new Blob([htmlDoc], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "82-Harrow-Christmas-Shopping-List.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Downloaded shopping list table!");
  }
}

function exportShoppingListAsCsv() {
  if (!appState || !appState.grouped_shopping_list || appState.grouped_shopping_list.length === 0) {
    showToast("No shopping list items to export yet!");
    return;
  }

  const groupedList = appState.grouped_shopping_list;
  let grandTotal = 0;
  const csvRows = [
    ["Ingredient", "Total Amount Needed (For 7 People)", "Where to Buy", "Estimated Cost (GBP)", "Used In Recipes"],
  ];

  groupedList.forEach((item) => {
    const cost = Number(item.estimated_cost_gbp || 0);
    grandTotal += cost;
    const storeName = STORE_TIER_CLEAN_NAMES[item.store_tier || "normal"] || "Normal (Sainsbury's)";
    const dishesUsed = (item.uses || [])
      .map((u) => `${u.dish_title} (${u.scaled_part})`)
      .join(" + ");

    csvRows.push([
      item.ingredient_name,
      item.total_amount_for_7,
      storeName,
      `£${cost.toFixed(2)}`,
      dishesUsed,
    ]);
  });

  const perPerson = grandTotal / HOUSE_SIZE;
  csvRows.push([]);
  csvRows.push(["TOTAL ESTIMATED COST", "", "", `£${grandTotal.toFixed(2)}`, ""]);
  csvRows.push(["TOTAL COST EACH (DIVIDED BY 7)", "", "", `£${perPerson.toFixed(2)}`, ""]);

  const csvString = csvRows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\r\n");

  const blob = new Blob(["\uFEFF" + csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "82-Harrow-Christmas-Shopping-List.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("📊 Downloaded CSV Shopping List Table!");
}

// =====================================================================
// VIEW 3: MEAT POLL (INCLUDING 'TRIO OF MEATS' DUO DROPDOWN) & LIVE PIE CHART
// =====================================================================
let trioDrawerManuallyOpen = false;

function renderMeatPoll() {
  const user = appState.current_user;
  const isAdmin = user.role === "admin";
  const poll = appState.meat_poll || { options: [], votes: [] };
  const options = poll.options || [];
  const votes = poll.votes || [];
  const users = appState.users || [];

  const singleOptions = options.filter((o) => !o.is_trio);
  const trioOptions = options.filter((o) => o.is_trio);

  const myVoteObj = votes.find((v) => v.user_id === user.id);
  const myChoice = myVoteObj ? myVoteObj.choice : null;
  const myVoteIsTrio = Boolean(myChoice && myChoice.startsWith("trio_"));

  const votesByOption = {};
  options.forEach((o) => {
    votesByOption[o.id] = [];
  });
  votes.forEach((v) => {
    if (votesByOption[v.choice]) {
      votesByOption[v.choice].push(v);
    }
  });

  // Total votes across all Trio of Meats duo categories
  const allTrioVotes = votes.filter((v) => (v.choice || "").startsWith("trio_"));
  const totalTrioPct = votes.length > 0 ? Math.round((allTrioVotes.length / votes.length) * 100) : 0;
  const showTrioDrawer = trioDrawerManuallyOpen || myVoteIsTrio;

  const singleHtml = singleOptions
    .map((opt) => {
      const optVotes = votesByOption[opt.id] || [];
      const isMine = myChoice === opt.id;
      const pct = votes.length > 0 ? Math.round((optVotes.length / votes.length) * 100) : 0;

      const votersHtml =
        optVotes.length > 0
          ? `
            <div class="meat-voters-row">
              ${optVotes
                .map(
                  (v) => `
                    <span class="voter-chip">
                      <span class="avatar avatar-sm" style="width:18px;height:18px;font-size:0.62rem;background-color:${escapeHtml(v.avatar_color)}">
                        ${escapeHtml(getInitials(v.display_name))}
                      </span>
                      ${escapeHtml(v.display_name)}${v.user_id === user.id ? " (You)" : ""}
                    </span>
                  `
                )
                .join("")}
            </div>
          `
          : "";

      return `
        <button
          type="button"
          class="meat-option-btn ${isMine ? "my-meat-vote" : ""}"
          data-meat-choice="${opt.id}"
        >
          <div class="meat-option-top">
            <div class="meat-option-title">
              <span class="meat-emoji-big">${opt.emoji}</span>
              <span>${escapeHtml(opt.label)}</span>
              ${isMine ? '<span class="priv-pill priv-pill-editor">✓ Your Vote</span>' : ""}
            </div>
            <span class="meat-vote-count-pill">
              ${optVotes.length} vote${optVotes.length === 1 ? "" : "s"} (${pct}%)
            </span>
          </div>
          ${votersHtml}
        </button>
      `;
    })
    .join("");

  // Active Trio of Meats breakdown by specific duo category
  const activeTrioCategoriesHtml = trioOptions
    .filter((tOpt) => (votesByOption[tOpt.id] || []).length > 0)
    .map((tOpt) => {
      const tVotes = votesByOption[tOpt.id] || [];
      const tPct = votes.length > 0 ? Math.round((tVotes.length / votes.length) * 100) : 0;
      return `
        <div class="trio-breakdown-item">
          <div>
            <strong>${tOpt.emoji} ${escapeHtml(tOpt.label)}</strong>
            <span style="font-size:0.75rem; color:var(--text-muted); margin-left:0.35rem;">(${tVotes.length} vote${tVotes.length === 1 ? "" : "s"}, ${tPct}%)</span>
          </div>
          <div class="meat-voters-row">
            ${tVotes
              .map(
                (v) => `
                  <span class="voter-chip">
                    <span class="avatar avatar-sm" style="width:18px;height:18px;font-size:0.62rem;background-color:${escapeHtml(v.avatar_color)}">
                      ${escapeHtml(getInitials(v.display_name))}
                    </span>
                    ${escapeHtml(v.display_name)}${v.user_id === user.id ? " (You)" : ""}
                  </span>
                `
              )
              .join("")}
          </div>
        </div>
      `;
    })
    .join("");

  const selectedDuoId = myVoteIsTrio
    ? myChoice
    : trioOptions[0]
    ? trioOptions[0].id
    : "trio_gammon_beef";

  const trioCardHtml = `
    <div class="trio-meat-card ${myVoteIsTrio ? "my-meat-vote" : ""}">
      <button type="button" id="btn-toggle-trio-drawer" class="trio-trigger-btn">
        <div class="meat-option-top">
          <div class="meat-option-title">
            <span class="meat-emoji-big">🍗🍖🥩</span>
            <div>
              <span>Trio of Meats (Pick a Secondary Meat Duo!)</span>
              <span style="display:block; font-size:0.76rem; font-weight:500; color:var(--text-muted);">
                Roast Chicken + any 2 Secondary Meats • Click to choose your duo
              </span>
            </div>
            ${myVoteIsTrio ? '<span class="priv-pill priv-pill-admin">✓ Your Trio Vote</span>' : ""}
          </div>
          <span class="meat-vote-count-pill">
            ${allTrioVotes.length} Trio vote${allTrioVotes.length === 1 ? "" : "s"} (${totalTrioPct}%) ▾
          </span>
        </div>
      </button>

      <div id="trio-dropdown-drawer" class="trio-dropdown-drawer ${showTrioDrawer ? "" : "hidden"}">
        <label for="trio-duo-select-input" style="font-size:0.82rem; font-weight:700; color:#5c3f04;">
          Choose your Secondary Meat Duo (alongside Chicken):
        </label>
        <div class="trio-dropdown-row">
          <select id="trio-duo-select-input" class="trio-duo-select">
            ${trioOptions
              .map(
                (tOpt) => `
                  <option value="${tOpt.id}" ${tOpt.id === selectedDuoId ? "selected" : ""}>
                    ${tOpt.emoji} ${escapeHtml(tOpt.duo_label || tOpt.label)} (+ 🍗 Chicken)
                  </option>
                `
              )
              .join("")}
          </select>
          <button type="button" id="btn-confirm-trio-vote" class="btn btn-primary btn-sm">
            🗳️ Select This Trio
          </button>
        </div>
      </div>

      ${
        activeTrioCategoriesHtml
          ? `<div class="trio-breakdown-list">${activeTrioCategoriesHtml}</div>`
          : ""
      }
    </div>
  `;

  const listEl = document.getElementById("meat-options-list");
  listEl.innerHTML = singleHtml + trioCardHtml;

  // Single meat vote click
  listEl.querySelectorAll(".meat-option-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const choice = btn.getAttribute("data-meat-choice");
      try {
        btn.disabled = true;
        trioDrawerManuallyOpen = false;
        const newState = await apiRequest("/api/meat_poll/vote", "POST", { choice });
        updateState(newState, true);
        showToast("🗳️ Secondary meat vote recorded!");
      } catch (err) {
        showToast(err.message);
        btn.disabled = false;
      }
    });
  });

  // Trio drawer toggle
  const toggleTrioBtn = document.getElementById("btn-toggle-trio-drawer");
  if (toggleTrioBtn) {
    toggleTrioBtn.addEventListener("click", () => {
      trioDrawerManuallyOpen = !showTrioDrawer;
      renderMeatPoll();
    });
  }

  // Trio dropdown change or confirm button immediately casts vote for that Trio duo!
  const trioSelect = document.getElementById("trio-duo-select-input");
  const confirmTrioBtn = document.getElementById("btn-confirm-trio-vote");
  const submitTrioChoice = async () => {
    if (!trioSelect || !trioSelect.value) return;
    try {
      if (confirmTrioBtn) confirmTrioBtn.disabled = true;
      const newState = await apiRequest("/api/meat_poll/vote", "POST", {
        choice: trioSelect.value,
      });
      updateState(newState, true);
      const chosenOpt = trioOptions.find((o) => o.id === trioSelect.value);
      showToast(`🍗Voted for ${chosenOpt ? chosenOpt.label : "Trio of Meats"}!`);
    } catch (err) {
      showToast(err.message);
      if (confirmTrioBtn) confirmTrioBtn.disabled = false;
    }
  };
  if (trioSelect) {
    trioSelect.addEventListener("change", submitTrioChoice);
  }
  if (confirmTrioBtn) {
    confirmTrioBtn.addEventListener("click", submitTrioChoice);
  }

  // Admin Override Box for Morgan
  const adminBox = document.getElementById("admin-meat-override");
  if (isAdmin && users.length > 0) {
    adminBox.classList.remove("hidden");
    const userSel = document.getElementById("admin-meat-user-select");
    const prevVal = userSel.value;
    userSel.innerHTML = users
      .map((u) => {
        const uVote = votes.find((v) => v.user_id === u.id);
        const optObj = uVote ? options.find((o) => o.id === uVote.choice) : null;
        const curLabel = optObj ? `${optObj.emoji} ${optObj.label}` : "No vote yet";
        return `<option value="${u.id}">${escapeHtml(u.display_name)} (${escapeHtml(curLabel)})</option>`;
      })
      .join("");
    if (prevVal && Array.from(userSel.options).some((o) => o.value === prevVal)) {
      userSel.value = prevVal;
    }
  } else {
    adminBox.classList.add("hidden");
  }

  document.getElementById("meat-total-votes-label").textContent = `${votes.length} total vote${votes.length === 1 ? "" : "s"} cast`;

  drawMeatPieChart(options, votesByOption, votes.length);
}

function drawMeatPieChart(options, votesByOption, totalVotes) {
  const canvas = document.getElementById("meat-pie-canvas");
  const legendEl = document.getElementById("meat-chart-legend");
  if (!canvas || !legendEl) return;

  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 22;

  ctx.clearRect(0, 0, w, h);

  if (totalVotes === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ece4d3";
    ctx.fill();
    ctx.strokeStyle = "#d5c9b0";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#556659";
    ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No votes yet — vote on the left!", cx, cy);
  } else {
    let startAngle = -Math.PI / 2;
    options.forEach((opt) => {
      const count = (votesByOption[opt.id] || []).length;
      if (count === 0) return;
      const sliceAngle = (count / totalVotes) * Math.PI * 2;
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.closePath();
      // Note: All Trio of Meats categories share the same Royal Gold colour (#d4a017) for easy quick-look,
      // while still being drawn as distinct category slices with white borders!
      ctx.fillStyle = opt.color;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();

      const midAngle = startAngle + sliceAngle / 2;
      const labelR = totalVotes === count ? 0 : radius * 0.62;
      const lx = cx + Math.cos(midAngle) * labelR;
      const ly = cy + Math.sin(midAngle) * labelR;
      const pct = Math.round((count / totalVotes) * 100);

      ctx.fillStyle = opt.is_trio ? "#2b1d00" : "#ffffff";
      ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const sliceLabel = opt.is_trio ? `${opt.emoji} ${pct}%` : `${opt.emoji} ${pct}%`;
      ctx.fillText(sliceLabel, lx, ly);

      startAngle = endAngle;
    });
  }

  // Render Legend: show all 5 single meats + any Trio of Meats duo category that has votes
  // (plus a general Trio of Meats row if 0 Trio votes exist yet)
  const singleOpts = options.filter((o) => !o.is_trio);
  const votedTrioOpts = options.filter((o) => o.is_trio && (votesByOption[o.id] || []).length > 0);

  const legendItems = [...singleOpts, ...votedTrioOpts];
  let legendHtml = legendItems
    .map((opt) => {
      const count = (votesByOption[opt.id] || []).length;
      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      return `
        <div class="legend-row">
          <div class="legend-left">
            <span class="legend-swatch" style="background-color: ${escapeHtml(opt.color)}"></span>
            <span>${opt.emoji} ${escapeHtml(opt.label)}</span>
          </div>
          <strong>${count} vote${count === 1 ? "" : "s"} (${pct}%)</strong>
        </div>
      `;
    })
    .join("");

  if (votedTrioOpts.length === 0) {
    legendHtml += `
      <div class="legend-row">
        <div class="legend-left">
          <span class="legend-swatch" style="background-color: #d4a017"></span>
          <span>🍗🍖🥩 Trio of Meats (Any Secondary Duo)</span>
        </div>
        <strong>0 votes (0%)</strong>
      </div>
    `;
  }

  legendEl.innerHTML = legendHtml;
}

// =====================================================================
// VIEW 4: DRINKS BOARD (EVERYONE UPLOADS + AI EMOJI + 1 DRINK SELECTION)
// =====================================================================
function renderDrinksBoard() {
  const user = appState.current_user;
  const isAdmin = user.role === "admin";
  const drinks = appState.drinks || [];
  const users = appState.users || [];

  const emptyEl = document.getElementById("drinks-empty-state");
  const gridEl = document.getElementById("drinks-grid");

  // Find which drink the current user is currently assigned to
  let myCurrentDrinkId = null;
  drinks.forEach((dr) => {
    if ((dr.drinkers || []).some((d) => d.user_id === user.id)) {
      myCurrentDrinkId = dr.id;
    }
  });

  // Admin Override Box for Morgan
  const adminDrinkBox = document.getElementById("admin-drink-override");
  if (isAdmin && users.length > 0 && drinks.length > 0) {
    adminDrinkBox.classList.remove("hidden");
    const uSel = document.getElementById("admin-drink-user-select");
    const dSel = document.getElementById("admin-drink-choice-select");
    const prevUser = uSel.value;
    const prevDrink = dSel.value;

    uSel.innerHTML = users
      .map((u) => `<option value="${u.id}">${escapeHtml(u.display_name)} (@${escapeHtml(u.username)})</option>`)
      .join("");
    if (prevUser && Array.from(uSel.options).some((o) => o.value === prevUser)) {
      uSel.value = prevUser;
    }

    dSel.innerHTML =
      drinks
        .map((dr) => `<option value="${dr.id}">${dr.emoji} ${escapeHtml(dr.name)}</option>`)
        .join("") + `<option value="clear">✕ No drink selected</option>`;
    if (prevDrink && Array.from(dSel.options).some((o) => o.value === prevDrink)) {
      dSel.value = prevDrink;
    }
  } else {
    adminDrinkBox.classList.add("hidden");
  }

  if (drinks.length === 0) {
    gridEl.innerHTML = "";
    emptyEl.classList.remove("hidden");
    return;
  }

  emptyEl.classList.add("hidden");

  gridEl.innerHTML = drinks
    .map((dr) => {
      const drinkers = dr.drinkers || [];
      const isMine = myCurrentDrinkId === dr.id;
      const canManageThisDrink = isAdmin || dr.created_by === user.id;

      const drinkersHtml =
        drinkers.length === 0
          ? `<span class="no-claims-yet">Nobody assigned to this drink yet</span>`
          : `
            <div class="drinkers-chips">
              ${drinkers
                .map(
                  (p) => `
                    <span class="voter-chip">
                      <span class="avatar avatar-sm" style="width:20px;height:20px;font-size:0.65rem;background-color:${escapeHtml(p.avatar_color)}">
                        ${escapeHtml(getInitials(p.display_name))}
                      </span>
                      <strong>${escapeHtml(p.display_name)}</strong>${p.user_id === user.id ? " (You)" : ""}
                    </span>
                  `
                )
                .join("")}
            </div>
          `;

      let actionButtonHtml = "";
      if (isMine) {
        actionButtonHtml = `
          <button
            type="button"
            class="btn btn-danger-outline btn-sm btn-block btn-select-drink"
            data-drink-id="clear"
          >
            ✓ You're Drinking This (Click to Leave)
          </button>
        `;
      } else if (myCurrentDrinkId !== null) {
        actionButtonHtml = `
          <button
            type="button"
            class="btn btn-gold btn-sm btn-block btn-select-drink"
            data-drink-id="${dr.id}"
          >
            🔄 Switch to Drinking ${dr.emoji} ${escapeHtml(dr.name)}
          </button>
        `;
      } else {
        actionButtonHtml = `
          <button
            type="button"
            class="btn btn-green btn-sm btn-block btn-select-drink"
            data-drink-id="${dr.id}"
          >
            ${dr.emoji} I'm Drinking This
          </button>
        `;
      }

      return `
        <article class="drink-card ${isMine ? "my-drink-choice" : ""}">
          <div>
            <div class="drink-card-top">
              <div class="drink-identity">
                <div class="drink-emoji-avatar" title="AI-selected emoji">${dr.emoji}</div>
                <div>
                  <h3 class="drink-name">${escapeHtml(dr.name)}</h3>
                  ${dr.notes ? `<p class="drink-notes">${escapeHtml(dr.notes)}</p>` : ""}
                  ${
                    dr.created_by_name
                      ? `<span style="font-size:0.74rem; color:var(--text-muted);">Uploaded by ${escapeHtml(dr.created_by_name)}</span>`
                      : ""
                  }
                </div>
              </div>
              ${
                canManageThisDrink
                  ? `
                    <div style="display:flex; gap:0.2rem;">
                      <button type="button" class="icon-btn btn-edit-drink" data-drink-id="${dr.id}" title="Edit Drink">✏️</button>
                      <button type="button" class="icon-btn btn-delete-drink" data-drink-id="${dr.id}" title="Delete Drink">🗑️</button>
                    </div>
                  `
                  : ""
              }
            </div>
          </div>

          <div class="drinkers-box">
            <span class="drinkers-box-label">${dr.emoji} Drinking This (${drinkers.length})</span>
            ${drinkersHtml}
          </div>

          <div>
            ${actionButtonHtml}
          </div>
        </article>
      `;
    })
    .join("");

  // Select / switch drink listeners
  gridEl.querySelectorAll(".btn-select-drink").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const val = btn.getAttribute("data-drink-id");
      const drinkId = val === "clear" ? "clear" : Number(val);
      try {
        btn.disabled = true;
        const newState = await apiRequest("/api/drinks/select", "POST", { drink_id: drinkId });
        updateState(newState, true);
        showToast(drinkId === "clear" ? "Cleared drink choice." : "🥂 Updated your drink choice!");
      } catch (err) {
        showToast(err.message);
        btn.disabled = false;
      }
    });
  });

  // Edit drink
  gridEl.querySelectorAll(".btn-edit-drink").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const drinkId = Number(btn.getAttribute("data-drink-id"));
      const dr = drinks.find((x) => x.id === drinkId);
      if (!dr) return;
      const newName = prompt("Edit Drink Name:", dr.name);
      if (!newName || !newName.trim()) return;
      const newNotes = prompt("Edit Drink Notes (optional):", dr.notes || "");
      if (newNotes === null) return;
      try {
        const newState = await apiRequest("/api/drinks/update", "POST", {
          drink_id: drinkId,
          name: newName.trim(),
          notes: newNotes.trim(),
        });
        updateState(newState, true);
        showToast("Updated drink option!");
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  // Delete drink
  gridEl.querySelectorAll(".btn-delete-drink").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const drinkId = Number(btn.getAttribute("data-drink-id"));
      const dr = drinks.find((x) => x.id === drinkId);
      if (!dr) return;
      if (!confirm(`Delete "${dr.name}" from the drinks board?`)) return;
      try {
        const newState = await apiRequest("/api/drinks/delete", "POST", { drink_id: drinkId });
        updateState(newState, true);
        showToast(`Deleted "${dr.name}".`);
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

// =====================================================================
// VIEW 5: PEOPLE & PRIVILEGES (EDIT NAMES, DISH EDITORS & ADMINS)
// =====================================================================
function renderPeopleAndPrivileges() {
  const listEl = document.getElementById("privileges-people-list");
  if (!listEl || !appState) return;

  const currentUser = appState.current_user;
  const isAdmin = currentUser.role === "admin";
  const users = appState.users || [];

  const subtitle = document.getElementById("privileges-subtitle");
  if (isAdmin) {
    subtitle.innerHTML =
      "Everyone who has logged into the 82 Harrow dashboard appears below. As Administrator, you can <strong>Edit Anyone's Name</strong>, grant <strong>Dish Editor Privileges</strong>, or grant <strong>Administrator Privileges</strong>.";
  } else {
    subtitle.innerHTML =
      "Everyone who has logged into the 82 Harrow dashboard and their current privileges.";
  }

  listEl.innerHTML = users
    .map((u) => {
      const uIsAdmin = u.role === "admin";
      const uIsEditor = uIsAdmin || Boolean(u.can_edit_dishes);
      const isMe = u.id === currentUser.id;
      const isMorgan =
        u.username.toLowerCase() === "morgan" ||
        u.display_name.toLowerCase() === "morgan";

      const badges = [];
      if (uIsAdmin) {
        badges.push(`<span class="priv-pill priv-pill-admin">👑 Administrator</span>`);
      }
      if (uIsEditor) {
        badges.push(`<span class="priv-pill priv-pill-editor">🍽️ Dish Editor</span>`);
      }
      if (!uIsAdmin && !uIsEditor) {
        badges.push(`<span class="priv-pill priv-pill-housemate">🏠 Housemate</span>`);
      }

      const controlsHtml = isAdmin
        ? `
          <div class="privilege-controls">
            <button
              type="button"
              class="btn btn-secondary btn-sm btn-rename-user"
              data-user-id="${u.id}"
              data-user-name="${escapeHtml(u.display_name)}"
            >
              ✏️ Edit Name
            </button>

            <button
              type="button"
              class="priv-toggle-btn ${uIsEditor ? "active-editor" : ""} btn-toggle-editor"
              data-user-id="${u.id}"
              ${uIsAdmin ? 'disabled title="Administrators automatically have Dish Editor privileges"' : ""}
            >
              ${uIsEditor ? "✓ 🍽️ Dish Editor Privileges" : "+ 🍽️ Give Dish Editor Privileges"}
            </button>

            <button
              type="button"
              class="priv-toggle-btn ${uIsAdmin ? "active-admin" : ""} btn-toggle-admin"
              data-user-id="${u.id}"
              ${isMe || isMorgan ? 'disabled title="Morgan Always Has Administrator Privileges"' : ""}
            >
              ${uIsAdmin ? "✓ 👑 Administrator Privileges" : "+ 👑 Give Administrator Privileges"}
            </button>

            <button
              type="button"
              class="btn btn-secondary btn-sm btn-reset-pwd"
              data-user-id="${u.id}"
              data-user-name="${escapeHtml(u.display_name)}"
            >
              🔑 Reset Password
            </button>

            ${
              !isMe && !isMorgan
                ? `
                  <button
                    type="button"
                    class="btn btn-danger-outline btn-sm btn-remove-user"
                    data-user-id="${u.id}"
                    data-user-name="${escapeHtml(u.display_name)}"
                  >
                    Remove
                  </button>
                `
                : ""
            }
          </div>
        `
        : "";

      return `
        <div class="privilege-person-card">
          <div class="privilege-person-info">
            <div class="avatar" style="background-color: ${escapeHtml(u.avatar_color)}">
              ${escapeHtml(getInitials(u.display_name))}
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:0.45rem;">
                <strong style="font-size:1.05rem;">${escapeHtml(u.display_name)}${isMe ? " (You)" : ""}</strong>
                <span style="font-size:0.82rem; color:var(--text-muted);">@${escapeHtml(u.username)}</span>
              </div>
              <div class="privilege-badges-row">
                ${badges.join("")}
              </div>
            </div>
          </div>
          ${controlsHtml}
        </div>
      `;
    })
    .join("");

  if (isAdmin) {
    listEl.querySelectorAll(".btn-rename-user").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uid = Number(btn.getAttribute("data-user-id"));
        const curName = btn.getAttribute("data-user-name") || "";
        const newName = prompt(`Edit display name for ${curName}:`, curName);
        if (!newName || !newName.trim() || newName.trim() === curName) return;
        try {
          const newState = await apiRequest("/api/users/manage", "POST", {
            action: "rename_user",
            user_id: uid,
            display_name: newName.trim(),
          });
          updateState(newState, true);
          showToast(`Renamed to ${newName.trim()}!`);
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    listEl.querySelectorAll(".btn-toggle-editor").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uid = Number(btn.getAttribute("data-user-id"));
        try {
          btn.disabled = true;
          const newState = await apiRequest("/api/users/manage", "POST", {
            action: "toggle_dish_editor",
            user_id: uid,
          });
          updateState(newState, true);
          showToast("Updated Dish Editor privileges!");
        } catch (err) {
          showToast(err.message);
          btn.disabled = false;
        }
      });
    });

    listEl.querySelectorAll(".btn-toggle-admin").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uid = Number(btn.getAttribute("data-user-id"));
        try {
          btn.disabled = true;
          const newState = await apiRequest("/api/users/manage", "POST", {
            action: "toggle_admin",
            user_id: uid,
          });
          updateState(newState, true);
          showToast("Updated Administrator privileges!");
        } catch (err) {
          showToast(err.message);
          btn.disabled = false;
        }
      });
    });

    listEl.querySelectorAll(".btn-reset-pwd").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uid = Number(btn.getAttribute("data-user-id"));
        const uname = btn.getAttribute("data-user-name");
        const newPassword = prompt(`Enter a new password for ${uname} (at least 4 characters):`);
        if (!newPassword) return;
        try {
          const newState = await apiRequest("/api/users/manage", "POST", {
            action: "reset_password",
            user_id: uid,
            new_password: newPassword,
          });
          updateState(newState, true);
          showToast(`Password updated for ${uname}!`);
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    listEl.querySelectorAll(".btn-remove-user").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uid = Number(btn.getAttribute("data-user-id"));
        const uname = btn.getAttribute("data-user-name");
        if (!confirm(`Remove ${uname}'s account and their assignments?`)) return;
        try {
          const newState = await apiRequest("/api/users/manage", "POST", {
            action: "delete_user",
            user_id: uid,
          });
          updateState(newState, true);
          showToast(`Removed ${uname}.`);
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  }
}

function renderHousematesRoster() {
  const container = document.getElementById("housemates-grid");
  const users = appState.users || [];
  const dishes = appState.dishes || [];
  const meatPoll = appState.meat_poll || { options: [], votes: [] };
  const drinks = appState.drinks || [];

  const claimsByUser = {};
  dishes.forEach((d) => {
    (d.claims || []).forEach((c) => {
      if (!claimsByUser[c.user_id]) claimsByUser[c.user_id] = [];
      claimsByUser[c.user_id].push({
        dishTitle: d.title,
        category: d.category,
        status: c.status,
      });
    });
  });

  const meatVoteByUser = {};
  (meatPoll.votes || []).forEach((v) => {
    const opt = (meatPoll.options || []).find((o) => o.id === v.choice);
    if (opt) meatVoteByUser[v.user_id] = `${opt.emoji} ${opt.label}`;
  });

  const drinkByUser = {};
  drinks.forEach((dr) => {
    (dr.drinkers || []).forEach((p) => {
      drinkByUser[p.user_id] = `${dr.emoji} ${dr.name}`;
    });
  });

  container.innerHTML = users
    .map((u) => {
      const userClaims = claimsByUser[u.id] || [];
      const userMeat = meatVoteByUser[u.id] || "No vote yet";
      const userDrink = drinkByUser[u.id] || "No drink selected";

      return `
        <div class="housemate-card">
          <div class="housemate-header">
            <div class="avatar" style="background-color: ${escapeHtml(u.avatar_color)}">
              ${escapeHtml(getInitials(u.display_name))}
            </div>
            <div style="flex:1">
              <div style="display:flex; align-items:center; gap:0.45rem; flex-wrap:wrap;">
                <span class="housemate-name">${escapeHtml(u.display_name)}</span>
                ${
                  u.role === "admin"
                    ? '<span class="priv-pill priv-pill-admin">👑 Admin</span>'
                    : u.can_edit_dishes
                    ? '<span class="priv-pill priv-pill-editor">🍽️ Dish Editor</span>'
                    : ""
                }
              </div>
              <span class="housemate-handle">@${escapeHtml(u.username)} • Sorting ${userClaims.length} ${userClaims.length === 1 ? "dish" : "dishes"}</span>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:0.4rem; margin-bottom:0.75rem; font-size:0.84rem;">
            <div><strong>🥩 Meat Vote:</strong> ${escapeHtml(userMeat)}</div>
            <div><strong>🍷 Drink Choice:</strong> ${escapeHtml(userDrink)}</div>
          </div>

          <div class="housemate-claims-list">
            ${
              userClaims.length === 0
                ? `<div class="no-claims-yet">Hasn't clicked "Assign to me" on any dishes yet!</div>`
                : userClaims
                    .map((item) => {
                      const icon = CATEGORY_ICONS[item.category] || "🍽️";
                      return `
                        <div class="housemate-claim-chip">
                          <span>${icon} ${escapeHtml(item.dishTitle)}</span>
                          <span class="status-pill">${escapeHtml(STATUS_LABELS[item.status] || "📝 Planned")}</span>
                        </div>
                      `;
                    })
                    .join("")
            }
          </div>
        </div>
      `;
    })
    .join("");
}

function renderAdminSettings() {
  const settings = appState.settings || {};
  const activeEl = document.activeElement;
  const isEditingSettings =
    activeEl && document.getElementById("settings-form").contains(activeEl);

  if (!isEditingSettings) {
    document.getElementById("set-event-title").value = settings.event_title || "";
    document.getElementById("set-event-date").value = settings.event_date || "";
    document.getElementById("set-event-time").value = settings.event_time || "";
    document.getElementById("set-announcement").value = settings.announcement || "";
    document.getElementById("set-house-code").value = settings.house_code || "";
    document.getElementById("set-lock-claims").checked = Boolean(settings.lock_claims);
  }
}

// =====================================================================
// VIEW & SUBTAB NAVIGATION
// =====================================================================
function setActiveView(viewName) {
  activeView = viewName;
  document.querySelectorAll(".main-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.getAttribute("data-view") === viewName);
  });
  document.getElementById("view-dishes").classList.toggle("hidden", viewName !== "dishes");
  document.getElementById("view-recipes").classList.toggle("hidden", viewName !== "recipes");
  document.getElementById("view-meat").classList.toggle("hidden", viewName !== "meat");
  document.getElementById("view-drinks").classList.toggle("hidden", viewName !== "drinks");
  document.getElementById("view-housemates").classList.toggle("hidden", viewName !== "housemates");
  document.getElementById("view-admin").classList.toggle("hidden", viewName !== "admin");
}

function setActivePeopleSubtab(subtabName) {
  activePeopleSubtab = subtabName;
  document.querySelectorAll(".subtab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-subtab") === subtabName);
  });
  document.getElementById("subtab-privileges").classList.toggle("hidden", subtabName !== "privileges");
  document.getElementById("subtab-roster").classList.toggle("hidden", subtabName !== "roster");
}

function updateState(newState, forceRender = false) {
  if (newState.token) {
    setStoredToken(newState.token);
  }
  appState = newState;

  const activeEl = document.activeElement;
  if (
    !forceRender &&
    activeEl &&
    (activeEl.classList.contains("claim-note-input") ||
      activeEl.classList.contains("recipe-url-input") ||
      activeEl.classList.contains("manual-recipe-title") ||
      activeEl.classList.contains("manual-recipe-servings") ||
      activeEl.classList.contains("manual-recipe-prep") ||
      activeEl.classList.contains("manual-recipe-cook") ||
      activeEl.classList.contains("manual-recipe-desc") ||
      activeEl.classList.contains("manual-recipe-ings") ||
      activeEl.id === "new-drink-name" ||
      activeEl.id === "new-drink-notes" ||
      activeEl.tagName === "SELECT")
  ) {
    return;
  }

  if (!appState.current_user) {
    renderAuthView();
  } else {
    renderDashboard();
  }
}

async function fetchState(forceRender = false) {
  const epochBefore = mutationEpoch;
  try {
    const state = await apiRequest("/api/state");
    if (!forceRender && mutationEpoch !== epochBefore) {
      // A user action occurred while this background poll was in flight; ignore stale response
      return;
    }
    updateState(state, forceRender);
  } catch (err) {
    console.error("Failed to fetch state:", err);
  }
}

function initEventListeners() {
  document.getElementById("tab-login").addEventListener("click", () => switchAuthTab("login"));
  document.getElementById("tab-register").addEventListener("click", () => switchAuthTab("register"));

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    try {
      const state = await apiRequest("/api/login", "POST", { username, password });
      updateState(state, true);
      showToast(`Welcome, ${state.current_user.display_name}! 🎄`);
    } catch (err) {
      showAuthError(err.message);
    }
  });

  document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const display_name = document.getElementById("reg-display-name").value.trim();
    const username = document.getElementById("reg-username").value.trim();
    const password = document.getElementById("reg-password").value;
    const house_code = document.getElementById("reg-house-code").value.trim();
    try {
      const state = await apiRequest("/api/register", "POST", {
        display_name,
        username,
        password,
        house_code,
      });
      updateState(state, true);
      const roleMsg =
        state.current_user.role === "admin"
          ? `👑 Welcome ${state.current_user.display_name}! You have full Administrator privileges.`
          : `Welcome to 82 Harrow Christmas Dinner, ${state.current_user.display_name}!`;
      showToast(roleMsg);
    } catch (err) {
      showAuthError(err.message);
    }
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
      const state = await apiRequest("/api/logout", "POST");
      setStoredToken("");
      updateState(state, true);
      showToast("Logged out.");
    } catch (err) {
      showToast(err.message);
    }
  });

  document.querySelectorAll(".main-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      setActiveView(tab.getAttribute("data-view"));
    });
  });

  document.querySelectorAll(".subtab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActivePeopleSubtab(btn.getAttribute("data-subtab"));
    });
  });

  document.getElementById("toggle-presets-btn").addEventListener("click", () => {
    const drawer = document.getElementById("quick-presets-drawer");
    drawer.classList.toggle("hidden");
  });

  document.getElementById("add-dish-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const titleInput = document.getElementById("new-dish-title");
    const catSelect = document.getElementById("new-dish-category");
    const spotsInput = document.getElementById("new-dish-spots");
    const notesInput = document.getElementById("new-dish-notes");

    try {
      const newState = await apiRequest("/api/dishes/add", "POST", {
        title: titleInput.value.trim(),
        category: catSelect.value,
        max_claims: Number(spotsInput.value) || 1,
        notes: notesInput.value.trim(),
      });
      titleInput.value = "";
      notesInput.value = "";
      spotsInput.value = "1";
      updateState(newState, true);
      showToast("Added dish to the 82 Harrow Christmas Dinner list!");
    } catch (err) {
      showToast(err.message);
    }
  });

  // Live AI Emoji preview when typing a drink option
  const drinkNameInput = document.getElementById("new-drink-name");
  const drinkNotesInput = document.getElementById("new-drink-notes");
  const updateLiveDrinkEmoji = () => {
    const emoji = selectDrinkEmojiClient(drinkNameInput.value, drinkNotesInput.value);
    document.getElementById("drink-live-emoji").textContent = emoji;
  };
  drinkNameInput.addEventListener("input", updateLiveDrinkEmoji);
  drinkNotesInput.addEventListener("input", updateLiveDrinkEmoji);

  // Add Drink Option form (Everyone)
  document.getElementById("add-drink-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = drinkNameInput.value.trim();
    const notes = drinkNotesInput.value.trim();
    if (!name) return;
    try {
      const newState = await apiRequest("/api/drinks/add", "POST", { name, notes });
      drinkNameInput.value = "";
      drinkNotesInput.value = "";
      updateLiveDrinkEmoji();
      updateState(newState, true);
      showToast("🥂 Uploaded drink option!");
    } catch (err) {
      showToast(err.message);
    }
  });

  // Admin Override for Meat Poll
  document.getElementById("btn-admin-set-meat-vote").addEventListener("click", async () => {
    const uid = Number(document.getElementById("admin-meat-user-select").value);
    const choice = document.getElementById("admin-meat-choice-select").value;
    if (!uid) return;
    try {
      const newState = await apiRequest("/api/meat_poll/vote", "POST", {
        user_id: uid,
        choice,
      });
      updateState(newState, true);
      showToast("Updated housemate's meat vote!");
    } catch (err) {
      showToast(err.message);
    }
  });

  // Admin Override for Drink Selection
  document.getElementById("btn-admin-set-drink").addEventListener("click", async () => {
    const uid = Number(document.getElementById("admin-drink-user-select").value);
    const dval = document.getElementById("admin-drink-choice-select").value;
    if (!uid) return;
    try {
      const newState = await apiRequest("/api/drinks/select", "POST", {
        user_id: uid,
        drink_id: dval === "clear" ? "clear" : Number(dval),
      });
      updateState(newState, true);
      showToast("Updated housemate's drink selection!");
    } catch (err) {
      showToast(err.message);
    }
  });

  // Edit dish modal
  const closeEditModal = () => {
    document.getElementById("edit-dish-modal").classList.add("hidden");
  };
  document.getElementById("close-edit-modal").addEventListener("click", closeEditModal);
  document.getElementById("cancel-edit-dish").addEventListener("click", closeEditModal);

  document.getElementById("edit-dish-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const dish_id = Number(document.getElementById("edit-dish-id").value);
    const title = document.getElementById("edit-dish-title").value.trim();
    const category = document.getElementById("edit-dish-category").value;
    const max_claims = Number(document.getElementById("edit-dish-spots").value) || 1;
    const notes = document.getElementById("edit-dish-notes").value.trim();

    try {
      const newState = await apiRequest("/api/dishes/update", "POST", {
        dish_id,
        title,
        category,
        max_claims,
        notes,
      });
      closeEditModal();
      updateState(newState, true);
      showToast("Saved changes!");
    } catch (err) {
      showToast(err.message);
    }
  });

  document.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      activeFilter = pill.getAttribute("data-filter");
      document.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      renderDishesList();
    });
  });

  document.getElementById("dish-search-input").addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    renderDishesList();
  });

  // Bulk store quick-select buttons
  document.querySelectorAll(".btn-bulk-store").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const storeTier = btn.getAttribute("data-store");
      try {
        btn.disabled = true;
        const newState = await apiRequest("/api/shopping/update_store", "POST", {
          canonical_key: "ALL",
          store_tier: storeTier,
        });
        updateState(newState, true);
        showToast(`Set all items to ${STORE_TIER_CLEAN_NAMES[storeTier]}!`);
      } catch (err) {
        showToast(err.message);
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Export Shopping List as PDF Table & CSV buttons
  const pdfBtn = document.getElementById("btn-export-pdf-table");
  if (pdfBtn) {
    pdfBtn.addEventListener("click", exportShoppingListAsPdfTable);
  }
  const csvBtn = document.getElementById("btn-export-csv-table");
  if (csvBtn) {
    csvBtn.addEventListener("click", exportShoppingListAsCsv);
  }

  document.getElementById("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const ghTokEl = document.getElementById("set-github-token");
      const newState = await apiRequest("/api/settings/update", "POST", {
        event_title: document.getElementById("set-event-title").value.trim(),
        event_date: document.getElementById("set-event-date").value.trim(),
        event_time: document.getElementById("set-event-time").value.trim(),
        announcement: document.getElementById("set-announcement").value.trim(),
        house_code: document.getElementById("set-house-code").value.trim(),
        github_token: ghTokEl ? ghTokEl.value.trim() : "",
        lock_claims: document.getElementById("set-lock-claims").checked,
      });
      if (ghTokEl) ghTokEl.value = "";
      updateState(newState, true);
      showToast("Saved event settings & backed up to cloud!");
    } catch (err) {
      showToast(err.message);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initSnowfall();
  initEventListeners();
  fetchState(true);
  pollTimer = setInterval(() => fetchState(false), 4000);
});
