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

async function apiRequest(path, method = "GET", body = null) {
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

  // Compute Stats & Recipe Total Cost
  const totalDishes = dishes.length;
  let totalSpots = 0;
  let claimedSpots = 0;
  let myClaimsCount = 0;
  let totalRecipeCostGbp = 0;
  let compiledIngredientCount = 0;

  dishes.forEach((d) => {
    const claimsCount = (d.claims || []).length;
    totalSpots += d.max_claims;
    claimedSpots += Math.min(claimsCount, d.max_claims);
    if ((d.claims || []).some((c) => c.user_id === user.id)) {
      myClaimsCount += 1;
    }
    (d.compiled_ingredients || []).forEach((item) => {
      compiledIngredientCount += 1;
      totalRecipeCostGbp += Number(item.estimated_cost_gbp || 0);
    });
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
// VIEW 2: COMPILED RECIPE LIST & 7-PERSON UK SUPERMARKET COSTS
// =====================================================================
function renderCompiledRecipesList() {
  const user = appState.current_user;
  const isAdmin = user.role === "admin";
  const dishes = appState.dishes || [];

  const emptyEl = document.getElementById("recipes-empty-state");
  const wrapperEl = document.getElementById("recipes-compiled-wrapper");
  const tbody = document.getElementById("compiled-ingredients-tbody");
  const adminCol = document.getElementById("compiled-admin-col");

  if (isAdmin) {
    adminCol.classList.remove("hidden");
  } else {
    adminCol.classList.add("hidden");
  }

  const rows = [];
  let grandTotal = 0;
  let recipeCount = 0;

  dishes.forEach((d) => {
    const compiled = d.compiled_ingredients || [];
    if (compiled.length > 0) {
      recipeCount += 1;
      const sortedNames = formatSortedByNames(d.claims || []) || "Unassigned";
      compiled.forEach((item, idx) => {
        const cost = Number(item.estimated_cost_gbp || 0);
        grandTotal += cost;
        rows.push({
          dishId: d.id,
          dishTitle: d.title,
          recipeTitle: d.recipe_title || d.title,
          recipeUrl: d.recipe_url,
          recipeServings: d.recipe_servings || 4,
          sortedNames,
          itemIndex: idx,
          ingredient: item.ingredient || item.original_text,
          originalText: item.original_text || "",
          amountFor7: item.amount_for_7 || "Scaled for 7",
          cost,
        });
      });
    }
  });

  if (rows.length === 0) {
    wrapperEl.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    return;
  }

  emptyEl.classList.add("hidden");
  wrapperEl.classList.remove("hidden");

  tbody.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td>
          <strong>${escapeHtml(r.dishTitle)}</strong>
          <div style="font-size:0.76rem; color:var(--text-muted);">
            ${
              r.recipeUrl
                ? `<a href="${escapeHtml(r.recipeUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--green-primary); text-decoration:none;">🔗 Recipe (Serves ${r.recipeServings} → 7) ↗</a>`
                : `Serves ${r.recipeServings} → 7`
            }
          </div>
        </td>
        <td>
          <span style="font-size:0.83rem; font-weight:600;">${escapeHtml(r.sortedNames)}</span>
        </td>
        <td>
          <strong>${escapeHtml(r.ingredient)}</strong>
          ${
            r.originalText && r.originalText !== r.ingredient
              ? `<div style="font-size:0.75rem; color:var(--text-muted);">From recipe: “${escapeHtml(r.originalText)}”</div>`
              : ""
          }
        </td>
        <td>
          <span class="amount-7-badge">${escapeHtml(r.amountFor7)}</span>
        </td>
        <td class="cost-gbp-cell">
          £${r.cost.toFixed(2)}
        </td>
        ${
          isAdmin
            ? `
              <td>
                <div style="display:flex; gap:0.35rem;">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm btn-edit-compiled-item"
                    data-dish-id="${r.dishId}"
                    data-item-idx="${r.itemIndex}"
                    data-ing="${escapeHtml(r.ingredient)}"
                    data-amt="${escapeHtml(r.amountFor7)}"
                    data-cost="${r.cost.toFixed(2)}"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm btn-jump-edit-recipe"
                    data-dish-id="${r.dishId}"
                    title="Edit full recipe on Dishes tab"
                  >
                    📖 Recipe
                  </button>
                </div>
              </td>
            `
            : ""
        }
      </tr>
    `
    )
    .join("");

  const perPerson = grandTotal / HOUSE_SIZE;
  document.getElementById("recipe-grand-total").textContent = `£${grandTotal.toFixed(2)}`;
  document.getElementById("recipe-cost-per-person").textContent = `£${perPerson.toFixed(2)}`;
  document.getElementById("recipe-total-items-count").textContent = `${rows.length} ingredient${rows.length === 1 ? "" : "s"} across ${recipeCount} recipe${recipeCount === 1 ? "" : "s"}`;

  if (isAdmin) {
    tbody.querySelectorAll(".btn-edit-compiled-item").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const dishId = Number(btn.getAttribute("data-dish-id"));
        const itemIdx = Number(btn.getAttribute("data-item-idx"));
        const curIng = btn.getAttribute("data-ing") || "";
        const curAmt = btn.getAttribute("data-amt") || "";
        const curCost = btn.getAttribute("data-cost") || "1.50";

        const newIng = prompt("Edit Ingredient Name:", curIng);
        if (newIng === null) return;
        const newAmt = prompt("Edit Amount Needed for 7 People:", curAmt);
        if (newAmt === null) return;
        const newCostStr = prompt("Edit Estimated UK Supermarket Cost (£):", curCost);
        if (newCostStr === null) return;

        try {
          const newState = await apiRequest("/api/recipes/update_item", "POST", {
            dish_id: dishId,
            item_index: itemIdx,
            ingredient: newIng.trim(),
            amount_for_7: newAmt.trim(),
            estimated_cost_gbp: parseFloat(newCostStr.replace("£", "")) || 0,
          });
          updateState(newState, true);
          showToast("Updated 7-person ingredient & cost!");
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    tbody.querySelectorAll(".btn-jump-edit-recipe").forEach((btn) => {
      btn.addEventListener("click", () => {
        const dishId = Number(btn.getAttribute("data-dish-id"));
        expandedDishIds.add(dishId);
        editingRecipeDishIds.add(dishId);
        manualRecipeDishIds.add(dishId);
        setActiveView("dishes");
        renderDishesList();
      });
    });
  }
}

// =====================================================================
// VIEW 3: MEAT POLL & LIVE PIE CHART
// =====================================================================
function renderMeatPoll() {
  const user = appState.current_user;
  const isAdmin = user.role === "admin";
  const poll = appState.meat_poll || { options: [], votes: [] };
  const options = poll.options || [];
  const votes = poll.votes || [];
  const users = appState.users || [];

  const myVoteObj = votes.find((v) => v.user_id === user.id);
  const myChoice = myVoteObj ? myVoteObj.choice : null;

  const votesByOption = {};
  options.forEach((o) => {
    votesByOption[o.id] = [];
  });
  votes.forEach((v) => {
    if (votesByOption[v.choice]) {
      votesByOption[v.choice].push(v);
    }
  });

  const listEl = document.getElementById("meat-options-list");
  listEl.innerHTML = options
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

  listEl.querySelectorAll(".meat-option-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const choice = btn.getAttribute("data-meat-choice");
      try {
        btn.disabled = true;
        const newState = await apiRequest("/api/meat_poll/vote", "POST", { choice });
        updateState(newState, true);
        showToast("🗳️ Secondary meat vote recorded!");
      } catch (err) {
        showToast(err.message);
        btn.disabled = false;
      }
    });
  });

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
      ctx.fillStyle = opt.color;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw emoji + percentage inside slice
      const midAngle = startAngle + sliceAngle / 2;
      const labelR = totalVotes === count ? 0 : radius * 0.62;
      const lx = cx + Math.cos(midAngle) * labelR;
      const ly = cy + Math.sin(midAngle) * labelR;
      const pct = Math.round((count / totalVotes) * 100);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${opt.emoji} ${pct}%`, lx, ly);

      startAngle = endAngle;
    });
  }

  // Render Legend
  legendEl.innerHTML = options
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
  try {
    const state = await apiRequest("/api/state");
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

  document.getElementById("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const newState = await apiRequest("/api/settings/update", "POST", {
        event_title: document.getElementById("set-event-title").value.trim(),
        event_date: document.getElementById("set-event-date").value.trim(),
        event_time: document.getElementById("set-event-time").value.trim(),
        announcement: document.getElementById("set-announcement").value.trim(),
        house_code: document.getElementById("set-house-code").value.trim(),
        lock_claims: document.getElementById("set-lock-claims").checked,
      });
      updateState(newState, true);
      showToast("Saved event settings!");
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
